/*
 * ==========================================
 * Server (index.js) - v2.0 Multi-Queue & Persistence
 * ==========================================
 */
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");
const sqlite3 = require("sqlite3").verbose();
const rateLimit = require("express-rate-limit");
const line = require("@line/bot-sdk");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: "*" } });

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin123";
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const LINE_CONFIG = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

// --- Database Init (SQLite for Persistence) ---
const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 建立佇列設定表
    db.run(`CREATE TABLE IF NOT EXISTS queues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        current_number INTEGER DEFAULT 0,
        color TEXT DEFAULT '#2563eb'
    )`);
    // 建立日誌表
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // 預設至少有一個佇列
    db.get("SELECT count(*) as count FROM queues", (err, row) => {
        if (row.count === 0) {
            db.run("INSERT INTO queues (name, prefix, current_number) VALUES ('一般櫃台', 'A', 0)");
            console.log("✅ 初始化預設佇列");
        }
    });
});

// --- Redis Client ---
const redis = new Redis(REDIS_URL || "redis://localhost:6379");
redis.on("connect", () => console.log("✅ Redis Connected"));

// --- Middleware ---
app.use(express.static("public"));
app.use(express.json());

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });

// LINE Bot Client
let lineClient = null;
if (LINE_CONFIG.channelAccessToken) {
    lineClient = new line.Client(LINE_CONFIG);
    setupLineRichMenu(); // 啟動時設定 Rich Menu
}

// --- Helper Functions ---

// 從 DB 讀取所有佇列並同步到 Redis
function syncQueuesToRedis() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM queues", async (err, rows) => {
            if (err) return reject(err);
            // 將 SQLite 資料寫入 Redis 快取，方便前端快速讀取
            await redis.set("app:queues", JSON.stringify(rows));
            io.emit("updateQueues", rows);
            resolve(rows);
        });
    });
}

function logAction(msg) {
    console.log(`[LOG] ${msg}`);
    db.run("INSERT INTO logs (message) VALUES (?)", [msg]);
    io.emit("newAdminLog", msg);
}

// --- LINE Rich Menu Setup (一次性執行) ---
async function setupLineRichMenu() {
    if (!lineClient) return;
    // 這裡簡化流程：實際應用可檢查是否已建立，若無則建立並上傳圖片
    console.log("ℹ️ LINE Bot 功能已啟用");
    // 若要設置 Rich Menu，需調用 lineClient.createRichMenu(...)
}

// --- Routes ---

// 1. 登入
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === ADMIN_TOKEN) {
        const token = uuidv4();
        // 簡單 Token 儲存 (實際可用 Redis)
        redis.set(`session:${token}`, "admin", "EX", 86400);
        res.json({ token });
    } else {
        res.status(403).json({ error: "Auth Failed" });
    }
});

const auth = async (req, res, next) => {
    const token = req.body.token || req.query.token;
    const session = await redis.get(`session:${token}`);
    if (session) next();
    else res.status(401).json({ error: "Unauthorized" });
};

// 2. 初始化資料 (前端用)
app.post("/api/init-data", async (req, res) => {
    const queuesRaw = await redis.get("app:queues");
    const passedRaw = await redis.get("app:passed");
    const featuredRaw = await redis.get("app:featured");
    const isPublic = await redis.get("app:public");
    
    // 若 Redis 空的，從 SQLite 撈一次
    let queues = queuesRaw ? JSON.parse(queuesRaw) : await syncQueuesToRedis();

    res.json({
        queues,
        passed: passedRaw ? JSON.parse(passedRaw) : [],
        featured: featuredRaw ? JSON.parse(featuredRaw) : [],
        isPublic: isPublic !== "0"
    });
});

// 3. 佇列操作 (Admin)
app.post("/api/queue/change", auth, async (req, res) => {
    const { queueId, delta } = req.body;
    
    db.get("SELECT current_number FROM queues WHERE id = ?", [queueId], (err, row) => {
        if (!row) return res.status(404).json({error: "Queue not found"});
        
        let newNum = row.current_number + delta;
        if (newNum < 0) newNum = 0;

        db.run("UPDATE queues SET current_number = ? WHERE id = ?", [newNum, queueId], async () => {
            const queues = await syncQueuesToRedis();
            logAction(`佇列 ID:${queueId} 號碼變更為 ${newNum}`);
            
            // LINE 通知檢查 (簡單版)
            checkLineNotify(queueId, newNum);
            
            res.json({ success: true, newNum });
        });
    });
});

app.post("/api/queue/set", auth, async (req, res) => {
    const { queueId, number } = req.body;
    db.run("UPDATE queues SET current_number = ? WHERE id = ?", [number, queueId], async () => {
        await syncQueuesToRedis();
        logAction(`佇列 ID:${queueId} 手動設定為 ${number}`);
        res.json({ success: true });
    });
});

app.post("/api/queue/create", auth, (req, res) => {
    const { name, prefix, color } = req.body;
    db.run("INSERT INTO queues (name, prefix, color) VALUES (?, ?, ?)", [name, prefix, color], async () => {
        await syncQueuesToRedis();
        logAction(`新增佇列: ${name}`);
        res.json({ success: true });
    });
});

app.post("/api/queue/delete", auth, (req, res) => {
    const { id } = req.body;
    db.run("DELETE FROM queues WHERE id = ?", [id], async () => {
        await syncQueuesToRedis();
        logAction(`刪除佇列 ID: ${id}`);
        res.json({ success: true });
    });
});

// 4. 過號處理 (Redis List)
app.post("/api/passed/clear", auth, async (req, res) => {
    await redis.del("app:passed");
    io.emit("updatePassed", []);
    res.json({ success: true });
});

app.post("/api/passed/remove", auth, async (req, res) => {
    // 這裡簡化：直接讀取重寫
    const { prefix, number } = req.body;
    let list = JSON.parse(await redis.get("app:passed") || "[]");
    list = list.filter(i => !(i.queuePrefix === prefix && i.number === number));
    await redis.set("app:passed", JSON.stringify(list));
    io.emit("updatePassed", list);
    res.json({ success: true });
});

// 5. 設定與重置
app.post("/set-sound", auth, (req, res) => {
    io.emit("updateSoundSetting", req.body.enabled); // 暫時不存 DB
    res.json({success:true});
});

app.post("/set-public", auth, async (req, res) => {
    await redis.set("app:public", req.body.isPublic ? "1" : "0");
    io.emit("updatePublicStatus", req.body.isPublic);
    res.json({success:true});
});

app.post("/reset", auth, (req, res) => {
    db.run("UPDATE queues SET current_number = 0", async () => {
        await syncQueuesToRedis();
        await redis.del("app:passed");
        await redis.set("app:public", "1");
        io.emit("updatePassed", []);
        io.emit("updatePublicStatus", true);
        logAction("系統全域重置");
        res.json({success:true});
    });
});

// --- LINE Webhook ---
app.post("/callback", line.middleware(LINE_CONFIG), (req, res) => {
    Promise.all(req.body.events.map(handleLineEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

async function handleLineEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
    
    const text = event.message.text.trim();
    const userId = event.source.userId;

    if (text === '查詢' || text === '狀態') {
        const queues = JSON.parse(await redis.get("app:queues") || "[]");
        let msg = "📊 目前叫號狀態：\n";
        queues.forEach(q => {
            msg += `\n🔹 ${q.name}: ${q.current_number} 號`;
        });
        return lineClient.replyMessage(event.replyToken, { type: 'text', text: msg });
    }
    
    // 簡單的訂閱指令: "訂閱 A 50"
    const match = text.match(/^訂閱\s*([A-Za-z0-9]+)\s*(\d+)$/);
    if (match) {
        const prefix = match[1].toUpperCase();
        const num = parseInt(match[2]);
        // 將訂閱資訊存入 Redis Set: line:subs:{queueId}:{number}
        // 先找到 Queue ID
        const queues = JSON.parse(await redis.get("app:queues") || "[]");
        const q = queues.find(x => x.prefix.toUpperCase() === prefix);
        
        if (!q) return lineClient.replyMessage(event.replyToken, { type: 'text', text: `❌ 找不到代號為 ${prefix} 的櫃台` });
        if (q.current_number >= num) return lineClient.replyMessage(event.replyToken, { type: 'text', text: `❌ 該號碼已過號` });

        const key = `line:sub:${q.id}:${num}`;
        await redis.sadd(key, userId);
        await redis.expire(key, 86400); // 24小時過期

        return lineClient.replyMessage(event.replyToken, { type: 'text', text: `✅ 已設定提醒！\n當 ${q.name} 接近 ${num} 號時會通知您。` });
    }

    return lineClient.replyMessage(event.replyToken, { 
        type: 'text', 
        text: '👋 歡迎使用叫號系統\n\n輸入「查詢」查看目前號碼\n輸入「訂閱 A 88」設定到號提醒 (A為櫃台代號)' 
    });
}

async function checkLineNotify(queueId, currentNum) {
    if (!lineClient) return;
    
    // 檢查訂閱：currentNum + 3 (接近通知)
    const targetNum = currentNum + 3;
    const key3 = `line:sub:${queueId}:${targetNum}`;
    const users3 = await redis.smembers(key3);
    
    if (users3.length > 0) {
        const queues = JSON.parse(await redis.get("app:queues"));
        const q = queues.find(x => x.id === queueId);
        const msg = `🔔 提醒：${q.name} 目前 ${currentNum} 號，您的 ${targetNum} 號即將輪到 (剩3組)！`;
        users3.forEach(uid => lineClient.pushMessage(uid, { type: 'text', text: msg }));
    }

    // 檢查訂閱：currentNum (到號通知)
    const key0 = `line:sub:${queueId}:${currentNum}`;
    const users0 = await redis.smembers(key0);
    if (users0.length > 0) {
        const queues = JSON.parse(await redis.get("app:queues"));
        const q = queues.find(x => x.id === queueId);
        const msg = `🎉 輪到您了！${q.name} 現正叫號：${currentNum} 號，請前往辦理。`;
        users0.forEach(uid => lineClient.pushMessage(uid, { type: 'text', text: msg }));
        // 清除
        await redis.del(key0);
    }
}

// --- Start Server ---
syncQueuesToRedis().then(() => {
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
