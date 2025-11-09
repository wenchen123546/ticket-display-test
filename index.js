/*
 * ==========================================
 * 伺服器 (index.js)
 * ... (舊註解) ...
 * * 8. 【CSP 修正 v2】 
 * * - 修正 helmet 的 CSP 策略，允許載入 GridStack 和 QR Code 的 CDN
 * * 9. 【新功能】 
 * * - 實作「伺服器端」的後台日誌 (Redis List + Socket.io)
 * * 10.【重構 v1】
 * * - 安全性: 實作 JWT (JSON Web Token) 登入機制
 * * - 延展性: 導入 Socket.io Redis Adapter (支援水平擴展)
 * * - 維護性: 導入 express-async-errors 集中處理錯誤
 * ==========================================
 */

// --- 1. 模組載入 ---
const express = require("express");
require('express-async-errors'); // 【重構】 必須在 express 之後、路由之前
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const jwt = require('jsonwebtoken'); // 【重構】
const { createAdapter } = require("@socket.io/redis-adapter"); // 【重構】

// --- 2. 伺服器實體化 ---
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 3. 核心設定 & 安全性 ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET; // 【重構】

// --- 4. 關鍵檢查 ---
if (!ADMIN_TOKEN) {
    console.error("❌ 錯誤： ADMIN_TOKEN 環境變數未設定！");
    process.exit(1);
}
if (!REDIS_URL) {
    console.error("❌ 錯誤： UPSTASH_REDIS_URL 環境變數未設定！");
    process.exit(1);
}
if (!JWT_SECRET) {
    console.error("❌ 錯誤： JWT_SECRET 環境變數未設定！");
    process.exit(1);
}

// --- 5. 連線到 Upstash Redis ---
const redis = new Redis(REDIS_URL, {
    tls: {
        rejectUnauthorized: false
    }
});
const pubClient = redis;
const subClient = redis.duplicate(); // 【重構】 建立兩個 client 供 adapter 使用

redis.on('connect', () => { console.log("✅ 成功連線到 Upstash Redis 資料庫。"); });
redis.on('error', (err) => { console.error("❌ Redis 連線錯誤:", err); process.exit(1); });

redis.defineCommand("decrIfPositive", {
    numberOfKeys: 1,
    lua: `
        local currentValue = tonumber(redis.call("GET", KEYS[1]))
        if currentValue > 0 then
            return redis.call("DECR", KEYS[1])
        else
            return currentValue
        end
    `,
});

// 【重構】 將 Socket.io 連接到 Redis Adapter
io.adapter(createAdapter(pubClient, subClient));


// --- 6. Redis Keys & 全域狀態 ---
const KEY_CURRENT_NUMBER = 'callsys:number';
const KEY_PASSED_NUMBERS = 'callsys:passed';
const KEY_FEATURED_CONTENTS = 'callsys:featured';
const KEY_LAST_UPDATED = 'callsys:updated';
const KEY_SOUND_ENABLED = 'callsys:soundEnabled';
const KEY_IS_PUBLIC = 'callsys:isPublic'; 
const KEY_ADMIN_LAYOUT = 'callsys:admin-layout'; 
const KEY_ADMIN_LOG = 'callsys:admin-log'; 

// --- 7. Express 中介軟體 (Middleware) ---

app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        "style-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
        "connect-src": ["'self'", "https://cdn.jsdelivr.net"]
      },
    },
}));
app.use(express.static("public"));
app.use(express.json());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    message: { error: "請求過於頻繁，請稍後再試。" },
    standardHeaders: true, 
    legacyHeaders: false, 
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    message: { error: "登入嘗試次數過多，請 15 分鐘後再試。" },
    standardHeaders: true,
    legacyHeaders: false,
});

// 【重構】 JWT 認證 Middleware
const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "缺少認證" });
        }
        
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET); // 驗證 JWT
        
        next(); // 驗證通過
    } catch (err) {
        // JWT 驗證失敗 (例如過期或無效)
        return res.status(403).json({ error: "認證無效或已過期" });
    }
};

// --- 8. 輔助函式 ---
async function updateTimestamp() {
    const now = new Date().toISOString();
    await redis.set(KEY_LAST_UPDATED, now);
    io.emit("updateTimestamp", now);
}
async function broadcastPassedNumbers() {
    const numbersRaw = await redis.zrange(KEY_PASSED_NUMBERS, 0, -1);
    const numbers = numbersRaw.map(Number);
    io.emit("updatePassed", numbers);
    await updateTimestamp();
}
async function broadcastFeaturedContents() {
    const contentsJSONs = await redis.lrange(KEY_FEATURED_CONTENTS, 0, -1);
    const contents = contentsJSONs.map(JSON.parse);
    io.emit("updateFeaturedContents", contents);
    await updateTimestamp();
}

async function addAdminLog(message) {
    try {
        const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        const logMessage = `[${timestamp}] ${message}`;
        
        await redis.lpush(KEY_ADMIN_LOG, logMessage);
        await redis.ltrim(KEY_ADMIN_LOG, 0, 50);
        io.emit("newAdminLog", logMessage);
        
    } catch (e) {
        console.error("addAdminLog 失敗:", e);
    }
}


// --- 9. API 路由 (Routes) ---

// 【重構】 登入路由，使用 JWT
app.post("/login", loginLimiter, (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_TOKEN) {
        return res.status(403).json({ error: "密碼錯誤" });
    }
    
    // 密碼正確，簽發一個 8 小時有效的 JWT
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, {
        expiresIn: '8h' 
    });
    
    res.json({ success: true, token: token });
});
// (舊的 /check-token 已被 /login 取代)

const protectedAPIs = [
    "/change-number", "/set-number",
    "/api/passed/add", "/api/passed/remove", "/api/passed/clear",
    "/api/featured/add", "/api/featured/remove", "/api/featured/clear",
    "/set-sound-enabled", "/set-public-status", "/reset",
    "/api/layout/load", "/api/layout/save",
    "/api/logs/clear"
];
app.use(protectedAPIs, apiLimiter, authMiddleware); // 【重構】 API 現在受 JWT 保護

// 【重構】 移除所有 API 路由中的 try...catch
app.post("/change-number", async (req, res) => {
    const { direction } = req.body;
    let num;
    if (direction === "next") {
        num = await redis.incr(KEY_CURRENT_NUMBER);
        await addAdminLog(`號碼增加為 ${num}`); 
    }
    else if (direction === "prev") {
        const oldNum = await redis.get(KEY_CURRENT_NUMBER) || 0;
        num = await redis.decrIfPositive(KEY_CURRENT_NUMBER);
        if (Number(oldNum) > 0) {
            await addAdminLog(`號碼減少為 ${num}`); 
        }
    } 
    else {
        num = await redis.get(KEY_CURRENT_NUMBER) || 0;
    }
    io.emit("update", num);
    await updateTimestamp();
    res.json({ success: true, number: num });
});

app.post("/set-number", async (req, res) => {
    const { number } = req.body;
    const num = Number(number);
    if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
        return res.status(400).json({ error: "請提供一個有效的非負整數。" });
    }
    await redis.set(KEY_CURRENT_NUMBER, num);
    await addAdminLog(`號碼手動設定為 ${num}`); 
    io.emit("update", num);
    await updateTimestamp();
    res.json({ success: true, number: num });
});

app.post("/api/passed/add", async (req, res) => {
    const { number } = req.body;
    const num = Number(number);
    if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
        return res.status(400).json({ error: "請提供有效的正整數。" });
    }
    await redis.zadd(KEY_PASSED_NUMBERS, num, num);
    await redis.zremrangebyrank(KEY_PASSED_NUMBERS, 0, -21); 
    await addAdminLog(`過號列表新增 ${num}`); 
    await broadcastPassedNumbers();
    res.json({ success: true });
});

app.post("/api/passed/remove", async (req, res) => {
    const { number } = req.body;
    await redis.zrem(KEY_PASSED_NUMBERS, number);
    await addAdminLog(`過號列表移除 ${number}`); 
    await broadcastPassedNumbers();
    res.json({ success: true });
});

app.post("/api/featured/add", async (req, res) => {
    const { linkText, linkUrl } = req.body;
    if (!linkText || !linkUrl) {
        return res.status(400).json({ error: "文字和網址皆必填。" });
    }
    if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) {
        return res.status(400).json({ error: "網址請務必以 http:// 或 https:// 開頭。" });
    }
    const item = { linkText, linkUrl };
    await redis.rpush(KEY_FEATURED_CONTENTS, JSON.stringify(item));
    await addAdminLog(`精選連結新增: ${linkText}`); 
    await broadcastFeaturedContents();
    res.json({ success: true });
});

app.post("/api/featured/remove", async (req, res) => {
    const { linkText, linkUrl } = req.body;
    if (!linkText || !linkUrl) {
        return res.status(400).json({ error: "缺少必要參數。" });
    }
    const item = { linkText, linkUrl };
    await redis.lrem(KEY_FEATURED_CONTENTS, 1, JSON.stringify(item));
    await addAdminLog(`精選連結移除: ${linkText}`); 
    await broadcastFeaturedContents();
    res.json({ success: true });
});

app.post("/api/passed/clear", async (req, res) => {
    await redis.del(KEY_PASSED_NUMBERS);
    await addAdminLog(`過號列表已清空`); 
    io.emit("updatePassed", []);
    await updateTimestamp();
    res.json({ success: true, message: "過號列表已清空" });
});

app.post("/api/featured/clear", async (req, res) => {
    await redis.del(KEY_FEATURED_CONTENTS);
    await addAdminLog(`精選連結已清空`); 
    io.emit("updateFeaturedContents", []);
    await updateTimestamp();
    res.json({ success: true, message: "精選連結已清空" });
});

app.post("/set-sound-enabled", async (req, res) => {
    const { enabled } = req.body;
    const valueToSet = enabled ? "1" : "0";
    await redis.set(KEY_SOUND_ENABLED, valueToSet);
    await addAdminLog(`前台音效已設為: ${enabled ? '開啟' : '關閉'}`); 
    io.emit("updateSoundSetting", enabled);
    await updateTimestamp();
    res.json({ success: true, isEnabled: enabled });
});

app.post("/set-public-status", async (req, res) => {
    const { isPublic } = req.body;
    const valueToSet = isPublic ? "1" : "0";
    await redis.set(KEY_IS_PUBLIC, valueToSet);
    await addAdminLog(`前台已設為: ${isPublic ? '對外開放' : '關閉維護'}`); 
    io.emit("updatePublicStatus", isPublic); 
    await updateTimestamp();
    res.json({ success: true, isPublic: isPublic });
});

app.post("/reset", async (req, res) => {
    const multi = redis.multi();
    multi.set(KEY_CURRENT_NUMBER, 0);
    multi.del(KEY_PASSED_NUMBERS);
    multi.del(KEY_FEATURED_CONTENTS);
    multi.set(KEY_SOUND_ENABLED, "1");
    multi.set(KEY_IS_PUBLIC, "1"); 
    multi.del(KEY_ADMIN_LAYOUT); 
    multi.del(KEY_ADMIN_LOG); 
    await multi.exec();

    await addAdminLog(`💥 系統已重置所有資料`); 

    io.emit("update", 0);
    io.emit("updatePassed", []);
    io.emit("updateFeaturedContents", []);
    io.emit("updateSoundSetting", true);
    io.emit("updatePublicStatus", true); 
    io.emit("initAdminLogs", []); 

    await updateTimestamp();

    res.json({ success: true, message: "已重置所有內容" });
});

// --- 10. Socket.io 連線處理 ---

// 【重構】 Socket.io Middleware，用於 JWT 驗證
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error("Authentication failed: No token"));
    }

    // 驗證靜態 ADMIN_TOKEN (用於 Public User)
    // 或驗證 JWT (用於 Admin)
    if (token === ADMIN_TOKEN) {
        // 這是 Public User (或舊版 Admin)，允許連線，但標記為非管理員
        socket.isAdmin = false;
        return next();
    }
    
    try {
        // 嘗試驗證 JWT
        jwt.verify(token, JWT_SECRET);
        socket.isAdmin = true; // JWT 驗證通過，標記為管理員
        next();
    } catch (err) {
        // JWT 驗證失敗
        console.warn(`Socket 認證失敗: ${err.message}`);
        return next(new Error("Authentication failed"));
    }
});


io.on("connection", async (socket) => {
    // 【重構】 使用 socket.isAdmin 標記
    const isAdmin = socket.isAdmin;

    if (isAdmin) {
        console.log("✅ 一個已驗證的 Admin 連線", socket.id);
        socket.on("disconnect", (reason) => {
            console.log(`🔌 Admin ${socket.id} 斷線: ${reason}`);
        });

        // Admin 連線時，傳送日誌歷史
        try {
            const logs = await redis.lrange(KEY_ADMIN_LOG, 0, 50);
            socket.emit("initAdminLogs", logs); // 只傳送給這個剛連線的 admin
        } catch (e) {
            console.error("讀取日誌歷史失敗:", e);
        }

    } else {
        console.log("🔌 一個 Public User 連線", socket.id);
    }

    // ... (其餘連線邏輯不變，所有使用者都應收到初始狀態)
    try {
        const pipeline = redis.multi();
        pipeline.get(KEY_CURRENT_NUMBER);
        pipeline.zrange(KEY_PASSED_NUMBERS, 0, -1);
        pipeline.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        pipeline.get(KEY_LAST_UPDATED);
        pipeline.get(KEY_SOUND_ENABLED);
        pipeline.get(KEY_IS_PUBLIC); 
        
        const results = await pipeline.exec();
        if (results.some(res => res[0] !== null)) {
            const firstError = results.find(res => res[0] !== null)[0];
            throw new Error(`Redis multi 執行失敗: ${firstError.message}`);
        }
        const [
            [err0, currentNumberRaw],
            [err1, passedNumbersRaw],
            [err2, featuredContentsJSONs],
            [err3, lastUpdatedRaw],
            [err4, soundEnabledRaw],
            [err5, isPublicRaw]
        ] = results;

        const currentNumber = Number(currentNumberRaw || 0);
        const passedNumbers = (passedNumbersRaw || []).map(Number);
        const featuredContents = (featuredContentsJSONs || []).map(JSON.parse);
        const lastUpdated = lastUpdatedRaw || new Date().toISOString();
        const isSoundEnabled = soundEnabledRaw === null ? "1" : soundEnabledRaw;
        const isPublic = isPublicRaw === null ? "1" : isPublicRaw; 

        socket.emit("update", currentNumber);
        socket.emit("updatePassed", passedNumbers);
        socket.emit("updateFeaturedContents", featuredContents);
        socket.emit("updateTimestamp", lastUpdated);
        socket.emit("updateSoundSetting", isSoundEnabled === "1");
        socket.emit("updatePublicStatus", isPublic === "1"); 

    }
    catch (e) {
        console.error("Socket 連線處理失敗:", e);
        socket.emit("initialStateError", "無法載入初始資料，請稍後重新整理。");
    }
});

// --- 11. 儀表板排版 API ---
app.post("/api/layout/load", async (req, res) => {
    const layoutJSON = await redis.get(KEY_ADMIN_LAYOUT);
    if (layoutJSON) {
        res.json({ success: true, layout: JSON.parse(layoutJSON) });
    } else {
        res.json({ success: true, layout: null });
    }
});

app.post("/api/layout/save", async (req, res) => {
    const { layout } = req.body;
    if (!layout || !Array.isArray(layout)) {
        return res.status(400).json({ error: "排版資料格式不正確。" });
    }
    
    const layoutJSON = JSON.stringify(layout);
    await redis.set(KEY_ADMIN_LAYOUT, layoutJSON);
    await addAdminLog(`💾 儀表板排版已儲存`); 
    
    res.json({ success: true, message: "排版已儲存。" });
});

// --- 【新功能】 清空日誌 API ---
app.post("/api/logs/clear", async (req, res) => {
    await redis.del(KEY_ADMIN_LOG);
    await addAdminLog(`🧼 管理員清空了所有日誌`); 
    io.emit("initAdminLogs", []); 
    res.json({ success: true, message: "日誌已清空。" });
});


// --- 【重構】 集中錯誤處理 Middleware ---
// 必須放在所有 app.use 和 app.post/get 之後
app.use((err, req, res, next) => {
    console.error("❌ 發生未處理的錯誤:", err.stack || err);
    
    if (res.headersSent) {
        return next(err);
    }
    
    res.status(err.status || 500).json({ error: err.message || "伺服器內部錯誤" });
});


// --- 12. 啟動伺服器 ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on host 0.0.0.0, port ${PORT}`);
    console.log(`🎟 User page (local): http://localhost:${PORT}/index.html`);
    console.log(`🛠 Admin page (local): http://localhost:${PORT}/admin.html`);
});
