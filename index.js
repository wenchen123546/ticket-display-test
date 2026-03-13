/* Server v18.14 - 包含讀寫分離、卡片隱藏權限控制、叫號開關、MAX 進度解耦與前台文字自定義 */
require('dotenv').config();
const { Server } = require("http"), express = require("express"), socketio = require("socket.io"), Redis = require("ioredis"),
      helmet = require('helmet'), rateLimit = require('express-rate-limit'), { v4: uuidv4 } = require('uuid'),
      bcrypt = require('bcrypt'), line = require('@line/bot-sdk'), cron = require('node-cron'), fs = require("fs"),
      path = require("path"), sqlite3 = require('sqlite3').verbose(), app = express();

const { PORT = 3000, UPSTASH_REDIS_URL: REDIS_URL, ADMIN_TOKEN, LINE_ACCESS_TOKEN: LAT, LINE_CHANNEL_SECRET: LCS, ALLOWED_ORIGINS } = process.env;
if (!ADMIN_TOKEN || !REDIS_URL) { console.error("❌ Missing ADMIN_TOKEN or REDIS_URL"); process.exit(1); }

const DB_FLUSH_INTERVAL = 5000;

const DEFAULT_ROLES = { 
    OPERATOR: { level: 1, can: ['perm_command', 'perm_issue', 'perm_passed_view', 'perm_passed_edit', 'perm_booking_view'] }, 
    MANAGER: { level: 2, can: ['perm_command', 'perm_issue', 'perm_passed_view', 'perm_passed_edit', 'perm_booking_view', 'perm_booking_edit', 'perm_stats_view', 'perm_logs_view', 'perm_system_view', 'perm_links_view', 'perm_links_edit', 'perm_online_view', 'perm_users_view'] }, 
    ADMIN: { level: 9, can: ['*'] } 
};

// 新增 FRONTEND_TEXTS 用於儲存前台自定義文字
const KEYS = { CURRENT: 'callsys:number', MAX: 'callsys:max', ISSUED: 'callsys:issued', MODE: 'callsys:mode', PASSED: 'callsys:passed', FEATURED: 'callsys:featured', LOGS: 'callsys:admin-log', USERS: 'callsys:users', NICKS: 'callsys:nicknames', USER_ROLES: 'callsys:user_roles', SESSION: 'callsys:session:', HISTORY: 'callsys:stats:history', HOURLY: 'callsys:stats:hourly:', ROLES: 'callsys:config:roles', HOURS: 'callsys:config:hours', FRONTEND_TEXTS: 'callsys:config:frontend_texts', LINE: { SUB: 'callsys:line:notify:', USER: 'callsys:line:user:', PWD: 'callsys:line:unlock_pwd', ADMIN: 'callsys:line:admin_session:', CTX: 'callsys:line:context:', ACTIVE: 'callsys:line:active_subs_set', CFG_TOKEN: 'callsys:line:cfg:token', CFG_SECRET: 'callsys:line:cfg:secret', MSG: { APPROACH: 'callsys:line:msg:approach', ARRIVAL: 'callsys:line:msg:arrival', SUCCESS: 'callsys:line:msg:success', PASSED: 'callsys:line:msg:passed', CANCEL: 'callsys:line:msg:cancel', DEFAULT: 'callsys:line:msg:default', HELP: 'callsys:line:msg:help', LOGIN_PROMPT: 'callsys:line:msg:login_prompt', LOGIN_SUCCESS: 'callsys:line:msg:login_success', NO_TRACKING: 'callsys:line:msg:no_tracking', NO_PASSED: 'callsys:line:msg:no_passed', PASSED_PREFIX: 'callsys:line:msg:passed_prefix' }, CMD: { LOGIN: 'callsys:line:cmd:login', STATUS: 'callsys:line:cmd:status', CANCEL: 'callsys:line:cmd:cancel', PASSED: 'callsys:line:cmd:passed', HELP: 'callsys:line:cmd:help' }, AUTOREPLY: 'callsys:line:autoreply_rules' } };

app.disable('x-powered-by'); app.use(helmet({ contentSecurityPolicy: false })); app.use(express.static(path.join(__dirname, "public")));
const server = Server(app), io = socketio(server, { cors: { origin: ALLOWED_ORIGINS ? ALLOWED_ORIGINS.split(',') : ["http://localhost:3000"], methods: ["GET", "POST"], credentials: true }, pingTimeout: 60000 });
const redis = new Redis(REDIS_URL, { tls: { rejectUnauthorized: false }, retryStrategy: t => Math.min(t * 50, 2000) });
const db = new sqlite3.Database(path.join(__dirname, 'callsys.db')), dbQueue = [];

let lineClient = null;
const initLine = async () => { const [t, s] = await redis.mget(KEYS.LINE.CFG_TOKEN, KEYS.LINE.CFG_SECRET); if ((t||LAT) && (s||LCS)) lineClient = new line.Client({ channelAccessToken: t||LAT, channelSecret: s||LCS }); else console.warn("⚠️ LINE Token Missing"); };
initLine(); try { if (!fs.existsSync(path.join(__dirname, 'user_logs'))) fs.mkdirSync(path.join(__dirname, 'user_logs')); } catch(e) {}

const initDB = () => new Promise((res, rej) => db.serialize(() => { db.run("PRAGMA journal_mode=WAL;"); db.run(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, date_str TEXT, timestamp INTEGER, number INTEGER, action TEXT, operator TEXT, wait_time_min REAL)`); db.run(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY, number INTEGER, scheduled_time INTEGER, status TEXT DEFAULT 'pending')`); db.run("CREATE INDEX IF NOT EXISTS idx_history_date ON history(date_str)"); db.run("CREATE INDEX IF NOT EXISTS idx_history_ts ON history(timestamp)", e => e ? rej(e) : (console.log("✅ DB Ready"), res())); }));
setInterval(() => { if (!dbQueue.length) return; const batch = [...dbQueue]; dbQueue.length = 0; db.serialize(() => { db.run("BEGIN TRANSACTION"); const s = db.prepare("INSERT INTO history (date_str, timestamp, number, action, operator, wait_time_min) VALUES (?, ?, ?, ?, ?, ?)"); batch.forEach(r => s.run([r.dateStr, r.timestamp, r.number, r.action, r.operator, r.wait_time_min])); s.finalize(); db.run("COMMIT", e => e && console.error("Batch Error:", e)); }); }, DB_FLUSH_INTERVAL);
const dbQ = (m, s, p=[]) => new Promise((res, rej) => db[m](s, p, function(e, r){ e ? rej(e) : res(m==='run'?this:r) })), [run, all, get] = ['run', 'all', 'get'].map(m => (s, p) => dbQ(m, s, p));

redis.defineCommand("safeNextNumber", { numberOfKeys: 3, lua: `local m=tonumber(redis.call("GET",KEYS[1])) local c=tonumber(redis.call("GET",KEYS[2])) or 0 if not m then m=c end local i=tonumber(redis.call("GET",KEYS[3])) or 0 if m < i then m=m+1 redis.call("SET",KEYS[1],m) redis.call("SET",KEYS[2],m) return m else return -1 end` });
redis.defineCommand("decrIfPositive", { numberOfKeys: 2, lua: `local c=tonumber(redis.call("GET",KEYS[1])) or 0 local m=tonumber(redis.call("GET",KEYS[2])) or 0 if c > 0 then local nc=c-1 redis.call("SET",KEYS[1],nc) if m==c then redis.call("SET",KEYS[2],nc) end return nc end return c` });

(async() => { if (!(await redis.exists(KEYS.ROLES))) await redis.set(KEYS.ROLES, JSON.stringify(DEFAULT_ROLES)); })();

const getTWTime = () => { const p = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit'}).formatToParts(new Date()); return { dateStr: `${p[0].value}-${p[2].value}-${p[4].value}`, hour: parseInt(p[6].value)%24 }; };
const addLog = async (n, m) => { const t = new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}); await redis.lpush(KEYS.LOGS, `[${t}] [${n}] ${m}`); await redis.ltrim(KEYS.LOGS, 0, 99); io.to("admin").emit("newAdminLog", `[${t}] [${n}] ${m}`); };
const parseCookie = s => s.split(';').reduce((a, v) => { const [k, val] = v.split('=').map(x=>x.trim()); a[k] = decodeURIComponent(val); return a; }, {});
let bCastT = null, cacheWait = 0, lastWaitCalc = 0;

const broadcastQueue = async () => { if (bCastT) clearTimeout(bCastT); bCastT = setTimeout(async () => { let [c, i, m] = (await redis.mget(KEYS.CURRENT, KEYS.ISSUED, KEYS.MAX)).map(v => parseInt(v)||0); if(i<c) { i=c; await redis.set(KEYS.ISSUED, i); } if(m<c) { m=c; await redis.set(KEYS.MAX, m); } io.emit("update", c); io.emit("updateQueue", { current: c, issued: i, max: m }); io.emit("updateWaitTime", await calcWaitTime()); io.emit("updateTimestamp", new Date().toISOString()); }, 100); };
const broadcastAppts = async () => io.to("admin").emit("updateAppointments", await all("SELECT * FROM appointments WHERE status='pending' ORDER BY scheduled_time ASC"));

const calcWaitTime = async (force) => {
    if (!force && Date.now() - lastWaitCalc < 60000) return cacheWait;
    const rows = await all(`SELECT timestamp FROM history WHERE action='call' ORDER BY timestamp DESC LIMIT 30`);
    if (!rows || rows.length < 2) return (cacheWait = 0);
    let validIntervals = [];
    const MIN_MS = 10 * 1000, MAX_MS = 10 * 60 * 1000;
    for (let i = 0; i < rows.length - 1; i++) {
        const diff = rows[i].timestamp - rows[i + 1].timestamp;
        if (diff >= MIN_MS && diff <= MAX_MS) validIntervals.push(diff);
    }
    if (validIntervals.length === 0) { lastWaitCalc = Date.now(); return cacheWait || 0; }
    const total = validIntervals.reduce((acc, val) => acc + val, 0);
    const avgMs = total / validIntervals.length;
    lastWaitCalc = Date.now();
    cacheWait = Math.ceil((avgMs / 60000) * 10) / 10;
    return cacheWait;
};

const isBusinessOpen = async () => { 
    const c = JSON.parse(await redis.get(KEYS.HOURS)) || { enabled: false, start: "08:00", end: "22:00" };
    if (!c.enabled) return true;
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
    const curH = parseInt(parts.find(p => p.type === 'hour').value), curM = parseInt(parts.find(p => p.type === 'minute').value);
    const curTotal = curH * 60 + curM;
    const toMins = (t) => { if (typeof t === 'number') return t * 60; const [h, m] = (t || "00:00").split(':').map(Number); return h * 60 + m; };
    return curTotal >= toMins(c.start) && curTotal < toMins(c.end);
};

async function checkLine(c) { if(!lineClient) return; const t=c+5, [ap, ar, s5, s0] = await Promise.all([redis.get(KEYS.LINE.MSG.APPROACH), redis.get(KEYS.LINE.MSG.ARRIVAL), redis.smembers(`${KEYS.LINE.SUB}${t}`), redis.smembers(`${KEYS.LINE.SUB}${c}`)]); const send = (ids,txt) => { while(ids.length) lineClient.multicast(ids.splice(0,500),[{type:'text',text:txt}]).catch(console.error); }; if(s5.length) send(s5, (ap||'🔔 {target}號快到了 (前方剩{diff}組)').replace(/{current}/g,c).replace(/{target}/g,t).replace(/{diff}/g,5)); if(s0.length) { send(s0, (ar||'🎉 {current}號 到您了！請前往櫃台').replace(/{current}/g,c)); await redis.multi().del(`${KEYS.LINE.SUB}${c}`).srem(KEYS.LINE.ACTIVE,c).exec(); s0.forEach(u=>redis.del(`${KEYS.LINE.USER}${u}`)); } }

app.post('/callback', async (req, res) => {
    try {
        const [t, s] = await redis.mget(KEYS.LINE.CFG_TOKEN, KEYS.LINE.CFG_SECRET), cfg = { channelAccessToken: t||LAT, channelSecret: s||LCS };
        if (!cfg.channelAccessToken || !cfg.channelSecret) return res.status(500).end();
        line.middleware(cfg)(req, res, async (err) => {
            if (err) return res.status(403).json({ error: "Invalid Signature" });
            if (!lineClient) lineClient = new line.Client(cfg);
            try {
                await Promise.all(req.body.events.map(async e => {
                    if (e.type !== 'message' || e.message.type !== 'text') return;
                    const txt = e.message.text.trim(), uid = e.source.userId, rp = x => lineClient.replyMessage(e.replyToken, { type: 'text', text: x }).catch(console.error);
                    const keys = [KEYS.LINE.CMD.LOGIN, KEYS.LINE.CMD.STATUS, KEYS.LINE.CMD.CANCEL, KEYS.LINE.CMD.PASSED, KEYS.LINE.CMD.HELP, KEYS.LINE.MSG.SUCCESS, KEYS.LINE.MSG.PASSED, KEYS.LINE.MSG.CANCEL, KEYS.LINE.MSG.DEFAULT, KEYS.LINE.MSG.HELP, KEYS.LINE.MSG.LOGIN_PROMPT, KEYS.LINE.MSG.LOGIN_SUCCESS, KEYS.LINE.MSG.NO_TRACKING, KEYS.LINE.MSG.NO_PASSED, KEYS.LINE.MSG.PASSED_PREFIX];
                    const vals = await redis.mget(...keys), [cLog, cStat, cCanc, cPass, cHelp, mSuc, mPas, mCan, mDef, mHlp, mLP, mLS, mNT, mNP, mPre] = vals;
                    const T = { SUCC: mSuc||'設定成功: {number}號', PASS: mPas||'已過號', CANC: mCan||'已取消', HELP: mHlp||'💡 請輸入數字', LP: mLP||'請輸入密碼', LS: mLS||'🔓 驗證成功', NT: mNT||'無追蹤', NP: mNP||'無過號', PRE: mPre||'⚠️ 過號：' };
                    
                    if(txt === (cLog||'後台登入')) return rp((await redis.get(`${KEYS.LINE.ADMIN}${uid}`)) ? `🔗 ${process.env.RENDER_EXTERNAL_URL}/admin.html` : (await redis.set(`${KEYS.LINE.CTX}${uid}`,'WAIT_PWD','EX',120), T.LP));
                    if((await redis.get(`${KEYS.LINE.CTX}${uid}`))==='WAIT_PWD' && txt===(await redis.get(KEYS.LINE.PWD)||`unlock${ADMIN_TOKEN}`)) { await redis.set(`${KEYS.LINE.ADMIN}${uid}`,"1","EX",600); await redis.del(`${KEYS.LINE.CTX}${uid}`); return rp(T.LS); }
                    const ar = await redis.hget(KEYS.LINE.AUTOREPLY, txt); if (ar) return rp(ar);
                    if((cStat||'status,?,查詢,查詢進度').split(',').includes(txt.toLowerCase())) { const [n,i,my]=await redis.mget(KEYS.CURRENT,KEYS.ISSUED,`${KEYS.LINE.USER}${uid}`); return rp(`目前叫號: ${n||0}\n已發號至: ${i||0}${my?`\n您的追蹤: ${my}號`:''}`); }
                    if((cCanc||'cancel,取消,取消提醒').split(',').includes(txt.toLowerCase())) { const n=await redis.get(`${KEYS.LINE.USER}${uid}`); if(n){await redis.multi().del(`${KEYS.LINE.USER}${uid}`).srem(`${KEYS.LINE.SUB}${n}`,uid).exec(); return rp(T.CANC);} return rp(T.NT); }
                    if((cPass||'passed,過號,過號名單').split(',').includes(txt.toLowerCase())) { const l = await redis.zrange(KEYS.PASSED, 0, -1); return rp(l.length ? `${T.PRE}\n${l.join(', ')}` : T.NP); }
                    if((cHelp||'help,提醒,設定提醒').split(',').includes(txt.toLowerCase())) return rp(T.HELP);
                    if(/^\d+$/.test(txt)) { const n=parseInt(txt), c=parseInt(await redis.get(KEYS.CURRENT))||0; if(n<=c) return rp(T.PASS); await redis.multi().set(`${KEYS.LINE.USER}${uid}`,n,'EX',43200).sadd(`${KEYS.LINE.SUB}${n}`,uid).expire(`${KEYS.LINE.SUB}${n}`,43200).sadd(KEYS.LINE.ACTIVE,n).exec(); return rp(T.SUCC.replace(/{number}/g, n)); }
                    if (mDef && mDef.trim()) return rp(mDef);
                }));
                res.json({});
            } catch (e) { console.error(e); res.status(500).end(); }
        });
    } catch (e) { res.status(500).end(); }
});

app.use(express.json()); app.set('trust proxy', 1);
const H = fn => async(req, res, next) => { try { const r = await fn(req, res); if(r!==false) res.json(r||{success:true}); } catch(e){ res.status(500).json({error:e.message}); } };
const auth = async(req, res, next) => { try { const t = parseCookie(req.headers.cookie||'')['token'], u = t ? JSON.parse(await redis.get(`${KEYS.SESSION}${t}`)) : null; if(!u) throw 0; req.user = u; await redis.expire(`${KEYS.SESSION}${t}`, 28800); next(); } catch(e) { res.status(403).json({error:"權限/Session失效"}); } };
const perm = (a) => async (req, res, next) => { if(req.user.role === 'super') return next(); const r = (JSON.parse(await redis.get(KEYS.ROLES)) || DEFAULT_ROLES)[req.user.userRole || 'OPERATOR'] || DEFAULT_ROLES.OPERATOR; (r.level>=9 || r.can.includes(a) || r.can.includes('*')) ? next() : res.status(403).json({ error: "權限不足" }); };

async function ctl(type, {body, user}) {
    if(body.number!==undefined && (isNaN(parseInt(body.number)) || body.number<0)) return { error: "非法數值" };
    const { direction: dir, number: num } = body, { dateStr, hour } = getTWTime(), curr = parseInt(await redis.get(KEYS.CURRENT))||0, issued = parseInt(await redis.get(KEYS.ISSUED))||0;
    if(['call','issue'].includes(type) && !(await isBusinessOpen())) return { error: "非營業時間" };
    let newNum=0, msg='';
    if(type === 'call') {
        if(dir==='next') { const appt = await get("SELECT number FROM appointments WHERE status='pending' AND scheduled_time <= ? ORDER BY scheduled_time ASC LIMIT 1", [Date.now()]); if(appt) { newNum = appt.number; await redis.set(KEYS.CURRENT, newNum); const curMax=parseInt(await redis.get(KEYS.MAX))||0; if(newNum>curMax) await redis.set(KEYS.MAX, newNum); await run("UPDATE appointments SET status='called' WHERE number=?", [newNum]); msg=`🔔 呼叫預約 ${newNum}`; broadcastAppts(); } else { if((newNum = await redis.safeNextNumber(KEYS.MAX, KEYS.CURRENT, KEYS.ISSUED)) === -1) return { error: "已無等待" }; msg=`號碼增加為 ${newNum}`; } } 
        else { newNum = await redis.decrIfPositive(KEYS.CURRENT, KEYS.MAX); msg=`號碼回退為 ${newNum}`; }
        checkLine(newNum);
    } else if(type === 'issue') {
        if(dir==='next') { newNum = await redis.incr(KEYS.ISSUED); msg=`手動發號 ${newNum}`; await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, 1); } else if(issued > curr) { newNum = await redis.decr(KEYS.ISSUED); msg=`手動回退 ${newNum}`; await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, -1); } else return { error: "錯誤" };
        await redis.expire(`${KEYS.HOURLY}${dateStr}`, 172800);
    } else { /* set */ newNum = parseInt(num); if(type==='set_issue' && newNum===0) return resetSys(user.nickname); if(type==='set_issue') { const diff = newNum - issued; if(diff) await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, diff); await redis.set(KEYS.ISSUED, newNum); msg=`修正發號 ${newNum}`; } else { await redis.mset(KEYS.CURRENT, newNum, KEYS.MAX, newNum, ...(newNum>issued?[KEYS.ISSUED, newNum]:[])); msg=`設定叫號 ${newNum}`; checkLine(newNum); } }
    if(msg) { addLog(user.nickname, msg); dbQueue.push({dateStr, timestamp: Date.now(), number: newNum||curr, action: type, operator: user.nickname, wait_time_min: await calcWaitTime()}); } await broadcastQueue(); return { number: newNum };
}
async function resetSys(by) { await redis.mset(KEYS.CURRENT,0,KEYS.ISSUED,0,KEYS.MAX,0); await redis.del(KEYS.PASSED, KEYS.LINE.ACTIVE); await run("UPDATE appointments SET status='cancelled' WHERE status='pending'"); addLog(by, "💥 全域重置"); cacheWait=0; await broadcastQueue(); broadcastAppts(); io.emit("updatePassed",[]); return {}; }

app.post("/login", rateLimit({windowMs:9e5,max:100}), H(async (req, res) => {
    const { username: u, password: p } = req.body; let valid = (u === 'superadmin' && (p||"").trim() === (ADMIN_TOKEN||"").trim());
    if(!valid && await redis.hexists(KEYS.USERS, u)) valid = await bcrypt.compare(p, await redis.hget(KEYS.USERS, u));
    if(!valid) throw new Error("帳號或密碼錯誤");
    const token = uuidv4(), nick = await redis.hget(KEYS.NICKS, u) || u, userRole = (u==='superadmin' ? 'ADMIN' : (await redis.hget(KEYS.USER_ROLES, u) || 'OPERATOR'));
    await redis.set(`${KEYS.SESSION}${token}`, JSON.stringify({username:u, role:u==='superadmin'?'super':'normal', userRole, nickname:nick}), "EX", 28800);
    res.setHeader('Set-Cookie', [`token=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Strict; ${process.env.NODE_ENV==='production'?'Secure':''}`]);
    return { success: true, role: u==='superadmin'?'super':'normal', userRole, username: u, nickname: nick };
}));

app.post("/api/ticket/take", rateLimit({windowMs:36e5,max:20}), H(async req => {
    if(await redis.get(KEYS.MODE)==='input') throw new Error("手動模式"); 
    if(!(await isBusinessOpen())) throw new Error("非營業時間");
    if(await redis.get("callsys:allowTicketing") === "0") throw new Error("目前暫停取號");
    const { dateStr, hour } = getTWTime(), t = await redis.incr(KEYS.ISSUED); await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, 1); await redis.expire(`${KEYS.HOURLY}${dateStr}`, 172800);
    dbQueue.push({dateStr, timestamp: Date.now(), number: t, action: 'online_take', operator: 'User', wait_time_min: await calcWaitTime()}); await broadcastQueue(); return { ticket: t };
}));

['call','set-call'].forEach(c => app.post(`/api/control/${c}`, auth, perm('perm_command'), H(async r => { const res = await ctl(c.replace('-','_'), r); if(res.error) throw new Error(res.error); return res; })));
['issue','set-issue'].forEach(c => app.post(`/api/control/${c}`, auth, perm('perm_issue'), H(async r => { const res = await ctl(c.replace('-','_'), r); if(res.error) throw new Error(res.error); return res; })));

app.post("/api/control/pass-current", auth, perm('perm_passed_edit'), H(async req => {
    const c = parseInt(await redis.get(KEYS.CURRENT))||0; if(!c) throw new Error("無叫號");
    await redis.zadd(KEYS.PASSED, c, c); const next = (await redis.safeNextNumber(KEYS.MAX, KEYS.CURRENT, KEYS.ISSUED)===-1 ? c : await redis.get(KEYS.CURRENT));
    const {dateStr, hour} = getTWTime(); await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_p`, 1);
    dbQueue.push({dateStr, timestamp: Date.now(), number: c, action: 'pass', operator: req.user.nickname, wait_time_min: await calcWaitTime()}); checkLine(next); await broadcastQueue(); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); return { next };
}));

app.post("/api/control/recall-passed", auth, perm('perm_passed_edit'), H(async r => { const n = parseInt(r.body.number), c = parseInt(await redis.get(KEYS.CURRENT))||0; const m = parseInt(await redis.get(KEYS.MAX))||0; if(c > m) await redis.set(KEYS.MAX, c); await redis.zrem(KEYS.PASSED, n); await redis.set(KEYS.CURRENT, n); addLog(r.user.nickname, `↩️ 重呼 ${n}`); await broadcastQueue(); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); }));

app.post("/api/passed/add", auth, perm('perm_passed_edit'), H(async r => { const n = parseInt(r.body.number); if(n>0) { await redis.zadd(KEYS.PASSED, n, n); await redis.hincrby(`${KEYS.HOURLY}${getTWTime().dateStr}`, `${getTWTime().hour}_p`, 1); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); addLog(r.user.nickname, `➕ 手動過號 ${n}`); } }));
app.post("/api/passed/remove", auth, perm('perm_passed_edit'), H(async r => { const n = parseInt(r.body.number); if(n>0) { await redis.zrem(KEYS.PASSED, n); await redis.hincrby(`${KEYS.HOURLY}${getTWTime().dateStr}`, `${getTWTime().hour}_p`, -1); io.emit("updatePassed", (await redis.zrange(KEYS.PASSED,0,-1)).map(Number)); addLog(r.user.nickname, `🗑️ 移除過號 ${n}`); } }));
app.post("/api/passed/clear", auth, perm('perm_passed_edit'), H(async r => { await redis.del(KEYS.PASSED); io.emit("updatePassed", []); addLog(r.user.nickname, "🗑️ 清空過號名單"); }));

app.post("/api/admin/users", auth, perm('perm_users_view'), H(async r => ({ users: await Promise.all([{username:'superadmin',nickname:await redis.hget(KEYS.NICKS,'superadmin')||'Super',role:'ADMIN'}, ...(await redis.hkeys(KEYS.USERS)).map(x=>({username:x}))].map(async u=>{ if(u.username!=='superadmin'){u.nickname=await redis.hget(KEYS.NICKS,u.username)||u.username; u.role=await redis.hget(KEYS.USER_ROLES,u.username)||'OPERATOR';} return u; })) })));
app.post("/api/admin/add-user", auth, perm('perm_users_edit'), H(async r=>{ if(await redis.hexists(KEYS.USERS, r.body.newUsername)) throw new Error("已存在"); await redis.hset(KEYS.USERS, r.body.newUsername, await bcrypt.hash(r.body.newPassword,10)); await redis.hset(KEYS.NICKS, r.body.newUsername, r.body.newNickname); await redis.hset(KEYS.USER_ROLES, r.body.newUsername, r.body.newRole||'OPERATOR'); }));
app.post("/api/admin/del-user", auth, perm('perm_users_edit'), H(async r=>{ if(r.body.delUsername==='superadmin') throw new Error("不可刪除"); await redis.hdel(KEYS.USERS, r.body.delUsername); await redis.hdel(KEYS.NICKS, r.body.delUsername); await redis.hdel(KEYS.USER_ROLES, r.body.delUsername); }));
app.post("/api/admin/set-nickname", auth, H(async r => { if(r.user.role!=='super' && r.user.username!==r.body.targetUsername) throw new Error("權限不足"); await redis.hset(KEYS.NICKS, r.body.targetUsername, r.body.nickname); }));
app.post("/api/admin/set-role", auth, perm('perm_users_edit'), H(async r => { if(r.user.role!=='super') throw new Error("僅限超級管理員"); await redis.hset(KEYS.USER_ROLES, r.body.targetUsername, r.body.newRole); }));
app.post("/api/admin/roles/get", auth, H(async r => JSON.parse(await redis.get(KEYS.ROLES)) || DEFAULT_ROLES));
app.post("/api/admin/roles/update", auth, perm('perm_roles'), H(async r => { if(r.user.role!=='super') throw new Error("僅超級管理員"); await redis.set(KEYS.ROLES, JSON.stringify(r.body.rolesConfig)); addLog(r.user.nickname, "🔧 修改權限"); }));

app.post("/api/admin/stats", auth, perm('perm_stats_view'), H(async req => { const {dateStr, hour} = getTWTime(), hData = await redis.hgetall(`${KEYS.HOURLY}${dateStr}`), counts = new Array(24).fill(0); let total = 0; if(hData) for(let i=0; i<24; i++) { let net = Math.max(0, parseInt(hData[`${i}_i`]||hData[i]||0) - parseInt(hData[`${i}_p`]||0)); counts[i] = net; total += net; } return { history: await all("SELECT * FROM history ORDER BY id DESC LIMIT 50"), hourlyCounts: counts, todayCount: Math.max(0, total), serverHour: hour }; }));
app.post("/api/admin/stats/clear", auth, perm('perm_stats_edit'), H(async r => { const {dateStr} = getTWTime(); await redis.del(`${KEYS.HOURLY}${dateStr}`); await run("DELETE FROM history WHERE date_str=?", [dateStr]); addLog(r.user.nickname, "🗑️ 清空今日統計"); }));
app.post("/api/admin/stats/adjust", auth, perm('perm_stats_edit'), H(async r => { await redis.hincrby(`${KEYS.HOURLY}${getTWTime().dateStr}`, `${r.body.hour}_i`, r.body.delta); }));
app.post("/api/admin/stats/calibrate", auth, perm('perm_stats_edit'), H(async r => { const {dateStr, hour} = getTWTime(), [issued, passedList] = await Promise.all([redis.get(KEYS.ISSUED), redis.zrange(KEYS.PASSED, 0, -1)]), targetTotal = Math.max(0, (parseInt(issued)||0) - (passedList?passedList.length:0)), hData = await redis.hgetall(`${KEYS.HOURLY}${dateStr}`); let currentStatsTotal = 0; if(hData) for(let i=0; i<24; i++) currentStatsTotal += Math.max(0, parseInt(hData[`${i}_i`]||hData[i]||0) - parseInt(hData[`${i}_p`]||0)); const diff = targetTotal - currentStatsTotal; if(diff !== 0) { await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, `${hour}_i`, diff); addLog(r.user.nickname, `⚖️ 校正統計 (${diff>0?'+':''}${diff})`); } return { success: true, diff }; }));
app.post("/api/admin/export-csv", auth, perm('perm_stats_view'), H(async r => { const d = r.body.date || getTWTime().dateStr, rows = await all("SELECT * FROM history WHERE date_str = ? ORDER BY id ASC", [d]); return { csvData: "\uFEFFDate,Time,Number,Action,Operator,Wait(min)\n" + rows.map(r => `${r.date_str},${new Date(r.timestamp).toLocaleTimeString('zh-TW')},${r.number},${r.action},${r.operator},${r.wait_time_min}`).join("\n"), fileName: `export_${d}.csv` }; }));
app.post("/api/logs/clear", auth, perm('perm_logs_edit'), H(async r => { await redis.del(KEYS.LOGS); io.to("admin").emit("initAdminLogs", []); }));

app.post("/api/featured/add", auth, perm('perm_links_edit'), H(async r=>{ await redis.rpush(KEYS.FEATURED, JSON.stringify(r.body)); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/get", auth, perm('perm_links_view'), H(async r => (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)));
app.post("/api/featured/remove", auth, perm('perm_links_edit'), H(async r => { const l=await redis.lrange(KEYS.FEATURED,0,-1), t=l.find(x=>x.includes(r.body.linkUrl)); if(t) await redis.lrem(KEYS.FEATURED, 1, t); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/edit", auth, perm('perm_links_edit'), H(async r => { const l=await redis.lrange(KEYS.FEATURED,0,-1), idx=l.findIndex(x=>x.includes(r.body.oldLinkUrl)); if(idx>=0) await redis.lset(KEYS.FEATURED, idx, JSON.stringify({linkText:r.body.newLinkText, linkUrl:r.body.newLinkUrl})); io.emit("updateFeaturedContents", (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse)); }));
app.post("/api/featured/clear", auth, perm('perm_links_edit'), H(async r => { await redis.del(KEYS.FEATURED); io.emit("updateFeaturedContents", []); }));

app.post("/api/appointment/add", auth, perm('perm_booking_edit'), H(async r => { const ts = new Date(r.body.timeStr).getTime(); if(await get("SELECT id FROM appointments WHERE scheduled_time = ? OR number = ?", [ts, r.body.number])) throw new Error("預約衝突"); await run("INSERT INTO appointments (number, scheduled_time) VALUES (?, ?)", [r.body.number, ts]); addLog(r.user.nickname, `📅 預約: ${r.body.number}`); broadcastAppts(); }));
app.post("/api/appointment/list", auth, perm('perm_booking_view'), H(async r => ({ appointments: await all("SELECT * FROM appointments WHERE status='pending' ORDER BY scheduled_time ASC") })));
app.post("/api/appointment/remove", auth, perm('perm_booking_edit'), H(async r => { await run("DELETE FROM appointments WHERE id=?", [r.body.id]); broadcastAppts(); }));

app.post("/set-sound-enabled", auth, perm('perm_system_edit'), H(async r=>{ await redis.set("callsys:soundEnabled", r.body.enabled?"1":"0"); io.emit("updateSoundSetting", r.body.enabled); }));
app.post("/set-public-status", auth, perm('perm_system_edit'), H(async r=>{ await redis.set("callsys:isPublic", r.body.isPublic?"1":"0"); io.emit("updatePublicStatus", r.body.isPublic); }));
app.post("/set-system-mode", auth, perm('perm_system_edit'), H(async r=>{ await redis.set(KEYS.MODE, r.body.mode); io.emit("updateSystemMode", r.body.mode); }));
app.post("/set-ticketing-enabled", auth, perm('perm_system_edit'), H(async r=>{ await redis.set("callsys:allowTicketing", r.body.enabled?"1":"0"); io.emit("updateTicketingEnabled", r.body.enabled); }));
app.post("/reset", auth, perm('perm_system_edit'), H(async r => resetSys(r.user.nickname)));
app.post("/api/admin/broadcast", auth, perm('perm_system_edit'), H(async r => { io.emit("adminBroadcast", r.body.message); addLog(r.user.nickname, `📢 廣播: ${r.body.message}`); }));

app.post("/api/admin/settings/hours/get", auth, perm('perm_system_view'), H(async r => JSON.parse(await redis.get(KEYS.HOURS)) || { enabled: false, start: "08:00", end: "22:00" }));
app.post("/api/admin/settings/hours/save", auth, perm('perm_system_edit'), H(async r => { const cfg = { start: r.body.start, end: r.body.end, enabled: !!r.body.enabled }; await redis.set(KEYS.HOURS, JSON.stringify(cfg)); addLog(r.user.nickname, `🔧 更新營業時間 ${cfg.start}-${cfg.end}`); io.emit("updateBusinessHours", cfg); }));

// 儲存與獲取前台自定義文字 API
app.post("/api/admin/frontend-texts/get", auth, perm('perm_system_view'), H(async r => JSON.parse(await redis.get(KEYS.FRONTEND_TEXTS)) || {}));
app.post("/api/admin/frontend-texts/save", auth, perm('perm_system_edit'), H(async r => { await redis.set(KEYS.FRONTEND_TEXTS, JSON.stringify(r.body.texts)); io.emit("updateFrontendTexts", r.body.texts); addLog(r.user.nickname, "🔧 更新前台顯示文字"); }));

app.post("/api/admin/line-settings/get", auth, perm('perm_line_view'), H(async r => ({ "LINE Access Token": await redis.get(KEYS.LINE.CFG_TOKEN), "LINE Channel Secret": await redis.get(KEYS.LINE.CFG_SECRET) })));
app.post("/api/admin/line-settings/save", auth, perm('perm_line_edit'), H(async r => { if(r.body["LINE Access Token"]) await redis.set(KEYS.LINE.CFG_TOKEN, r.body["LINE Access Token"]); if(r.body["LINE Channel Secret"]) await redis.set(KEYS.LINE.CFG_SECRET, r.body["LINE Channel Secret"]); initLine(); addLog(r.user.nickname, "🔧 更新 LINE 設定"); }));
app.post("/api/admin/line-settings/reset", auth, perm('perm_line_edit'), H(async r => { await redis.del(KEYS.LINE.CFG_TOKEN, KEYS.LINE.CFG_SECRET); initLine(); }));
app.post("/api/admin/line-settings/get-unlock-pass", auth, perm('perm_line_view'), H(async r => ({ password: await redis.get(KEYS.LINE.PWD) })));
app.post("/api/admin/line-settings/save-pass", auth, perm('perm_line_edit'), H(async r => { await redis.set(KEYS.LINE.PWD, r.body.password); }));

app.post("/api/admin/line-messages/get", auth, perm('perm_line_view'), H(async r => {
    const v = await redis.mget(KEYS.LINE.MSG.APPROACH, KEYS.LINE.MSG.ARRIVAL, KEYS.LINE.MSG.SUCCESS, KEYS.LINE.MSG.PASSED, KEYS.LINE.MSG.CANCEL, KEYS.LINE.MSG.HELP, KEYS.LINE.MSG.LOGIN_PROMPT, KEYS.LINE.MSG.LOGIN_SUCCESS, KEYS.LINE.MSG.NO_TRACKING, KEYS.LINE.MSG.NO_PASSED, KEYS.LINE.MSG.PASSED_PREFIX);
    return { approach: v[0]||'🔔 {target}號快到了 (前方剩{diff}組)', arrival: v[1]||'🎉 {current}號 到您了！請前往櫃台', success: v[2]||'設定成功: {number}號', passed: v[3]||'已過號', cancel: v[4]||'已取消', help: v[5]||'💡 請輸入數字', loginPrompt: v[6]||'請輸入密碼', loginSuccess: v[7]||'🔓 驗證成功', noTracking: v[8]||'無追蹤', noPassed: v[9]||'無過號', passedPrefix: v[10]||'⚠️ 過號：' };
}));
app.post("/api/admin/line-messages/save", auth, perm('perm_line_edit'), H(async r => { const b=r.body; await redis.mset(KEYS.LINE.MSG.APPROACH, b.approach, KEYS.LINE.MSG.ARRIVAL, b.arrival, KEYS.LINE.MSG.SUCCESS, b.success, KEYS.LINE.MSG.PASSED, b.passed, KEYS.LINE.MSG.CANCEL, b.cancel, KEYS.LINE.MSG.HELP, b.help, KEYS.LINE.MSG.LOGIN_PROMPT, b.loginPrompt, KEYS.LINE.MSG.LOGIN_SUCCESS, b.loginSuccess, KEYS.LINE.MSG.NO_TRACKING, b.noTracking, KEYS.LINE.MSG.NO_PASSED, b.noPassed, KEYS.LINE.MSG.PASSED_PREFIX, b.passedPrefix); addLog(r.user.nickname, "💬 更新 LINE 訊息"); }));
app.post("/api/admin/line-autoreply/list", auth, perm('perm_line_view'), H(async r => await redis.hgetall(KEYS.LINE.AUTOREPLY)));
app.post("/api/admin/line-autoreply/save", auth, perm('perm_line_edit'), H(async r => { if(!r.body.keyword||!r.body.reply) throw new Error("無效內容"); await redis.hset(KEYS.LINE.AUTOREPLY, r.body.keyword.trim(), r.body.reply); addLog(r.user.nickname, `➕ LINE 關鍵字: ${r.body.keyword}`); }));
app.post("/api/admin/line-autoreply/edit", auth, perm('perm_line_edit'), H(async r => { const { oldKeyword:o, newKeyword:n, newReply:p } = r.body; if(!n||!p) throw new Error("空值"); const pipe=redis.multi(); if(o!==n) pipe.hdel(KEYS.LINE.AUTOREPLY, o); pipe.hset(KEYS.LINE.AUTOREPLY, n.trim(), p); await pipe.exec(); addLog(r.user.nickname, `✎ 修改 LINE 規則: ${o}->${n}`); }));
app.post("/api/admin/line-autoreply/del", auth, perm('perm_line_edit'), H(async r => { await redis.hdel(KEYS.LINE.AUTOREPLY, r.body.keyword); addLog(r.user.nickname, `🗑️ 移除 LINE 關鍵字: ${r.body.keyword}`); }));
app.post("/api/admin/line-default-reply/get", auth, perm('perm_line_view'), H(async r => ({ reply: await redis.get(KEYS.LINE.MSG.DEFAULT) })));
app.post("/api/admin/line-default-reply/save", auth, perm('perm_line_edit'), H(async r => { await redis.set(KEYS.LINE.MSG.DEFAULT, r.body.reply); addLog(r.user.nickname, "🔧 更新 LINE 預設回覆"); }));
app.post("/api/admin/line-system-keywords/get", auth, perm('perm_line_view'), H(async r => { const v = await redis.mget(KEYS.LINE.CMD.LOGIN, KEYS.LINE.CMD.STATUS, KEYS.LINE.CMD.CANCEL, KEYS.LINE.CMD.PASSED, KEYS.LINE.CMD.HELP); return { login: v[0]||'後台登入', status: v[1]||'status,?,查詢', cancel: v[2]||'cancel,取消', passed: v[3]||'passed,過號', help: v[4]||'help,提醒' }; }));
app.post("/api/admin/line-system-keywords/save", auth, perm('perm_line_edit'), H(async r => { await redis.mset(KEYS.LINE.CMD.LOGIN, r.body.login, KEYS.LINE.CMD.STATUS, r.body.status, KEYS.LINE.CMD.CANCEL, r.body.cancel, KEYS.LINE.CMD.PASSED, r.body.passed, KEYS.LINE.CMD.HELP, r.body.help); addLog(r.user.nickname, "🔧 更新 LINE 指令"); }));

cron.schedule('0 4 * * *', () => { resetSys('系統自動'); run("DELETE FROM history WHERE timestamp < ?", [Date.now()-(30*86400000)]); }, { timezone: "Asia/Taipei" });
io.use(async (s, next) => { try { const t = s.handshake.auth.token || parseCookie(s.request.headers.cookie||'')['token']; if(t) { const u = JSON.parse(await redis.get(`${KEYS.SESSION}${t}`)); if(u) s.user = u; } next(); } catch(e) { next(); } });

io.on("connection", async s => {
    if(s.user) { s.join("admin"); const socks = await io.in("admin").fetchSockets(); io.to("admin").emit("updateOnlineAdmins", [...new Map(socks.map(x=>x.user&&[x.user.username, x.user]).filter(Boolean)).values()]); s.emit("initAdminLogs", await redis.lrange(KEYS.LOGS,0,99)); broadcastAppts(); }
    s.join('public'); 
    const [c,i,p,f,snd,pub,m,h,allowT,max,fTexts] = await Promise.all([redis.get(KEYS.CURRENT),redis.get(KEYS.ISSUED),redis.zrange(KEYS.PASSED,0,-1),redis.lrange(KEYS.FEATURED,0,-1),redis.get("callsys:soundEnabled"),redis.get("callsys:isPublic"),redis.get(KEYS.MODE), redis.get(KEYS.HOURS), redis.get("callsys:allowTicketing"), redis.get(KEYS.MAX), redis.get(KEYS.FRONTEND_TEXTS)]);
    s.emit("update",Number(c)); 
    s.emit("updateQueue",{current:Number(c),issued:Number(i), max:Number(max)||Number(c)}); 
    s.emit("updatePassed",p.map(Number)); 
    s.emit("updateFeaturedContents",f.map(JSON.parse)); 
    s.emit("updateSoundSetting",snd==="1"); 
    s.emit("updatePublicStatus",pub!=="0"); 
    s.emit("updateSystemMode",m||'ticketing'); 
    s.emit("updateWaitTime",await calcWaitTime()); 
    s.emit("updateTicketingEnabled", allowT!=="0");
    s.emit("updateBusinessHours", h ? JSON.parse(h) : {enabled:false});
    s.emit("updateFrontendTexts", fTexts ? JSON.parse(fTexts) : {});
});

initDB().then(() => server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server v18.14 running on ${PORT}`))).catch(e => { console.error(e); process.exit(1); });
