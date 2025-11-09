/*
 * ==========================================
 * 伺服器 (index.js)
 * ... (舊註解) ...
 * * 13.【優化】
 * * - 管理員日誌加入日期時間戳記
 * * 14.【新增/優化】
 * * - JWT 期限可由超級管理員在後台設定 (預設 8 小時)
 * ==========================================
 */

// --- 1. 模組載入 ---
const express = require("express");
require('express-async-errors'); 
// ... (其他模組不變)
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 

// ... (2. 伺服器實體化 不變)

// --- 3. 核心設定 & 安全性 ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; 
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET; 
const DEFAULT_JWT_EXPIRY_HOURS = 8; // 【新增】定義預設值為 8 小時

// ... (4. 關鍵檢查 不變)
// ... (5. 連線到 Upstash Redis 不變)
// ... (Redis DecrIfPositive Command 不變)

// --- 6. Redis Keys ---
const KEY_CURRENT_NUMBER = 'callsys:number';
const KEY_PASSED_NUMBERS = 'callsys:passed';
const KEY_FEATURED_CONTENTS = 'callsys:featured';
const KEY_LAST_UPDATED = 'callsys:updated';
const KEY_SOUND_ENABLED = 'callsys:soundEnabled';
const KEY_IS_PUBLIC = 'callsys:isPublic'; 
const KEY_ADMIN_LOG = 'callsys:admin-log'; 
const KEY_ADMINS = 'callsys:admins'; 
const KEY_JWT_EXPIRY = 'callsys:jwt-expiry-hours'; // 【新增】JWT 期限 Key

// ... (7. Express 中介軟體 不變)
// ... (8. 認證中介軟體 不變)
// ... (9. 輔助函式 不變)


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

    // 【修改】 從 Redis 讀取 JWT 期限設定
    const expiryHoursRaw = await redis.get(KEY_JWT_EXPIRY);
    const expiryHours = Number(expiryHoursRaw) || DEFAULT_JWT_EXPIRY_HOURS;
    const expiresIn = `${expiryHours}h`;

    const payload = {
        username: user.username,
        role: user.role
    };
    const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: expiresIn // 【修改】 使用動態期限
    });

    res.json({ success: true, token: token, role: user.role });
});

// --- 【新增】 超級管理員 API ---

app.use("/api/admin", apiLimiter, authMiddleware, isSuperAdminMiddleware);

// ... (list/add/delete/set-password APIs 不變)

// 【新增】 設定 JWT 期限 API
app.post("/api/admin/set-jwt-expiry", async (req, res) => {
    const { hours } = req.body;
    const numHours = Number(hours);
    
    if (isNaN(numHours) || numHours < 1 || numHours > 720 || !Number.isInteger(numHours)) {
        return res.status(400).json({ error: "請提供一個有效的整數小時數 (1~720)。" });
    }

    await redis.set(KEY_JWT_EXPIRY, numHours);
    await addAdminLog(`JWT 期限已設為 ${numHours} 小時 (新 Token 生效)`, req.user.username);
    res.json({ success: true, hours: numHours });
});

// 【新增】 取得 JWT 期限 API
app.post("/api/admin/get-jwt-expiry", async (req, res) => {
    const hoursRaw = await redis.get(KEY_JWT_EXPIRY);
    const hours = Number(hoursRaw) || DEFAULT_JWT_EXPIRY_HOURS;
    res.json({ success: true, hours: hours });
});


// --- 11. 核心功能 API (受 JWT 保護) ---

// ... (protectedAPIs / 核心功能 APIs 不變)


// --- 12. Socket.io 連線處理 ---

// ... (io.use / io.on('connection') 不變)


// --- 13. 啟動伺服器 & 建立超級管理員 ---
async function startServer() {
    // ... (檢查並建立超級管理員 不變)

    // 【新增】 確保 JWT 期限的預設值存在
    const currentExpiry = await redis.get(KEY_JWT_EXPIRY);
    if (currentExpiry === null) {
        await redis.set(KEY_JWT_EXPIRY, DEFAULT_JWT_EXPIRY_HOURS);
        console.log(`⏱ JWT 期限預設值 (${DEFAULT_JWT_EXPIRY_HOURS} 小時) 已設定。`);
    }

    server.listen(PORT, '0.0.0.0', () => {
// ...
