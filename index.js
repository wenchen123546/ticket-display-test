/*
 * ==========================================
 * 伺服器 (index.js)
 * 升級：多用戶角色系統 (Super Admin / Normal Admin)
 * 升級 v2：追蹤在線管理員列表
 * 升級 v3：管理員綽號系統
 * 升級 v4：新增用戶時可選填綽號
 * ==========================================
 */

// --- 1. 模듈載入 ---
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
const KEY_NICKNAMES = 'callsys:nicknames'; // 儲存綽號
const SESSION_PREFIX = 'callsys:session:';

// 在線管理員追蹤 (使用 Map 儲存 socket.id -> user info)
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

        req.user = JSON.parse(sessionData); // req.user 將包含 { username, role, nickname }
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

/**
 * 簡易的 HTML 標籤過濾函式 (防止 XSS)
 * @param {string} str 
 * @returns {string}
 */
function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>?/gm, '');
}

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
async function addAdminLog(nickname, message) { // 參數改為 nickname
    try {
        const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        const logMessage = `[${timestamp}] [${nickname}] ${message}`; // 顯示 nickname
        
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
        const adminList = Array.from(onlineAdmins.values()); // adminList 將包含 { username, role, nickname }
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
        
        // 獲取綽號，若無則使用帳號
        let nickname = await redis.hget(KEY_NICKNAMES, username);
        if (!nickname) {
            nickname = username;
            // 如果 superadmin 第一次登入，幫他設定預設綽號
            if (username === 'superadmin') {
                await redis.hset(KEY_NICKNAMES, 'superadmin', 'superadmin');
            }
        }

        const sessionData = JSON.stringify({ username, role, nickname }); // 存入綽號
        await redis.set(sessionKey, sessionData, "EX", 8 * 60 * 60); 

        // 回傳綽號
        res.json({ success: true, token: sessionToken, role: role, username: username, nickname: nickname });

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
        const nickname = req.user.nickname; 
        let num;
        if (direction === "next") {
            num = await redis.incr(KEY_CURRENT_NUMBER);
            await addAdminLog(nickname, `號碼增加為 ${num}`); 
        }
        else if (direction === "prev") {
            const oldNum = await redis.get(KEY_CURRENT_NUMBER) || 0;
            num = await redis.decrIfPositive(KEY_CURRENT_NUMBER);
            if (Number(oldNum) > 0) {
                await addAdminLog(nickname, `號碼減少為 ${num}`); 
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
        const nickname = req.user.nickname; 
        const num = Number(number);
        if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
            return res.status(400).json({ error: "請提供一個有效的非負整數。" });
        }
        await redis.set(KEY_CURRENT_NUMBER, num);
        await addAdminLog(nickname, `號碼手動設定為 ${num}`); 
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
        const nickname = req.user.nickname; 
        const num = Number(number);
        if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
            return res.status(400).json({ error: "請提供有效的正整數。" });
        }
        await redis.zadd(KEY_PASSED_NUMBERS, num, num);
        await redis.zremrangebyrank(KEY_PASSED_NUMBERS, 0, -21); 
        await addAdminLog(nickname, `過號列表新增 ${num}`); 
        await broadcastPassedNumbers();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/passed/remove", async (req, res) => {
    try {
        const { number } = req.body;
        const nickname = req.user.nickname; 
        await redis.zrem(KEY_PASSED_NUMBERS, number);
        await addAdminLog(nickname, `過號列表移除 ${number}`); 
        await broadcastPassedNumbers();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/featured/add", async (req, res) => {
    try {
        const { linkText, linkUrl } = req.body;
        const nickname = req.user.nickname; 
        if (!linkText || !linkUrl) {
            return res.status(400).json({ error: "文字和網址皆必填。" });
        }
        if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) {
            return res.status(400).json({ error: "網址請務必以 http:// 或 https:// 開頭。" });
        }
        
        // 【修改】 對 linkText 進行過濾
        const sanitizedText = sanitize(linkText);
        const item = { linkText: sanitizedText, linkUrl }; // 使用過濾後的文字
        
        await redis.rpush(KEY_FEATURED_CONTENTS, JSON.stringify(item));
        await addAdminLog(nickname, `精選連結新增: ${sanitizedText}`); 
        await broadcastFeaturedContents();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/featured/remove", async (req, res) => {
    try {
        const { linkText, linkUrl } = req.body;
        const nickname = req.user.nickname; 
        if (!linkText || !linkUrl) {
            return res.status(400).json({ error: "缺少必要參數。" });
        }
        const item = { linkText, linkUrl };
        await redis.lrem(KEY_FEATURED_CONTENTS, 1, JSON.stringify(item));
        await addAdminLog(nickname, `精選連結移除: ${linkText}`); 
        await broadcastFeaturedContents();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/passed/clear", async (req, res) => {
    try {
        const nickname = req.user.nickname; 
        await redis.del(KEY_PASSED_NUMBERS);
        await addAdminLog(nickname, `過號列表已清空`); 
        io.emit("updatePassed", []);
        await updateTimestamp();
        res.json({ success: true, message: "過號列表已清空" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/featured/clear", async (req, res) => {
    try {
        const nickname = req.user.nickname; 
        await redis.del(KEY_FEATURED_CONTENTS);
        await addAdminLog(nickname, `精選連結已清空`); 
        io.emit("updateFeaturedContents", []);
        await updateTimestamp();
        res.json({ success: true, message: "精選連結已清空" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/set-sound-enabled", async (req, res) => {
    try {
        const { enabled } = req.body;
        const nickname = req.user.nickname; 
        const valueToSet = enabled ? "1" : "0";
        await redis.set(KEY_SOUND_ENABLED, valueToSet);
        await addAdminLog(nickname, `前台音效已設為: ${enabled ? '開啟' : '關閉'}`); 
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
        const nickname = req.user.nickname; 
        const valueToSet = isPublic ? "1" : "0";
        await redis.set(KEY_IS_PUBLIC, valueToSet);
        await addAdminLog(nickname, `前台已設為: ${isPublic ? '對外開放' : '關閉維護'}`); 
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
        const nickname = req.user.nickname; 
        const multi = redis.multi();
        multi.set(KEY_CURRENT_NUMBER, 0);
        multi.del(KEY_PASSED_NUMBERS);
        multi.del(KEY_FEATURED_CONTENTS);
        multi.set(KEY_SOUND_ENABLED, "0"); // 【修改】 預設改為 0 (關閉)
        multi.set(KEY_IS_PUBLIC, "1"); 
        multi.del(KEY_ADMIN_LOG);
        await multi.exec();

        await addAdminLog(nickname, `💥 系統已重置所有資料`); 

        io.emit("update", 0);
        io.emit("updatePassed", []);
        io.emit("updateFeaturedContents", []);
        io.emit("updateSoundSetting", false); // 【修改】 預設改為 false (關閉)
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
    let userNickname = "Public_User"; 
    
    // 驗證 Session Token
    if (token) {
        const sessionKey = `${SESSION_PREFIX}${token}`;
        const sessionData = await redis.get(sessionKey);
        
        if (sessionData) {
            const user = JSON.parse(sessionData); // user 包含 { username, role, nickname }
            isAdmin = true;
            userNickname = user.nickname; 
            
            console.log(`✅ 一個已驗證的 Admin 連線 (${userNickname})`, socket.id); 
            
            // 將用戶完整資訊添加到在線列表並廣播
            onlineAdmins.set(socket.id, { 
                username: user.username, // 唯一ID
                role: user.role, 
                nickname: user.nickname  // 顯示名稱
            });
            broadcastOnlineAdmins();

            socket.on("disconnect", (reason) => {
                console.log(`🔌 Admin ${socket.id} (${userNickname}) 斷線: ${reason}`); 
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
        const isSoundEnabled = soundEnabledRaw === null ? "0" : soundEnabledRaw; // 【修改】 預設改為 0 (關閉)
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
    "/api/admin/set-nickname"
];
app.use(superAdminAPIs, apiLimiter, authMiddleware, superAdminAuthMiddleware);

// 獲取所有普通管理員
app.post("/api/admin/users", async (req, res) => {
    try {
        const usersList = [];
        const nicknamesMap = await redis.hgetall(KEY_NICKNAMES) || {};
        
        // 1. 添加 Superadmin
        usersList.push({ 
            username: 'superadmin', 
            nickname: nicknamesMap['superadmin'] || 'superadmin', 
            role: 'super' 
        });

        // 2. 添加所有普通管理員
        const normalUsernames = await redis.hkeys(KEY_USERS) || [];
        for (const username of normalUsernames) {
            usersList.push({
                username: username,
                nickname: nicknamesMap[username] || username,
                role: 'normal'
            });
        }
        
        res.json({ success: true, users: usersList });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 新增普通管理員
app.post("/api/admin/add-user", async (req, res) => {
    try {
        // 【修改】 取得 newNickname
        const { newUsername, newPassword, newNickname } = req.body; 
        
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
        
        // 【修改】 如果提供了綽號，則使用它；否則，使用帳號作為預設綽號
        const nicknameToSet = (newNickname && newNickname.trim() !== '') 
            ? sanitize(newNickname.trim()) // 過濾 newNickname
            : newUsername;
        await redis.hset(KEY_NICKNAMES, newUsername, nicknameToSet); 

        await addAdminLog(req.user.nickname, `新增管理員: ${newUsername} (綽號: ${nicknameToSet})`);
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
        
        await redis.hdel(KEY_NICKNAMES, delUsername); // 刪除綽號

        await addAdminLog(req.user.nickname, `刪除管理員: ${delUsername}`); 
        res.json({ success: true, message: "管理員已刪除。" });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 設定綽號 API
app.post("/api/admin/set-nickname", async (req, res) => {
    try {
        const { targetUsername, nickname } = req.body;
        if (!targetUsername || !nickname) {
            return res.status(400).json({ error: "目標帳號和綽號皆為必填。" });
        }
        
        // 檢查用戶是否存在 (superadmin 總是存在，普通用戶檢查 HASH)
        if (targetUsername !== 'superadmin') {
            const exists = await redis.hexists(KEY_USERS, targetUsername);
            if (!exists) {
                 return res.status(404).json({ error: "找不到該用戶。" });
            }
        }
        
        // 檢查 superadmin 是否存在於 nicknames (以防萬一)
        if (targetUsername === 'superadmin') {
             const superExists = await redis.hget(KEY_NICKNAMES, 'superadmin');
             if (!superExists) {
                 await redis.hset(KEY_NICKNAMES, 'superadmin', 'superadmin');
             }
        }

        // 【修改】 過濾綽號
        const sanitizedNickname = sanitize(nickname);
        await redis.hset(KEY_NICKNAMES, targetUsername, sanitizedNickname);
        
        await addAdminLog(req.user.nickname, `將 ${targetUsername} 的綽號設為: ${sanitizedNickname}`);
        res.json({ success: true, message: "綽號已更新。" });

    } catch (e) { res.status(500).json({ error: e.message }); }
});


// --- 12. 清空日誌 API ---
app.post("/api/logs/clear", async (req, res) => {
    try {
        const nickname = req.user.nickname; 
        await redis.del(KEY_ADMIN_LOG);
        await addAdminLog(nickname, `🧼 管理員清空了所有日誌`); 
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
