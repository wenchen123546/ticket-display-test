/*
 * ==========================================
 * 伺服器 (index.js)
 * ... (舊註解) ...
 * * 11.【重構 v2】
 * * - 實作多使用者系統 (Admin / Super Admin)
 * * - 導入 bcryptjs 進行密碼雜湊
 * * - 導入 JWT (JSON Web Token) 進行認證
 * * - 新增 Super Admin 管理 API
 * ==========================================
 */

// --- 1. 模組載入 ---
const express = require("express");
require('express-async-errors'); // 必須在 express 之後
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const bcrypt = require('bcryptjs'); // 【新增】 密碼雜湊
const jwt = require('jsonwebtoken'); // 【新增】 JWT

// --- 2. 伺服器實體化 ---
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 3. 核心設定 & 安全性 ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; // 舊的密碼，用於建立第一個 superadmin
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET; // 【新增】

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
const KEY_ADMINS = 'callsys:admins'; // 【新增】 儲存所有管理員的 Hash

// --- 7. Express 中介軟體 (Middleware) ---
app.use(helmet({ /* ... */ })); // (CSP 策略保持不變)
app.use(express.static("public"));
app.use(express.json());

const apiLimiter = rateLimit({ /* ... */ });
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    message: { error: "登入嘗試次數過多，請 15 分鐘後再試。" },
    standardHeaders: true,
    legacyHeaders: false,
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
        
        // 將解碼後的 user 資訊附加到 req 物件上
        req.user = payload; 
        
        next(); // 驗證通過
    } catch (err) {
        return res.status(403).json({ error: "認證無效或已過期" });
    }
};

// 【新增】 超級管理員權限中介軟體
const isSuperAdminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: "權限不足，此操作僅限超級管理員。" });
    }
    next();
};

// --- 9. 輔助函式 ---
async function updateTimestamp() { /* ... */ }
async function broadcastPassedNumbers() { /* ... */ }
async function broadcastFeaturedContents() { /* ... */ }

// 【重構】 addAdminLog 函式，現在會記錄是哪個使用者操作
async function addAdminLog(message, username = '系統') {
    try {
        const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        const logMessage = `[${timestamp}] (${username}) ${message}`;
        
        await redis.lpush(KEY_ADMIN_LOG, logMessage);
        await redis.ltrim(KEY_ADMIN_LOG, 0, 50);
        io.to('admin_room').emit("newAdminLog", logMessage); // 只傳送給 Admin
        
    } catch (e) {
        console.error("addAdminLog 失敗:", e);
    }
}


// --- 10. 【重構】 登入 / 管理員 API ---

// 【新增】 登入 API
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
    
    // 比較密碼
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        return res.status(403).json({ error: "使用者名稱或密碼錯誤。" });
    }

    // 密碼正確，簽發 JWT
    const payload = {
        username: user.username,
        role: user.role
    };
    const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: '8h' // Token 8 小時後過期
    });

    res.json({ success: true, token: token, role: user.role });
});

// --- 【新增】 超級管理員 API (全部都需要 Super Admin 權限) ---

// (保護 /api/admin/* 路由)
app.use("/api/admin", apiLimiter, authMiddleware, isSuperAdminMiddleware);

// 取得管理員列表
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

// 新增管理員
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

// 刪除管理員
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

// 重設密碼
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

// (移除舊的 /check-token 路由)

const protectedAPIs = [
    "/change-number", "/set-number",
    "/api/passed/add", "/api/passed/remove", "/api/passed/clear",
    "/api/featured/add", "/api/featured/remove", "/api/featured/clear",
    "/set-sound-enabled", "/set-public-status", "/reset",
    "/api/logs/clear"
];
// 【重構】 所有 API 都使用新的 authMiddleware
app.use(protectedAPIs, apiLimiter, authMiddleware);

app.post("/change-number", async (req, res) => {
    const { direction } = req.body;
    let num;
    if (direction === "next") {
        num = await redis.incr(KEY_CURRENT_NUMBER);
        await addAdminLog(`號碼增加為 ${num}`, req.user.username); 
    }
    else if (direction === "prev") {
        num = await redis.decrIfPositive(KEY_CURRENT_NUMBER);
        await addAdminLog(`號碼減少為 ${num}`, req.user.username); 
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
    // ... (驗證)
    await redis.set(KEY_CURRENT_NUMBER, num);
    await addAdminLog(`號碼手動設定為 ${num}`, req.user.username); 
    io.emit("update", num);
    await updateTimestamp();
    res.json({ success: true, number: num });
});

// ... (其他 API 如 /api/passed/add, /api/featured/add 等都類似地
//      在呼叫 addAdminLog 時加上 req.user.username)

app.post("/api/passed/add", async (req, res) => {
    // ...
    await addAdminLog(`過號列表新增 ${num}`, req.user.username);
    await broadcastPassedNumbers();
    res.json({ success: true });
});

// ... (請依此類推修改所有呼叫 addAdminLog 的地方)

// (為了簡潔，以下省略了其他 API，僅展示 reset 和 logs/clear)

app.post("/api/logs/clear", async (req, res) => {
    await redis.del(KEY_ADMIN_LOG);
    await addAdminLog(`🧼 管理員清空了所有日誌`, req.user.username); 
    io.to('admin_room').emit("initAdminLogs", []); // 廣播清空
    res.json({ success: true, message: "日誌已清空。" });
});

app.post("/reset", async (req, res) => {
    // ... (multi.del(KEY_ADMIN_LAYOUT) 已移除)
    // ...
    await addAdminLog(`💥 系統已重置所有資料 (不清空管理員帳號)`, req.user.username); 
    // ...
    res.json({ success: true, message: "已重置所有內容" });
});


// --- 12. Socket.io 連線處理 ---

// 【重構】 Socket.io Middleware，用於 JWT 驗證
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Authentication failed: No token"));
    }
    
    try {
        // 驗證 JWT
        const payload = jwt.verify(token, JWT_SECRET);
        socket.user = payload; // 將 user 資訊附加到 socket
        next();
    } catch (err) {
        // JWT 驗證失敗
        console.warn(`Socket 認證失敗: ${err.message}`);
        return next(new Error("Authentication failed"));
    }
});

io.on("connection", async (socket) => {
    // 【重構】 檢查 socket.user (來自 JWT)
    const isAdmin = (socket.user && socket.user.role);

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
        // (理論上, 公開使用者不應該通過 JWT 驗證, 但我們保留以防萬一)
        console.log("🔌 一個 Public User 連線 (或 JWT 無效)", socket.id);
        socket.join('public_room'); // 加入公開房間
    }

    // --- 廣播初始狀態給所有人 ---
    try {
        // ... (原來的 pipeline 邏輯不變)
        const [
            // ...
        ] = await pipeline.exec();
        
        // ... (原來的 emit 邏輯不變)
        socket.emit("update", currentNumber);
        // ...

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

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on host 0.0.0.0, port ${PORT}`);
        console.log(`🎟 User page (local): http://localhost:${PORT}/index.html`);
        console.log(`🛠 Admin page (local): http://localhost:${PORT}/admin.html`);
    });
}

startServer(); // 啟動伺服器
