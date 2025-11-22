<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>線上叫號系統</title>
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#2563eb">
    <script src="/socket.io/socket.io.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    
    <div id="maintenance-overlay">
        <h1>💉系統維護中🩸</h1>
        <p>目前暫停服務，請稍後再試。</p>
    </div>

    <div id="status-bar">連線中斷，正在嘗試重新連線...</div>
    <audio id="notify-sound" src="/ding.mp3" preload="auto"></audio>

    <div class="top-header">
        <h1>線上叫號系統</h1>
        <p id="last-updated">正在連線...</p>
    </div>
    
    <div class="content-wrapper">
        <div class="card" id="current-number-card">
            <h2>目前號碼</h2>
            <p id="number">0</p>
        </div>

        <div id="kiosk-area" style="display:none; width:100%;">
            <button id="btn-take-ticket" class="btn-kiosk">
                🎫 我要取號
            </button>
            <p style="color:#666; font-size:0.9rem; margin-top:5px;">目前等待人數：<span id="kiosk-waiting-count">0</span> 人</p>
        </div>

        <div class="card" id="passed-container">
            <h3>已過號</h3>
            <ul id="passedList"></ul>
            <p id="passed-empty-msg" class="empty-state-message">目前尚無過號</p>
        </div>
    </div>

    <div id="ticket-modal" class="modal-overlay" style="display:none;">
        <div class="modal-content">
            <h3>取號成功！</h3>
            <p>您的號碼是</p>
            <div id="my-new-ticket" style="font-size:3rem; font-weight:bold; color:#2563eb; margin:10px 0;"></div>
            <p style="font-size:0.9rem; color:#666;">前方還有 <span id="modal-waiting-count">0</span> 人</p>
            <p style="font-size:0.8rem; color:#999; margin-top:15px;">請截圖保存或記住此號碼</p>
            <button id="btn-close-ticket" class="btn-kiosk" style="font-size:1rem; padding:10px; margin-top:10px;">好的</button>
        </div>
    </div>

    <div class="utility-buttons">
        <div id="copy-link-prompt"><span class="emoji">🔗</span> 複製連結</div>
        <div id="sound-prompt" style="display: none;"><span class="emoji">🔊</span> 啟用音效</div>
    </div>

    <div class="card" style="margin-top: 20px; max-width: 900px; padding: 15px;">
        <h3 style="font-size: 1.2rem; margin: 0 0 10px 0; color: #555;">🔔 到號提醒</h3>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <input type="number" id="my-number" placeholder="輸入您的號碼" style="padding: 8px; border-radius: 8px; border: 1px solid #ccc; width: 120px; text-align: center; font-size: 1rem;">
            <button id="enable-notify-btn" style="background-color: #2563eb; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-weight: bold;">設定提醒</button>
        </div>
        <p id="estimated-wait" style="font-size: 0.9rem; color: #2563eb; margin-top: 10px; display:none; font-weight: bold;">
            ⏳ 預估等待時間：約 <span id="wait-minutes">0</span> 分鐘
        </p>
        <p id="notify-status" style="font-size: 0.9rem; color: #666; margin-top: 8px; margin-bottom: 0;">(設定後，即使網頁在背景也會收到通知)</p>
    </div>

    <div id="featured-container"></div>
    
    <div style="margin-top:20px; font-size:0.9rem; color:#666;">
        <p>加入 LINE 官方帳號，隨時查詢叫號進度！</p>
    </div>

    <div id="qr-code-container">
        <div id="qr-code-placeholder"></div>
        <p>掃描查看進度</p>
    </div>

    <script src="/js/main.js"></script>
</body>
</html>
