/* ==========================================
 * 伺服器 (index.js) - v47.0 Enterprise Features
 * 含：SQLite持久化、預約插隊、營業時間、多層級權限、精準估時
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
const sqlite3 = require('sqlite3').verbose(); // [新增] SQLite

// --- 1. 環境變數檢查 ---
const { PORT = 3000, UPSTASH_REDIS_URL: REDIS_URL, ADMIN_TOKEN, LINE_ACCESS_TOKEN, LINE_CHANNEL_SECRET } = process.env;
if (!ADMIN_TOKEN || !REDIS_URL) {
    console.error("\n\n❌❌❌ [嚴重錯誤] 缺少核心變數 ❌❌❌");
    console.error("請檢查 .env 檔案是否包含 UPSTASH_REDIS_URL 和 ADMIN_TOKEN\n\n");
    process.exit(1);
}

// --- 2. 進階設定 (營業時間 & 權限) ---
// [新增] 營業時間 (24h制) - 若不在時間內，將無法取號或叫號
const BUSINESS_HOURS = { start: 8, end: 22, enabled: false }; // 預設關閉以免誤鎖，需要請改為 true

// [新增] 角色權限定義
const ROLES = {
    VIEWER:   { level: 0, can: [] },
    OPERATOR: { level: 1, can: ['call', 'pass', 'recall', 'issue'] }, // 一般櫃台 (normal)
    MANAGER:  { level: 2, can: ['call', 'pass', 'recall', 'issue', 'settings', 'appointment'] },
    ADMIN:    { level: 9, can: ['*'] } // 超級管理員 (super)
};

const app = express();
const server = Server(app);
const io = socketio(server, { cors: { origin: "*" }, pingTimeout: 60000 });

// --- 3. 資料庫初始化 (SQLite & Redis) ---
const LOG_DIR = path.join(__dirname, 'user_logs');
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR); } catch(e) {}

// [新增] SQLite 連線與建表
const db = new sqlite3.Database(path.join(__dirname, 'callsys.db'), (err) => {
    if (err) console.error("❌ SQLite Error:", err.message);
    else {
        console.log("✅ SQLite 資料庫已連線 (數據持久化開啟)");
        // 歷史紀錄表
        db.run(`CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_str TEXT, timestamp INTEGER, number INTEGER,
            action TEXT, operator TEXT, wait_time_min REAL
        )`);
        // 預約表
        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number INTEGER, scheduled_time INTEGER,
            status TEXT DEFAULT 'pending' -- pending, called, cancelled
        )`);
    }
});

const redis = new Redis(REDIS_URL, { tls: { rejectUnauthorized: false }, retryStrategy: t => Math.min(t * 50, 2000) });
redis.on("error", e => console.error("🔥 Redis Error:", e.message));
redis.on("connect", () => console.log("✅ Redis 連線成功！"));

const lineClient = (LINE_ACCESS_TOKEN && LINE_CHANNEL_SECRET) ? new line.Client({ channelAccessToken: LINE_ACCESS_TOKEN, channelSecret: LINE_CHANNEL_SECRET }) : null;

const KEYS = {
    CURRENT: 'callsys:number', ISSUED: 'callsys:issued', MODE: 'callsys:mode', PASSED: 'callsys:passed',
    FEATURED: 'callsys:featured', UPDATED: 'callsys:updated', SOUND: 'callsys:soundEnabled', PUBLIC: 'callsys:isPublic',
    LOGS: 'callsys:admin-log', USERS: 'callsys:users', NICKS: 'callsys:nicknames', SESSION: 'callsys:session:',
    LINE: { SUB: 'callsys:line:notify:', USER: 'callsys:line:user:', PWD: 'callsys:line:unlock_pwd', ADMIN: 'callsys:line:admin_session:', CTX: 'callsys:line:context:', ACTIVE: 'callsys:line:active_subs_set' }
};

redis.defineCommand("safeNextNumber", { numberOfKeys: 2, lua: `return (tonumber(redis.call("GET",KEYS[1]))or 0) < (tonumber(redis.call("GET",KEYS[2]))or 0) and redis.call("INCR",KEYS[1]) or -1` });
redis.defineCommand("decrIfPositive", { numberOfKeys: 1, lua: `local v=tonumber(redis.call("GET",KEYS[1])) return (v and v>0) and redis.call("DECR",KEYS[1]) or (v or 0)` });

// --- 4. 核心邏輯函式 ---
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

const broadcastQueue = async () => {
    let [c, i] = await redis.mget(KEYS.CURRENT, KEYS.ISSUED);
    c = parseInt(c)||0; i = parseInt(i)||0;
    if(i < c) { i = c; await redis.set(KEYS.ISSUED, i); }
    io.emit("update", c); io.emit("updateQueue", { current: c, issued: i });
    io.emit("updateWaitTime", await calcWaitTime()); 
    io.emit("updateTimestamp", new Date().toISOString());
};

// [修改] 更精準的等待時間計算 (基於 SQLite 歷史數據)
let cacheWait = 0, lastWaitCalc = 0;
const calcWaitTime = async (force=false) => {
    if(!force && Date.now()-lastWaitCalc<60000) return cacheWait;
    return new Promise(resolve => {
        // 取最近 20 筆叫號紀錄，計算平均間隔
        db.all(`SELECT timestamp FROM history WHERE action='call' ORDER BY timestamp DESC LIMIT 20`, [], (err, rows) => {
            if(err || !rows || rows.length < 2) { resolve(0); return; }
            let totalDiff = 0;
            for(let i=0; i<rows.length-1; i++) totalDiff += (rows[i].timestamp - rows[i+1].timestamp);
            const avgMs = totalDiff / (rows.length - 1);
            cacheWait = Math.ceil((avgMs / 60000) * 10) / 10; // 取小數一位
            lastWaitCalc = Date.now();
            resolve(cacheWait);
        });
    });
};

// [修改] 核心控制邏輯 (整合預約、營業時間、持久化)
async function handleControl(type, { body, user }) {
    const { direction, number } = body;
    const curr = parseInt(await redis.get(KEYS.CURRENT))||0;
    let issued = parseInt(await redis.get(KEYS.ISSUED))||0, newNum=0, logMsg='', delta=0;

    // A. 營業時間檢查
    if(['call', 'issue', 'take'].includes(type) && BUSINESS_HOURS.enabled) {
        const h = new Date().getHours();
        if(h < BUSINESS_HOURS.start || h >= BUSINESS_HOURS.end) return { error: "非營業時間" };
    }

    // B. 叫號邏輯 (含預約插隊)
    if(type === 'call') {
        if(direction==='next') {
            // B-1. 檢查是否有到期的預約
            const pendingAppt = await new Promise(r => db.get("SELECT number FROM appointments WHERE status='pending' AND scheduled_time <= ? ORDER BY scheduled_time ASC LIMIT 1", [Date.now()], (e, row)=>r(row)));
            
            if(pendingAppt) {
                newNum = pendingAppt.number;
                await redis.set(KEYS.CURRENT, newNum);
                db.run("UPDATE appointments SET status='called' WHERE number=?", [newNum]);
                logMsg = `🔔 呼叫預約號碼 ${newNum}`;
            } else {
                // B-2. 正常跳號
                if((newNum = await redis.safeNextNumber(KEYS.CURRENT, KEYS.ISSUED)) === -1) {
                    if(issued < curr) { await broadcastQueue(); return { error: "已無等待 (同步)" }; }
                    return { error: "已無等待人數" };
                }
                logMsg = `號碼增加為 ${newNum}`;
            }
        } else { 
            newNum = await redis.decrIfPositive(KEYS.CURRENT); logMsg = `號碼回退為 ${newNum}`; 
        }
        checkLineNotify(newNum).catch(()=>{});
    } 
    else if(type === 'issue') {
        if(direction==='next') { newNum = await redis.incr(KEYS.ISSUED); logMsg = `手動發號至 ${newNum}`; }
        else if(issued > curr) { newNum = await redis.decr(KEYS.ISSUED); logMsg = `手動發號回退至 ${newNum}`; }
        else return { error: "不可小於叫號" };
    } 
    else if(type.startsWith('set')) {
        newNum = parseInt(number); if(isNaN(newNum)||newNum<0) return { error: "無效號碼" };
        if(type==='set_issue' && newNum===0) { await performReset(user.nickname); return {}; }
        if(type==='set_call') {
            await redis.mset(KEYS.CURRENT, newNum, ...(newNum>issued?[KEYS.ISSUED, newNum]:[]));
            logMsg = `手動設定為 ${newNum}`; checkLineNotify(newNum).catch(()=>{});
        } else { await redis.set(KEYS.ISSUED, newNum); logMsg = `修正發號為 ${newNum}`; }
    }

    // C. 數據持久化 & Log
    if(logMsg) {
        addLog(user.nickname, logMsg);
        // 寫入 SQLite
        db.run(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`,
            [getTWTime().dateStr, Date.now(), newNum||curr, type, user.nickname, await calcWaitTime()]);
    }
    await broadcastQueue();
    return { number: newNum };
}

async function performReset(by) {
    const pipe = redis.multi().set(KEYS.CURRENT,0).set(KEYS.ISSUED,0).del(KEYS.PASSED, KEYS.LINE.ACTIVE);
    (await redis.smembers(KEYS.LINE.ACTIVE)).forEach(k=>pipe.del(`${KEYS.LINE.SUB}${k}`));
    (await redis.keys(`${KEYS.LINE.USER}*`)).forEach(k=>pipe.del(k));
    await pipe.exec();
    // 清空當日預約
    db.run("UPDATE appointments SET status='cancelled' WHERE status='pending'");
    addLog(by, "💥 系統全域重置"); cacheWait = 0;
    await broadcastQueue(); io.emit("updatePassed",[]);
}

// --- Middleware (CSP & Auth) ---
app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc:["'self'","*"], scriptSrc:["'self'","'unsafe-inline'","'unsafe-eval'","*"], styleSrc:["'self'","'unsafe-inline'","*"], imgSrc:["'self'","data:","*"], connectSrc:["'self'","*"], fontSrc:["'self'","*"], objectSrc:["'none'"], upgradeInsecureRequests:[] } }
}));
app.use(express.static(path.join(__dirname, "public"))); 
app.use(express.json()); app.set('trust proxy', 1);

const asyncHandler = fn => async(req, res, next) => {
    try { const r = await fn(req, res); if(r!==false) res.json(r||{success:true}); }
    catch(e){ console.error(e); res.status(500).json({error:e.message}); }
};

const auth = async(req, res, next) => {
    try {
        const u = req.body.token ? JSON.parse(await redis.get(`${KEYS.SESSION}${req.body.token}`)) : null;
        if(!u) return res.status(403).json({error:"權限不足或過期"});
        req.user = u; await redis.expire(`${KEYS.SESSION}${req.body.token}`, 28800); next();
    } catch(e) { res.status(403).json({error:"Invalid Token"}); }
};

// [新增] 權限檢查 Middleware
const checkPermission = (action) => (req, res, next) => {
    // 映射: super -> ADMIN, normal -> OPERATOR (可擴充更多)
    const roleKey = req.user.role === 'super' ? 'ADMIN' : 'OPERATOR';
    const role = ROLES[roleKey];
    if(role.level >= 9 || role.can.includes(action) || role.can.includes('*')) return next();
    res.status(403).json({ error: "權限不足" });
};

// --- Routes ---
app.post("/login", rateLimit({windowMs:9e5,max:100}), asyncHandler(async req => {
    const { username: u, password: p } = req.body;
    let valid = (u==='superadmin' && p===ADMIN_TOKEN);
    if(!valid && await redis.hexists(KEYS.USERS, u)) valid = await bcrypt.compare(p, await redis.hget(KEYS.USERS, u));
    if(!valid) throw new Error("帳密錯誤");
    
    const token = uuidv4(), nick = await redis.hget(KEYS.NICKS, u) || u;
    // 記錄登入日誌到檔案 (Log File Persistence)
    const logPath = path.join(LOG_DIR, `system_${getTWTime().dateStr}.log`);
    fs.appendFile(logPath, `[${new Date().toLocaleTimeString()}] [${u}] Login\n`, ()=>{});
    
    await redis.set(`${KEYS.SESSION}${token}`, JSON.stringify({username:u, role:valid&&u==='superadmin'?'super':'normal', nickname:nick}), "EX", 28800);
    return { token, role: u==='superadmin'?'super':'normal', username: u, nickname: nick };
}));

app.post("/api/ticket/take", rateLimit({windowMs:36e5,max:20}), asyncHandler(async req => {
    if(await redis.get(KEYS.MODE)==='input') throw new Error("僅限手動輸入");
    if(BUSINESS_HOURS.enabled) { const h=new Date().getHours(); if(h<BUSINESS_HOURS.start||h>=BUSINESS_HOURS.end) throw new Error("非營業時間"); }
    const t = await redis.incr(KEYS.ISSUED); 
    // 取號也寫入 SQLite
    db.run(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`,
        [getTWTime().dateStr, Date.now(), t, 'online_take', 'User', await calcWaitTime()]);
    await broadcastQueue(); return { ticket: t };
}));

// 控制相關 (加入權限檢查)
const ctrls = ['call','issue','set-call','set-issue'];
ctrls.forEach(c => app.post(`/api/control/${c}`, auth, checkPermission(c.startsWith('set')?'settings':c.split('-')[0]), asyncHandler(async req => {
    const r = await handleControl(c.replace('-','_'), req);
    if(r.error) throw new Error(r.error); return r;
})));

app.post("/api/control/pass-current", auth, checkPermission('pass'), asyncHandler(async req => {
    const c = parseInt(await redis.get(KEYS.CURRENT))||0; if(!c) throw new Error("無叫號");
    await redis.zadd(KEYS.PASSED, c, c);
    const next = (await redis.safeNextNumber(KEYS.CURRENT, KEYS.ISSUED));
    const act = next===-1 ? c : next;
    // 跳號記錄
    db.run(`INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)`,
        [getTWTime().dateStr, Date.now(), c, 'pass', req.user.nickname, await calcWaitTime()]);
    
    checkLineNotify(act).catch(()=>{}); await broadcastQueue();
    addLog(req.user.nickname, `⏩ 跳號至 ${act}`); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); return { next: act };
}));

app.post("/api/control/recall-passed", auth, checkPermission('recall'), asyncHandler(async req => {
    await redis.zrem(KEYS.PASSED, req.body.number); await redis.set(KEYS.CURRENT, req.body.number);
    addLog(req.user.nickname, `↩️ 重呼 ${req.body.number}`); 
    io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); await broadcastQueue();
}));

// [新增] 預約相關 API
app.post("/api/appointment/add", auth, checkPermission('appointment'), asyncHandler(async req => {
    const { number, timeStr } = req.body; // timeStr: "2023-10-27 10:30"
    if(!number || !timeStr) throw new Error("參數不足");
    db.run("INSERT INTO appointments (number, scheduled_time) VALUES (?, ?)", [number, new Date(timeStr).getTime()]);
    addLog(req.user.nickname, `📅 新增預約: ${number}號`);
}));

app.post("/api/passed/add", auth, checkPermission('pass'), asyncHandler(async r=>{ await redis.zadd(KEYS.PASSED, r.body.number, r.body.number); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); }));
app.post("/api/passed/remove", auth, checkPermission('pass'), asyncHandler(async r=>{ await redis.zrem(KEYS.PASSED, r.body.number); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); }));
app.post("/api/passed/clear", auth, checkPermission('pass'), asyncHandler(async r=>{ await redis.del(KEYS.PASSED); io.emit("updatePassed", []); }));
app.post("/api/featured/add", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.rpush(KEYS.FEATURED, JSON.stringify(r.body)); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/edit", auth, checkPermission('settings'), asyncHandler(async r=>{ 
    const l = await redis.lrange(KEYS.FEATURED,0,-1), idx = l.indexOf(JSON.stringify({linkText:r.body.oldLinkText,linkUrl:r.body.oldLinkUrl}));
    if(idx>-1) await redis.lset(KEYS.FEATURED, idx, JSON.stringify({linkText:r.body.newLinkText,linkUrl:r.body.newLinkUrl}));
    io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse));
}));
app.post("/api/featured/remove", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.lrem(KEYS.FEATURED, 1, JSON.stringify(r.body)); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/clear", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.del(KEYS.FEATURED); io.emit("updateFeaturedContents", []); }));
app.post("/api/featured/get", auth, asyncHandler(async r=>{ return (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse); }));

app.post("/set-sound-enabled", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.set(KEYS.SOUND, r.body.enabled?"1":"0"); io.emit("updateSoundSetting", r.body.enabled); }));
app.post("/set-public-status", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.set(KEYS.PUBLIC, r.body.isPublic?"1":"0"); io.emit("updatePublicStatus", r.body.isPublic); }));
app.post("/api/admin/broadcast", auth, checkPermission('call'), asyncHandler(async r=>{ io.emit("adminBroadcast", sanitize(r.body.message).substr(0,50)); addLog(r.user.nickname,`📢 ${r.body.message}`); }));
app.post("/api/logs/clear", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.del(KEYS.LOGS); io.to("admin").emit("initAdminLogs",[]); }));

// 報表相關
app.post("/api/admin/stats", auth, asyncHandler(async req => {
    // 簡單即時統計 (從 Redis)
    const {dateStr, hour} = getTWTime();
    const [hist, hData] = await Promise.all([redis.lrange(KEYS.LOGS,0,99), redis.hgetall(`${KEYS.HOURLY}${dateStr}`)]);
    const counts = new Array(24).fill(0); let total=0;
    for(const [h,c] of Object.entries(hData||{})) { counts[parseInt(h)]=parseInt(c); total+=parseInt(c); }
    return { history: hist, hourlyCounts: counts, todayCount: total, serverHour: hour };
}));
// [新增] 歷史詳細報表 (從 SQLite)
app.post("/api/admin/history-report", auth, checkPermission('settings'), asyncHandler(async req => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM history ORDER BY timestamp DESC LIMIT 1000", [], (err, rows) => {
            if(err) reject(err); else resolve({ data: rows });
        });
    });
}));

app.post("/api/admin/stats/adjust", auth, checkPermission('settings'), asyncHandler(async r=>{ 
    const {dateStr}=getTWTime(); await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, r.body.hour, r.body.delta); 
}));
app.post("/api/admin/stats/clear", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.del(`${KEYS.HOURLY}${getTWTime().dateStr}`); addLog(r.user.nickname,"⚠️ 清空統計"); }));
app.post("/set-system-mode", auth, checkPermission('settings'), asyncHandler(async r=>{ await redis.set(KEYS.MODE, r.body.mode); io.emit("updateSystemMode", r.body.mode); }));
app.post("/reset", auth, checkPermission('settings'), asyncHandler(async r=>{ await performReset(r.user.nickname); }));

// 帳號管理
app.post("/api/admin/users", auth, asyncHandler(async r=>{
    const n = await redis.hgetall(KEYS.NICKS)||{}, u = await redis.hkeys(KEYS.USERS)||[];
    return { users: [{username:'superadmin',nickname:n['superadmin']||'Super',role:'super'}, ...u.map(x=>({username:x,nickname:n[x]||x,role:'normal'}))] };
}));
app.post("/api/admin/add-user", auth, checkPermission('settings'), asyncHandler(async r=>{ 
    if(await redis.hexists(KEYS.USERS, r.body.newUsername)) throw new Error("已存在");
    await redis.hset(KEYS.USERS, r.body.newUsername, await bcrypt.hash(r.body.newPassword,10));
    await redis.hset(KEYS.NICKS, r.body.newUsername, r.body.newNickname);
}));
app.post("/api/admin/del-user", auth, checkPermission('settings'), asyncHandler(async r=>{ 
    if(r.body.delUsername==='superadmin') throw new Error("不可刪除"); 
    await redis.hdel(KEYS.USERS, r.body.delUsername); await redis.hdel(KEYS.NICKS, r.body.delUsername); 
}));
app.post("/api/admin/set-nickname", auth, asyncHandler(async r=>{ 
    if(r.body.targetUsername !== r.user.username && r.user.role !== 'super') throw new Error("權限不足");
    await redis.hset(KEYS.NICKS, r.body.targetUsername, r.body.nickname);
}));
app.post("/api/admin/export-csv", auth, checkPermission('settings'), asyncHandler(async r=>{
    return new Promise((resolve, reject) => {
        // 從 SQLite 導出 CSV (更完整)
        db.all("SELECT * FROM history WHERE date_str = ?", [getTWTime().dateStr], (err, rows) => {
            if(err) reject(err);
            const header = "\uFEFF時間,號碼,動作,操作員,等待(分)\n";
            const body = rows.map(r => `${new Date(r.timestamp).toLocaleTimeString()},${r.number},${r.action},${r.operator},${r.wait_time_min}`).join("\n");
            resolve({ csvData: header+body, fileName: `report_${getTWTime().dateStr}.csv` });
        });
    });
}));

// LINE Settings
app.post("/api/admin/line-settings/:act", auth, checkPermission('settings'), asyncHandler(async req => {
    const act = req.params.act, fields = ['approach','arrival','status','personal','passed','set_ok','cancel','login_hint','err_passed','err_no_sub','set_hint'];
    const keys = fields.map(k=>`callsys:line:msg:${k}`);
    if(act==='get') { const v = await redis.mget(keys); return fields.reduce((a,k,i)=>(a[k]=v[i]||"",a),{}); }
    if(act==='save') { const pipe = redis.multi(); fields.forEach((k,i)=>pipe.set(keys[i], sanitize(req.body[k]))); await pipe.exec(); }
    if(act==='reset') await redis.del(keys);
    if(act==='set-unlock-pass') await redis.set(KEYS.LINE.PWD, req.body.password);
    if(act==='get-unlock-pass') return { password: await redis.get(KEYS.LINE.PWD)||"" };
}));

// LINE Bot Logic (保持不變，省略 checkPermission)
const lineMsgs = { approach:"🔔 叫號提醒！\n現已叫號至 {current}。\n您的 {target} 即將輪到 (剩 {diff} 組)。", arrival:"🎉 輪到您了！\n{current} 號請至櫃台。", status:"📊 叫號：{current}\n發號：{issued}{personal}" };
async function checkLineNotify(curr) {
    if(!lineClient) return;
    const target = curr + 5;
    const [appT, arrT, subs, exact] = await Promise.all([redis.get('callsys:line:msg:approach'), redis.get('callsys:line:msg:arrival'), redis.smembers(`${KEYS.LINE.SUB}${target}`), redis.smembers(`${KEYS.LINE.SUB}${curr}`)]);
    const send = (ids, txt) => ids.length && lineClient.multicast(ids, [{type:'text', text:txt}]);
    if(subs.length) await send(subs, (appT||lineMsgs.approach).replace('{current}',curr).replace('{target}',target).replace('{diff}',5));
    if(exact.length) {
        await send(exact, (arrT||lineMsgs.arrival).replace('{current}',curr).replace('{target}',curr).replace('{diff}',0));
        const pipe = redis.multi().del(`${KEYS.LINE.SUB}${curr}`).srem(KEYS.LINE.ACTIVE, curr);
        exact.forEach(u => pipe.del(`${KEYS.LINE.USER}${u}`)); await pipe.exec();
    }
}
if(lineClient) app.post('/callback', line.middleware({channelAccessToken:LINE_ACCESS_TOKEN,channelSecret:LINE_CHANNEL_SECRET}), (req,res)=>Promise.all(req.body.events.map(handleLine)).then(r=>res.json(r)).catch(e=>res.status(500).end()));
async function handleLine(e) {
    if(e.type!=='message' || e.message.type!=='text') return;
    const txt = e.message.text.trim(), uid = e.source.userId, rT = e.replyToken, ctx = `${KEYS.LINE.CTX}${uid}`;
    const reply = t => lineClient.replyMessage(rT, {type:'text',text:t});
    const msgKeys = ['status','personal','passed','set_ok','cancel','login_hint','err_passed','err_no_sub','set_hint'];
    const msgs = (await redis.mget(msgKeys.map(k=>`callsys:line:msg:${k}`))).reduce((a,v,i)=>(a[msgKeys[i]]=v,a),{});

    if(txt==='後台登入') return reply((await redis.get(`${KEYS.LINE.ADMIN}${uid}`)) ? `🔗 ${process.env.RENDER_EXTERNAL_URL}/admin.html` : (await redis.set(ctx,'WAIT_PWD','EX',120), msgs.login_hint||"請輸入密碼"));
    if((await redis.get(ctx))==='WAIT_PWD' && txt===(await redis.get(KEYS.LINE.PWD)||`unlock${ADMIN_TOKEN}`)) { await redis.set(`${KEYS.LINE.ADMIN}${uid}`,"1","EX",600); await redis.del(ctx); return reply("🔓 驗證成功，請再次點擊後台登入"); }
    
    if(['查詢','status','?'].includes(txt)) {
        const [c, i, uNum] = await Promise.all([redis.get(KEYS.CURRENT), redis.get(KEYS.ISSUED), redis.get(`${KEYS.LINE.USER}${uid}`)]);
        const pTxt = uNum ? (msgs.personal||"\n追蹤：{target}").replace('{target}',uNum).replace('{diff}',Math.max(0,uNum-c)) : "";
        return reply((msgs.status||lineMsgs.status).replace('{current}',c||0).replace('{issued}',i||0).replace('{personal}',pTxt));
    }
    if(['設定','set'].includes(txt)) { await redis.set(ctx,'WAIT_NUM','EX',120); return reply(msgs.set_hint||"請輸入號碼"); }
    if((await redis.get(ctx))==='WAIT_NUM' && /^\d+$/.test(txt)) {
        const n=parseInt(txt), c=parseInt(await redis.get(KEYS.CURRENT))||0;
        if(n<=c) { await redis.del(ctx); return reply((msgs.err_passed||"已過號").replace('{target}',n).replace('{current}',c)); }
        const old = await redis.get(`${KEYS.LINE.USER}${uid}`); if(old) await redis.srem(`${KEYS.LINE.SUB}${old}`, uid);
        await redis.multi().set(`${KEYS.LINE.USER}${uid}`,n,'EX',43200).sadd(`${KEYS.LINE.SUB}${n}`,uid).expire(`${KEYS.LINE.SUB}${n}`,43200).sadd(KEYS.LINE.ACTIVE,n).del(ctx).exec();
        return reply((msgs.set_ok||"設定成功").replace('{target}',n).replace('{current}',c).replace('{diff}',n-c));
    }
    if(['取消','cancel'].includes(txt)) {
        const n = await redis.get(`${KEYS.LINE.USER}${uid}`); if(!n) return reply(msgs.err_no_sub||"無設定");
        await redis.multi().del(`${KEYS.LINE.USER}${uid}`).srem(`${KEYS.LINE.SUB}${n}`,uid).exec();
        return reply((msgs.cancel||"已取消").replace('{target}',n));
    }
    if(['過號','passed'].includes(txt)) return reply((msgs.passed||"過號：{list}").replace('{list}', (await redis.zrange(KEYS.PASSED,0,-1)).join(',')||"無"));
}

cron.schedule('0 4 * * *', () => performReset('系統自動'), { timezone: "Asia/Taipei" });
io.on("connection", async s => {
    if(s.handshake.auth.token) {
        try { const u = JSON.parse(await redis.get(`${KEYS.SESSION}${s.handshake.auth.token}`)); if(u) { s.join("admin"); s.emit("initAdminLogs", await redis.lrange(KEYS.LOGS,0,99)); } } catch(e) {}
    }
    s.join('public');
    const [c, i, p, f, u, snd, pub, m] = await Promise.all([redis.get(KEYS.CURRENT), redis.get(KEYS.ISSUED), redis.zrange(KEYS.PASSED,0,-1), redis.lrange(KEYS.FEATURED,0,-1), redis.get(KEYS.UPDATED), redis.get(KEYS.SOUND), redis.get(KEYS.PUBLIC), redis.get(KEYS.MODE)]);
    s.emit("update", Number(c)); s.emit("updateQueue", {current:Number(c), issued:Number(i)});
    s.emit("updatePassed", p.map(Number)); s.emit("updateFeaturedContents", f.map(JSON.parse));
    s.emit("updateSoundSetting", snd==="1"); s.emit("updatePublicStatus", pub!=="0"); s.emit("updateSystemMode", m||'ticketing');
    s.emit("updateWaitTime", await calcWaitTime());
});

server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server v47.0 Enterprise running on ${PORT}`));
