/* ==========================================
 * 伺服器 (index.js) - v41.2 Robust Path Fix
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
const path = require("path"); // [必要] 引入路徑處理模組

// --- 1. 環境變數檢查 ---
const { PORT = 3000, UPSTASH_REDIS_URL: REDIS_URL, ADMIN_TOKEN, LINE_ACCESS_TOKEN, LINE_CHANNEL_SECRET } = process.env;
if (!ADMIN_TOKEN || !REDIS_URL) {
    console.error("\n\n❌❌❌ [嚴重錯誤] 缺少核心變數 ❌❌❌");
    console.error("請檢查 .env 檔案是否包含 UPSTASH_REDIS_URL 和 ADMIN_TOKEN\n\n");
    process.exit(1);
}

const app = express();
const server = Server(app);
const io = socketio(server, { cors: { origin: "*" }, pingTimeout: 60000 });

// --- 2. Config & Helpers ---
// 使用 path.join 確保在任何作業系統下路徑都正確
const LOG_DIR = path.join(__dirname, 'user_logs');
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR); } catch(e) { console.warn("⚠️ 無法建立 Log 資料夾，忽略日誌功能"); }

const logSystemDaily = (user, msg) => {
    try {
        const now = new Date();
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('T')[0];
        const timeStr = now.toLocaleString('zh-TW', {timeZone:'Asia/Taipei', hour12:false});
        const logPath = path.join(LOG_DIR, `system_${dateStr}.log`);
        fs.appendFile(logPath, `[${timeStr}] [${user || 'System'}] ${msg}\n`, (err) => {});
    } catch (e) {}
};

// --- 3. Redis 連線 (安全模式) ---
const redis = new Redis(REDIS_URL, { 
    tls: { rejectUnauthorized: false }, 
    retryStrategy: t => Math.min(t * 50, 2000) 
});

redis.on("error", (err) => {
    console.error("🔥 [Redis Error] 連線失敗:", err.message);
});

redis.on("connect", () => {
    console.log("✅ Redis 連線成功！");
});

const lineClient = (LINE_ACCESS_TOKEN && LINE_CHANNEL_SECRET) ? new line.Client({ channelAccessToken: LINE_ACCESS_TOKEN, channelSecret: LINE_CHANNEL_SECRET }) : null;

const KEYS = {
    CURRENT: 'callsys:number', ISSUED: 'callsys:issued', MODE: 'callsys:mode', PASSED: 'callsys:passed',
    FEATURED: 'callsys:featured', UPDATED: 'callsys:updated', SOUND: 'callsys:soundEnabled', PUBLIC: 'callsys:isPublic',
    LOGS: 'callsys:admin-log', USERS: 'callsys:users', NICKS: 'callsys:nicknames', SESSION: 'callsys:session:',
    HISTORY: 'callsys:stats:history', HOURLY: 'callsys:stats:hourly:',
    LINE: { SUB: 'callsys:line:notify:', USER: 'callsys:line:user:', PWD: 'callsys:line:unlock_pwd', ADMIN: 'callsys:line:admin_session:', CTX: 'callsys:line:context:', ACTIVE: 'callsys:line:active_subs_set' }
};

redis.defineCommand("safeNextNumber", { numberOfKeys: 2, lua: `return (tonumber(redis.call("GET",KEYS[1]))or 0) < (tonumber(redis.call("GET",KEYS[2]))or 0) and redis.call("INCR",KEYS[1]) or -1` });
redis.defineCommand("decrIfPositive", { numberOfKeys: 1, lua: `local v=tonumber(redis.call("GET",KEYS[1])) return (v and v>0) and redis.call("DECR",KEYS[1]) or (v or 0)` });

const sanitize = s => typeof s==='string'?s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"): '';
const getTWTime = () => {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hour12:false}).formatToParts(new Date());
    return { dateStr: `${parts[0].value}-${parts[2].value}-${parts[4].value}`, hour: parseInt(parts[6].value)%24 };
};
const addLog = async (nick, msg) => { 
    try {
        const time = new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
        await redis.lpush(KEYS.LOGS, `[${time}] [${nick}] ${msg}`); 
        await redis.ltrim(KEYS.LOGS, 0, 99); 
        io.to("admin").emit("newAdminLog", `[${time}] [${nick}] ${msg}`);
    } catch(e) { console.error("Log Redis Error", e); }
};
const broadcast = async (evt, data) => { io.emit(evt, data); await redis.set(KEYS.UPDATED, new Date().toISOString()); io.emit("updateTimestamp", new Date().toISOString()); };
const broadcastList = async (k, evt, isJSON) => broadcast(evt, (isJSON ? await redis.lrange(k,0,-1) : await redis.zrange(k,0,-1)).map(isJSON?JSON.parse:Number));

let cacheWait = 0, lastWaitCalc = 0;
const calcWaitTime = async (force=false) => {
    try {
        if(!force && Date.now()-lastWaitCalc<60000) return cacheWait;
        const hist = (await redis.lrange(KEYS.HISTORY, 0, 19)).map(JSON.parse).filter(r=>r.num);
        let total=0, weight=0;
        for(let i=0; i<hist.length-1; i++) {
            const t1 = new Date(hist[i].time), t2 = new Date(hist[i+1].time);
            const diff = (t1 - t2)/60000; 
            const nDiff = Math.abs(hist[i].num - hist[i+1].num);
            if(nDiff > 0 && diff > 0 && (diff/nDiff) <= 20) { 
                const w = (20-i); total += (diff/nDiff) * w; weight += w; 
            }
        }
        cacheWait = weight > 0 ? (total/weight) : 0;
        lastWaitCalc = Date.now();
        return cacheWait;
    } catch(e) { return 0; }
};

async function handleControl(type, { body, user }) {
    const { direction, number } = body;
    const curr = parseInt(await redis.get(KEYS.CURRENT))||0;
    let issued = parseInt(await redis.get(KEYS.ISSUED))||0, newNum=0, logMsg='', delta=0;
    
    if(type === 'call') {
        if(direction==='next') {
            if((newNum = await redis.safeNextNumber(KEYS.CURRENT, KEYS.ISSUED)) === -1) {
                if(issued < curr) { await broadcastQueue(); return { error: "已無等待 (自動同步)" }; }
                return { error: "已無等待人數" };
            }
            logMsg = `號碼增加為 ${newNum}`; delta=1;
        } else { newNum = await redis.decrIfPositive(KEYS.CURRENT); logMsg = `號碼回退為 ${newNum}`; }
        
        await logHistory(newNum, user.nickname, delta);
        checkLineNotify(newNum).catch(e => console.error("Line Error (BG):", e.message)); 
    } else if(type === 'issue') {
        if(direction==='next') { newNum = await redis.incr(KEYS.ISSUED); logMsg = `手動發號至 ${newNum}`; }
        else if(issued > curr) { newNum = await redis.decr(KEYS.ISSUED); logMsg = `手動發號回退至 ${newNum}`; }
        else return { error: "不可小於叫號" };
    } else if(type.startsWith('set')) {
        newNum = parseInt(number); if(isNaN(newNum)||newNum<0) return { error: "無效號碼" };
        if(type==='set_issue' && newNum===0) { await performReset(user.nickname); return {}; }
        if(type==='set_issue' && newNum<curr) return { error: "不可小於目前叫號" };
        
        if(type==='set_call') {
            await redis.mset(KEYS.CURRENT, newNum, ...(newNum>issued?[KEYS.ISSUED, newNum]:[]));
            delta = Math.max(0, newNum-curr); logMsg = `手動設定為 ${newNum}`;
            await logHistory(newNum, user.nickname, delta);
            checkLineNotify(newNum).catch(e => console.error("Line Error (BG):", e.message));
        } else { await redis.set(KEYS.ISSUED, newNum); logMsg = `修正發號為 ${newNum}`; }
    }
    if(logMsg) { addLog(user.nickname, logMsg); logSystemDaily(user.username, `[操作] ${logMsg}`); }
    await broadcastQueue();
    return { number: newNum, issued: type==='issue'?newNum:undefined };
}

async function performReset(by) {
    const pipe = redis.multi().set(KEYS.CURRENT,0).set(KEYS.ISSUED,0).del(KEYS.PASSED, KEYS.LINE.ACTIVE);
    (await redis.smembers(KEYS.LINE.ACTIVE)).forEach(k=>pipe.del(`${KEYS.LINE.SUB}${k}`));
    (await redis.keys(`${KEYS.LINE.USER}*`)).forEach(k=>pipe.del(k));
    await pipe.exec();
    addLog(by, "💥 系統全域重置"); cacheWait = 0;
    await broadcastQueue(); io.emit("updatePassed",[]);
}

async function broadcastQueue() {
    let [c, i] = await redis.mget(KEYS.CURRENT, KEYS.ISSUED);
    c = parseInt(c)||0; i = parseInt(i)||0;
    if(i < c) { i = c; await redis.set(KEYS.ISSUED, i); }
    io.emit("update", c); io.emit("updateQueue", { current: c, issued: i });
    io.emit("updateWaitTime", await calcWaitTime()); await broadcast(KEYS.UPDATED);
}

async function logHistory(num, op, delta=0) {
    const { dateStr, hour } = getTWTime();
    const pipe = redis.multi().lpush(KEYS.HISTORY, JSON.stringify({num, time:new Date(), operator:op})).ltrim(KEYS.HISTORY,0,999);
    if(delta>0) pipe.hincrby(`${KEYS.HOURLY}${dateStr}`, hour, delta).expire(`${KEYS.HOURLY}${dateStr}`, 2592000); 
    await pipe.exec(); calcWaitTime(true);
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));

// [關鍵修正] 使用 path.join(__dirname, 'public') 強制鎖定 public 資料夾位置
// 這能確保無論您在哪個目錄執行 node index.js，都能正確找到 CSS 和 HTML
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
const superAuth = (req,res,next) => req.user.role==='super' ? next() : res.status(403).json({error:"權限不足"});

// Routes
app.post("/login", rateLimit({windowMs:9e5,max:100}), asyncHandler(async req => {
    const { username: u, password: p } = req.body;
    let valid = (u==='superadmin' && p===ADMIN_TOKEN);
    if(!valid && await redis.hexists(KEYS.USERS, u)) valid = await bcrypt.compare(p, await redis.hget(KEYS.USERS, u));
    if(!valid) { logSystemDaily(u, "登入失敗"); throw new Error("帳密錯誤"); }
    const token = uuidv4(), nick = await redis.hget(KEYS.NICKS, u) || u;
    await redis.set(`${KEYS.SESSION}${token}`, JSON.stringify({username:u, role:valid&&u==='superadmin'?'super':'normal', nickname:nick}), "EX", 28800);
    logSystemDaily(u, "登入成功");
    return { token, role: u==='superadmin'?'super':'normal', username: u, nickname: nick };
}));

app.post("/api/ticket/take", rateLimit({windowMs:36e5,max:20}), asyncHandler(async req => {
    if(await redis.get(KEYS.MODE)==='input') throw new Error("僅限手動輸入");
    const t = await redis.incr(KEYS.ISSUED); await broadcastQueue(); return { ticket: t };
}));

const ctrls = ['call','issue','set-call','set-issue'];
ctrls.forEach(c => app.post(`/api/control/${c}`, auth, asyncHandler(async req => {
    const r = await handleControl(c.replace('-','_'), req);
    if(r.error) throw new Error(r.error); return r;
})));

app.post("/api/control/pass-current", auth, asyncHandler(async req => {
    const c = parseInt(await redis.get(KEYS.CURRENT))||0; if(!c) throw new Error("無叫號");
    await redis.zadd(KEYS.PASSED, c, c);
    const next = (await redis.safeNextNumber(KEYS.CURRENT, KEYS.ISSUED));
    const act = next===-1 ? c : next;
    await logHistory(act, req.user.nickname, 1); checkLineNotify(act).catch(()=>{}); await broadcastQueue();
    addLog(req.user.nickname, `⏩ 跳號至 ${act}`); broadcastList(KEYS.PASSED, "updatePassed"); return { next: act };
}));

app.post("/api/control/recall-passed", auth, asyncHandler(async req => {
    await redis.zrem(KEYS.PASSED, req.body.number); await redis.set(KEYS.CURRENT, req.body.number);
    addLog(req.user.nickname, `↩️ 重呼 ${req.body.number}`); broadcastList(KEYS.PASSED, "updatePassed"); await broadcastQueue();
}));

app.post("/api/passed/add", auth, asyncHandler(async r=>{ await redis.zadd(KEYS.PASSED, r.body.number, r.body.number); broadcastList(KEYS.PASSED,"updatePassed"); }));
app.post("/api/passed/remove", auth, asyncHandler(async r=>{ await redis.zrem(KEYS.PASSED, r.body.number); broadcastList(KEYS.PASSED,"updatePassed"); }));
app.post("/api/passed/clear", auth, asyncHandler(async r=>{ await redis.del(KEYS.PASSED); broadcastList(KEYS.PASSED,"updatePassed"); }));
app.post("/api/featured/add", auth, asyncHandler(async r=>{ await redis.rpush(KEYS.FEATURED, JSON.stringify(r.body)); broadcastList(KEYS.FEATURED,"updateFeaturedContents",true); }));
app.post("/api/featured/edit", auth, asyncHandler(async r=>{ 
    const l = await redis.lrange(KEYS.FEATURED,0,-1), idx = l.indexOf(JSON.stringify({linkText:r.body.oldLinkText,linkUrl:r.body.oldLinkUrl}));
    if(idx>-1) await redis.lset(KEYS.FEATURED, idx, JSON.stringify({linkText:r.body.newLinkText,linkUrl:r.body.newLinkUrl}));
    broadcastList(KEYS.FEATURED,"updateFeaturedContents",true); 
}));
app.post("/api/featured/remove", auth, asyncHandler(async r=>{ await redis.lrem(KEYS.FEATURED, 1, JSON.stringify(r.body)); broadcastList(KEYS.FEATURED,"updateFeaturedContents",true); }));
app.post("/api/featured/clear", auth, asyncHandler(async r=>{ await redis.del(KEYS.FEATURED); broadcastList(KEYS.FEATURED,"updateFeaturedContents",true); }));
app.post("/api/featured/get", auth, asyncHandler(async r=>{ return (await redis.lrange(KEYS.FEATURED,0,-1)).map(JSON.parse); }));

app.post("/set-sound-enabled", auth, asyncHandler(async r=>{ await redis.set(KEYS.SOUND, r.body.enabled?"1":"0"); io.emit("updateSoundSetting", r.body.enabled); }));
app.post("/set-public-status", auth, asyncHandler(async r=>{ await redis.set(KEYS.PUBLIC, r.body.isPublic?"1":"0"); io.emit("updatePublicStatus", r.body.isPublic); }));
app.post("/api/admin/broadcast", auth, asyncHandler(async r=>{ io.emit("adminBroadcast", sanitize(r.body.message).substr(0,50)); addLog(r.user.nickname,`📢 ${r.body.message}`); }));
app.post("/api/logs/clear", auth, asyncHandler(async r=>{ await redis.del(KEYS.LOGS); io.to("admin").emit("initAdminLogs",[]); }));

app.post("/api/admin/stats", auth, asyncHandler(async req => {
    const {dateStr, hour} = getTWTime(), hKey = `${KEYS.HOURLY}${dateStr}`;
    const [hist, hData] = await Promise.all([redis.lrange(KEYS.HISTORY,0,99), redis.hgetall(hKey)]);
    const counts = new Array(24).fill(0); let total=0;
    for(const [h,c] of Object.entries(hData||{})) { counts[parseInt(h)]=parseInt(c); total+=parseInt(c); }
    return { history: hist.map(JSON.parse), hourlyCounts: counts, todayCount: total, serverHour: hour };
}));
app.post("/api/admin/stats/adjust", auth, asyncHandler(async r=>{ 
    const {dateStr}=getTWTime(); await redis.hincrby(`${KEYS.HOURLY}${dateStr}`, r.body.hour, r.body.delta); 
    await redis.lpush(KEYS.HISTORY, JSON.stringify({num:"Adj",time:new Date(),operator:r.user.nickname})); 
}));
app.post("/api/admin/stats/clear", auth, asyncHandler(async r=>{ await redis.del(`${KEYS.HOURLY}${getTWTime().dateStr}`, KEYS.HISTORY); addLog(r.user.nickname,"⚠️ 清空統計"); }));

app.post("/set-system-mode", auth, superAuth, asyncHandler(async r=>{ await redis.set(KEYS.MODE, r.body.mode); io.emit("updateSystemMode", r.body.mode); }));
app.post("/reset", auth, superAuth, asyncHandler(async r=>{ await performReset(r.user.nickname); }));
app.post("/api/admin/users", auth, asyncHandler(async r=>{
    const n = await redis.hgetall(KEYS.NICKS)||{}, u = await redis.hkeys(KEYS.USERS)||[];
    return { users: [{username:'superadmin',nickname:n['superadmin']||'Super',role:'super'}, ...u.map(x=>({username:x,nickname:n[x]||x,role:'normal'}))] };
}));
app.post("/api/admin/add-user", auth, superAuth, asyncHandler(async r=>{ 
    if(await redis.hexists(KEYS.USERS, r.body.newUsername)) throw new Error("已存在");
    await redis.hset(KEYS.USERS, r.body.newUsername, await bcrypt.hash(r.body.newPassword,10));
    await redis.hset(KEYS.NICKS, r.body.newUsername, r.body.newNickname);
}));
app.post("/api/admin/del-user", auth, superAuth, asyncHandler(async r=>{ 
    if(r.body.delUsername==='superadmin') throw new Error("不可刪除"); 
    await redis.hdel(KEYS.USERS, r.body.delUsername); await redis.hdel(KEYS.NICKS, r.body.delUsername); 
}));
app.post("/api/admin/set-nickname", auth, asyncHandler(async r=>{ 
    if(r.body.targetUsername !== r.user.username && r.user.role !== 'super') throw new Error("權限不足");
    await redis.hset(KEYS.NICKS, r.body.targetUsername, r.body.nickname);
}));
app.post("/api/admin/export-csv", auth, superAuth, asyncHandler(async r=>{
    const h = (await redis.lrange(KEYS.HISTORY,0,-1)).map(JSON.parse).reverse();
    let csv = "\uFEFF時間,號碼,操作員\n" + h.map(i=>`${new Date(i.time).toLocaleTimeString('zh-TW')},${i.num},${i.operator}`).join("\n");
    return { csvData: csv, fileName: `stats_${Date.now()}.csv` };
}));
app.post("/api/admin/line-settings/:act", auth, superAuth, asyncHandler(async req => {
    const act = req.params.act, fields = ['approach','arrival','status','personal','passed','set_ok','cancel','login_hint','err_passed','err_no_sub','set_hint'];
    const keys = fields.map(k=>`callsys:line:msg:${k}`);
    if(act==='get') { const v = await redis.mget(keys); return fields.reduce((a,k,i)=>(a[k]=v[i]||"",a),{}); }
    if(act==='save') { const pipe = redis.multi(); fields.forEach((k,i)=>pipe.set(keys[i], sanitize(req.body[k]))); await pipe.exec(); }
    if(act==='reset') await redis.del(keys);
    if(act==='set-unlock-pass') await redis.set(KEYS.LINE.PWD, req.body.password);
    if(act==='get-unlock-pass') return { password: await redis.get(KEYS.LINE.PWD)||"" };
}));

// LINE Bot
const lineMsgs = { approach:"🔔 叫號提醒！\n現已叫號至 {current}。\n您的 {target} 即將輪到 (剩 {diff} 組)。", arrival:"🎉 輪到您了！\n{current} 號請至櫃台。", status:"📊 叫號：{current}\n發號：{issued}{personal}" };
async function checkLineNotify(curr) {
    if(!lineClient) return;
    const target = curr + 5;
    const [appT, arrT, subs, exact] = await Promise.all([
        redis.get('callsys:line:msg:approach'), redis.get('callsys:line:msg:arrival'),
        redis.smembers(`${KEYS.LINE.SUB}${target}`), redis.smembers(`${KEYS.LINE.SUB}${curr}`)
    ]);
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
        try {
            const u = JSON.parse(await redis.get(`${KEYS.SESSION}${s.handshake.auth.token}`));
            if(u) { s.join("admin"); s.emit("initAdminLogs", await redis.lrange(KEYS.LOGS,0,99)); }
        } catch(e) {}
    }
    s.join('public');
    const [c, i, p, f, u, snd, pub, m] = await Promise.all([
        redis.get(KEYS.CURRENT), redis.get(KEYS.ISSUED), redis.zrange(KEYS.PASSED,0,-1), redis.lrange(KEYS.FEATURED,0,-1),
        redis.get(KEYS.UPDATED), redis.get(KEYS.SOUND), redis.get(KEYS.PUBLIC), redis.get(KEYS.MODE)
    ]);
    s.emit("update", Number(c)); s.emit("updateQueue", {current:Number(c), issued:Number(i)});
    s.emit("updatePassed", p.map(Number)); s.emit("updateFeaturedContents", f.map(JSON.parse));
    s.emit("updateSoundSetting", snd==="1"); s.emit("updatePublicStatus", pub!=="0"); s.emit("updateSystemMode", m||'ticketing');
    s.emit("updateWaitTime", await calcWaitTime());
});

server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server v41.2 running on ${PORT}`));
