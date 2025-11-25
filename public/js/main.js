/*
 * ==========================================
 * 前端邏輯 (main.js) - v18.35 Optimized (Native Reconnect & Audio Unlock)
 * ==========================================
 */

// --- 0. i18n 字典與設定 (國際化) ---
const i18nData = {
    "zh-TW": {
        "app_title": "💉熱血不宜攔！🩸",
        "current_number": "目前叫號",
        "issued_number": "已發號碼",
        "online_ticket_title": "線上取號",
        "online_ticket_desc": "免排隊、免等待！線上領取號碼牌，到號自動通知您。",
        "take_ticket": "🎫 立即取號",
        "taking_ticket": "取號中...",
        "manual_track_title": "手動輸入追蹤",
        "manual_track_desc": "請輸入您手上的號碼牌號碼，我們將在到號時通知您。",
        "set_reminder": "🔔 設定提醒",
        "btn_give_up": "🗑️ 放棄",
        "my_number": "您的號碼",
        "ticket_current_label": "目前叫號",
        "wait_count": "前方等待",
        "unit_group": "組",
        "status_wait": "⏳ 請稍候，還有 %s 組",
        "status_arrival": "🎉 輪到您了！請前往櫃台",
        "status_passed": "⚠️ 您可能已過號",
        "passed_list_title": "已過號",
        "passed_empty": "目前尚無過號",
        "copy_link": "複製連結",
        "sound_enable": "啟用音效",
        "sound_on": "音效開啟",
        "sound_mute": "啟用音效",
        "featured_empty": "暫無精選連結",
        "scan_qr": "掃描查看進度",
        "error_network": "連線中斷",
        "manual_input_placeholder": "輸入號碼",
        "take_success": "取號成功！",
        "take_fail": "取號失敗",
        "input_empty": "請輸入號碼",
        "cancel_confirm": "確定要放棄/清除目前的追蹤嗎？",
        "copy_success": "✅ 已複製",
        "public_announcement": "📢 店家公告：",
        "queue_notification": "再 %s 組就輪到您囉！",
        "arrival_notification": "輪到您了！請前往櫃台",
        "estimated_wait": "預估等待：約 %s 分鐘",
        "time_just_now": "剛剛更新",
        "time_min_ago": "最後更新於 %s 分鐘前",
        "status_connected": "✅ 已連線",
        "status_reconnecting": "連線中斷，嘗試重連 (%s)..."
    },
    "en": {
        "app_title": "Waiting Queue",
        "current_number": "Current Number",
        "issued_number": "Issued Number",
        "online_ticket_title": "Get Ticket Online",
        "online_ticket_desc": "Skip the line! Get your ticket online and we'll notify you.",
        "take_ticket": "🎫 Get Ticket",
        "taking_ticket": "Processing...",
        "manual_track_title": "Track My Ticket",
        "manual_track_desc": "Enter your physical ticket number to get notified.",
        "set_reminder": "🔔 Set Reminder",
        "btn_give_up": "🗑️ Cancel",
        "my_number": "Your Number",
        "ticket_current_label": "Now Serving",
        "wait_count": "Waiting",
        "unit_group": "groups",
        "status_wait": "⏳ Waiting: %s groups ahead",
        "status_arrival": "🎉 It's your turn!",
        "status_passed": "⚠️ Number passed",
        "passed_list_title": "Passed Numbers",
        "passed_empty": "No passed numbers",
        "copy_link": "Copy Link",
        "sound_enable": "Enable Sound",
        "sound_on": "Sound On",
        "sound_mute": "Enable Sound",
        "featured_empty": "No featured links",
        "scan_qr": "Scan to track",
        "error_network": "Connection Lost",
        "manual_input_placeholder": "Enter Number",
        "take_success": "Success!",
        "take_fail": "Failed",
        "input_empty": "Please enter a number",
        "cancel_confirm": "Are you sure you want to stop tracking?",
        "copy_success": "✅ Copied",
        "public_announcement": "📢 Announcement: ",
        "queue_notification": "%s groups to go!",
        "arrival_notification": "It's your turn!",
        "estimated_wait": "Est. wait: %s mins",
        "time_just_now": "Updated just now",
        "time_min_ago": "Updated %s min ago",
        "status_connected": "✅ Connected",
        "status_reconnecting": "Reconnecting (%s)..."
    }
};

const langSelector = document.getElementById('language-selector');
let currentLang = localStorage.getItem('callsys_lang') || ((navigator.language || navigator.userLanguage).startsWith('zh') ? 'zh-TW' : 'en');
let T = i18nData[currentLang];

// --- 1. DOM 元素統一管理 ---
const DOM = {
    number: document.getElementById("number"),
    issuedNumberMain: document.getElementById("issued-number-main"),
    passedList: document.getElementById("passedList"),
    featuredContainer: document.getElementById("featured-container"),
    statusBar: document.getElementById("status-bar"),
    notifySound: document.getElementById("notify-sound"),
    lastUpdated: document.getElementById("last-updated"),
    soundPrompt: document.getElementById("sound-prompt"),
    copyLinkPrompt: document.getElementById("copy-link-prompt"),
    passedContainer: document.getElementById("passed-container"),
    ticketingModeContainer: document.getElementById("ticketing-mode-container"),
    inputModeContainer: document.getElementById("input-mode-container"),
    takeTicketView: document.getElementById("take-ticket-view"),
    inputModeView: document.getElementById("input-mode-view"),
    myTicketView: document.getElementById("my-ticket-view"),
    btnTakeTicket: document.getElementById("btn-take-ticket"),
    btnTrackTicket: document.getElementById("btn-track-ticket"),
    manualTicketInput: document.getElementById("manual-ticket-input"),
    myTicketNum: document.getElementById("my-ticket-num"),
    ticketCurrentDisplay: document.getElementById("ticket-current-display"),
    ticketWaitingCount: document.getElementById("ticket-waiting-count"),
    btnCancelTicket: document.getElementById("btn-cancel-ticket"),
    ticketStatusText: document.getElementById("ticket-status-text"),
    ticketWaitTime: document.getElementById("ticket-wait-time"),
};

// --- 2. 狀態變數與工具函式 ---
let isSoundEnabled = false; 
let isLocallyMuted = false; 
let lastUpdateTime = null;
let currentSystemMode = 'ticketing'; 
let avgServiceTime = 0;
let audioPermissionGranted = false;
let ttsEnabled = false;
let wakeLock = null;
let myTicket = localStorage.getItem('callsys_ticket') ? parseInt(localStorage.getItem('callsys_ticket')) : null;

// [優化] AudioContext 狀態管理 (解決 iOS 靜音問題)
let audioContext = null;

function unlockAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            // 播放極短靜音以完全解鎖
            const buffer = audioContext.createBuffer(1, 1, 22050);
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
            audioPermissionGranted = true;
            ttsEnabled = true;
            updateMuteUI(false);
        });
    }
}

function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast-message ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    
    requestAnimationFrame(() => el.classList.add('show'));
    
    if (navigator.vibrate) navigator.vibrate(50); 

    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

function vibratePattern(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

function speakText(text, rate) {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW'; 
    utterance.rate = rate || 0.9;
    window.speechSynthesis.speak(utterance);
}

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {});
        } catch (err) { console.error(err); }
    }
}
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') { await requestWakeLock(); }
});

function playNotificationSound() {
    if (!DOM.notifySound) return;
    // 嘗試使用 AudioContext 解鎖後的權限
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const playPromise = DOM.notifySound.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            audioPermissionGranted = true;
            updateMuteUI(false);
            if (!isSoundEnabled || isLocallyMuted) {
                DOM.notifySound.pause(); DOM.notifySound.currentTime = 0;
            }
        }).catch(() => {
            console.warn("Autoplay blocked");
            audioPermissionGranted = false;
            updateMuteUI(true, true); 
        });
    }
}

function triggerConfetti() {
    if (typeof confetti === 'undefined') return;
    const duration = 3000;
    const end = Date.now() + duration;
    (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
        if (Date.now() < end) requestAnimationFrame(frame);
    })();
}

// --- 3. i18n & Time Logic ---
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if(T[key]) el.textContent = T[key];
    });
    if(DOM.manualTicketInput) DOM.manualTicketInput.placeholder = T["manual_input_placeholder"];
    if(DOM.btnTakeTicket && !DOM.btnTakeTicket.disabled) { DOM.btnTakeTicket.textContent = T["take_ticket"]; }
}

function updateTimeText() {
    if (!lastUpdateTime) return;
    const diff = Math.floor((new Date() - lastUpdateTime) / 60000);
    DOM.lastUpdated.textContent = diff < 1 ? T["time_just_now"] : T["time_min_ago"].replace("%s", diff);
}
setInterval(updateTimeText, 10000);

if(langSelector) {
    langSelector.value = currentLang;
    langSelector.addEventListener('change', (e) => {
        currentLang = e.target.value;
        localStorage.setItem('callsys_lang', currentLang);
        T = i18nData[currentLang];
        applyI18n();
        updateTicketUI(parseInt(DOM.number.textContent) || 0);
        updateMuteUI(isLocallyMuted);
        updateTimeText();
    });
}

// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW fail', err));
    });
}

// --- 4. Socket.io 初始化與事件處理 (Native Reconnection) ---
// [優化] 啟用 reconnection (預設 true), 設定嘗試次數
const socket = io({ 
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5
});

socket.on("connect", () => {
    socket.emit('joinRoom', 'public');
    DOM.statusBar.textContent = T["status_connected"] || "Connected";
    DOM.statusBar.style.backgroundColor = "#10b981"; 
    setTimeout(() => { if (socket.connected) DOM.statusBar.classList.remove("visible"); }, 1500);
    requestWakeLock(); 
});

socket.on("disconnect", (reason) => {
    DOM.statusBar.classList.add("visible");
    DOM.statusBar.textContent = T["error_network"];
    DOM.statusBar.style.backgroundColor = "#dc2626";
    DOM.lastUpdated.textContent = T["error_network"];
});

// [優化] 監聽 Socket 原生重連事件
socket.io.on("reconnect_attempt", (attempt) => {
    DOM.statusBar.classList.add("visible");
    DOM.statusBar.style.backgroundColor = "#d97706"; // Warning Color
    const msg = (T["status_reconnecting"] || "Reconnecting (%s)...").replace("%s", attempt);
    DOM.statusBar.textContent = msg;
});

socket.io.on("reconnect", () => {
    // 連線成功會觸發 "connect"，此處可留空
    console.log("Reconnected");
});


socket.on("updateQueue", (data) => {
    const current = data.current;
    if(DOM.issuedNumberMain) DOM.issuedNumberMain.textContent = data.issued;
    handleNewNumber(current);
    updateTicketUI(current);
});

socket.on("adminBroadcast", (msg) => {
    if (!isLocallyMuted) {
        speakText(msg, 1.0); 
        showToast(`${T["public_announcement"]}${msg}`, "info");
    }
});

socket.on("updateWaitTime", (time) => { avgServiceTime = time; updateTicketUI(parseInt(DOM.number.textContent) || 0); });
socket.on("updateSoundSetting", (isEnabled) => { isSoundEnabled = isEnabled; });
socket.on("updatePublicStatus", (status) => { document.body.classList.toggle("is-closed", !status); if (status) socket.connect(); else socket.disconnect(); });
socket.on("updateSystemMode", (mode) => { currentSystemMode = mode; switchSystemModeUI(mode); });
socket.on("updatePassed", (numbers) => renderPassed(numbers));
socket.on("updateFeaturedContents", (contents) => renderFeatured(contents));
socket.on("updateTimestamp", (ts) => { lastUpdateTime = new Date(ts); updateTimeText(); });


// --- 5. Core Logic ---

function switchSystemModeUI(mode) {
    const isTicketing = mode === 'ticketing';
    DOM.ticketingModeContainer.style.display = isTicketing ? "block" : "none";
    DOM.inputModeContainer.style.display = isTicketing ? "none" : "block";
    if (myTicket) showMyTicketMode(); else showTakeTicketMode();
}

function handleNewNumber(num) {
    if (DOM.number.textContent !== String(num)) {
        playNotificationSound();
        setTimeout(() => {
            if (DOM.number.textContent !== String(num) && isSoundEnabled && !isLocallyMuted) { speakText(`現在號碼，${num}號`, 0.9); }
        }, 800);
        
        DOM.number.textContent = num;
        document.title = `${num} - ${T["app_title"]}`;
        DOM.number.classList.add("updated");
        setTimeout(() => DOM.number.classList.remove("updated"), 500);
    }
}

function updateTicketUI(currentNum) {
    if (!myTicket) return;

    DOM.ticketCurrentDisplay.textContent = currentNum;
    const diff = myTicket - currentNum;
    
    let background = "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)";
    let statusText = T["status_wait"].replace("%s", diff);
    let waitTimeDisplay = "none";
    
    if (diff > 0) {
        DOM.ticketWaitingCount.textContent = diff;
        if (avgServiceTime > 0) {
            const min = Math.ceil(diff * avgServiceTime);
            DOM.ticketWaitTime.textContent = T["estimated_wait"].replace("%s", min);
            waitTimeDisplay = "block";
        }
        if (diff <= 3) {
             vibratePattern([100]); 
             if (document.hidden && Notification.permission === "granted") { new Notification(T["app_title"], { body: T["queue_notification"].replace("%s", diff), tag: 'approach' }); }
        }
    } else if (diff === 0) {
        DOM.ticketWaitingCount.textContent = "0";
        statusText = T["status_arrival"];
        background = "linear-gradient(135deg, #059669 0%, #10b981 100%)";
        triggerConfetti();
        vibratePattern([200, 100, 200, 100, 200]); 
        if (isSoundEnabled && !isLocallyMuted) speakText("恭喜，輪到您了，請前往櫃台", 1.0);
        if (Notification.permission === "granted") { new Notification(T["app_title"], { body: T["arrival_notification"], requireInteraction: true, tag: 'arrival' }); }
    } else {
        DOM.ticketWaitingCount.textContent = "-";
        statusText = T["status_passed"];
        background = "linear-gradient(135deg, #d97706 0%, #b45309 100%)";
    }
    
    DOM.ticketStatusText.textContent = statusText;
    DOM.myTicketView.style.background = background; 
    DOM.ticketWaitTime.style.display = waitTimeDisplay;
}

function showMyTicketMode() {
    DOM.takeTicketView.style.display = "none";
    DOM.inputModeView.style.display = "none";
    DOM.myTicketView.style.display = "block";
    DOM.myTicketNum.textContent = myTicket;
    if ("Notification" in window && Notification.permission === "default") { Notification.requestPermission(); }
}

function showTakeTicketMode() {
    DOM.myTicketView.style.display = "none";
    DOM.takeTicketView.style.display = (currentSystemMode === 'ticketing') ? "block" : "none";
    DOM.inputModeView.style.display = (currentSystemMode === 'input') ? "block" : "none";
}

function renderPassed(numbers) {
    DOM.passedList.innerHTML = "";
    const isEmpty = !numbers || numbers.length === 0;
    DOM.passedContainer.classList.toggle("is-empty", isEmpty);
    if (!isEmpty) {
        const frag = document.createDocumentFragment();
        numbers.forEach(n => {
            const li = document.createElement("li"); li.textContent = n; frag.appendChild(li);
        });
        DOM.passedList.appendChild(frag);
    }
}

function renderFeatured(contents) {
    DOM.featuredContainer.innerHTML = "";
    if (!contents || contents.length === 0) {
        DOM.featuredContainer.innerHTML = `<p class="empty-state-message" data-i18n="featured_empty">${T["featured_empty"]}</p>`;
        DOM.featuredContainer.classList.add("is-empty");
        return;
    }
    DOM.featuredContainer.classList.remove("is-empty");
    const frag = document.createDocumentFragment();
    contents.forEach(c => {
        const a = document.createElement("a");
        a.className = "featured-link";
        a.href = c.linkUrl; a.target = "_blank"; a.textContent = c.linkText;
        frag.appendChild(a);
    });
    DOM.featuredContainer.appendChild(frag);
}

// --- 6. Interaction Events ---

// [優化] 通用解鎖包裝函式
function handleUserInteraction(callback) {
    unlockAudioContext(); // 確保音效解鎖
    callback();
}

if(DOM.btnTakeTicket) DOM.btnTakeTicket.addEventListener("click", () => handleUserInteraction(async () => {
    if ("Notification" in window && Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        if (p !== "granted" && !confirm("Without notifications, you must keep this tab open. Continue?")) return;
    }

    DOM.btnTakeTicket.disabled = true;
    DOM.btnTakeTicket.textContent = T["taking_ticket"];
    
    try {
        const res = await fetch("/api/ticket/take", { method: "POST" });
        const data = await res.json();
        
        if (data.success) {
            myTicket = data.ticket;
            localStorage.setItem('callsys_ticket', myTicket);
            showMyTicketMode();
            updateTicketUI(parseInt(DOM.number.textContent) || 0);
            showToast(T["take_success"], "success");
        } else { showToast(data.error || T["take_fail"], "error"); }
    } catch (e) { showToast(T["error_network"], "error"); } 
    finally { DOM.btnTakeTicket.disabled = false; DOM.btnTakeTicket.textContent = T["take_ticket"]; }
}));

if(DOM.btnTrackTicket) DOM.btnTrackTicket.addEventListener("click", () => handleUserInteraction(async () => {
    const val = DOM.manualTicketInput.value;
    if (!val) return showToast(T["input_empty"], "error");
    
    if ("Notification" in window && Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        if (p !== "granted" && !confirm("Continue without notifications?")) return;
    }

    myTicket = parseInt(val);
    localStorage.setItem('callsys_ticket', myTicket);
    DOM.manualTicketInput.value = "";
    
    showMyTicketMode();
    updateTicketUI(parseInt(DOM.number.textContent) || 0);
    showToast(T["take_success"], "success");
}));

if(DOM.btnCancelTicket) DOM.btnCancelTicket.addEventListener("click", () => {
    if(confirm(T["cancel_confirm"])) {
        localStorage.removeItem('callsys_ticket');
        myTicket = null;
        showTakeTicketMode();
    }
});

function updateMuteUI(isMuted, needsPermission = false) {
    isLocallyMuted = isMuted;
    if (!DOM.soundPrompt) return;
    const text = needsPermission || isMuted ? T["sound_mute"] : T["sound_on"];
    DOM.soundPrompt.innerHTML = `<span class="emoji">${needsPermission || isMuted ? '🔇' : '🔊'}</span> ${text}`;
    DOM.soundPrompt.classList.toggle("is-active", !needsPermission && !isMuted);
}

if (DOM.soundPrompt) DOM.soundPrompt.addEventListener("click", () => handleUserInteraction(() => {
    if (!audioPermissionGranted) { playNotificationSound(); } else { updateMuteUI(!isLocallyMuted); }
}));

if (DOM.copyLinkPrompt) DOM.copyLinkPrompt.addEventListener("click", () => {
    if (!navigator.clipboard) return alert("Use HTTPS to copy");
    navigator.clipboard.writeText(window.location.href).then(() => {
        const original = DOM.copyLinkPrompt.innerHTML;
        DOM.copyLinkPrompt.innerHTML = T["copy_success"];
        DOM.copyLinkPrompt.classList.add("is-copied");
        setTimeout(() => { 
            DOM.copyLinkPrompt.innerHTML = `<span class="emoji">🔗</span> ${T["copy_link"]}`; 
            DOM.copyLinkPrompt.classList.remove("is-copied"); 
        }, 2000);
    });
});

try {
    const qrEl = document.getElementById("qr-code-placeholder");
    if (qrEl) { new QRCode(qrEl, { text: window.location.href, width: 120, height: 120 }); }
} catch (e) {}

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    applyI18n();
    if (myTicket) showMyTicketMode(); else showTakeTicketMode();
    socket.connect();
    // 嘗試在第一次互動時註冊事件以解鎖音效
    document.body.addEventListener('click', unlockAudioContext, { once: true });
});
