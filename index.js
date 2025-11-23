/*
 * ==========================================
 * 伺服器 (index.js) - v12.0 Smart Prediction & Rich Menu Ready
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

const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: "*" }, pingTimeout: 60000 });

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; 
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const SALT_ROUNDS = 10; 

// --- 設定提醒的提前號碼數 (預設：5號) ---
const REMIND_BUFFER = 5;

// --- 智慧預測參數 ---
const MAX_HISTORY_FOR_PREDICTION = 15; // 參考最近 15 筆數據
const MAX_VALID_SERVICE_MINUTES = 20;  // 超過 20 分鐘視為異常(休息/故障)，不列入計算

const lineConfig = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

if (!ADMIN_TOKEN || !REDIS_URL) {
    console.error("❌ 錯誤： 環境變數未設定");
    process.exit(1);
}

let lineClient = null;
if (lineConfig.channelAccessToken && lineConfig.channelSecret) {
    lineClient = new line.Client(lineConfig);
    console.log("✅ LINE Bot Client 已初始化");
} else {
    console.warn("⚠️ 警告：未設定 LINE 環境變數");
}

const redis = new Redis(REDIS_URL, {
    tls: { rejectUnauthorized: false },
    retryStrategy: (times) => Math.min(times * 50, 2000)
});
redis.on('connect', () => console.log("✅ Redis 連線成功"));
redis.on('error', (err) => console.error("❌ Redis 錯誤:", err));

redis.defineCommand("decrIfPositive", {
    numberOfKeys: 1,
    lua: `
        local currentValue = tonumber(redis.call("GET", KEYS[1]))
        if currentValue and currentValue > 0 then
            return redis.call("DECR", KEYS[1])
        else
            return currentValue or 0
        end
    `,
});

// --- Keys ---
const KEY_CURRENT_NUMBER = 'callsys:number';
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

// --- LINE 相關 Keys ---
const KEY_LINE_SUB_PREFIX = 'callsys:line:notify:'; 
const KEY_LINE_USER_STATUS = 'callsys:line:user:';  
const KEY_LINE_MSG_APPROACH = 'callsys:line:msg:approach';
const KEY_LINE_MSG_ARRIVAL = 'callsys:line:msg:arrival';

const DEFAULT_LINE_MSG_APPROACH = "🔔 叫號提醒！\n\n目前已叫號至 {current} 號。\n您的 {target} 號即將輪到 (剩 {diff} 組)，請準備前往現場！";
const DEFAULT_LINE_MSG_ARRIVAL = "🎉 輪到您了！\n\n目前號碼：{current} 號\n請立即前往櫃台辦理。";

const onlineAdmins = new Map();

// --- Middleware ---
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

if (lineClient) {
    app.post('/callback', line.middleware(lineConfig), (req, res) => {
        Promise.all(req.body.events.map(handleLineEvent))
            .then((result) => res.json(result))
            .catch((err) => {
                console.error("Line Webhook Error:", err);
                res.status(500).end();
            });
    });
}

app.use(express.static("public"));
app.use(express.json()); 

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

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

// --- Helpers ---

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

async function addAdminLog(nickname, message) {
    try {
        const timeString = new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
        const log = `[${timeString}] [${nickname}] ${message}`;
        await redis.lpush(KEY_ADMIN_LOG, log);
        await redis.ltrim(KEY_ADMIN_LOG, 0, 99); 
        io.emit("newAdminLog", log);
    } catch (e) { console.error("Log error:", e); }
}

// --- 【升級 1】 智慧預測：加權移動平均 (Weighted Moving Average) ---
async function calculateSmartWaitTime() {
    try {
        // 取出最近 N 筆紀錄
        const historyRaw = await redis.lrange(KEY_HISTORY_STATS, 0, MAX_HISTORY_FOR_PREDICTION); 
        const history = historyRaw.map(JSON.parse).filter(r => typeof r.num === 'number');
        
        // 至少要有 2 筆數據才能計算區間
        if (history.length < 2) return 0;

        let totalWeightedTime = 0;
        let totalWeight = 0;
        let validIntervals = 0;

        // 從最新的數據開始往回計算
        for (let i = 0; i < history.length - 1; i++) {
            const current = history[i];
            const prev = history[i+1];

            // 計算兩次叫號的時間差 (分鐘)
            const timeDiff = (new Date(current.time) - new Date(prev.time)) / 1000 / 60;
            // 計算號碼差 (例如 10號 -> 12號，差2號)
            const numDiff = Math.abs(current.num - prev.num);

            if (numDiff > 0 && timeDiff > 0) {
                const timePerNum = timeDiff / numDiff;

                // 【過濾異常值】 如果一組號碼處理超過 20 分鐘 (可能是休息)，則不列入平均
                if (timePerNum <= MAX_VALID_SERVICE_MINUTES) {
                    // 【權重邏輯】 越靠近現在 (i=0)，權重越重
                    // 例如 history有5筆，i=0時 weight=5, i=1時 weight=4...
                    const weight = MAX_HISTORY_FOR_PREDICTION - i;
                    
                    totalWeightedTime += timePerNum * weight;
                    totalWeight += weight;
                    validIntervals++;
                }
            }
        }

        if (totalWeight === 0) return 0; // 避免除以零
        
        // 回傳加權平均值
        return totalWeightedTime / totalWeight; 

    } catch (e) { 
        console.error("Smart Wait Time Error:", e);
        return 0; 
    }
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

// --- LINE Logic (Enhanced) ---

function createStatusFlexMessage(currentNum, waitTime, myTarget = null) {
    let statusText = "目前無設定提醒";
    let statusColor = "#aaaaaa";
    let diffText = "無";
    
    if (myTarget) {
        const diff = myTarget - currentNum;
        if (diff > 0) {
            statusText = `等待 ${myTarget} 號`;
            statusColor = "#ef4444"; // Red
            diffText = `還有 ${diff} 組`;
        } else {
            statusText = "您可能已過號";
            statusColor = "#d97706"; // Orange
            diffText = "已到號";
        }
    }

    // 格式化等待時間，若小於 1 分鐘顯示 "< 1 分鐘"
    let waitTimeStr = "計算中...";
    if (waitTime > 0) {
        waitTimeStr = waitTime < 1 
            ? `約 < 1 分/組` 
            : `約 ${waitTime.toFixed(1)} 分/組`;
    }

    return {
        type: "flex",
        altText: `目前叫號：${currentNum}`,
        contents: {
            type: "bubble",
            size: "giga",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#2563eb",
                paddingAll: "lg",
                contents: [
                    { type: "text", text: "現場叫號進度", weight: "bold", color: "#ffffff", size: "lg" }
                ]
            },
            hero: {
                type: "box",
                layout: "vertical",
                paddingAll: "xxl",
                spacing: "md",
                contents: [
                    { type: "text", text: "目前號碼", size: "sm", color: "#888888", align: "center" },
                    { type: "text", text: `${currentNum}`, size: "5xl", weight: "bold", color: "#2563eb", align: "center" }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            { type: "text", text: "平均等待", size: "sm", color: "#aaaaaa", flex: 1 },
                            { type: "text", text: waitTimeStr, size: "sm", color: "#666666", align: "end", flex: 2 }
                        ]
                    },
                    { type: "separator", margin: "lg" },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        spacing: "sm",
                        contents: [
                            { type: "text", text: "您的狀態", weight: "bold", color: "#333333" },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    { type: "text", text: statusText, size: "md", color: statusColor, flex: 2, weight: "bold" },
                                    { type: "text", text: diffText, size: "md", color: "#333333", align: "end", flex: 1 }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                contents: [
                    { type: "text", text: "點選「取消提醒」可移除", size: "xs", color: "#bbbbbb", align: "center", margin: "md" }
                ]
            }
        }
    };
}

// 2. Handle LINE Events
async function handleLineEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
    const text = event.message.text.trim();
    const userId = event.source.userId;

    // --- 【升級 2】 圖文選單 (Rich Menu) 支援 ---
    // 增加關鍵字比對，讓圖文選單的按鈕文字 (例如 "🔍 查詢進度") 也能觸發指令
    const isQuery = ['查詢', '號碼', '進度', '?', '？', '查詢捐血進度', '查詢進度', '🔍 查詢進度'].some(k => text.includes(k));
    const isPassed = ['過號', '過號查詢', '📋 過號名單', '過號名單'].some(k => text.includes(k));
    const isCancel = ['取消', '取消提醒', '❌ 取消提醒'].includes(text);

    // 1. 查詢進度
    if (isQuery) {
        const currentNum = parseInt(await redis.get(KEY_CURRENT_NUMBER)) || 0;
        const waitTime = await calculateSmartWaitTime(); // 使用智慧預測
        
        const userTargetStr = await redis.get(`${KEY_LINE_USER_STATUS}${userId}`);
        const userTarget = userTargetStr ? parseInt(userTargetStr) : null;

        const flexMsg = createStatusFlexMessage(currentNum, waitTime, userTarget);
        return lineClient.replyMessage(event.replyToken, flexMsg);
    }

    // 2. 過號查詢
    if (isPassed) {
        const passedList = await redis.zrange(KEY_PASSED_NUMBERS, 0, -1);
        if (!passedList || passedList.length === 0) {
            return lineClient.replyMessage(event.replyToken, { type: 'text', text: '🟢 目前沒有任何過號紀錄喔！' });
        }
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: `📋 目前過號名單：\n\n${passedList.join(', ')}` });
    }

    // 3. 取消提醒
    if (isCancel) {
        const userTargetStr = await redis.get(`${KEY_LINE_USER_STATUS}${userId}`);
        if (!userTargetStr) {
            return lineClient.replyMessage(event.replyToken, { type: 'text', text: '❌ 您目前沒有設定任何提醒喔！' });
        }
        const targetNum = parseInt(userTargetStr);
        
        const pipeline = redis.multi();
        pipeline.srem(`${KEY_LINE_SUB_PREFIX}${targetNum}`, userId); 
        pipeline.del(`${KEY_LINE_USER_STATUS}${userId}`);            
        await pipeline.exec();

        return lineClient.replyMessage(event.replyToken, { type: 'text', text: `🗑️ 已取消 ${targetNum} 號的到號提醒。` });
    }

    // 4. 設定提醒 (純數字)
    const match = text.match(/^(?:提醒|設定)?\s*(\d+)$/);
    if (match) {
        const targetNum = parseInt(match[1]);
        const currentNum = parseInt(await redis.get(KEY_CURRENT_NUMBER)) || 0;

        if (targetNum <= currentNum) {
            return lineClient.replyMessage(event.replyToken, { 
                type: 'text', text: `❌ 目前已經是 ${currentNum} 號囉！\n請直接前往櫃台。` 
            });
        }

        const existingTarget = await redis.get(`${KEY_LINE_USER_STATUS}${userId}`);
        const pipeline = redis.multi();
        
        if (existingTarget) {
            pipeline.srem(`${KEY_LINE_SUB_PREFIX}${existingTarget}`, userId);
        }

        const subKey = `${KEY_LINE_SUB_PREFIX}${targetNum}`;
        pipeline.sadd(subKey, userId);               
        pipeline.expire(subKey, 86400); 
        pipeline.set(`${KEY_LINE_USER_STATUS}${userId}`, targetNum, "EX", 86400); 
        await pipeline.exec();

        const notifyAt = Math.max(currentNum, targetNum - REMIND_BUFFER);

        return lineClient.replyMessage(event.replyToken, { 
            type: 'text', 
            text: `✅ 設定成功！\n\n您的號碼：${targetNum} 號\n當叫到 ${notifyAt} 號時 (前 ${REMIND_BUFFER} 號)，我會通知您。` 
        });
    }
    
    // 預設說明
    return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: '👋 您好！叫號小幫手指令：\n\n🔹 輸入「查詢進度」：看現場號碼\n🔹 輸入「過號名單」：看過號名單\n🔹 輸入數字 (如 88)：設定到號提醒\n🔹 點選「取消提醒」：移除提醒'
    });
}

function formatLineMessage(template, current, target) {
    const diff = Math.max(0, target - current);
    return template
        .replace(/{current}/g, current)
        .replace(/{target}/g, target)
        .replace(/{diff}/g, diff);
}

// 3. Notify Logic
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
            const msgText = formatLineMessage(tplApproach, currentNum, notifyTarget);
            await lineClient.multicast(subscribers, [{ type: 'text', text: msgText }]);
            console.log(`LINE: 已發送接近通知給 ${subscribers.length} 人`);
        }

        const exactKey = `${KEY_LINE_SUB_PREFIX}${currentNum}`;
        const exactSubscribers = await redis.smembers(exactKey);
        
        if (exactSubscribers.length > 0) {
            const msgText = formatLineMessage(tplArrival, currentNum, currentNum);
            await lineClient.multicast(exactSubscribers, [{ type: 'text', text: msgText }]);
            
            const pipeline = redis.multi();
            exactSubscribers.forEach(uid => {
                pipeline.del(`${KEY_LINE_USER_STATUS}${uid}`);
            });
            pipeline.del(exactKey); 
            await pipeline.exec();
            
            console.log(`LINE: 已發送到號通知給 ${exactSubscribers.length} 人並清除狀態`);
        }
    } catch (e) { console.error("Line Notify Error:", e); }
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

const protectedAPIs = [
    "/change-number", "/set-number",
    "/api/passed/add", "/api/passed/remove", "/api/passed/clear",
    "/api/featured/add", "/api/featured/remove", "/api/featured/clear",
    "/set-sound-enabled", "/set-public-status", "/reset",
    "/api/logs/clear", "/api/admin/stats", "/api/admin/broadcast",
    "/api/admin/stats/adjust", "/api/admin/stats/clear",
    "/api/admin/export-csv",
    "/api/admin/line-settings/get", "/api/admin/line-settings/save", "/api/admin/line-settings/reset"
];
app.use(protectedAPIs, apiLimiter, authMiddleware);

app.post("/api/admin/line-settings/get", async (req, res) => {
    try {
        const [approach, arrival] = await redis.mget(KEY_LINE_MSG_APPROACH, KEY_LINE_MSG_ARRIVAL);
        res.json({
            success: true,
            approach: approach || DEFAULT_LINE_MSG_APPROACH,
            arrival: arrival || DEFAULT_LINE_MSG_ARRIVAL
        });
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

// --- 【升級 3】 報表升級：CSV 匯出優化 (含耗時計算) ---
app.post("/api/admin/export-csv", superAdminAuthMiddleware, async (req, res) => {
    try {
        const { dateStr } = getTaiwanDateInfo();
        const historyRaw = await redis.lrange(KEY_HISTORY_STATS, 0, -1);
        const history = historyRaw.map(JSON.parse);
        
        // 標題列新增「服務耗時(秒)」與「備註」
        let csvContent = "\uFEFF時間,號碼,操作員,服務耗時(秒),備註\n";
        
        // 反轉陣列，從最舊的開始寫入，方便計算時間差
        const reversedHistory = history.reverse();

        for (let i = 0; i < reversedHistory.length; i++) {
            const item = reversedHistory[i];
            const time = new Date(item.time).toLocaleTimeString('zh-TW', { hour12: false });
            const numDisplay = item.num;
            
            // 計算服務耗時：當前時間 - 上一筆時間
            let duration = "-";
            let note = "";
            if (i > 0) {
                const prevItem = reversedHistory[i-1];
                const diffSec = Math.floor((new Date(item.time) - new Date(prevItem.time)) / 1000);
                duration = diffSec;
                if (diffSec > MAX_VALID_SERVICE_MINUTES * 60) note = "異常長時(可能休息)";
            } else {
                duration = "首筆";
            }

            csvContent += `${time},${numDisplay},${item.operator},${duration},${note}\n`;
        }

        res.json({ success: true, csvData: csvContent, fileName: `stats_${dateStr}.csv` });
        addAdminLog(req.user.nickname, "📥 下載了進階 CSV 報表");
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
        } else {
            num = await redis.get(KEY_CURRENT_NUMBER) || 0;
        }
        io.emit("update", num);
        checkAndNotifyLineUsers(num);
        // 更新等待時間 (使用智慧預測)
        io.emit("updateWaitTime", await calculateSmartWaitTime());
        await updateTimestamp();
        res.json({ success: true, number: num });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/set-number", async (req, res) => {
    try {
        const newNum = parseInt(req.body.number);
        if (isNaN(newNum) || newNum < 0) return res.status(400).json({ error: "無效號碼" });
        const oldNum = parseInt(await redis.get(KEY_CURRENT_NUMBER)) || 0;
        await redis.set(KEY_CURRENT_NUMBER, newNum);
        const delta = Math.max(0, newNum - oldNum);
        await logHistory(newNum, req.user.nickname, delta);
        
        addAdminLog(req.user.nickname, `手動設定為 ${newNum} (統計增加 ${delta})`);
        io.emit("update", newNum);
        checkAndNotifyLineUsers(newNum);
        io.emit("updateWaitTime", await calculateSmartWaitTime());
        await updateTimestamp();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/broadcast", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "訊息內容為空" });
    const cleanMsg = sanitize(message).substring(0, 50); 
    
    // 1. Socket 廣播 (網頁版)
    io.emit("adminBroadcast", cleanMsg);
    
    // 2. LINE 廣播
    if (lineClient) {
        try {
            const keys = await redis.keys(`${KEY_LINE_SUB_PREFIX}*`);
            if (keys.length > 0) {
                const pipeline = redis.pipeline();
                keys.forEach(k => pipeline.smembers(k));
                const results = await pipeline.exec();
                const allUserIds = new Set();
                results.forEach(([err, members]) => {
                    if (members) members.forEach(m => allUserIds.add(m));
                });

                const uniqueUsers = Array.from(allUserIds);
                if (uniqueUsers.length > 0) {
                    await lineClient.multicast(uniqueUsers, [{ 
                        type: 'text', 
                        text: `📢 店家公告：${cleanMsg}` 
                    }]);
                }
            }
        } catch (e) { console.error("LINE Broadcast error:", e); }
    }

    addAdminLog(req.user.nickname, `📢 發送廣播: "${cleanMsg}"`);
    res.json({ success: true });
});

app.post("/api/admin/stats", async (req, res) => {
    try {
        const { dateStr, hour } = getTaiwanDateInfo();
        const [historyRaw, hourlyData] = await Promise.all([
            redis.lrange(KEY_HISTORY_STATS, 0, 99),
            redis.hgetall(`${KEY_STATS_HOURLY_PREFIX}${dateStr}`)
        ]);
        const hourlyCounts = new Array(24).fill(0);
        let todayTotal = 0;
        if (hourlyData) {
            for (const [hStr, count] of Object.entries(hourlyData)) {
                const h = parseInt(hStr);
                const c = parseInt(count);
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

        const record = {
            num: "Adj",
            time: new Date().toISOString(),
            operator: `${req.user.nickname} (調整${hour}點: ${delta>0?'+':''}${delta})`
        };
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
        multi.del(KEY_HISTORY_STATS); 
        await multi.exec();
        addAdminLog(req.user.nickname, `⚠️ 清空了統計數據`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/passed/add", async (req, res) => {
    const num = parseInt(req.body.number);
    if (!num) return res.status(400).json({ error: "無效數字" });
    await redis.zadd(KEY_PASSED_NUMBERS, num, num);
    await redis.zremrangebyrank(KEY_PASSED_NUMBERS, 0, -21);
    addAdminLog(req.user.nickname, `過號新增 ${num}`);
    broadcastData(KEY_PASSED_NUMBERS, "updatePassed", false);
    res.json({ success: true });
});

app.post("/api/passed/remove", async (req, res) => {
    await redis.zrem(KEY_PASSED_NUMBERS, req.body.number);
    addAdminLog(req.user.nickname, `過號移除 ${req.body.number}`);
    broadcastData(KEY_PASSED_NUMBERS, "updatePassed", false);
    res.json({ success: true });
});

app.post("/api/passed/clear", async (req, res) => {
    await redis.del(KEY_PASSED_NUMBERS);
    addAdminLog(req.user.nickname, `過號清空`);
    broadcastData(KEY_PASSED_NUMBERS, "updatePassed", false);
    res.json({ success: true });
});

app.post("/api/featured/add", async (req, res) => {
    const { linkText, linkUrl } = req.body;
    await redis.rpush(KEY_FEATURED_CONTENTS, JSON.stringify({ linkText: sanitize(linkText), linkUrl }));
    addAdminLog(req.user.nickname, `連結新增 ${linkText}`);
    broadcastData(KEY_FEATURED_CONTENTS, "updateFeaturedContents", true);
    res.json({ success: true });
});

app.post("/api/featured/remove", async (req, res) => {
    const { linkText, linkUrl } = req.body;
    await redis.lrem(KEY_FEATURED_CONTENTS, 1, JSON.stringify({ linkText, linkUrl }));
    addAdminLog(req.user.nickname, `連結移除 ${linkText}`);
    broadcastData(KEY_FEATURED_CONTENTS, "updateFeaturedContents", true);
    res.json({ success: true });
});

app.post("/api/featured/clear", async (req, res) => {
    await redis.del(KEY_FEATURED_CONTENTS);
    addAdminLog(req.user.nickname, `連結清空`);
    broadcastData(KEY_FEATURED_CONTENTS, "updateFeaturedContents", true);
    res.json({ success: true });
});

app.post("/set-sound-enabled", async (req, res) => {
    const { enabled } = req.body;
    await redis.set(KEY_SOUND_ENABLED, enabled ? "1" : "0");
    addAdminLog(req.user.nickname, `音效設為 ${enabled}`);
    io.emit("updateSoundSetting", enabled);
    res.json({ success: true });
});

app.post("/set-public-status", async (req, res) => {
    const { isPublic } = req.body;
    await redis.set(KEY_IS_PUBLIC, isPublic ? "1" : "0");
    addAdminLog(req.user.nickname, `系統設為 ${isPublic ? '開放' : '維護'}`);
    io.emit("updatePublicStatus", isPublic);
    res.json({ success: true });
});

app.post("/reset", async (req, res) => {
    const multi = redis.multi();
    multi.set(KEY_CURRENT_NUMBER, 0);
    multi.del(KEY_PASSED_NUMBERS);
    multi.del(KEY_FEATURED_CONTENTS);
    multi.set(KEY_SOUND_ENABLED, "0");
    multi.set(KEY_IS_PUBLIC, "1");
    multi.del(KEY_ADMIN_LOG);
    multi.del(KEY_HISTORY_STATS); 
    
    // 重置 LINE 相關 (除了文案設定)
    const keys = await redis.keys(`${KEY_LINE_SUB_PREFIX}*`);
    const userKeys = await redis.keys(`${KEY_LINE_USER_STATUS}*`); // 清除反向索引
    const allLineKeys = [...keys, ...userKeys];
    if(allLineKeys.length > 0) multi.del(allLineKeys);

    await multi.exec();
    addAdminLog(req.user.nickname, `💥 系統全域重置`);
    io.emit("update", 0);
    io.emit("updatePassed", []);
    io.emit("updateFeaturedContents", []);
    io.emit("updateSoundSetting", false);
    io.emit("updatePublicStatus", true);
    io.emit("initAdminLogs", []);
    io.emit("updateWaitTime", 0); 
    await updateTimestamp();
    res.json({ success: true });
});

app.post("/api/logs/clear", async (req, res) => {
    await redis.del(KEY_ADMIN_LOG);
    io.emit("initAdminLogs", []);
    res.json({ success: true });
});

app.use(["/api/admin/users", "/api/admin/add-user", "/api/admin/del-user", "/api/admin/set-nickname"], 
    authMiddleware, superAdminAuthMiddleware);

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
        pipeline.zrange(KEY_PASSED_NUMBERS, 0, -1);
        pipeline.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        pipeline.get(KEY_LAST_UPDATED);
        pipeline.get(KEY_SOUND_ENABLED);
        pipeline.get(KEY_IS_PUBLIC);
        const results = await pipeline.exec();
        socket.emit("update", Number(results[0][1] || 0));
        socket.emit("updatePassed", (results[1][1] || []).map(Number));
        socket.emit("updateFeaturedContents", (results[2][1] || []).map(JSON.parse));
        socket.emit("updateTimestamp", results[3][1] || new Date().toISOString());
        socket.emit("updateSoundSetting", results[4][1] === "1");
        socket.emit("updatePublicStatus", results[5][1] !== "0");
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
    console.log(`🚀 Server v12.0 ready on port ${PORT}`);
});
