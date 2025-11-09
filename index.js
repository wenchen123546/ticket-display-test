/*
 * ==========================================
 * 伺服器 (index.js)
 * v3: 增加重設密碼 API
 * ==========================================
 */

// --- 1. 模組載入 ---
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const { v4: uuidv4 } = require('uuid'); 
const bcrypt = require('bcrypt'); 

// --- 2. 伺服器實體化 ---
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 3. 核心設定 & 安全性 ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; 
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const SALT_ROUNDS = 10; 

// --- 4. 關鍵檢查 ---
if (!ADMIN_TOKEN) {
    console.error("❌ 錯誤： ADMIN_TOKEN 環境變數未設定！(這是超級管理員密碼)");
    process.exit(1);
}
if (!REDIS_URL) {
    console.error("❌ 錯誤： UPSTASH_REDIS_URL 環境變數未設定！");
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


// --- 6. Redis Keys & 全域狀態 ---
const KEY_CURRENT_NUMBER = 'callsys:number';
const KEY_PASSED_NUMBERS = 'callsys:passed';
const KEY_FEATURED_CONTENTS = 'callsys:featured';
const KEY_LAST_UPDATED = 'callsys:updated';
const KEY_SOUND_ENABLED = 'callsys:soundEnabled';
const KEY_IS_PUBLIC = 'callsys:isPublic'; 
const KEY_ADMIN_LOG = 'callsys:admin-log';
const KEY_USERS = 'callsys:users'; 
const SESSION_PREFIX = 'callsys:session:';

const onlineAdmins = new Map();

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

// 基於 Session Token 的驗證中介軟體
const authMiddleware = async (req, res, next) => {
    try {
        const { token } = req.body; 
        
        if (!token) {
            return res.status(401).json({ error: "未提供驗證 Token" });
        }

        const sessionKey = `${SESSION_PREFIX}${token}`;
        const sessionData = await redis.get(sessionKey);

        if (!sessionData) {
            return res.status(403).json({ error: "驗證失敗或 Session 已過期" });
        }

        req.user = JSON.parse(sessionData); 
        await redis.expire(sessionKey, 8 * 60 * 60);
        
        next();

    } catch (e) {
        res.status(500).json({ error: "驗證中介軟體錯誤" });
    }
};

// 超級管理員專用中介軟體
const superAdminAuthMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'super') {
        next();
    } else {
        return res.status(403).json({ error: "權限不足 (僅限超級管理員)" });
    }
};


// --- 8. 輔助函式 ---
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
    } catch (e) {
        console.error("broadcastPassedNumbers 失敗:", e);
    }
}
async function broadcastFeaturedContents() {
    try {
        const contentsJSONs = await redis.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        const contents = contentsJSONs.map(JSON.parse);
        io.emit("updateFeaturedContents", contents);
        await updateTimestamp();
    } catch (e) {
        console.error("broadcastFeaturedContents 失敗:", e);
    }
}

// 伺服器端日誌函式
async function addAdminLog(username, message) { 
    try {
        const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        const logMessage = `[${timestamp}] [${username}] ${message}`; 
        
        await redis.lpush(KEY_ADMIN_LOG, logMessage);
        await redis.ltrim(KEY_ADMIN_LOG, 0, 50);
        io.emit("newAdminLog", logMessage);
        
    } catch (e) {
        console.error("addAdminLog 失敗:", e);
    }
}

// 廣播在線管理員列表
function broadcastOnlineAdmins() {
    try {
        const adminList = Array.from(onlineAdmins.values());
        io.emit("updateOnlineAdmins", adminList);
    } catch (e) {
        console.error("broadcastOnlineAdmins 失敗:", e);
    }
}


// --- 9. API 路由 (Routes) ---

// 登入路由
app.post("/login", loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "帳號和密碼皆為必填。" });
        }

        let isValid = false;
        let role = 'normal'; 

        // 邏輯 1：檢查是否為超級管理員
        if (username === 'superadmin' && password === ADMIN_TOKEN) {
            isValid = true;
            role = 'super';
            console.log("一個超級管理員已登入。");
        } 
        // 邏輯 2：檢查是否為普通管理員
        else {
            const storedHash = await redis.hget(KEY_USERS, username);
            if (storedHash) {
                isValid = await bcrypt.compare(password, storedHash);
                role = 'normal';
            }
        }

        // 邏輯 3：登入失敗
        if (!isValid) {
            return res.status(403).json({ error: "帳號或密碼錯誤。" });
        }

        // 邏輯 4：登入成功，建立 Session
        const sessionToken = uuidv4();
        const sessionKey = `${SESSION_PREFIX}${sessionToken}`;
        const sessionData = JSON.stringify({ username, role });
        await redis.set(sessionKey, sessionData, "EX", 8 * 60 * 60); 

        res.json({ success: true, token: sessionToken, role: role, username: username });

    } catch (e) {
        console.error("登入時發生錯誤:", e);
        res.status(500).json({ error: e.message });
    }
});


const protectedAPIs = [
    "/change-number", "/set-number",
    "/api/passed/add", "/api/passed/remove", "/api/passed/clear",
    "/api/featured/add", "/api/featured/remove", "/api/featured/clear",
    "/set-sound-enabled", "/set-public-status", "/reset",
    "/api/logs/clear"
];
app.use(protectedAPIs, apiLimiter, authMiddleware);

app.post("/change-number", async (req, res) => {
    try {
        const { direction } = req.body;
        const username = req.user.username; 
        let num;
        if (direction === "next") {
            num = await redis.incr(KEY_CURRENT_NUMBER);
            await addAdminLog(username, `號碼增加為 ${num}`); 
        }
        else if (direction === "prev") {
            const oldNum = await redis.get(KEY_CURRENT_NUMBER) || 0;
            num = await redis.decrIfPositive(KEY_CURRENT_NUMBER);
            if (Number(oldNum) > 0) {
                await addAdminLog(username, `號碼減少為 ${num}`); 
            }
        } 
        else {
            num = await redis.get(KEY_CURRENT_NUMBER) || 0;
        }
        io.emit("update", num);
        await updateTimestamp();
        res.json({ success: true, number: num });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/set-number", async (req, res) => {
    try {
        const { number } = req.body;
        const username = req.user.username; 
        const num = Number(number);
        if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
            return res.status(400).json({ error: "請提供一個有效的非負整數。" });
        }
        await redis.set(KEY_CURRENT_NUMBER, num);
        await addAdminLog(username, `號碼手動設定為 ${num}`); 
        io.emit("update", num);
        await updateTimestamp();
        res.json({ success: true, number: num });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/passed/add", async (req, res) => {
    try {
        const { number } = req.body;
        const username = req.user.username; 
        const num = Number(number);
        if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
            return res.status(400).json({ error: "請提供有效的正整數。" });
        }
        await redis.zadd(KEY_PASSED_NUMBERS, num, num);
        await redis.zremrangebyrank(KEY_PASSED_NUMBERS, 0, -21); 
        await addAdminLog(username, `過號列表新增 ${num}`); 
        await broadcastPassedNumbers();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/passed/remove", async (req, res) => {
    try {
        const { number } = req.body;
        const username = req.user.username; 
        await redis.zrem(KEY_PASSED_NUMBERS, number);
        await addAdminLog(username, `過號列表移除 ${number}`); 
        await broadcastPassedNumbers();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/featured/add", async (req, res) => {
    try {
        const { linkText, linkUrl } = req.body;
        const username = req.user.username; 
        if (!linkText || !linkUrl) {
            return res.status(400).json({ error: "文字和網址皆必填。" });
        }
        if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) {
            return res.status(400).json({ error: "網址請務必以 http:// 或 https:// 開頭。" });
        }
        const item = { linkText, linkUrl };
        await redis.rpush(KEY_FEATURED_CONTENTS, JSON.stringify(item));
        await addAdminLog(username, `精選連結新增: ${linkText}`); 
        await broadcastFeaturedContents();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/featured/remove", async (req, res) => {
    try {
        const { linkText, linkUrl } = req.body;
        const username = req.user.username; 
        if (!linkText || !linkUrl) {
            return res.status(400).json({ error: "缺少必要參數。" });
        }
        const item = { linkText, linkUrl };
        await redis.lrem(KEY_FEATURED_CONTENTS, 1, JSON.stringify(item));
        await addAdminLog(username, `精選連結移除: ${linkText}`); 
        await broadcastFeaturedContents();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/passed/clear", async (req, res) => {
    try {
        const username = req.user.username; 
        await redis.del(KEY_PASSED_NUMBERS);
        await addAdminLog(username, `過號列表已清空`); 
        io.emit("updatePassed", []);
        await updateTimestamp();
        res.json({ success: true, message: "過號列表已清空" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/featured/clear", async (req, res) => {
    try {
        const username = req.user.username; 
        await redis.del(KEY_FEATURED_CONTENTS);
        await addAdminLog(username, `精選連結已清空`); 
        io.emit("updateFeaturedContents", []);
        await updateTimestamp();
        res.json({ success: true, message: "精選連結已清空" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/set-sound-enabled", async (req, res) => {
    try {
        const { enabled } = req.body;
        const username = req.user.username; 
        const valueToSet = enabled ? "1" : "0";
        await redis.set(KEY_SOUND_ENABLED, valueToSet);
        await addAdminLog(username, `前台音效已設為: ${enabled ? '開啟' : '關閉'}`); 
        io.emit("updateSoundSetting", enabled);
        await updateTimestamp();
        res.json({ success: true, isEnabled: enabled });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/set-public-status", async (req, res) => {
    try {
        const { isPublic } = req.body;
        const username = req.user.username; 
        const valueToSet = isPublic ? "1" : "0";
        await redis.set(KEY_IS_PUBLIC, valueToSet);
        await addAdminLog(username, `前台已設為: ${isPublic ? '對外開放' : '關閉維護'}`); 
        io.emit("updatePublicStatus", isPublic); 
        await updateTimestamp();
        res.json({ success: true, isPublic: isPublic });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/reset", async (req, res) => {
    try {
        const username = req.user.username; 
        const multi = redis.multi();
        multi.set(KEY_CURRENT_NUMBER, 0);
        multi.del(KEY_PASSED_NUMBERS);
        multi.del(KEY_FEATURED_CONTENTS);
        multi.set(KEY_SOUND_ENABLED, "1");
        multi.set(KEY_IS_PUBLIC, "1"); 
        multi.del(KEY_ADMIN_LOG);
        await multi.exec();

        await addAdminLog(username, `💥 系統已重置所有資料`); 

        io.emit("update", 0);
        io.emit("updatePassed", []);
        io.emit("updateFeaturedContents", []);
        io.emit("updateSoundSetting", true);
        io.emit("updatePublicStatus", true); 
        io.emit("initAdminLogs", []); 

        await updateTimestamp();

        res.json({ success: true, message: "已重置所有內容" });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 10. Socket.io 連線處理 ---
io.on("connection", async (socket) => {
    const token = socket.handshake.auth.token; 
    let isAdmin = false;
    let username = "Public_User";
    
    // 驗證 Session Token
    if (token) {
        const sessionKey = `${SESSION_PREFIX}${token}`;
        const sessionData = await redis.get(sessionKey);
        
        if (sessionData) {
            const user = JSON.parse(sessionData);
            isAdmin = true;
            username = user.username;
            
            console.log(`✅ 一個已驗證的 Admin 連線 (${username})`, socket.id);
            
            // 將用戶添加到在線列表並廣播
            onlineAdmins.set(socket.id, { username: user.username, role: user.role });
            broadcastOnlineAdmins();

            socket.on("disconnect", (reason) => {
                console.log(`🔌 Admin ${socket.id} (${username}) 斷線: ${reason}`);
                // 從在線列表移除並廣播
                onlineAdmins.delete(socket.id);
                broadcastOnlineAdmins();
            });

            // Admin 連線時，傳送日誌歷史
            try {
                const logs = await redis.lrange(KEY_ADMIN_LOG, 0, 50);
                socket.emit("initAdminLogs", logs); 
            } catch (e) {
                console.error("讀取日誌歷史失敗:", e);
            }
        }
    }

    if (!isAdmin) {
        console.log("🔌 一個 Public User 連線", socket.id);
    }

    try {
        // ... (載入初始資料的 pipeline 保持不變) ...
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

// --- 11. 超級管理員 API (管理用戶) ---

const superAdminAPIs = [
    "/api/admin/users",
    "/api/admin/add-user",
    "/api/admin/del-user",
    "/api/admin/set-password" // 【新】
];
app.use(superAdminAPIs, apiLimiter, authMiddleware, superAdminAuthMiddleware);

// 獲取所有普通管理員
app.post("/api/admin/users", async (req, res) => {
    try {
        const users = await redis.hkeys(KEY_USERS);
        res.json({ success: true, users: users || [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 新增普通管理員
app.post("/api/admin/add-user", async (req, res) => {
    try {
        const { newUsername, newPassword } = req.body;
        if (!newUsername || !newPassword) {
            return res.status(400).json({ error: "新帳號和新密碼皆為必填。" });
        }
        if (newUsername === 'superadmin') {
            return res.status(400).json({ error: "不可使用保留帳號。" });
        }

        const exists = await redis.hexists(KEY_USERS, newUsername);
        if (exists) {
            return res.status(400).json({ error: "此帳號已被使用。" });
        }

        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await redis.hset(KEY_USERS, newUsername, hash);

        await addAdminLog(req.user.username, `新增管理員: ${newUsername}`);
        res.json({ success: true, message: "管理員已新增。" });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 刪除普通管理員
app.post("/api/admin/del-user", async (req, res) => {
    try {
        const { delUsername } = req.body;
        if (!delUsername) {
            return res.status(400).json({ error: "缺少用戶名。" });
        }
        
        const result = await redis.hdel(KEY_USERS, delUsername);
        if (result === 0) {
            return res.status(404).json({ error: "找不到該用戶。" });
        }

        await addAdminLog(req.user.username, `刪除管理員: ${delUsername}`);
        res.json({ success: true, message: "管理員已刪除。" });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 【新】 重設普通管理員密碼
app.post("/api/admin/set-password", async (req, res) => {
    try {
        const { usernameToChange, newPassword } = req.body;
        if (!usernameToChange || !newPassword) {
            return res.status(400).json({ error: "用戶名和新密碼皆為必填。" });
        }
        if (usernameToChange === 'superadmin') {
            return res.status(400).json({ error: "無法在此更改超級管理員密碼。" });
        }

        const exists = await redis.hexists(KEY_USERS, usernameToChange);
        if (!exists) {
            return res.status(404).json({ error: "找不到該用戶。" });
        }

        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await redis.hset(KEY_USERS, usernameToChange, hash);

        await addAdminLog(req.user.username, `重設了管理員 ${usernameToChange} 的密碼`);
        res.json({ success: true, message: "密碼已更新。" });

    } catch (e) { 
        console.error("重設密碼失敗:", e);
        res.status(500).json({ error: e.message }); 
    }
});


// --- 12. 清空日誌 API ---
app.post("/api/logs/clear", async (req, res) => {
    try {
        const username = req.user.username; 
        await redis.del(KEY_ADMIN_LOG);
        await addAdminLog(username, `🧼 管理員清空了所有日誌`); 
        io.emit("initAdminLogs", []); 
        res.json({ success: true, message: "日誌已清空。" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// --- 13. 啟動伺服器 ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on host 0.0.0.0, port ${PORT}`);
    console.log(`🎟 User page (local): http://localhost:${PORT}/index.html`);
    console.log(`🛠 Admin page (local): http://localhost:${PORT}/admin.html`);
});
