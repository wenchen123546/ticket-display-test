/* ==========================================
 * 伺服器 (index.js) - v91.0 Stats & DB Optimized
 * ========================================== */
require('dotenv').config();
const { Server } = require("http"), express = require("express"), socketio = require("socket.io");
const Redis = require("ioredis"), helmet = require('helmet'), rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid'), bcrypt = require('bcrypt'), line = require('@line/bot-sdk');
const cron = require('node-cron'), fs = require("fs"), path = require("path"), sqlite3 = require('sqlite3').verbose();

// --- Env Variables ---
const { PORT = 3000, UPSTASH_REDIS_URL: REDIS_URL, ADMIN_TOKEN, LINE_ACCESS_TOKEN, LINE_CHANNEL_SECRET } = process.env;
if (!ADMIN_TOKEN || !REDIS_URL) { console.error("❌ Missing ADMIN_TOKEN or REDIS_URL"); process.exit(1); }

// --- Config & Consts ---
const BUSINESS_HOURS = { start: 8, end: 22, enabled: false };
const DEFAULT_ROLES = { VIEWER: { level: 0, can: [] }, OPERATOR: { level: 1, can: ['call', 'pass', 'recall', 'issue'] }, MANAGER: { level: 2, can: ['call', 'pass', 'recall', 'issue', 'settings', 'appointment'] }, ADMIN: { level: 9, can: ['*'] } };
const KEYS = { 
    CURRENT: 'callsys:number', ISSUED: 'callsys:issued', MODE: 'callsys:mode', PASSED: 'callsys:passed', 
    FEATURED: 'callsys:featured', LOGS: 'callsys:admin-log', USERS: 'callsys:users', NICKS: 'callsys:nicknames', 
    USER_ROLES: 'callsys:user_roles', SESSION: 'callsys:session:', HISTORY: 'callsys:stats:history', 
    HOURLY: 'callsys:stats:hourly:', ROLES: 'callsys:config:roles', 
    LINE: { SUB: 'callsys:line:notify:', USER: 'callsys:line:user:', PWD: 'callsys:line:unlock_pwd', ADMIN: 'callsys:line:admin_session:', CTX: 'callsys:line:context:', ACTIVE: 'callsys:line:active_subs_set', CFG_TOKEN: 'callsys:line:cfg:token', CFG_SECRET: 'callsys:line:cfg:secret' } 
};

// --- Setup ---
const app = express(); app.disable('x-powered-by');
const server = Server(app), io = socketio(server, { cors: { origin: "*" }, pingTimeout: 60000 });
const redis = new Redis(REDIS_URL, { tls: { rejectUnauthorized: false }, retryStrategy: t => Math.min(t * 50, 2000) });

// Line Client
let lineClient = null;
const initLine = async () => {
    const [dbToken, dbSecret] = await redis.mget(KEYS.LINE.CFG_TOKEN, KEYS.LINE.CFG_SECRET);
    const token = dbToken || LINE_ACCESS_TOKEN;
    const secret = dbSecret || LINE_CHANNEL_SECRET;
    if (token && secret) {
        try { lineClient = new line.Client({ channelAccessToken: token, channelSecret: secret }); } catch(e) { console.error("Line Init Error", e); }
    }
};
initLine();

try { if (!fs.existsSync(path.join(__dirname, 'user_logs'))) fs.mkdirSync(path.join(__dirname, 'user_logs')); } catch(e) {}

const db = new sqlite3.Database(path.join(__dirname, 'callsys.db'), (err) => { if(!err) {
    db.run(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, date_str TEXT, timestamp INTEGER, number INTEGER, action TEXT, operator TEXT, wait_time_min REAL)`);
    db.run(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY, number INTEGER, scheduled_time INTEGER, status TEXT DEFAULT 'pending')`);
    // [Optimization] Add Indexes for performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_history_date ON history(date_str)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_history_ts ON history(timestamp)`);
}});
const dbQuery = (m, s, p=[]) => new Promise((res, rej) => db[m](s, p, function(e, r){ e ? rej(e) : res(m==='run'?this:r) }));
const [run, all, get] = ['run', 'all', 'get'].map(m => (s, p) => dbQuery(m, s, p));

redis.defineCommand("safeNextNumber", { numberOfKeys: 2, lua: `return (tonumber(redis.call("GET",KEYS[1]))or 0) < (tonumber(redis.call("GET",KEYS[2]))or 0) and redis.call("INCR",KEYS[1]) or -1` });
redis.defineCommand("decrIfPositive", { numberOfKeys: 1, lua: `local v=tonumber(redis.call("GET",KEYS[1])) return (v and v>0) and redis.call("DECR",KEYS[1]) or (v or 0)` });
(async() => { if (!(await redis.exists(KEYS.ROLES))) await redis.set(KEYS.ROLES, JSON.stringify(DEFAULT_ROLES)); })();

// --- Helpers ---
const getTWTime = () => { const p = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',hour12:false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit'}).formatToParts(new Date()); return { dateStr: `${p[0].value}-${p[2].value}-${p[4].value}`, hour: parseInt(p[6].value)%24 }; };
const addLog = async (nick, msg) => { const t = new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}); await redis.lpush(KEYS.LOGS, `[${t}] [${nick}] ${msg}`); await redis.ltrim(KEYS.LOGS, 0, 99); io.to("admin").emit("newAdminLog", `[${t}] [${nick}] ${msg}`); };

let bCastT = null, cacheWait = 0, lastWaitCalc = 0;
const broadcastQueue = async () => {
    if (bCastT) clearTimeout(bCastT);
    bCastT = setTimeout(async () => {
        let [c, i] = (await redis.mget(KEYS.CURRENT, KEYS.ISSUED)).map(v => parseInt(v)||0);
        if(i < c) { i = c; await redis.set(KEYS.ISSUED, i); }
        io.emit("update", c); io.emit("updateQueue", { current: c, issued: i });
        io.emit("updateWaitTime", await calcWaitTime()); io.emit("updateTimestamp", new Date().toISOString());
    }, 50);
};
const broadcastAppts = async () => io.to("admin").emit("updateAppointments", await all("SELECT * FROM appointments WHERE status='pending' ORDER BY scheduled_time ASC"));
const calcWaitTime = async (force) => {
    if(!force && Date.now()-lastWaitCalc<60000) return cacheWait;
    const rows = await all(`SELECT timestamp FROM history WHERE action='call' ORDER BY timestamp DESC LIMIT 20`);
    if(!rows || rows.length < 2) return (cacheWait=0);
    let total = 0; for(let i=0; i<rows.length-1; i++) total += (rows[i].timestamp - rows[i+1].timestamp);
    return (lastWaitCalc=Date.now(), cacheWait = Math.ceil((total / (rows.length - 1) / 60000) * 10) / 10);
};

// --- Middleware & Auth ---
app.use(helmet({ contentSecurityPolicy: false })); app.use(express.static(path.join(__dirname, "public"))); app.use(express.json()); app.set('trust proxy', 1);
const H = fn => async(req, res, next) => { try { const r = await fn(req, res); if(r!==false) res.json(r||{success:true}); } catch(e){ res.status(500).json({error:e.message}); } };
const auth = async(req, res, next) => {
    try {
        const u = req.body.token ? JSON.parse(await redis.get(`${KEYS.SESSION}${req.body.token}`)) : null;
        if(!u) throw 0; req.user = u; await redis.expire(`${KEYS.SESSION}${req.body.token}`, 28800); next();
    } catch(e) { res.status(403).json({error:"權限/Session失效"}); }
};
const perm = (act) => async (req, res, next) => {
    const rKey = req.user.role === 'super' ? 'ADMIN' : (req.user.userRole || 'OPERATOR');
    const role = (JSON.parse(await redis.get(KEYS.ROLES)) || DEFAULT_ROLES)[rKey];
    if(role.level >= 9 || role.can.includes(act) || role.can.includes('*')) return next();
    res.status(403).json({ error: "權限不足" });
};

// --- Routes ---
app.post("/login", rateLimit({windowMs:9e5,max:100}), H(async req => {
    const { username: u, password: p } = req.body;
    const safeAdminToken = (ADMIN_TOKEN || "").trim();
    const safeInputPass = (p || "").trim();
    let valid = (u === 'superadmin' && safeInputPass === safeAdminToken);
    if(!valid && await redis.hexists(KEYS.USERS, u)) valid = await bcrypt.compare(safeInputPass, await redis.hget(KEYS.USERS, u));
    if(!valid) throw new Error("帳號或密碼錯誤");
    const token = uuidv4(), nick = await redis.hget(KEYS.NICKS, u) || u;
    const userRole = (u==='superadmin' ? 'ADMIN' : (await redis.hget(KEYS.USER_ROLES, u) || 'OPERATOR'));
    await redis.set(`${KEYS.SESSION}${token}`, JSON.stringify({username:u, role:u==='superadmin'?'super':'normal', userRole, nickname:nick}), "EX", 28800);
    return { token, role: u==='superadmin'?'super':'normal', userRole, username: u, nickname: nick };
}));

app.post("/api/ticket/take", rateLimit({windowMs:36e5,max:20}), H(async req => {
    if(await redis.get(KEYS.MODE)==='input') throw new Error("手動模式");
    const { dateStr, hour } = getTWTime();
    if(BUSINESS_HOURS.enabled) { const h=new Date().getHours(); if(h<BUSINESS_HOURS.start||h>=BUSINESS_HOURS.end) throw new Error("非營業時間"); }
    const t = await redis.incr(KEYS.ISSUED); 
    await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, 1); // Stats: +Issued
    await redis.expire(`${KEYS.HOURLY}${dateStr}`, 172800);
    await run(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`, [dateStr, Date.now(), t, 'online_take', 'User', await calcWaitTime()]);
    await broadcastQueue(); return { ticket: t };
}));

// Core Logic Wrapper
async function ctl(type, {body, user}) {
    const { direction: dir, number: num } = body, { dateStr, hour } = getTWTime();
    const curr = parseInt(await redis.get(KEYS.CURRENT))||0;
    let issued = parseInt(await redis.get(KEYS.ISSUED))||0, newNum=0, msg='';
    if(['call','issue'].includes(type) && BUSINESS_HOURS.enabled) { const h=new Date().getHours(); if(h<BUSINESS_HOURS.start||h>=BUSINESS_HOURS.end) return { error: "非營業時間" }; }

    if(type === 'call') {
        if(dir==='next') {
            const appt = await get("SELECT number FROM appointments WHERE status='pending' AND scheduled_time <= ? ORDER BY scheduled_time ASC LIMIT 1", [Date.now()]);
            if(appt) { newNum = appt.number; await redis.set(KEYS.CURRENT, newNum); await run("UPDATE appointments SET status='called' WHERE number=?", [newNum]); msg=`🔔 呼叫預約 ${newNum}`; broadcastAppts(); }
            else { if((newNum = await redis.safeNextNumber(KEYS.CURRENT, KEYS.ISSUED)) === -1) return { error: "已無等待" }; msg=`號碼增加為 ${newNum}`; }
        } else { newNum = await redis.decrIfPositive(KEYS.CURRENT); msg=`號碼回退為 ${newNum}`; }
        checkLine(newNum);
    } else if(type === 'issue') {
        if(dir==='next') { 
            newNum = await redis.incr(KEYS.ISSUED); 
            msg=`手動發號 ${newNum}`; 
            await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, 1); // Stats: +Issued
        }
        else if(issued > curr) { 
            newNum = await redis.decr(KEYS.ISSUED); 
            msg=`手動回退 ${newNum}`; 
            await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, -1); // Stats: -Issued
        }
        else return { error: "錯誤" };
        await redis.expire(`${KEYS.HOURLY}${dateStr}`, 172800);
    } else if(type.startsWith('set')) {
        newNum = parseInt(num); if(isNaN(newNum)||newNum<0) return { error: "無效" };
        if(type==='set_issue' && newNum===0) return resetSys(user.nickname);
        if(type==='set_issue') { 
            const diff = newNum - issued;
            if(diff !== 0) await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, diff); // Stats: Fix Issued
            await redis.set(KEYS.ISSUED, newNum); msg=`修正發號 ${newNum}`; 
        } else { 
            await redis.mset(KEYS.CURRENT, newNum, ...(newNum>issued?[KEYS.ISSUED, newNum]:[])); msg=`設定叫號 ${newNum}`; checkLine(newNum); 
        }
    }
    if(msg) { addLog(user.nickname, msg); await run(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`, [dateStr, Date.now(), newNum||curr, type, user.nickname, await calcWaitTime()]); }
    await broadcastQueue(); return { number: newNum };
}
async function resetSys(by) {
    await redis.mset(KEYS.CURRENT,0,KEYS.ISSUED,0); await redis.del(KEYS.PASSED, KEYS.LINE.ACTIVE);
    await run("UPDATE appointments SET status='cancelled' WHERE status='pending'");
    addLog(by, "💥 全域重置"); cacheWait=0; await broadcastQueue(); broadcastAppts(); io.emit("updatePassed",[]); return {};
}
['call','issue','set-call','set-issue'].forEach(c => app.post(`/api/control/${c}`, auth, perm(c.startsWith('set')?'settings':c.split('-')[0]), H(async r => { const res = await ctl(c.replace('-','_'), r); if(res.error) throw new Error(res.error); return res; })));

app.post("/api/control/pass-current", auth, perm('pass'), H(async req => {
    const c = parseInt(await redis.get(KEYS.CURRENT))||0; if(!c) throw new Error("無叫號");
    await redis.zadd(KEYS.PASSED, c, c); const next = (await redis.safeNextNumber(KEYS.CURRENT, KEYS.ISSUED)===-1 ? c : await redis.get(KEYS.CURRENT));
    const {dateStr, hour} = getTWTime(); 
    await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_p`, 1); // Stats: +Passed
    await run(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`, [dateStr, Date.now(), c, 'pass', req.user.nickname, await calcWaitTime()]);
    checkLine(next); await broadcastQueue(); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); return { next };
}));

app.post("/api/control/recall-passed", auth, perm('recall'), H(async req => {
    await redis.zrem(KEYS.PASSED, req.body.number); await redis.set(KEYS.CURRENT, req.body.number);
    const {dateStr, hour} = getTWTime(); 
    await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_p`, -1); // Stats: -Passed (Recall)
    addLog(req.user.nickname, `↩️ 重呼 ${req.body.number}`); await broadcastQueue(); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number));
}));

app.post("/api/passed/add", auth, perm('pass'), H(async r => {
    const n = parseInt(r.body.number);
    if(n > 0) {
        await redis.zadd(KEYS.PASSED, n, n);
        const {dateStr, hour} = getTWTime(); 
        await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_p`, 1); // Stats: +Passed
        io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number));
        addLog(r.user.nickname, `➕ 手動過號 ${n}`);
    }
}));
app.post("/api/passed/remove", auth, perm('pass'), H(async r => {
    const n = parseInt(r.body.number);
    if(n > 0) {
        await redis.zrem(KEYS.PASSED, n);
        const {dateStr, hour} = getTWTime(); 
        await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_p`, -1); // Stats: -Passed
        io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number));
        addLog(r.user.nickname, `🗑️ 移除過號 ${n}`);
    }
}));

// Admin & Settings (User)
app.post("/api/admin/users", auth, H(async r => {
    const rawUsers = [{username:'superadmin',nickname:await redis.hget(KEYS.NICKS,'superadmin')||'Super',role:'ADMIN'}, ...(await redis.hkeys(KEYS.USERS)).map(x=>({username:x, nickname:null, role:null}))];
    const resolvedUsers = await Promise.all(rawUsers.map(async u=>{ if(u.username!=='superadmin'){u.nickname=await redis.hget(KEYS.NICKS,u.username)||u.username; u.role=await redis.hget(KEYS.USER_ROLES,u.username)||'OPERATOR';} return u; }));
    return { users: resolvedUsers };
}));
app.post("/api/admin/add-user", auth, perm('settings'), H(async r=>{ if(await redis.hexists(KEYS.USERS, r.body.newUsername)) throw new Error("已存在"); await redis.hset(KEYS.USERS, r.body.newUsername, await bcrypt.hash(r.body.newPassword,10)); await redis.hset(KEYS.NICKS, r.body.newUsername, r.body.newNickname); await redis.hset(KEYS.USER_ROLES, r.body.newUsername, r.body.newRole||'OPERATOR'); }));
app.post("/api/admin/del-user", auth, perm('settings'), H(async r=>{ if(r.body.delUsername==='superadmin') throw new Error("不可刪除"); await redis.hdel(KEYS.USERS, r.body.delUsername); await redis.hdel(KEYS.NICKS, r.body.delUsername); await redis.hdel(KEYS.USER_ROLES, r.body.delUsername); }));
app.post("/api/admin/set-nickname", auth, H(async r => { if(r.user.role!=='super' && r.user.username!==r.body.targetUsername) throw new Error("權限不足"); await redis.hset(KEYS.NICKS, r.body.targetUsername, r.body.nickname); }));
app.post("/api/admin/set-role", auth, perm('settings'), H(async r => { if(r.user.role!=='super') throw new Error("僅限超級管理員"); await redis.hset(KEYS.USER_ROLES, r.body.targetUsername, r.body.newRole); }));
app.post("/api/admin/roles/get", auth, H(async r => JSON.parse(await redis.get(KEYS.ROLES)) || DEFAULT_ROLES));
app.post("/api/admin/roles/update", auth, perm('settings'), H(async r => { if(r.user.role!=='super') throw new Error("僅超級管理員"); await redis.set(KEYS.ROLES, JSON.stringify(r.body.rolesConfig)); addLog(r.user.nickname, "🔧 修改權限"); }));

// Stats & Calibration
app.post("/api/admin/stats", auth, H(async req => {
    const {dateStr, hour} = getTWTime(), hData = await redis.hgetall(`${KEYS.HOURLY}${dateStr}`), counts = new Array(24).fill(0);
    let total = 0; 
    if(hData) { 
        for(let i=0; i<24; i++) {
            let iss = parseInt(hData[`${i}_i`]) || 0;
            if(!hData[`${i}_i`] && hData[i]) iss = parseInt(hData[i]); // Backwards compact
            const pass = parseInt(hData[`${i}_p`]) || 0;
            const net = Math.max(0, iss - pass);
            counts[i] = net; total += net; 
        } 
    }
    return { history: await all("SELECT * FROM history ORDER BY id DESC LIMIT 50"), hourlyCounts: counts, todayCount: Math.max(0, total), serverHour: hour };
}));
app.post("/api/admin/stats/clear", auth, perm('settings'), H(async r => { const {dateStr} = getTWTime(); await redis.del(`${KEYS.HOURLY}${dateStr}`); await run("DELETE FROM history WHERE date_str=?", [dateStr]); addLog(r.user.nickname, "🗑️ 清空今日統計"); }));
app.post("/api/admin/stats/adjust", auth, perm('settings'), H(async r => { const {dateStr} = getTWTime(); await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${r.body.hour}_i`, r.body.delta); }));
app.post("/api/admin/stats/calibrate", auth, perm('settings'), H(async r => {
    // FORCE SYNC: Calculates Total Target (Issued - PassedCount) and adjusts the current hour's stats to match.
    const {dateStr, hour} = getTWTime();
    const [issuedStr, passedList] = await Promise.all([redis.get(KEYS.ISSUED), redis.zrange(KEYS.PASSED, 0, -1)]);
    const issued = parseInt(issuedStr) || 0;
    const passed = passedList ? passedList.length : 0;
    const targetTotal = Math.max(0, issued - passed);

    // Get current total from stats
    const hData = await redis.hgetall(`${KEYS.HOURLY}${dateStr}`);
    let currentStatsTotal = 0;
    if(hData) {
        for(let i=0; i<24; i++) {
            let iss = parseInt(hData[`${i}_i`]) || 0;
            if(!hData[`${i}_i`] && hData[i]) iss = parseInt(hData[i]);
            const p = parseInt(hData[`${i}_p`]) || 0;
            currentStatsTotal += Math.max(0, iss - p);
        }
    }
    
    const diff = targetTotal - currentStatsTotal;
    if(diff !== 0) {
        await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, diff);
        addLog(r.user.nickname, `⚖️ 校正統計 (${diff > 0 ? '+' : ''}${diff})`);
    }
    return { success: true, diff };
}));
app.post("/api/admin/export-csv", auth, perm('settings'), H(async r => {
    // [Optimization] Export logic improved: Defaults to current day to avoid massive dumps.
    const { dateStr } = getTWTime();
    const targetDate = r.body.date || dateStr;
    const rows = await all("SELECT * FROM history WHERE date_str = ? ORDER BY id ASC", [targetDate]);
    const csv = "\uFEFFDate,Time,Number,Action,Operator,Wait(min)\n" + rows.map(d => `${d.date_str},${new Date(d.timestamp).toLocaleTimeString('zh-TW')},${d.number},${d.action},${d.operator},${d.wait_time_min}`).join("\n");
    return { csvData: csv, fileName: `export_${targetDate}.csv` };
}));
app.post("/api/logs/clear", auth, perm('settings'), H(async r => { await redis.del(KEYS.LOGS); io.to("admin").emit("initAdminLogs", []); }));

// Features
app.post("/api/featured/add", auth, perm('settings'), H(async r=>{ await redis.rpush(KEYS.FEATURED, JSON.stringify(r.body)); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/get", auth, H(async r => (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)));
app.post("/api/featured/remove", auth, perm('settings'), H(async r => { const l=await redis.lrange(KEYS.FEATURED,0,-1); const t=l.find(x=>x.includes(r.body.linkUrl)); if(t) await redis.lrem(KEYS.FEATURED, 1, t); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/edit", auth, perm('settings'), H(async r => { const l=await redis.lrange(KEYS.FEATURED,0,-1); const idx=l.findIndex(x=>x.includes(r.body.oldLinkUrl)); if(idx>=0) await redis.lset(KEYS.FEATURED, idx, JSON.stringify({linkText:r.body.newLinkText, linkUrl:r.body.newLinkUrl})); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/clear", auth, perm('settings'), H(async r => { await redis.del(KEYS.FEATURED); io.emit("updateFeaturedContents", []); }));

// Appointments
app.post("/api/appointment/add", auth, perm('appointment'), H(async r => { await run("INSERT INTO appointments (number, scheduled_time) VALUES (?, ?)", [r.body.number, new Date(r.body.timeStr).getTime()]); addLog(r.user.nickname, `📅 預約: ${r.body.number}`); broadcastAppts(); }));
app.post("/api/appointment/list", auth, perm('appointment'), H(async r => ({ appointments: await all("SELECT * FROM appointments WHERE status='pending' ORDER BY scheduled_time ASC") })));
app.post("/api/appointment/remove", auth, perm('appointment'), H(async r => { await run("DELETE FROM appointments WHERE id=?", [r.body.id]); broadcastAppts(); }));

// Toggles & Line
app.post("/set-sound-enabled", auth, perm('settings'), H(async r=>{ await redis.set("callsys:soundEnabled", r.body.enabled?"1":"0"); io.emit("updateSoundSetting", r.body.enabled); }));
app.post("/set-public-status", auth, perm('settings'), H(async r=>{ await redis.set("callsys:isPublic", r.body.isPublic?"1":"0"); io.emit("updatePublicStatus", r.body.isPublic); }));
app.post("/set-system-mode", auth, perm('settings'), H(async r=>{ await redis.set(KEYS.MODE, r.body.mode); io.emit("updateSystemMode", r.body.mode); }));
app.post("/reset", auth, perm('settings'), H(async r => resetSys(r.user.nickname)));
app.post("/api/admin/broadcast", auth, H(async r => { io.emit("adminBroadcast", r.body.message); addLog(r.user.nickname, `📢 廣播: ${r.body.message}`); }));
app.post("/api/admin/line-settings/get", auth, perm('settings'), H(async r => ({ 
    "LINE Access Token": await redis.get(KEYS.LINE.CFG_TOKEN) || (LINE_ACCESS_TOKEN ? "(Using Env Var)" : ""),
    "LINE Channel Secret": await redis.get(KEYS.LINE.CFG_SECRET) || (LINE_CHANNEL_SECRET ? "(Using Env Var)" : "")
})));
app.post("/api/admin/line-settings/save", auth, perm('settings'), H(async r => {
    if(r.body["LINE Access Token"]) await redis.set(KEYS.LINE.CFG_TOKEN, r.body["LINE Access Token"]);
    if(r.body["LINE Channel Secret"]) await redis.set(KEYS.LINE.CFG_SECRET, r.body["LINE Channel Secret"]);
    initLine(); addLog(r.user.nickname, "🔧 更新 LINE 設定");
}));
app.post("/api/admin/line-settings/reset", auth, perm('settings'), H(async r => { await redis.del(KEYS.LINE.CFG_TOKEN, KEYS.LINE.CFG_SECRET); initLine(); }));
app.post("/api/admin/line-settings/get-unlock-pass", auth, perm('settings'), H(async r => ({ password: await redis.get(KEYS.LINE.PWD) })));
app.post("/api/admin/line-settings/save-pass", auth, perm('settings'), H(async r => { await redis.set(KEYS.LINE.PWD, r.body.password); }));

// Line Bot
async function checkLine(curr) {
    if(!lineClient) return;
    const t = curr+5, [appr, arr, sub5, sub0] = await Promise.all([redis.get('callsys:line:msg:approach'), redis.get('callsys:line:msg:arrival'), redis.smembers(`${KEYS.LINE.SUB}${t}`), redis.smembers(`${KEYS.LINE.SUB}${curr}`)]);
    const send = (ids, txt) => { while(ids.length) lineClient.multicast(ids.splice(0, 500), [{type:'text', text:txt}]).catch(console.error); };
    if(sub5.length) send(sub5, (appr||'🔔 快到了').replace('{current}',curr).replace('{target}',t).replace('{diff}',5));
    if(sub0.length) { send(sub0, (arr||'🎉 到您了').replace('{current}',curr)); const p=redis.multi().del(`${KEYS.LINE.SUB}${curr}`).srem(KEYS.LINE.ACTIVE,curr); sub0.forEach(u=>p.del(`${KEYS.LINE.USER}${u}`)); await p.exec(); }
}
if(LINE_ACCESS_TOKEN) {
    app.post('/callback', (req, res, next) => {
        if (!lineClient) return res.status(500).end();
        line.middleware({ channelAccessToken: lineClient.config.channelAccessToken, channelSecret: lineClient.config.channelSecret })(req, res, next);
    }, (req,res)=>Promise.all(req.body.events.map(async e => {
        if(e.type!=='message'||e.message.type!=='text') return;
        const t=e.message.text.trim(), u=e.source.userId, rp=x=>lineClient.replyMessage(e.replyToken,{type:'text',text:x});
        if(t==='後台登入') return rp((await redis.get(`${KEYS.LINE.ADMIN}${u}`)) ? `🔗 ${process.env.RENDER_EXTERNAL_URL}/admin.html` : (await redis.set(`${KEYS.LINE.CTX}${u}`,'WAIT_PWD','EX',120),"請輸入密碼"));
        if((await redis.get(`${KEYS.LINE.CTX}${u}`))==='WAIT_PWD' && t===(await redis.get(KEYS.LINE.PWD)||`unlock${ADMIN_TOKEN}`)) { await redis.set(`${KEYS.LINE.ADMIN}${u}`,"1","EX",600); await redis.del(`${KEYS.LINE.CTX}${u}`); return rp("🔓 驗證成功"); }
        if(['?','status'].includes(t.toLowerCase())) { const [n,i,my]=await Promise.all([redis.get(KEYS.CURRENT),redis.get(KEYS.ISSUED),redis.get(`${KEYS.LINE.USER}${u}`)]); return rp(`叫號:${n||0} / 發號:${i||0}${my?`\n您的:${my}`:''}`); }
        if(/^\d+$/.test(t)) { const n=parseInt(t), c=parseInt(await redis.get(KEYS.CURRENT))||0; if(n<=c) return rp("已過號"); await redis.multi().set(`${KEYS.LINE.USER}${u}`,n,'EX',43200).sadd(`${KEYS.LINE.SUB}${n}`,u).expire(`${KEYS.LINE.SUB}${n}`,43200).sadd(KEYS.LINE.ACTIVE,n).exec(); return rp(`設定成功: ${n}號`); }
        if(['cancel'].includes(t.toLowerCase())) { const n=await redis.get(`${KEYS.LINE.USER}${u}`); if(n){await redis.multi().del(`${KEYS.LINE.USER}${u}`).srem(`${KEYS.LINE.SUB}${n}`,u).exec(); return rp("已取消");} }
    })).then(()=>res.json({})).catch(e=>res.status(500).end()));
}

cron.schedule('0 4 * * *', () => { resetSys('系統自動'); run("DELETE FROM history WHERE timestamp < ?", [Date.now()-(30*86400000)]); }, { timezone: "Asia/Taipei" });
io.on("connection", async s => {
    if(s.handshake.auth.token) { try { const u=JSON.parse(await redis.get(`${KEYS.SESSION}${s.handshake.auth.token}`)); if(u) { s.join("admin"); const socks = await io.in("admin").fetchSockets(); io.to("admin").emit("updateOnlineAdmins", [...new Map(socks.map(x=>x.handshake.auth.token).filter(Boolean).map(t=>[t,u])).values()]); s.emit("initAdminLogs", await redis.lrange(KEYS.LOGS,0,99)); broadcastAppts(); } } catch(e){} }
    s.join('public');
    const [c,i,p,f,snd,pub,m] = await Promise.all([redis.get(KEYS.CURRENT),redis.get(KEYS.ISSUED),redis.zrange(KEYS.PASSED,0,-1),redis.lrange(KEYS.FEATURED,0,-1),redis.get("callsys:soundEnabled"),redis.get("callsys:isPublic"),redis.get(KEYS.MODE)]);
    s.emit("update",Number(c)); s.emit("updateQueue",{current:Number(c),issued:Number(i)}); s.emit("updatePassed",p.map(Number)); s.emit("updateFeaturedContents",f.map(JSON.parse));
    s.emit("updateSoundSetting",snd==="1"); s.emit("updatePublicStatus",pub!=="0"); s.emit("updateSystemMode",m||'ticketing'); s.emit("updateWaitTime",await calcWaitTime());
});
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server v91.0 running on ${PORT}`));
