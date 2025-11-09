/*
 * ==========================================
 * 伺服器 (index.js)
 * * 【修改 V3.1】 修正 express-rate-limit 在 'trust proxy' = true 時的崩潰錯誤
 * ==========================================
 */

// --- 1. 模組載入 ---
const express = require("express");
require('express-async-errors'); 
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");
const helmet = require('helmet'); 
const rateLimit = require("express-rate-limit");
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 

// --- 2. 伺服器實體化 ---
const app = express();
// 【修正】 設定 'trust proxy' 為 true，解決部署環境中的 X-Forwarded-For 錯誤
app.set('trust proxy', true);

const server = http.createServer(app);
const io = socketio(server);

// --- 3. 核心設定 & 安全性 ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; 
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET; 
// const DEFAULT_JWT_EXPIRY_HOURS = 8; // 【移除】: 不再使用 JWT 期限

// --- 4. 關鍵檢查 ---
if (!ADMIN_TOKEN) {
    console.error("❌ 錯誤： ADMIN_TOKEN 環境變數未設定！(用於建立初始超級管理員)");
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


// --- 6. Redis Keys ---
const KEY_CURRENT_NUMBER = 'callsys:number';
const KEY_PASSED_NUMBERS = 'callsys:passed';
const KEY_FEATURED_CONTENTS = 'callsys:featured';
const KEY_LAST_UPDATED = 'callsys:updated';
const KEY_SOUND_ENABLED = 'callsys:soundEnabled';
const KEY_IS_PUBLIC = 'callsys:isPublic'; 
const KEY_ADMIN_LOG = 'callsys:admin-log'; 
const KEY_ADMINS = 'callsys:admins'; 
// const KEY_JWT_EXPIRY = 'callsys:jwt-expiry-hours'; // 【移除】 JWT 期限 Key

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
    trustProxy: 1 // <-- 【關鍵修復 V3.1】 告訴 limiter 信任第一層 proxy
});
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    message: { error: "登入嘗試次數過多，請 15 分鐘後再試。" },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: 1 // <-- 【關鍵修復 V3.1】 告訴 limiter 信任第一層 proxy
});

// --- 8. 【重構】 認證中介軟體 (JWT) ---
const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "缺少認證 Token" });
        }
        
        const token = authHeader.split(' ')[1];
        const payload = jwt.verify(token, JWT_SECRET);
        
        req.user = payload; 
        
        next(); 
    } catch (err) {
        // 由於移除了期限，這裡主要是處理 Token 格式錯誤或 JWT_SECRET 不匹配
        return res.status(403).json({ error: "認證無效或Token錯誤" });
    }
};

const isSuperAdminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: "權限不足，此操作僅限超級管理員。" });
    }
    next();
};

// --- 9. 輔助函式 ---
async function updateTimestamp() {
    const now = new Date().toISOString();
    await redis.set(KEY_LAST_UPDATED, now);
    io.emit("updateTimestamp", now);
}
async function broadcastPassedNumbers() {
    try {
        const numbersRaw = await redis.zrange(KEY_PASSED_NUMBERS, 0, -1);
        const numbers = numbersRaw.map(Number);
        io.emit("updatePassed", numbers);
        await updateTimestamp();
    } catch (e) { console.error("broadcastPassedNumbers 失敗:", e); }
}
async function broadcastFeaturedContents() {
    try {
        const contentsJSONs = await redis.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        const contents = contentsJSONs.map(JSON.parse);
        io.emit("updateFeaturedContents", contents);
        await updateTimestamp();
    } catch (e) { console.error("broadcastFeaturedContents 失敗:", e); }
}

async function addAdminLog(message, username = '系統') {
    try {
        // 【優化】 增加日期，使用 toLocaleString 確保格式一致性
        const timestamp = new Date().toLocaleString('zh-TW', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: false 
        });
        const logMessage = `[${timestamp}] (${username}) ${message}`;
        
        await redis.lpush(KEY_ADMIN_LOG, logMessage);
        await redis.ltrim(KEY_ADMIN_LOG, 0, 50);
        io.to('admin_room').emit("newAdminLog", logMessage); 
        
    } catch (e) {
        console.error("addAdminLog 失敗:", e);
    }
}


// --- 10. 【重構】 登入 / 管理員 API ---

app.post("/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "請輸入使用者名稱和密碼。" });
    }

    const userJSON = await redis.hget(KEY_ADMINS, username);
    if (!userJSON) {
        return res.status(403).json({ error: "使用者名稱或密碼錯誤。" });
    }

    const user = JSON.parse(userJSON);
    
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        return res.status(403).json({ error: "使用者名稱或密碼錯誤。" });
    }

    // 【修改】 移除讀取 JWT 期限的邏輯
    const payload = {
        username: user.username,
        role: user.role
    };
    
    // 【修改】 移除 expiresIn 選項，Token 永不過期
    const token = jwt.sign(payload, JWT_SECRET); 

    res.json({ success: true, token: token, role: user.role });
});

// --- 【新增】 超級管理員 API ---

// 移除 /api/admin/set-jwt-expiry 和 /api/admin/get-jwt-expiry 路由

app.use("/api/admin", apiLimiter, authMiddleware, isSuperAdminMiddleware);

app.post("/api/admin/list", async (req, res) => {
    const adminHash = await redis.hgetall(KEY_ADMINS);
    const admins = Object.keys(adminHash).map(username => {
        const user = JSON.parse(adminHash[username]);
        return {
            username: user.username,
            role: user.role
        };
    });
    res.json({ success: true, admins: admins });
});

app.post("/api/admin/add", async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: "使用者名稱、密碼和角色為必填。" });
    }
    if (role !== 'admin' && role !== 'superadmin') {
        return res.status(400).json({ error: "無效的角色。" });
    }

    const exists = await redis.hget(KEY_ADMINS, username);
    if (exists) {
        return res.status(400).json({ error: "此使用者名稱已被使用。" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
        username,
        passwordHash,
        role
    };

    await redis.hset(KEY_ADMINS, username, JSON.stringify(user));
    await addAdminLog(`新增了管理員: ${username} (角色: ${role})`, req.user.username);
    res.json({ success: true });
});

app.post("/api/admin/delete", async (req, res) => {
    const { username } = req.body;
    if (username === req.user.username) {
        return res.status(400).json({ error: "您無法刪除自己的帳號。" });
    }
    
    const result = await redis.hdel(KEY_ADMINS, username);
    if (result === 0) {
        return res.status(404).json({ error: "找不到該使用者。" });
    }

    await addAdminLog(`刪除了管理員: ${username}`, req.user.username);
    res.json({ success: true });
});

app.post("/api/admin/set-password", async (req, res) => {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
        return res.status(400).json({ error: "使用者名稱和新密碼為必填。" });
    }

    const userJSON = await redis.hget(KEY_ADMINS, username);
    if (!userJSON) {
        return res.status(404).json({ error: "找不到該使用者。" });
    }

    const user = JSON.parse(userJSON);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    
    await redis.hset(KEY_ADMINS, username, JSON.stringify(user));
    await addAdminLog(`重設了管理員 ${username} 的密碼`, req.user.username);
    res.json({ success: true });
});


// --- 11. 核心功能 API (受 JWT 保護) ---

const protectedAPIs = [
    "/change-number", "/set-number",
    "/api/passed/add", "/api/passed/remove", "/api/passed/clear",
    "/api/featured/add", "/api/featured/remove", "/api/featured/clear",
    "/set-sound-enabled", "/set-public-status", "/reset",
    "/api/logs/clear"
];
app.use(protectedAPIs, apiLimiter, authMiddleware);

app.post("/change-number", async (req, res) => {
    const { direction } = req.body;
    let num;
    if (direction === "next") {
        num = await redis.incr(KEY_CURRENT_NUMBER);
        await addAdminLog(`號碼增加為 ${num}`, req.user.username); 
    }
    else if (direction === "prev") {
        const oldNum = await redis.get(KEY_CURRENT_NUMBER) || 0;
        num = await redis.decrIfPositive(KEY_CURRENT_NUMBER);
        if (Number(oldNum) > 0) {
             await addAdminLog(`號碼減少為 ${num}`, req.user.username);
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
    await addAdminLog(`號碼手動設定為 ${num}`, req.user.username); 
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
    await addAdminLog(`過號列表新增 ${num}`, req.user.username); 
    await broadcastPassedNumbers();
    res.json({ success: true });
});

app.post("/api/passed/remove", async (req, res) => {
    const { number } = req.body;
    await redis.zrem(KEY_PASSED_NUMBERS, number);
    await addAdminLog(`過號列表移除 ${number}`, req.user.username); 
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
    await addAdminLog(`精選連結新增: ${linkText}`, req.user.username); 
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
    await addAdminLog(`精選連結移除: ${linkText}`, req.user.username); 
    await broadcastFeaturedContents();
    res.json({ success: true });
});

app.post("/api/passed/clear", async (req, res) => {
    await redis.del(KEY_PASSED_NUMBERS);
    await addAdminLog(`過號列表已清空`, req.user.username); 
    io.emit("updatePassed", []);
    await updateTimestamp();
    res.json({ success: true, message: "過號列表已清空" });
});

app.post("/api/featured/clear", async (req, res) => {
    await redis.del(KEY_FEATURED_CONTENTS);
    await addAdminLog(`精選連結已清空`, req.user.username); 
    io.emit("updateFeaturedContents", []);
    await updateTimestamp();
    res.json({ success: true, message: "精選連結已清空" });
});

app.post("/set-sound-enabled", async (req, res) => {
    const { enabled } = req.body;
    const valueToSet = enabled ? "1" : "0";
    await redis.set(KEY_SOUND_ENABLED, valueToSet);
    await addAdminLog(`前台音效已設為: ${enabled ? '開啟' : '關閉'}`, req.user.username); 
    io.emit("updateSoundSetting", enabled);
    await updateTimestamp();
    res.json({ success: true, isEnabled: enabled });
});

app.post("/set-public-status", async (req, res) => {
    const { isPublic } = req.body;
    const valueToSet = isPublic ? "1" : "0";
    await redis.set(KEY_IS_PUBLIC, valueToSet);
    await addAdminLog(`前台已設為: ${isPublic ? '對外開放' : '關閉維護'}`, req.user.username); 
    io.emit("updatePublicStatus", isPublic); 
    await updateTimestamp();
    res.json({ success: true, isPublic: isPublic });
});

app.post("/api/logs/clear", async (req, res) => {
    await redis.del(KEY_ADMIN_LOG);
    await addAdminLog(`🧼 管理員清空了所有日誌`, req.user.username); 
    io.to('admin_room').emit("initAdminLogs", []); 
    res.json({ success: true, message: "日誌已清空。" });
});

app.post("/reset", async (req, res) => {
    const multi = redis.multi();
    multi.set(KEY_CURRENT_NUMBER, 0);
    multi.del(KEY_PASSED_NUMBERS);
    multi.del(KEY_FEATURED_CONTENTS);
    multi.set(KEY_SOUND_ENABLED, "1");
    multi.set(KEY_IS_PUBLIC, "1"); 
    multi.del(KEY_ADMIN_LOG); 
    await multi.exec();

    await addAdminLog(`💥 系統已重置所有資料 (不清空管理員帳號)`, req.user.username); 

    io.emit("update", 0);
    io.emit("updatePassed", []);
    io.emit("updateFeaturedContents", []);
    io.emit("updateSoundSetting", true);
    io.emit("updatePublicStatus", true); 
    io.to('admin_room').emit("initAdminLogs", []); 

    await updateTimestamp();

    res.json({ success: true, message: "已重置所有內容" });
});


// --- 12. Socket.io 連線處理 ---

// 【修正 v2.1】 Socket.io Middleware (區分公/私)
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    // 情況 1: 沒有 Token (公開使用者)
    if (!token) {
        socket.user = { role: 'public' };
        return next();
    }

    // 情況 2: 有 Token (管理員)
    try {
        // 驗證 JWT
        const payload = jwt.verify(token, JWT_SECRET);
        socket.user = payload; // 附加 user 資訊 (e.g., { username: '...', role: 'admin' })
        next();
    } catch (err) {
        // 情況 3: Token 無效或過期
        console.warn(`Socket 認證失敗: ${err.message}`);
        return next(new Error("Authentication failed: Invalid Token"));
    }
});

io.on("connection", async (socket) => {
    // 【修正 v2.1】 檢查 socket.user.role (在 middleware 中設定)
    const isAdmin = (socket.user && socket.user.role !== 'public');

    if (isAdmin) {
        console.log(`✅ 一個 Admin (${socket.user.username}) 連線`, socket.id);
        socket.join('admin_room'); // 加入管理員專用房間
        socket.on("disconnect", (reason) => {
            console.log(`🔌 Admin (${socket.user.username}) ${socket.id} 斷線: ${reason}`);
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
        socket.join('public_room'); // 加入公開房間
    }

    // --- 廣播初始狀態給所有人 (不論身分) ---
    try {
        const pipeline = redis.multi();
        pipeline.get(KEY_CURRENT_NUMBER);
        pipeline.zrange(KEY_PASSED_NUMBERS, 0, -1);
        pipeline.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        pipeline.get(KEY_LAST_UPDATED);
        pipeline.get(KEY_SOUND_ENABLED);
        pipeline.get(KEY_IS_PUBLIC); 
        
        const results = await pipeline.exec();
        // 確保正確檢查 Redis multi 的錯誤
        if (results.some(res => res[0])) {
            const firstErrorResult = results.find(res => res[0]);
            const firstError = firstErrorResult ? firstErrorResult[0] : new Error("Unknown Redis Multi Error");
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


// --- 13. 啟動伺服器 & 建立超級管理員 ---
async function startServer() {
    // 【新增】 檢查並建立第一個超級管理員
    try {
        const admins = await redis.hgetall(KEY_ADMINS);
        if (Object.keys(admins).length === 0) {
            console.log("... 偵測到沒有任何管理員，正在建立初始超級管理員 (superadmin)...");
            const passwordHash = await bcrypt.hash(ADMIN_TOKEN, 10);
            const superAdmin = {
                username: 'superadmin',
                passwordHash: passwordHash,
                role: 'superadmin'
            };
            await redis.hset(KEY_ADMINS, 'superadmin', JSON.stringify(superAdmin));
            console.log("✅ 初始超級管理員 'superadmin' 建立完畢。");
            console.log("   請使用 'superadmin' 和您的 ADMIN_TOKEN 密碼登入。");
        } else {
            console.log("... 管理員帳號已存在，跳過初始建立。");
        }
    } catch (e) {
        console.error("❌ 建立初始超級管理員失敗:", e);
        process.exit(1);
    }
    
    // 【移除】 不再需要 JWT 期限的預設值檢查

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on host 0.0.0.0, port ${PORT}`);
        console.log(`🎟 User page (local): http://localhost:${PORT}/index.html`);
        console.log(`🛠 Admin page (local): http://localhost:${PORT}/admin.html`);
    });
}

// 統一的錯誤處理
app.use((err, req, res, next) => {
    console.error("❌ 發生未處理的錯誤:", err.stack);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ error: "伺服器內部錯誤" });
});


startServer(); // 啟動伺服器
