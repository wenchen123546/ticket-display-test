/*
 * ==========================================
 * 伺服器 (index.js) - v17.3 Rich Menu Logic Fix
 * ==========================================
 */

const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const { v4: uuidv4 } = require('uuid'); 
const bcrypt = require('bcrypt'); 
const line = require('@line/bot-sdk'); 
const cron = require('node-cron'); 

const app = express();

// 設定 Trust Proxy (針對 Render/Heroku 等平台)
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = socketio(server, { cors: { origin: "*" }, pingTimeout: 60000 });

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; 

const SALT_ROUNDS = 10; 
const REMIND_BUFFER = 5; // 提醒緩衝區 (前5號通知)
const MAX_HISTORY_FOR_PREDICTION = 15; 
const MAX_VALID_SERVICE_MINUTES = 20;  

// LINE 設定
const lineConfig = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

// 檢查必要變數
if (!ADMIN_TOKEN || !REDIS_URL) {
    console.error("❌ 錯誤：核心環境變數未設定 (ADMIN_TOKEN 或 UPSTASH_REDIS_URL)");
    process.exit(1);
}

let lineClient = null;
if (lineConfig.channelAccessToken && lineConfig.channelSecret) {
    lineClient = new line.Client(lineConfig);
    console.log("✅ LINE Bot Client 已初始化");
}

const redis = new Redis(REDIS_URL, {
    tls: { rejectUnauthorized: false },
    retryStrategy: (times) => Math.min(times * 50, 2000)
});

// Redis Keys
const KEY_CURRENT_NUMBER = 'callsys:number';
const KEY_LAST_ISSUED = 'callsys:issued'; 
const KEY_SYSTEM_MODE = 'callsys:mode'; 
const KEY_PASSED_NUMBERS = 'callsys:passed';
const KEY_FEATURED_CONTENTS = 'callsys:featured';
const KEY_LAST_UPDATED = 'callsys:updated';
const KEY_SOUND_ENABLED = 'callsys:soundEnabled';
const KEY_IS_PUBLIC = 'callsys:isPublic'; 
const KEY_ADMIN_LOG = 'callsys:admin-log';
const KEY_USERS = 'callsys:users'; 
const KEY_NICKNAMES = 'callsys:nicknames';
const SESSION_PREFIX = 'callsys:session:';
const KEY_HISTORY_STATS = 'callsys:stats:history';
const KEY_STATS_HOURLY_PREFIX = 'callsys:stats:hourly:'; 
const KEY_LINE_SUB_PREFIX = 'callsys:line:notify:'; 
const KEY_LINE_USER_STATUS = 'callsys:line:user:';  
const KEY_LINE_MSG_APPROACH = 'callsys:line:msg:approach';
const KEY_LINE_MSG_ARRIVAL = 'callsys:line:msg:arrival';

// 新增 Keys：後台解鎖密碼 & 使用者解鎖狀態
const KEY_LINE_UNLOCK_PWD = 'callsys:line:unlock_pwd';
const KEY_LINE_ADMIN_UNLOCK = 'callsys:line:admin_session:';

const DEFAULT_LINE_MSG_APPROACH = "🔔 叫號提醒！\n\n目前已叫號至 {current} 號。\n您的 {target} 號即將輪到 (剩 {diff} 組)，請準備前往現場！";
const DEFAULT_LINE_MSG_ARRIVAL = "🎉 輪到您了！\n\n目前號碼：{current} 號\n請立即前往櫃台辦理。";

const onlineAdmins = new Map();

// 安全設定
app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        "style-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
        "connect-src": ["'self'", "https://cdn.jsdelivr.net", "wss:", "ws:"]
      },
    },
}));

// LINE Webhook 入口
if (lineClient) {
    app.post('/callback', line.middleware(lineConfig), (req, res) => {
        Promise.all(req.body.events.map(handleLineEvent))
            .then((r) => res.json(r))
            .catch((e) => {
                console.error("LINE Webhook Error:", e);
                res.status(500).end();
            });
    });
}

app.use(express.static("public"));
app.use(express.json()); 

// Rate Limiters
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const ticketLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: "操作過於頻繁" });

// Middleware
const authMiddleware = async (req, res, next) => {
    try {
        const { token } = req.body; 
        if (!token) return res.status(401).json({ error: "未提供 Token" });
        const sessionKey = `${SESSION_PREFIX}${token}`;
        const sessionData = await redis.get(sessionKey);
        if (!sessionData) return res.status(403).json({ error: "Session 已過期" });
        req.user = JSON.parse(sessionData); 
        await redis.expire(sessionKey, 8 * 60 * 60); 
        next();
    } catch (e) { res.status(500).json({ error: "驗證錯誤" }); }
};

const superAdminAuthMiddleware = (req, res, next) => {
    if (req.user?.role === 'super') next();
    else res.status(403).json({ error: "權限不足" });
};

// 每日重置排程 (凌晨 4 點)
cron.schedule('0 4 * * *', async () => {
    try {
        const multi = redis.multi();
        multi.set(KEY_CURRENT_NUMBER, 0);
        multi.set(KEY_LAST_ISSUED, 0);
        multi.del(KEY_PASSED_NUMBERS);
        const keys = await redis.keys(`${KEY_LINE_SUB_PREFIX}*`);
        const userKeys = await redis.keys(`${KEY_LINE_USER_STATUS}*`);
        const allLineKeys = [...keys, ...userKeys];
        if(allLineKeys.length > 0) multi.del(allLineKeys);

        await multi.exec();
        
        io.emit("update", 0);
        io.emit("updateQueue", { current: 0, issued: 0 });
        io.emit("updatePassed", []);
        io.emit("adminBroadcast", "系統已執行每日自動歸零");
        addAdminLog("系統", "⏰ 執行每日自動歸零");
    } catch (e) { console.error("❌ 自動重置失敗:", e); }
}, { timezone: "Asia/Taipei" });

redis.defineCommand("decrIfPositive", {
    numberOfKeys: 1,
    lua: `
        local currentValue = tonumber(redis.call("GET", KEYS[1]))
        if currentValue and currentValue > 0 then return redis.call("DECR", KEYS[1]) else return currentValue or 0 end
    `,
});

// --- Helper Functions ---
function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>?/gm, '');
}

async function updateTimestamp() {
    const now = new Date().toISOString();
    await redis.set(KEY_LAST_UPDATED, now);
    io.emit("updateTimestamp", now);
}

function getTaiwanDateInfo() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    let hour = parseInt(parts.find(p => p.type === 'hour').value);
    if (hour === 24) hour = 0;
    return { dateStr: `${year}-${month}-${day}`, hour: hour };
}

async function broadcastData(key, eventName, isJSON = false) {
    try {
        const raw = isJSON ? await redis.lrange(key, 0, -1) : await redis.zrange(key, 0, -1);
        const data = isJSON ? raw.map(JSON.parse) : raw.map(Number);
        io.emit(eventName, data);
        await updateTimestamp();
    } catch (e) { console.error(`Broadcast ${eventName} error:`, e); }
}

async function broadcastQueueStatus() {
    const [current, issued] = await redis.mget(KEY_CURRENT_NUMBER, KEY_LAST_ISSUED);
    const currentNum = parseInt(current) || 0;
    let issuedNum = parseInt(issued) || 0;
    
    // 防呆：發號數不應小於叫號數
    if (issuedNum < currentNum) {
        issuedNum = currentNum;
        await redis.set(KEY_LAST_ISSUED, issuedNum);
    }
    
    io.emit("update", currentNum);
    io.emit("updateQueue", { current: currentNum, issued: issuedNum });
}

async function addAdminLog(nickname, message) {
    try {
        const timeString = new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
        const log = `[${timeString}] [${nickname}] ${message}`;
        await redis.lpush(KEY_ADMIN_LOG, log);
        await redis.ltrim(KEY_ADMIN_LOG, 0, 99); 
        io.emit("newAdminLog", log);
    } catch (e) { console.error("Log error:", e); }
}

async function calculateSmartWaitTime() {
    try {
        const historyRaw = await redis.lrange(KEY_HISTORY_STATS, 0, MAX_HISTORY_FOR_PREDICTION); 
        const history = historyRaw.map(JSON.parse).filter(r => typeof r.num === 'number');
        if (history.length < 2) return 0;
        let totalWeightedTime = 0, totalWeight = 0;
        for (let i = 0; i < history.length - 1; i++) {
            const current = history[i];
            const prev = history[i+1];
            const timeDiff = (new Date(current.time) - new Date(prev.time)) / 1000 / 60;
            const numDiff = Math.abs(current.num - prev.num);
            if (numDiff > 0 && timeDiff > 0) {
                const timePerNum = timeDiff / numDiff;
                if (timePerNum <= MAX_VALID_SERVICE_MINUTES) {
                    const weight = MAX_HISTORY_FOR_PREDICTION - i;
                    totalWeightedTime += timePerNum * weight;
                    totalWeight += weight;
                }
            }
        }
        if (totalWeight === 0) return 0;
        return totalWeightedTime / totalWeight; 
    } catch (e) { return 0; }
}

async function logHistory(number, operator, delta = 1) {
    try {
        if (delta <= 0) return;
        const { dateStr, hour } = getTaiwanDateInfo();
        const record = { num: number, time: new Date().toISOString(), operator };
        const pipeline = redis.multi();
        pipeline.lpush(KEY_HISTORY_STATS, JSON.stringify(record));
        pipeline.ltrim(KEY_HISTORY_STATS, 0, 999); 
        pipeline.hincrby(`${KEY_STATS_HOURLY_PREFIX}${dateStr}`, hour, delta); 
        pipeline.expire(`${KEY_STATS_HOURLY_PREFIX}${dateStr}`, 30 * 86400);
        await pipeline.exec();
    } catch (e) { console.error("Log history error:", e); }
}

function broadcastOnlineAdmins() {
    io.emit("updateOnlineAdmins", Array.from(onlineAdmins.values()));
}

async function checkAndNotifyLineUsers(currentNum) {
    if (!lineClient) return;
    try {
        currentNum = parseInt(currentNum);
        let [tplApproach, tplArrival] = await redis.mget(KEY_LINE_MSG_APPROACH, KEY_LINE_MSG_ARRIVAL);
        if (!tplApproach) tplApproach = DEFAULT_LINE_MSG_APPROACH;
        if (!tplArrival) tplArrival = DEFAULT_LINE_MSG_ARRIVAL;

        const notifyTarget = currentNum + REMIND_BUFFER; 
        const subKey = `${KEY_LINE_SUB_PREFIX}${notifyTarget}`;
        const subscribers = await redis.smembers(subKey);
        
        if (subscribers.length > 0) {
            const msgText = tplApproach.replace(/{current}/g, currentNum).replace(/{target}/g, notifyTarget).replace(/{diff}/g, REMIND_BUFFER);
            await lineClient.multicast(subscribers, [{ type: 'text', text: msgText }]);
        }

        const exactKey = `${KEY_LINE_SUB_PREFIX}${currentNum}`;
        const exactSubscribers = await redis.smembers(exactKey);
        if (exactSubscribers.length > 0) {
            const msgText = tplArrival.replace(/{current}/g, currentNum).replace(/{target}/g, currentNum).replace(/{diff}/g, 0);
            await lineClient.multicast(exactSubscribers, [{ type: 'text', text: msgText }]);
            const pipeline = redis.multi();
            exactSubscribers.forEach(uid => pipeline.del(`${KEY_LINE_USER_STATUS}${uid}`));
            pipeline.del(exactKey); await pipeline.exec();
        }
    } catch (e) { console.error("Line Notify Error:", e); }
}

// --- LINE Event Handler ---
async function handleLineEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
    
    // 移除前後空白，確保比對準確
    const text = event.message.text.trim();
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    /* * [重要] 後台按鈕邏輯
     * 1. 使用者按鈕需傳送文字「後台登入」
     * 2. 伺服器檢查 Redis 是否有該 userId 的解鎖記錄
     * 3. 若無 -> 回傳鎖定訊息
     * 4. 若有 -> 回傳連結
     */
    
    // (A) 使用者點擊「後台登入」 (LINE圖文選單需設定為傳送文字)
    if (text === '後台登入') {
        const isUnlocked = await redis.get(`${KEY_LINE_ADMIN_UNLOCK}${userId}`);

        if (isUnlocked) {
            // 已解鎖：動態抓取 Render/Heroku 的網址 (若無環境變數則需手動更改)
            const host = process.env.RENDER_EXTERNAL_URL || "https://您的網域"; 
            
            return lineClient.replyMessage(replyToken, {
                type: "text",
                text: `🔗 後台傳送門已開啟：\n\n請點擊連結進入後台：\n${host}/admin.html\n\n(此連結包含敏感權限，請勿轉傳)`
            });
        } else {
            // 未解鎖
            return lineClient.replyMessage(replyToken, {
                type: "text",
                text: "🔒 按鈕已鎖定\n\n此功能僅限管理員使用。\n請輸入後台設定的「解鎖密碼」以驗證身份。"
            });
        }
    }

    // (B) 使用者輸入密碼解鎖
    // 優先讀取後台設定的密碼，若無則預設為 "unlock" + ADMIN_TOKEN
    let currentUnlockPass = await redis.get(KEY_LINE_UNLOCK_PWD);
    if (!currentUnlockPass) currentUnlockPass = `unlock${ADMIN_TOKEN}`;

    // 比對密碼 (區分大小寫)
    if (text === currentUnlockPass) {
        // 密碼正確 -> 在 Redis 記錄已解鎖，有效期限 600 秒 (10分鐘)
        await redis.set(`${KEY_LINE_ADMIN_UNLOCK}${userId}`, "1", "EX", 600);
        
        return lineClient.replyMessage(replyToken, {
            type: "text",
            text: "🔓 管理員權限已驗證\n\n您現在可以點擊「後台登入」按鈕取得連結。\n(權限將在 10 分鐘後自動上鎖)"
        });
    }

    // --- 一般使用者功能 ---

    // 1. 查詢進度
    if (['查詢進度', '查詢', '進度', 'status', '？', '?'].includes(text)) {
        const [current, issued] = await redis.mget(KEY_CURRENT_NUMBER, KEY_LAST_ISSUED);
        const currentNum = parseInt(current) || 0;
        const issuedNum = parseInt(issued) || 0;
        
        const trackingNum = await redis.get(`${KEY_LINE_USER_STATUS}${userId}`);
        let personalStatus = "";
        
        if (trackingNum) {
            const diff = parseInt(trackingNum) - currentNum;
            if (diff > 0) {
                personalStatus = `\n\n📌 您正在追蹤：${trackingNum} 號\n⏳ 前方還有：${diff} 組`;
            } else if (diff === 0) {
                personalStatus = `\n\n🎉 輪到您了！請前往櫃台 (號碼 ${trackingNum})`;
            } else {
                personalStatus = `\n\n⚠️ 您追蹤的 ${trackingNum} 號可能已過號`;
            }
        }

        return lineClient.replyMessage(replyToken, {
            type: "text",
            text: `📊 現場狀況報告\n\n目前叫號：${currentNum} 號\n已發號至：${issuedNum} 號${personalStatus}`
        });
    }

    // 2. 過號名單
    if (['過號名單', '過號', 'passed'].includes(text)) {
        const passedList = await redis.zrange(KEY_PASSED_NUMBERS, 0, -1);
        let msgText = "";
        if (!passedList || passedList.length === 0) {
            msgText = "🟢 目前沒有過號名單。";
        } else {
            msgText = `📋 目前過號名單：\n\n${passedList.join(', ')}\n\n若您的號碼在名單中，請儘速洽詢櫃台。`;
        }
        return lineClient.replyMessage(replyToken, { type: "text", text: msgText });
    }

    // 3. 設定提醒
    if (text.startsWith('設定提醒')) {
        const inputNumStr = text.replace('設定提醒', '').trim();
        const targetNum = parseInt(inputNumStr);

        if (isNaN(targetNum)) {
            return lineClient.replyMessage(replyToken, { type: "text", text: "💡 設定失敗\n請輸入「設定提醒 號碼」，例如：\n設定提醒 105" });
        }

        const currentNum = parseInt(await redis.get(KEY_CURRENT_NUMBER)) || 0;
        if (targetNum <= currentNum) {
            return lineClient.replyMessage(replyToken, { type: "text", text: `⚠️ 設定失敗\n${targetNum} 號已經過號或正在叫號 (目前 ${currentNum} 號)。` });
        }

        // 清除舊訂閱
        const oldTarget = await redis.get(`${KEY_LINE_USER_STATUS}${userId}`);
        if (oldTarget) await redis.srem(`${KEY_LINE_SUB_PREFIX}${oldTarget}`, userId);

        // 寫入新訂閱
        const pipeline = redis.multi();
        pipeline.set(`${KEY_LINE_USER_STATUS}${userId}`, targetNum); 
        pipeline.sadd(`${KEY_LINE_SUB_PREFIX}${targetNum}`, userId); 
        pipeline.expire(`${KEY_LINE_USER_STATUS}${userId}`, 43200);
        pipeline.expire(`${KEY_LINE_SUB_PREFIX}${targetNum}`, 43200);
        await pipeline.exec();

        const diff = targetNum - currentNum;
        return lineClient.replyMessage(replyToken, {
            type: "text",
            text: `✅ 提醒設定成功！\n\n目標號碼：${targetNum} 號\n目前進度：${currentNum} 號\n前方等待：${diff} 組\n\n當號碼接近時 (前 ${REMIND_BUFFER} 組) 我們會傳送訊息通知您。`
        });
    }

    // 4. 取消提醒
    if (['取消提醒', '取消', 'cancel'].includes(text)) {
        const trackingNum = await redis.get(`${KEY_LINE_USER_STATUS}${userId}`);
        if (!trackingNum) {
            return lineClient.replyMessage(replyToken, { type: "text", text: "ℹ️ 您目前沒有設定任何叫號提醒。" });
        }
        const pipeline = redis.multi();
        pipeline.del(`${KEY_LINE_USER_STATUS}${userId}`); 
        pipeline.srem(`${KEY_LINE_SUB_PREFIX}${trackingNum}`, userId); 
        await pipeline.exec();
        return lineClient.replyMessage(replyToken, { type: "text", text: `🗑️ 已取消對 ${trackingNum} 號的提醒通知。` });
    }
    
    return Promise.resolve(null);
}

// --- Routes ---

app.post("/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "請輸入帳號密碼" });
    try {
        let isValid = false, role = 'normal';
        if (username === 'superadmin' && password === ADMIN_TOKEN) {
            isValid = true; role = 'super';
        } else {
            const storedHash = await redis.hget(KEY_USERS, username);
            if (storedHash) isValid = await bcrypt.compare(password, storedHash);
        }
        if (!isValid) return res.status(403).json({ error: "帳號或密碼錯誤" });
        const sessionToken = uuidv4();
        let nickname = await redis.hget(KEY_NICKNAMES, username);
        if (!nickname) nickname = username;
        await redis.set(`${SESSION_PREFIX}${sessionToken}`, JSON.stringify({ username, role, nickname }), "EX", 28800);
        res.json({ success: true, token: sessionToken, role, username, nickname });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 保護的 API 路由清單
const protectedAPIs = [
    "/change-number", "/set-number", "/set-system-mode", "/set-issued-number",
    "/api/passed/add", "/api/passed/remove", "/api/passed/clear",
    "/api/featured/add", "/api/featured/remove", "/api/featured/clear", 
    "/set-sound-enabled", "/set-public-status", "/reset",
    "/api/logs/clear", "/api/admin/stats", "/api/admin/broadcast", 
    "/api/admin/stats/adjust", "/api/admin/stats/clear", "/api/admin/export-csv", 
    "/api/admin/line-settings/get", "/api/admin/line-settings/save", "/api/admin/line-settings/reset",
    "/api/admin/line-settings/set-unlock-pass", "/api/admin/line-settings/get-unlock-pass"
];
app.use(protectedAPIs, apiLimiter, authMiddleware);

app.post("/api/admin/line-settings/get", async (req, res) => {
    try {
        const [approach, arrival] = await redis.mget(KEY_LINE_MSG_APPROACH, KEY_LINE_MSG_ARRIVAL);
        res.json({ success: true, approach: approach || DEFAULT_LINE_MSG_APPROACH, arrival: arrival || DEFAULT_LINE_MSG_ARRIVAL });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/line-settings/save", async (req, res) => {
    try {
        const { approach, arrival } = req.body;
        if (!approach || !arrival) return res.status(400).json({ error: "內容不可為空" });
        await redis.mset(KEY_LINE_MSG_APPROACH, sanitize(approach), KEY_LINE_MSG_ARRIVAL, sanitize(arrival));
        addAdminLog(req.user.nickname, "📝 更新了 LINE 通知文案");
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/line-settings/reset", async (req, res) => {
    try {
        await redis.del(KEY_LINE_MSG_APPROACH, KEY_LINE_MSG_ARRIVAL);
        addAdminLog(req.user.nickname, "↺ 重置了 LINE 通知文案");
        res.json({ success: true, approach: DEFAULT_LINE_MSG_APPROACH, arrival: DEFAULT_LINE_MSG_ARRIVAL });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 新增：超級管理員設定 LINE 解鎖密碼 API ---
app.post("/api/admin/line-settings/set-unlock-pass", superAdminAuthMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.trim() === "") return res.status(400).json({ error: "密碼不可為空" });
        
        await redis.set(KEY_LINE_UNLOCK_PWD, password.trim());
        addAdminLog(req.user.nickname, "🔑 更新了 LINE 後台解鎖密碼");
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/line-settings/get-unlock-pass", superAdminAuthMiddleware, async (req, res) => {
    try {
        const password = await redis.get(KEY_LINE_UNLOCK_PWD);
        res.json({ success: true, password: password || "" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/export-csv", superAdminAuthMiddleware, async (req, res) => {
    try {
        const { dateStr } = getTaiwanDateInfo();
        const historyRaw = await redis.lrange(KEY_HISTORY_STATS, 0, -1);
        const history = historyRaw.map(JSON.parse);
        let csvContent = "\uFEFF時間,號碼,操作員,服務耗時(秒),備註\n";
        const reversedHistory = history.reverse();
        for (let i = 0; i < reversedHistory.length; i++) {
            const item = reversedHistory[i];
            const time = new Date(item.time).toLocaleTimeString('zh-TW', { hour12: false });
            let duration = "-", note = "";
            if (i > 0) {
                const prevItem = reversedHistory[i-1];
                const diffSec = Math.floor((new Date(item.time) - new Date(prevItem.time)) / 1000);
                duration = diffSec;
                if (diffSec > MAX_VALID_SERVICE_MINUTES * 60) note = "異常長時(可能休息)";
            } else { duration = "首筆"; }
            csvContent += `${time},${item.num},${item.operator},${duration},${note}\n`;
        }
        res.json({ success: true, csvData: csvContent, fileName: `stats_${dateStr}.csv` });
        addAdminLog(req.user.nickname, "📥 下載了 CSV 報表");
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ticket/take", ticketLimiter, async (req, res) => {
    try {
        const mode = await redis.get(KEY_SYSTEM_MODE);
        if (mode === 'input') {
            return res.status(400).json({ error: "目前僅開放現場手動取號，請輸入您手上的號碼。" });
        }
        const newTicket = await redis.incr(KEY_LAST_ISSUED);
        const current = await redis.get(KEY_CURRENT_NUMBER);
        if (current === null) await redis.set(KEY_CURRENT_NUMBER, 0);
        await broadcastQueueStatus();
        io.emit("updateWaitTime", await calculateSmartWaitTime());
        res.json({ success: true, ticket: newTicket });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/set-system-mode", superAdminAuthMiddleware, async (req, res) => {
    try {
        const { mode } = req.body;
        if (!['ticketing', 'input'].includes(mode)) return res.status(400).json({ error: "無效模式" });
        await redis.set(KEY_SYSTEM_MODE, mode);
        addAdminLog(req.user.nickname, `切換系統模式為: ${mode === 'ticketing' ? '線上取號' : '手動輸入'}`);
        io.emit("updateSystemMode", mode);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/change-number", async (req, res) => {
    try {
        const { direction } = req.body;
        let num;
        if (direction === "next") {
            num = await redis.incr(KEY_CURRENT_NUMBER);
            await logHistory(num, req.user.nickname, 1);
            addAdminLog(req.user.nickname, `號碼增加為 ${num}`);
        } else if (direction === "prev") {
            num = await redis.decrIfPositive(KEY_CURRENT_NUMBER);
            await logHistory(num, req.user.nickname, 0); 
            addAdminLog(req.user.nickname, `號碼回退為 ${num}`);
        } else { num = await redis.get(KEY_CURRENT_NUMBER) || 0; }
        
        checkAndNotifyLineUsers(num);
        io.emit("updateWaitTime", await calculateSmartWaitTime());
        await updateTimestamp();
        await broadcastQueueStatus(); 
        res.json({ success: true, number: num });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/set-number", async (req, res) => {
    try {
        const newNum = parseInt(req.body.number);
        if (isNaN(newNum) || newNum < 0) return res.status(400).json({ error: "無效號碼" });
        const oldNum = parseInt(await redis.get(KEY_CURRENT_NUMBER)) || 0;
        await redis.set(KEY_CURRENT_NUMBER, newNum);
        
        const issued = parseInt(await redis.get(KEY_LAST_ISSUED)) || 0;
        if (newNum > issued) {
            await redis.set(KEY_LAST_ISSUED, newNum);
        }

        const delta = Math.max(0, newNum - oldNum);
        await logHistory(newNum, req.user.nickname, delta);
        addAdminLog(req.user.nickname, `手動設定為 ${newNum} (統計增加 ${delta})`);
        
        checkAndNotifyLineUsers(newNum);
        io.emit("updateWaitTime", await calculateSmartWaitTime());
        await updateTimestamp();
        await broadcastQueueStatus();

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/set-issued-number", async (req, res) => {
    try {
        const newIssued = parseInt(req.body.number);
        if (isNaN(newIssued) || newIssued < 0) return res.status(400).json({ error: "無效號碼" });
        
        const current = parseInt(await redis.get(KEY_CURRENT_NUMBER)) || 0;
        if (newIssued < current) {
            return res.status(400).json({ error: `發號數 (${newIssued}) 不可小於目前叫號 (${current})` });
        }

        await redis.set(KEY_LAST_ISSUED, newIssued);
        addAdminLog(req.user.nickname, `手動修正發號為 ${newIssued}`);
        
        await broadcastQueueStatus();
        io.emit("updateWaitTime", await calculateSmartWaitTime());
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/broadcast", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "訊息內容為空" });
    const cleanMsg = sanitize(message).substring(0, 50); 
    io.emit("adminBroadcast", cleanMsg);
    if (lineClient) {
        // (LINE broadcast logic simplified)
    }
    addAdminLog(req.user.nickname, `📢 發送廣播: "${cleanMsg}"`);
    res.json({ success: true });
});

app.post("/api/admin/stats", async (req, res) => {
    try {
        const { dateStr, hour } = getTaiwanDateInfo();
        const [historyRaw, hourlyData] = await Promise.all([redis.lrange(KEY_HISTORY_STATS, 0, 99), redis.hgetall(`${KEY_STATS_HOURLY_PREFIX}${dateStr}`)]);
        const hourlyCounts = new Array(24).fill(0);
        let todayTotal = 0;
        if (hourlyData) {
            for (const [hStr, count] of Object.entries(hourlyData)) {
                const h = parseInt(hStr); const c = parseInt(count);
                if (h >= 0 && h < 24) { hourlyCounts[h] = c; todayTotal += c; }
            }
        }
        res.json({ success: true, history: historyRaw.map(JSON.parse), hourlyCounts, todayCount: todayTotal, serverHour: hour });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/stats/adjust", async (req, res) => {
    try {
        const { hour, delta } = req.body;
        const { dateStr } = getTaiwanDateInfo();
        const key = `${KEY_STATS_HOURLY_PREFIX}${dateStr}`;
        const newVal = await redis.hincrby(key, hour, delta);
        if (newVal < 0) await redis.hset(key, hour, 0);
        const record = { num: "Adj", time: new Date().toISOString(), operator: `${req.user.nickname} (調整${hour}點: ${delta>0?'+':''}${delta})` };
        await redis.lpush(KEY_HISTORY_STATS, JSON.stringify(record));
        await redis.ltrim(KEY_HISTORY_STATS, 0, 999);
        addAdminLog(req.user.nickname, `手動調整 ${hour}點 統計`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/stats/clear", async (req, res) => {
    try {
        const { dateStr } = getTaiwanDateInfo();
        const multi = redis.multi();
        multi.del(`${KEY_STATS_HOURLY_PREFIX}${dateStr}`); 
        multi.del(KEY_HISTORY_STATS); await multi.exec();
        addAdminLog(req.user.nickname, `⚠️ 清空了統計數據`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/passed/add", async (req, res) => { await redis.zadd(KEY_PASSED_NUMBERS, req.body.number, req.body.number); broadcastData(KEY_PASSED_NUMBERS, "updatePassed", false); res.json({ success: true }); });
app.post("/api/passed/remove", async (req, res) => { await redis.zrem(KEY_PASSED_NUMBERS, req.body.number); broadcastData(KEY_PASSED_NUMBERS, "updatePassed", false); res.json({ success: true }); });
app.post("/api/passed/clear", async (req, res) => { await redis.del(KEY_PASSED_NUMBERS); broadcastData(KEY_PASSED_NUMBERS, "updatePassed", false); res.json({ success: true }); });
app.post("/api/featured/add", async (req, res) => { await redis.rpush(KEY_FEATURED_CONTENTS, JSON.stringify(req.body)); broadcastData(KEY_FEATURED_CONTENTS, "updateFeaturedContents", true); res.json({ success: true }); });
app.post("/api/featured/remove", async (req, res) => { await redis.lrem(KEY_FEATURED_CONTENTS, 1, JSON.stringify(req.body)); broadcastData(KEY_FEATURED_CONTENTS, "updateFeaturedContents", true); res.json({ success: true }); });
app.post("/api/featured/clear", async (req, res) => { await redis.del(KEY_FEATURED_CONTENTS); broadcastData(KEY_FEATURED_CONTENTS, "updateFeaturedContents", true); res.json({ success: true }); });
app.post("/set-sound-enabled", async (req, res) => { await redis.set(KEY_SOUND_ENABLED, req.body.enabled ? "1" : "0"); addAdminLog(req.user.nickname, `音效設為 ${req.body.enabled}`); io.emit("updateSoundSetting", req.body.enabled); res.json({ success: true }); });
app.post("/set-public-status", async (req, res) => { await redis.set(KEY_IS_PUBLIC, req.body.isPublic ? "1" : "0"); addAdminLog(req.user.nickname, `系統設為 ${req.body.isPublic ? '開放' : '維護'}`); io.emit("updatePublicStatus", req.body.isPublic); res.json({ success: true }); });

app.post("/reset", async (req, res) => {
    const multi = redis.multi();
    multi.set(KEY_CURRENT_NUMBER, 0);
    multi.set(KEY_LAST_ISSUED, 0);
    multi.del(KEY_PASSED_NUMBERS);
    multi.del(KEY_FEATURED_CONTENTS);
    multi.set(KEY_SOUND_ENABLED, "0");
    multi.set(KEY_IS_PUBLIC, "1");
    multi.del(KEY_ADMIN_LOG);
    multi.del(KEY_HISTORY_STATS); 
    const keys = await redis.keys(`${KEY_LINE_SUB_PREFIX}*`);
    const userKeys = await redis.keys(`${KEY_LINE_USER_STATUS}*`);
    const allLineKeys = [...keys, ...userKeys];
    if(allLineKeys.length > 0) multi.del(allLineKeys);

    await multi.exec();
    addAdminLog(req.user.nickname, `💥 系統全域重置`);
    
    await broadcastQueueStatus(); 
    io.emit("updatePassed", []);
    io.emit("updateFeaturedContents", []);
    io.emit("updateSoundSetting", false);
    io.emit("updatePublicStatus", true);
    io.emit("initAdminLogs", []);
    io.emit("updateWaitTime", 0); 
    await updateTimestamp();
    res.json({ success: true });
});

app.post("/api/logs/clear", async (req, res) => { await redis.del(KEY_ADMIN_LOG); io.emit("initAdminLogs", []); res.json({ success: true }); });

app.use(["/api/admin/users", "/api/admin/add-user", "/api/admin/del-user", "/api/admin/set-nickname"], authMiddleware, superAdminAuthMiddleware);

app.post("/api/admin/users", async (req, res) => {
    const nicknames = await redis.hgetall(KEY_NICKNAMES) || {};
    const normalUsers = await redis.hkeys(KEY_USERS) || [];
    const list = [{ username: 'superadmin', nickname: nicknames['superadmin'] || 'Super Admin', role: 'super' }];
    normalUsers.forEach(u => list.push({ username: u, nickname: nicknames[u] || u, role: 'normal' }));
    res.json({ success: true, users: list });
});
app.post("/api/admin/add-user", async (req, res) => {
    const { newUsername, newPassword, newNickname } = req.body;
    if(await redis.hexists(KEY_USERS, newUsername)) return res.status(400).json({error: "帳號已存在"});
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await redis.hset(KEY_USERS, newUsername, hash);
    await redis.hset(KEY_NICKNAMES, newUsername, sanitize(newNickname) || newUsername);
    addAdminLog(req.user.nickname, `新增管理員 ${newUsername}`);
    res.json({ success: true });
});
app.post("/api/admin/del-user", async (req, res) => {
    const { delUsername } = req.body;
    if (delUsername === 'superadmin') return res.status(400).json({error: "不可刪除超級管理員"});
    await redis.hdel(KEY_USERS, delUsername);
    await redis.hdel(KEY_NICKNAMES, delUsername);
    addAdminLog(req.user.nickname, `刪除管理員 ${delUsername}`);
    res.json({ success: true });
});
app.post("/api/admin/set-nickname", async (req, res) => {
    const { targetUsername, nickname } = req.body;
    await redis.hset(KEY_NICKNAMES, targetUsername, sanitize(nickname));
    addAdminLog(req.user.nickname, `修改 ${targetUsername} 暱稱為 ${nickname}`);
    res.json({ success: true });
});

io.on("connection", async (socket) => {
    const token = socket.handshake.auth.token;
    if (token) {
        const session = await redis.get(`${SESSION_PREFIX}${token}`);
        if (session) {
            const user = JSON.parse(session);
            onlineAdmins.set(socket.id, user);
            broadcastOnlineAdmins();
            const logs = await redis.lrange(KEY_ADMIN_LOG, 0, 99);
            socket.emit("initAdminLogs", logs);
            socket.on("disconnect", () => {
                onlineAdmins.delete(socket.id);
                broadcastOnlineAdmins();
            });
        }
    }
    try {
        const pipeline = redis.multi();
        pipeline.get(KEY_CURRENT_NUMBER);
        pipeline.get(KEY_LAST_ISSUED); 
        pipeline.zrange(KEY_PASSED_NUMBERS, 0, -1);
        pipeline.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        pipeline.get(KEY_LAST_UPDATED);
        pipeline.get(KEY_SOUND_ENABLED);
        pipeline.get(KEY_IS_PUBLIC);
        pipeline.get(KEY_SYSTEM_MODE);
        const results = await pipeline.exec();
        
        const curr = Number(results[0][1] || 0);
        const issued = Number(results[1][1] || 0);

        socket.emit("update", curr); 
        socket.emit("updateQueue", { current: curr, issued: issued });

        socket.emit("updatePassed", (results[2][1] || []).map(Number));
        socket.emit("updateFeaturedContents", (results[3][1] || []).map(JSON.parse));
        socket.emit("updateTimestamp", results[4][1] || new Date().toISOString());
        socket.emit("updateSoundSetting", results[5][1] === "1");
        socket.emit("updatePublicStatus", results[6][1] !== "0");
        socket.emit("updateSystemMode", results[7][1] || 'ticketing');
        socket.emit("updateWaitTime", await calculateSmartWaitTime());
    } catch(e) { console.error("Socket init error:", e); }
});

async function shutdown() {
    console.log('🛑 正在關閉伺服器...');
    io.close();
    await redis.quit();
    server.close(() => { console.log('✅ HTTP 伺服器已關閉'); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server v17.3 (Rich Menu Fix) ready on port ${PORT}`);
});
