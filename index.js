/* ==========================================
 * 伺服器 (index.js) - v70.0 Logic Fixed
 * ========================================== */
require('dotenv').config();
const { Server } = require("http");
const express = require("express");
const socketio = require("socket.io");
const Redis = require("ioredis");
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const fs = require("fs");
const path = require("path");
const sqlite3 = require('sqlite3').verbose();

const { PORT = 3000, UPSTASH_REDIS_URL: REDIS_URL, ADMIN_TOKEN, LINE_ACCESS_TOKEN, LINE_CHANNEL_SECRET } = process.env;
if (!ADMIN_TOKEN || !REDIS_URL) process.exit(1);

const BUSINESS_HOURS = { start: 8, end: 22, enabled: false };
const DEFAULT_ROLES = {
    VIEWER:   { level: 0, can: [] },
    OPERATOR: { level: 1, can: ['call', 'pass', 'recall', 'issue'] },
    MANAGER:  { level: 2, can: ['call', 'pass', 'recall', 'issue', 'settings', 'appointment'] },
    ADMIN:    { level: 9, can: ['*'] }
};

const app = express();
app.disable('x-powered-by'); 

const server = Server(app);
const io = socketio(server, { cors: { origin: "*", methods: ["GET", "POST"] }, pingTimeout: 60000 });

const LOG_DIR = path.join(__dirname, 'user_logs');
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR); } catch(e) {}

const db = new sqlite3.Database(path.join(__dirname, 'callsys.db'), (err) => {
    if(!err) {
        db.run(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, date_str TEXT, timestamp INTEGER, number INTEGER, action TEXT, operator TEXT, wait_time_min REAL)`);
        db.run(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER, scheduled_time INTEGER, status TEXT DEFAULT 'pending')`);
    }
});

const dbRun = (sql, params) => new Promise((resolve, reject) => db.run(sql, params, function(err){ if(err)reject(err); else resolve(this); }));
const dbAll = (sql, params) => new Promise((resolve, reject) => db.all(sql, params, (err, rows)=>{ if(err)reject(err); else resolve(rows); }));
const dbGet = (sql, params) => new Promise((resolve, reject) => db.get(sql, params, (err, row)=>{ if(err)reject(err); else resolve(row); }));

const redis = new Redis(REDIS_URL, { tls: { rejectUnauthorized: false }, retryStrategy: t => Math.min(t * 50, 2000) });
const lineClient = (LINE_ACCESS_TOKEN && LINE_CHANNEL_SECRET) ? new line.Client({ channelAccessToken: LINE_ACCESS_TOKEN, channelSecret: LINE_CHANNEL_SECRET }) : null;

const KEYS = {
    CURRENT: 'callsys:number', ISSUED: 'callsys:issued', MODE: 'callsys:mode', PASSED: 'callsys:passed',
    FEATURED: 'callsys:featured', UPDATED: 'callsys:updated', SOUND: 'callsys:soundEnabled', PUBLIC: 'callsys:isPublic',
    LOGS: 'callsys:admin-log', USERS: 'callsys:users', NICKS: 'callsys:nicknames', USER_ROLES: 'callsys:user_roles',
    SESSION: 'callsys:session:', HISTORY: 'callsys:stats:history', HOURLY: 'callsys:stats:hourly:',
    LINE: { SUB: 'callsys:line:notify:', USER: 'callsys:line:user:', PWD: 'callsys:line:unlock_pwd', ADMIN: 'callsys:line:admin_session:', CTX: 'callsys:line:context:', ACTIVE: 'callsys:line:active_subs_set' },
    ROLES_CONFIG: 'callsys:config:roles'
};

async function initRoles() {
    if (!(await redis.exists(KEYS.ROLES_CONFIG))) {
        await redis.set(KEYS.ROLES_CONFIG, JSON.stringify(DEFAULT_ROLES));
    }
}
initRoles();

redis.defineCommand("safeNextNumber", { numberOfKeys: 2, lua: `return (tonumber(redis.call("GET",KEYS[1]))or 0) < (tonumber(redis.call("GET",KEYS[2]))or 0) and redis.call("INCR",KEYS[1]) or -1` });
redis.defineCommand("decrIfPositive", { numberOfKeys: 1, lua: `local v=tonumber(redis.call("GET",KEYS[1])) return (v and v>0) and redis.call("DECR",KEYS[1]) or (v or 0)` });

const sanitize = s => typeof s==='string'?s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"): '';
const getTWTime = () => {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hour12:false}).formatToParts(new Date());
    return { dateStr: `${parts[0].value}-${parts[2].value}-${parts[4].value}`, hour: parseInt(parts[6].value)%24 };
};
const addLog = async (nick, msg) => { 
    const time = new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
    await redis.lpush(KEYS.LOGS, `[${time}] [${nick}] ${msg}`); await redis.ltrim(KEYS.LOGS, 0, 99); 
    io.to("admin").emit("newAdminLog", `[${time}] [${nick}] ${msg}`);
};

let broadcastTimer = null;
const broadcastQueue = async () => {
    if (broadcastTimer) clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(async () => {
        let [c, i] = await redis.mget(KEYS.CURRENT, KEYS.ISSUED);
        c = parseInt(c)||0; i = parseInt(i)||0;
        if(i < c) { i = c; await redis.set(KEYS.ISSUED, i); }
        io.emit("update", c); io.emit("updateQueue", { current: c, issued: i });
        io.emit("updateWaitTime", await calcWaitTime()); io.emit("updateTimestamp", new Date().toISOString());
    }, 50);
};

const broadcastOnlineAdmins = async () => {
    const sockets = await io.in("admin").fetchSockets();
    const admins = [];
    for(const s of sockets) { try { const u = s.handshake.auth.token ? JSON.parse(await redis.get(`${KEYS.SESSION}${s.handshake.auth.token}`)) : null; if(u) admins.push(u); } catch(e){} }
    const uniqueAdmins = [...new Map(admins.map(item => [item.username, item])).values()];
    io.to("admin").emit("updateOnlineAdmins", uniqueAdmins);
};

let cacheWait = 0, lastWaitCalc = 0;
const calcWaitTime = async (force=false) => {
    if(!force && Date.now()-lastWaitCalc<60000) return cacheWait;
    try {
        const rows = await dbAll(`SELECT timestamp FROM history WHERE action='call' ORDER BY timestamp DESC LIMIT 20`, []);
        if(!rows || rows.length < 2) { cacheWait=0; return 0; }
        let totalDiff = 0; for(let i=0; i<rows.length-1; i++) totalDiff += (rows[i].timestamp - rows[i+1].timestamp);
        cacheWait = Math.ceil((totalDiff / (rows.length - 1) / 60000) * 10) / 10; lastWaitCalc = Date.now(); 
        return cacheWait;
    } catch(e) { return 0; }
};

async function handleControl(type, { body, user }) {
    const { direction, number } = body;
    const curr = parseInt(await redis.get(KEYS.CURRENT))||0;
    let issued = parseInt(await redis.get(KEYS.ISSUED))||0, newNum=0, logMsg='';
    const { dateStr, hour } = getTWTime();

    if(['call', 'issue'].includes(type) && BUSINESS_HOURS.enabled) {
        const h = new Date().getHours(); if(h < BUSINESS_HOURS.start || h >= BUSINESS_HOURS.end) return { error: "非營業時間" };
    }

    if(type === 'call') {
        if(direction==='next') {
            const pendingAppt = await dbGet("SELECT number FROM appointments WHERE status='pending' AND scheduled_time <= ? ORDER BY scheduled_time ASC LIMIT 1", [Date.now()]);
            if(pendingAppt) {
                newNum = pendingAppt.number; await redis.set(KEYS.CURRENT, newNum); await dbRun("UPDATE appointments SET status='called' WHERE number=?", [newNum]); logMsg = `🔔 呼叫預約 ${newNum}`;
            } else {
                if((newNum = await redis.safeNextNumber(KEYS.CURRENT, KEYS.ISSUED)) === -1) {
                    if(issued < curr) { await broadcastQueue(); return { error: "已無等待" }; } return { error: "已無等待" };
                }
                logMsg = `號碼增加為 ${newNum}`;
            }
        } else { newNum = await redis.decrIfPositive(KEYS.CURRENT); logMsg = `號碼回退為 ${newNum}`; }
        checkLineNotify(newNum).catch(()=>{});
        
    } else if(type === 'issue') {
        if(direction==='next') { 
            newNum = await redis.incr(KEYS.ISSUED); logMsg = `手動發號 ${newNum}`; 
            await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, 1);
            await redis.expire(`${KEYS.HOURLY}${dateStr}`, 172800);
        }
        else if(issued > curr) { 
            newNum = await redis.decr(KEYS.ISSUED); logMsg = `手動回退 ${newNum}`; 
            await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, -1);
        }
        else return { error: "錯誤" };
    } else if(type.startsWith('set')) {
        newNum = parseInt(number); if(isNaN(newNum)||newNum<0) return { error: "無效號碼" };
        if(type==='set_issue' && newNum===0) { await performReset(user.nickname); return {}; }
        
        // 手動設定發號時，自動補齊統計差額
        if(type==='set_issue') {
            const diff = newNum - issued;
            if (diff !== 0) {
                await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, diff);
                await redis.expire(`${KEYS.HOURLY}${dateStr}`, 172800);
            }
            await redis.set(KEYS.ISSUED, newNum); 
            logMsg = `修正發號 ${newNum}`; 
        }
        
        // 手動設定叫號時，如果超過發號，自動補齊統計
        if(type==='set_call') { 
            if (newNum > issued) {
                const diff = newNum - issued;
                await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, diff);
                await redis.expire(`${KEYS.HOURLY}${dateStr}`, 172800);
            }
            await redis.mset(KEYS.CURRENT, newNum, ...(newNum>issued?[KEYS.ISSUED, newNum]:[])); 
            logMsg = `設定叫號 ${newNum}`; 
            checkLineNotify(newNum).catch(()=>{}); 
        }
    }

    if(logMsg) {
        addLog(user.nickname, logMsg);
        await dbRun(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`, [dateStr, Date.now(), newNum||curr, type, user.nickname, await calcWaitTime()]);
    }
    await broadcastQueue(); return { number: newNum };
}

async function performReset(by) {
    const pipe = redis.multi().set(KEYS.CURRENT,0).set(KEYS.ISSUED,0).del(KEYS.PASSED, KEYS.LINE.ACTIVE);
    (await redis.smembers(KEYS.LINE.ACTIVE)).forEach(k=>pipe.del(`${KEYS.LINE.SUB}${k}`));
    (await redis.keys(`${KEYS.LINE.USER}*`)).forEach(k=>pipe.del(k));
    await pipe.exec(); await dbRun("UPDATE appointments SET status='cancelled' WHERE status='pending'", []);
    addLog(by, "💥 全域重置"); cacheWait = 0; await broadcastQueue(); io.emit("updatePassed",[]);
}

app.use(helmet({ contentSecurityPolicy: { useDefaults:false, directives: { defaultSrc:["'self'","*"], scriptSrc:["'self'","'unsafe-inline'","'unsafe-eval'","*"], styleSrc:["'self'","'unsafe-inline'","*"], imgSrc:["'self'","data:","*"], connectSrc:["'self'","*"], fontSrc:["'self'","*"], objectSrc:["'none'"], upgradeInsecureRequests:[] } } }));
app.use(express.static(path.join(__dirname, "public"))); app.use(express.json()); app.set('trust proxy', 1);

const asyncHandler = fn => async(req, res, next) => { try { const r = await fn(req, res); if(r!==false) res.json(r||{success:true}); } catch(e){ console.error(e); res.status(500).json({error:e.message}); } };
const auth = async(req, res, next) => {
    try {
        const u = req.body.token ? JSON.parse(await redis.get(`${KEYS.SESSION}${req.body.token}`)) : null;
        if(!u) return res.status(403).json({error:"權限不足"});
        req.user = u; await redis.expire(`${KEYS.SESSION}${req.body.token}`, 28800); next();
    } catch(e) { res.status(403).json({error:"Invalid"}); }
};

const checkPermission = (act) => async (req, res, next) => {
    try {
        const roleKey = req.user.role === 'super' ? 'ADMIN' : (req.user.userRole || 'OPERATOR');
        const rolesConfigStr = await redis.get(KEYS.ROLES_CONFIG);
        const rolesConfig = rolesConfigStr ? JSON.parse(rolesConfigStr) : DEFAULT_ROLES;
        const role = rolesConfig[roleKey] || rolesConfig.OPERATOR;
        if(role.level >= 9 || role.can.includes(act) || role.can.includes('*')) return next();
        res.status(403).json({ error: "權限不足" });
    } catch(e) { res.status(500).json({ error: "權限驗證錯誤" }); }
};

// Routes
app.post("/login", rateLimit({windowMs:9e5,max:100}), asyncHandler(async req => {
    const { username: u, password: p } = req.body;
    let valid = (u==='superadmin' && p===ADMIN_TOKEN);
    if(!valid && await redis.hexists(KEYS.USERS, u)) valid = await bcrypt.compare(p, await redis.hget(KEYS.USERS, u));
    if(!valid) throw new Error("帳密錯誤");
    const token = uuidv4(), nick = await redis.hget(KEYS.NICKS, u) || u;
    const storedRole = await redis.hget(KEYS.USER_ROLES, u);
    const userRole = (u === 'superadmin') ? 'ADMIN' : (storedRole || 'OPERATOR');
    await redis.set(`${KEYS.SESSION}${token}`, JSON.stringify({username:u, role:valid&&u==='superadmin'?'super':'normal', userRole, nickname:nick}), "EX", 28800);
    return { token, role: u==='superadmin'?'super':'normal', userRole, username: u, nickname: nick };
}));

app.post("/api/ticket/take", rateLimit({windowMs:36e5,max:20}), asyncHandler(async req => {
    if(await redis.get(KEYS.MODE)==='input') throw new Error("手動模式");
    if(BUSINESS_HOURS.enabled) { const h=new Date().getHours(); if(h<BUSINESS_HOURS.start||h>=BUSINESS_HOURS.end) throw new Error("非營業時間"); }
    const t = await redis.incr(KEYS.ISSUED); 
    const { dateStr, hour } = getTWTime();
    
    // 取號統計 +1
    await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, 1);
    await redis.expire(`${KEYS.HOURLY}${dateStr}`, 172800);

    await dbRun(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`, [dateStr, Date.now(), t, 'online_take', 'User', await calcWaitTime()]);
    await broadcastQueue(); return { ticket: t };
}));

const ctrls = ['call','issue','set-call','set-issue'];
ctrls.forEach(c => app.post(`/api/control/${c}`, auth, checkPermission(c.startsWith('set')?'settings':c.split('-')[0]), asyncHandler(async req => {
    const r = await handleControl(c.replace('-','_'), req); if(r.error) throw new Error(r.error); return r;
})));

app.post("/api/control/pass-current", auth, checkPermission('pass'), asyncHandler(async req => {
    const c = parseInt(await redis.get(KEYS.CURRENT))||0; if(!c) throw new Error("無叫號");
    await redis.zadd(KEYS.PASSED, c, c); const act = (await redis.safeNextNumber(KEYS.CURRENT, KEYS.ISSUED) === -1 ? c : await redis.get(KEYS.CURRENT));
    
    const {dateStr, hour} = getTWTime(); 
    // 過號統計 -1
    await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, -1);
    
    await dbRun(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`, [dateStr, Date.now(), c, 'pass', req.user.nickname, await calcWaitTime()]);
    checkLineNotify(act).catch(()=>{}); await broadcastQueue(); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); return { next: act };
}));
app.post("/api/control/recall-passed", auth, checkPermission('recall'), asyncHandler(async req => {
    await redis.zrem(KEYS.PASSED, req.body.number); await redis.set(KEYS.CURRENT, req.body.number);
    addLog(req.user.nickname, `↩️ 重呼 ${req.body.number}`); await broadcastQueue(); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number));
}));

app.post("/api/admin/users", auth, asyncHandler(async r=>{
    const [nicks, roles, users] = await Promise.all([redis.hgetall(KEYS.NICKS), redis.hgetall(KEYS.USER_ROLES), redis.hkeys(KEYS.USERS)]);
    return { users: [{username:'superadmin',nickname:nicks['superadmin']||'Super',role:'ADMIN'}, ...users.map(x=>({username:x, nickname:nicks[x]||x, role: roles[x]||'OPERATOR'}))] };
}));
app.post("/api/admin/add-user", auth, checkPermission('settings'), asyncHandler(async r=>{ 
    if(await redis.hexists(KEYS.USERS, r.body.newUsername)) throw new Error("已存在");
    await redis.hset(KEYS.USERS, r.body.newUsername, await bcrypt.hash(r.body.newPassword,10));
    await redis.hset(KEYS.NICKS, r.body.newUsername, r.body.newNickname);
    await redis.hset(KEYS.USER_ROLES, r.body.newUsername, r.body.newRole || 'OPERATOR');
}));
app.post("/api/admin/set-role", auth, checkPermission('settings'), asyncHandler(async r=>{
    if(r.body.targetUsername === 'superadmin') throw new Error("不可變更管理員");
    await redis.hset(KEYS.USER_ROLES, r.body.targetUsername, r.body.newRole);
}));
app.post("/api/admin/del-user", auth, checkPermission('settings'), asyncHandler(async r=>{ 
    if(r.body.delUsername==='superadmin') throw new Error("不可刪除"); 
    await redis.hdel(KEYS.USERS, r.body.delUsername); await redis.hdel(KEYS.NICKS, r.body.delUsername); await redis.hdel(KEYS.USER_ROLES, r.body.delUsername);
}));

app.post("/api/admin/set-nickname", auth, asyncHandler(async r=>{ 
    if(r.body.targetUsername !== r.user.username && r.user.userRole !== 'ADMIN') throw new Error("權限不足");
    await redis.hset(KEYS.NICKS, r.body.targetUsername, r.body.nickname);
}));

app.post("/api/admin/roles/get", auth, checkPermission('settings'), asyncHandler(async r => {
    const roles = await redis.get(KEYS.ROLES_CONFIG);
    return roles ? JSON.parse(roles) : DEFAULT_ROLES;
}));

app.post("/api/admin/roles/update", auth, checkPermission('settings'), asyncHandler(async r => {
    if(r.user.role !== 'super') throw new Error("僅超級管理員可修改權限結構");
    const newConfig = r.body.rolesConfig;
    if (!newConfig.ADMIN || !newConfig.ADMIN.can.includes('*')) newConfig.ADMIN = { level: 9, can: ['*'] };
    await redis.set(KEYS.ROLES_CONFIG, JSON.stringify(newConfig));
    addLog(r.user.nickname, "🔧 修改了角色權限表");
}));

// 1. 手動加入過號 (修正：納入統計扣除 + 邏輯防呆)
app.post("/api/passed/add", auth, checkPermission('pass'), asyncHandler(async r => {
    const { number } = r.body;
    const num = parseInt(number);
    
    // [新增] 檢查邏輯：不可大於已發號碼
    const issued = parseInt(await redis.get(KEYS.ISSUED)) || 0;
    if (num > issued) throw new Error("不可大於已發號碼");
    if (num <= 0) throw new Error("號碼無效");

    await redis.zadd(KEYS.PASSED, num, num);
    
    // 手動加入過號時，該時段統計 -1 (視為未處理)
    const { dateStr, hour } = getTWTime();
    await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, -1);
    
    io.emit("updatePassed", (await redis.zrange(KEYS.PASSED, 0, -1)).map(Number));
}));

// 2. 移除過號 (修正：加回統計)
app.post("/api/passed/remove", auth, checkPermission('pass'), asyncHandler(async r => {
    const { number } = r.body;
    await redis.zrem(KEYS.PASSED, number);
    
    // 從過號名單移除時 (視為恢復)，該時段統計 +1
    const { dateStr, hour } = getTWTime();
    await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, 1);
    
    io.emit("updatePassed", (await redis.zrange(KEYS.PASSED, 0, -1)).map(Number));
}));

// 3. 清空過號
app.post("/api/passed/clear", auth, checkPermission('pass'), asyncHandler(async r => {
    await redis.del(KEYS.PASSED);
    io.emit("updatePassed", []);
}));

app.post("/api/appointment/add", auth, checkPermission('appointment'), asyncHandler(async req => { await dbRun("INSERT INTO appointments (number, scheduled_time) VALUES (?, ?)", [req.body.number, new Date(req.body.timeStr).getTime()]); addLog(req.user.nickname, `📅 預約: ${req.body.number}號`); }));
app.post("/api/appointment/list", auth, checkPermission('appointment'), asyncHandler(async req => { return { appointments: await dbAll("SELECT * FROM appointments WHERE status='pending' ORDER BY scheduled_time ASC", []) }; }));
app.post("/api/appointment/remove", auth, checkPermission('appointment'), asyncHandler(async req => { await dbRun("DELETE FROM appointments WHERE id = ?", [req.body.id]); addLog(req.user.nickname, `🗑️ 刪除預約 ID: ${req.body.id}`); }));

app.post("/api/admin/stats", auth, asyncHandler(async req => {
    const {dateStr, hour} = getTWTime();
    const hData = await redis.hgetall(`${KEYS.HOURLY}${dateStr}`);
    const counts = new Array(24).fill(0); let total=0;
    if(hData) { for(const [h,c] of Object.entries(hData)) { const val=parseInt(c)||0; counts[parseInt(h)]=val; total+=val; } }
    const rows = await dbAll("SELECT * FROM history ORDER BY id DESC LIMIT 50", []);
    return { history: rows || [], hourlyCounts: counts, todayCount: total, serverHour: hour };
}));

app.post("/api/admin/history-report", auth, checkPermission('settings'), asyncHandler(async req => { return { data: await dbAll("SELECT * FROM history ORDER BY timestamp DESC LIMIT 1000", []) }; }));
app.post("/api/admin/stats/adjust", auth, checkPermission('settings'), asyncHandler(async r=>{ const {dateStr}=getTWTime(); await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, r.body.hour, r.body.delta); }));
app.post("/api/admin/stats/clear", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.del(`${KEYS.HOURLY}${getTWTime().dateStr}`); addLog(r.user.nickname,"⚠️ 清空統計"); }));
app.post("/set-sound-enabled", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.set(KEYS.SOUND, r.body.enabled?"1":"0"); io.emit("updateSoundSetting", r.body.enabled); }));
app.post("/set-public-status", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.set(KEYS.PUBLIC, r.body.isPublic?"1":"0"); io.emit("updatePublicStatus", r.body.isPublic); }));
app.post("/api/admin/broadcast", auth, checkPermission('call'), asyncHandler(async r=>{ io.emit("adminBroadcast", sanitize(r.body.message).substr(0,200)); addLog(r.user.nickname,`📢 ${r.body.message}`); }));
app.post("/api/logs/clear", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.del(KEYS.LOGS); io.to("admin").emit("initAdminLogs",[]); }));
app.post("/set-system-mode", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.set(KEYS.MODE, r.body.mode); io.emit("updateSystemMode", r.body.mode); }));
app.post("/reset", auth, checkPermission('settings'), asyncHandler(async r=>{ await performReset(r.user.nickname); }));
app.post("/api/admin/export-csv", auth, checkPermission('settings'), asyncHandler(async r=>{ 
    const rows = await dbAll("SELECT * FROM history WHERE date_str = ?", [getTWTime().dateStr]);
    const header = "\uFEFF時間,號碼,動作,操作員,等待(分)\n"; 
    const body = rows.map(r => `${new Date(r.timestamp).toLocaleTimeString()},${r.number},${r.action},${r.operator},${r.wait_time_min}`).join("\n"); 
    return { csvData: header+body, fileName: `report_${getTWTime().dateStr}.csv` };
}));

app.post("/api/featured/add", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.rpush(KEYS.FEATURED, JSON.stringify(r.body)); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/edit", auth, checkPermission('settings'), asyncHandler(async r=>{ const l=await redis.lrange(KEYS.FEATURED,0,-1), i=l.indexOf(JSON.stringify({linkText:r.body.oldLinkText,linkUrl:r.body.oldLinkUrl})); if(i>-1) await redis.lset(KEYS.FEATURED,i,JSON.stringify({linkText:r.body.newLinkText,linkUrl:r.body.newLinkUrl})); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/remove", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.lrem(KEYS.FEATURED,1,JSON.stringify(r.body)); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/clear", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.del(KEYS.FEATURED); io.emit("updateFeaturedContents", []); }));
app.post("/api/featured/get", auth, asyncHandler(async r=>{ return (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse); }));
app.post("/api/admin/line-settings/:act", auth, checkPermission('settings'), asyncHandler(async req => { const act=req.params.act, keys=['approach','arrival','status','personal','passed','set_ok','cancel','login_hint','err_passed','err_no_sub','set_hint'].map(k=>`callsys:line:msg:${k}`); if(act==='get') return (await redis.mget(keys)).reduce((a,v,i)=>(a[keys[i].split(':').pop()]=v||"",a),{}); if(act==='save') { const p=redis.multi(); Object.keys(req.body).forEach(k=>p.set(`callsys:line:msg:${k}`,sanitize(req.body[k]))); await p.exec(); } if(act==='reset') await redis.del(keys); if(act==='set-unlock-pass') await redis.set(KEYS.LINE.PWD, req.body.password); if(act==='get-unlock-pass') return { password: await redis.get(KEYS.LINE.PWD)||"" }; }));

async function checkLineNotify(curr) { 
    if(!lineClient) return; 
    const t=curr+5, [a,r,s,e]=await Promise.all([redis.get('callsys:line:msg:approach'),redis.get('callsys:line:msg:arrival'),redis.smembers(`${KEYS.LINE.SUB}${t}`),redis.smembers(`${KEYS.LINE.SUB}${curr}`)]);
    const snd = async (ids, msgObj) => {
        if(!ids || !ids.length) return;
        const u = [...ids];
        while(u.length){
            try { await lineClient.multicast(u.splice(0, 500), [{type:'text',text:msgObj}]); } catch(err) { console.error("LINE Send Error", err); }
        }
    };
    if(s.length) await snd(s, (a||'🔔 快到了').replace('{current}',curr).replace('{target}',t).replace('{diff}',5)); 
    if(e.length) { 
        await snd(e, (r||'🎉 到您了').replace('{current}',curr).replace('{target}',curr).replace('{diff}',0)); 
        const p=redis.multi().del(`${KEYS.LINE.SUB}${curr}`).srem(KEYS.LINE.ACTIVE,curr); 
        e.forEach(u=>p.del(`${KEYS.LINE.USER}${u}`)); await p.exec(); 
    } 
}
if(lineClient) app.post('/callback', line.middleware({channelAccessToken:LINE_ACCESS_TOKEN,channelSecret:LINE_CHANNEL_SECRET}), (req,res)=>Promise.all(req.body.events.map(handleLine)).then(r=>res.json(r)).catch(e=>res.status(500).end()));

async function handleLine(e) { 
    if(e.type!=='message'||e.message.type!=='text')return; 
    const t=e.message.text.trim().toLowerCase(),u=e.source.userId,r=e.replyToken,c=`${KEYS.LINE.CTX}${u}`,rp=x=>lineClient.replyMessage(r,{type:'text',text:x}); 
    if(t==='後台登入')return rp((await redis.get(`${KEYS.LINE.ADMIN}${u}`))?`🔗 ${process.env.RENDER_EXTERNAL_URL}/admin.html`:(await redis.set(c,'WAIT_PWD','EX',120),"請輸入密碼")); 
    if((await redis.get(c))==='WAIT_PWD'&&t===(await redis.get(KEYS.LINE.PWD)||`unlock${ADMIN_TOKEN}`)) { await redis.set(`${KEYS.LINE.ADMIN}${u}`,"1","EX",600); await redis.del(c); return rp("🔓 驗證成功"); } 
    if(['?','status'].includes(t)){ const [n,i,un]=await Promise.all([redis.get(KEYS.CURRENT),redis.get(KEYS.ISSUED),redis.get(`${KEYS.LINE.USER}${u}`)]); return rp(`叫號:${n||0}\n發號:${i||0}${un?`\n您的:${un}`:''}`); } 
    if(['wait', '等待', '前面'].includes(t)) {
        const myNum = await redis.get(`${KEYS.LINE.USER}${u}`);
        if (!myNum) return rp("您尚未取號/輸入號碼");
        const curr = parseInt(await redis.get(KEYS.CURRENT)) || 0;
        const diff = parseInt(myNum) - curr;
        if (diff < 0) return rp("您的號碼已過");
        if (diff === 0) return rp("🎉 輪到您了！");
        return rp(`您的號碼: ${myNum}\n目前叫號: ${curr}\n⏳ 前方還有: ${diff} 組`);
    }
    if(['cancel'].includes(t)){ const n=await redis.get(`${KEYS.LINE.USER}${u}`); if(n){await redis.multi().del(`${KEYS.LINE.USER}${u}`).srem(`${KEYS.LINE.SUB}${n}`,u).exec(); return rp("已取消");} return rp("無設定"); } 
    if(/^\d+$/.test(t)){ const n=parseInt(t),curr=parseInt(await redis.get(KEYS.CURRENT))||0; if(n<=curr)return rp("已過號"); await redis.multi().set(`${KEYS.LINE.USER}${u}`,n,'EX',43200).sadd(`${KEYS.LINE.SUB}${n}`,u).expire(`${KEYS.LINE.SUB}${n}`,43200).sadd(KEYS.LINE.ACTIVE,n).exec(); return rp(`設定成功: ${n}號`); } 
}

cron.schedule('0 4 * * *', () => { 
    performReset('系統自動');
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    dbRun("DELETE FROM history WHERE timestamp < ?", [thirtyDaysAgo]).catch(e=>console.error(e));
}, { timezone: "Asia/Taipei" });

io.on("connection", async s => {
    if(s.handshake.auth.token) { try { const u=JSON.parse(await redis.get(`${KEYS.SESSION}${s.handshake.auth.token}`)); if(u) { s.join("admin"); broadcastOnlineAdmins(); s.emit("initAdminLogs", await redis.lrange(KEYS.LOGS,0,99)); } } catch(e){} }
    s.join('public');
    const [c,i,p,f,snd,pub,m]=await Promise.all([redis.get(KEYS.CURRENT),redis.get(KEYS.ISSUED),redis.zrange(KEYS.PASSED,0,-1),redis.lrange(KEYS.FEATURED,0,-1),redis.get(KEYS.SOUND),redis.get(KEYS.PUBLIC),redis.get(KEYS.MODE)]);
    s.emit("update",Number(c)); s.emit("updateQueue",{current:Number(c),issued:Number(i)}); s.emit("updatePassed",p.map(Number)); s.emit("updateFeaturedContents",f.map(JSON.parse));
    s.emit("updateSoundSetting",snd==="1"); s.emit("updatePublicStatus",pub!=="0"); s.emit("updateSystemMode",m||'ticketing'); s.emit("updateWaitTime",await calcWaitTime());
    s.on("disconnect", () => { setTimeout(broadcastOnlineAdmins, 1000); });
});

server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server v70.0 running on ${PORT}`));
