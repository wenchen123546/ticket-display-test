/*
 * ==========================================
 * 前端邏輯 (main.js) - v25.0
 * 包含：新增的說明文字翻譯
 * ==========================================
 */

const i18nData = {
    "zh-TW": {
        "current_number": "目前叫號",
        "issued_number": "已發號碼",
        "online_ticket_title": "線上取號",
        "help_take_ticket": "無需現場排隊，手機直接領取號碼牌，即時通知。",
        "manual_input_title": "手動追蹤",
        "help_track_ticket": "若您已有實體號碼牌，輸入號碼即可開啟到號提醒。",
        "online_ticket_desc": "免排隊，到號通知",
        "take_ticket": "立即取號",
        "taking_ticket": "處理中...",
        "manual_input_placeholder": "輸入號碼",
        "set_reminder": "追蹤",
        "my_number": "您的號碼",
        "wait_count": "前方等待",
        "status_wait": "⏳ 還需等待 %s 組",
        "status_arrival": "🎉 輪到您了！請前往櫃台",
        "status_passed": "⚠️ 您可能已過號",
        "passed_list_title": "已過號",
        "passed_empty": "目前無過號",
        "copy_link": "複製連結",
        "sound_enable": "啟用音效",
        "sound_on": "音效開啟",
        "sound_mute": "啟用音效",
        "scan_qr": "掃描追蹤",
        "error_network": "連線中斷",
        "take_success": "取號成功！",
        "take_fail": "取號失敗",
        "input_empty": "請輸入號碼",
        "cancel_confirm": "確定要取消追蹤嗎？",
        "copy_success": "已複製",
        "public_announcement": "📢 公告：",
        "queue_notification": "再 %s 組就輪到您囉！",
        "estimated_wait": "約 %s 分鐘",
        "time_just_now": "剛剛",
        "time_min_ago": "%s 分鐘前",
        "status_connected": "已連線",
        "status_reconnecting": "連線中斷 (%s)..."
    },
    "en": {
        "current_number": "Now Serving",
        "issued_number": "Issued",
        "online_ticket_title": "Online Ticket",
        "help_take_ticket": "Get a digital ticket directly on your phone. No queueing needed.",
        "manual_input_title": "Manual Track",
        "help_track_ticket": "Already have a paper ticket? Enter the number to get notified.",
        "online_ticket_desc": "Skip the line",
        "take_ticket": "Get Ticket",
        "taking_ticket": "...",
        "manual_input_placeholder": "Ticket #",
        "set_reminder": "Track",
        "my_number": "Your #",
        "wait_count": "Ahead",
        "status_wait": "⏳ %s groups ahead",
        "status_arrival": "🎉 It's your turn!",
        "status_passed": "⚠️ Passed",
        "passed_list_title": "Passed",
        "passed_empty": "None",
        "copy_link": "Copy Link",
        "sound_enable": "Sound",
        "sound_on": "On",
        "sound_mute": "Sound",
        "scan_qr": "Scan to track",
        "error_network": "Offline",
        "take_success": "Success",
        "take_fail": "Failed",
        "input_empty": "Enter number",
        "cancel_confirm": "Stop tracking?",
        "copy_success": "Copied",
        "public_announcement": "📢: ",
        "queue_notification": "%s groups to go!",
        "estimated_wait": "~%s mins",
        "time_just_now": "Now",
        "time_min_ago": "%s min ago",
        "status_connected": "Online",
        "status_reconnecting": "Reconnecting (%s)..."
    }
};

// --- DOM Cache ---
const DOM = {
    number: document.getElementById("number"),
    issuedNumberMain: document.getElementById("issued-number-main"),
    passedList: document.getElementById("passedList"),
    passedCount: document.getElementById("passed-count"),
    passedEmptyMsg: document.getElementById("passed-empty-msg"),
    featuredContainer: document.getElementById("featured-container"),
    statusBar: document.getElementById("status-bar"),
    notifySound: document.getElementById("notify-sound"),
    lastUpdated: document.getElementById("last-updated"),
    soundPrompt: document.getElementById("sound-prompt"),
    copyLinkPrompt: document.getElementById("copy-link-prompt"),
    
    // Modes
    ticketingModeContainer: document.getElementById("ticketing-mode-container"),
    inputModeContainer: document.getElementById("input-mode-container"),
    takeTicketView: document.getElementById("take-ticket-view"),
    inputModeView: document.getElementById("input-mode-view"),
    myTicketView: document.getElementById("my-ticket-view"),
    
    // Buttons & Inputs
    btnTakeTicket: document.getElementById("btn-take-ticket"),
    btnTrackTicket: document.getElementById("btn-track-ticket"),
    manualTicketInput: document.getElementById("manual-ticket-input"),
    btnCancelTicket: document.getElementById("btn-cancel-ticket"),
    
    // My Ticket Info
    myTicketNum: document.getElementById("my-ticket-num"),
    ticketWaitingCount: document.getElementById("ticket-waiting-count"),
    ticketStatusText: document.getElementById("ticket-status-text"),
    ticketWaitTime: document.getElementById("ticket-wait-time"),
};

const langSelector = document.getElementById('language-selector');
let currentLang = localStorage.getItem('callsys_lang') || 'zh-TW';
let T = i18nData[currentLang];

// --- State ---
let isSoundEnabled = false; 
let isLocallyMuted = false; 
let lastUpdateTime = null;
let currentSystemMode = 'ticketing'; 
let avgServiceTime = 0;
let audioPermissionGranted = false;
let ttsEnabled = false;
let myTicket = localStorage.getItem('callsys_ticket') ? parseInt(localStorage.getItem('callsys_ticket')) : null;
let audioContext = null;

// --- Helpers ---
function unlockAudioContext() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            // Play silent buffer to unlock
            const buffer = audioContext.createBuffer(1, 1, 22050);
            const source = audioContext.createBufferSource();
            source.buffer = buffer; source.connect(audioContext.destination); source.start(0);
            audioPermissionGranted = true; ttsEnabled = true; updateMuteUI(false);
        });
    }
}

function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const el = document.createElement('div'); el.className = `toast-message ${type}`; el.textContent = msg;
    container.appendChild(el); 
    requestAnimationFrame(() => el.classList.add('show'));
    if (navigator.vibrate) navigator.vibrate(50); 
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}

function vibratePattern(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

function speakText(text, rate) {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW'; utterance.rate = rate || 0.9;
    window.speechSynthesis.speak(utterance);
}

function playNotificationSound() {
    if (!DOM.notifySound) return;
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
    const playPromise = DOM.notifySound.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            audioPermissionGranted = true; updateMuteUI(false);
            if (!isSoundEnabled || isLocallyMuted) { DOM.notifySound.pause(); DOM.notifySound.currentTime = 0; }
        }).catch(() => { console.warn("Autoplay blocked"); audioPermissionGranted = false; updateMuteUI(true, true); });
    }
}

function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if(T[key]) el.textContent = T[key]; });
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
        currentLang = e.target.value; localStorage.setItem('callsys_lang', currentLang); T = i18nData[currentLang];
        applyI18n(); updateTicketUI(parseInt(DOM.number.textContent) || 0); updateMuteUI(isLocallyMuted); updateTimeText();
    });
}

// --- Socket.io ---
const socket = io({ autoConnect: false, reconnection: true });
socket.on("connect", () => { 
    socket.emit('joinRoom', 'public'); 
    DOM.statusBar.textContent = T["status_connected"]; DOM.statusBar.style.backgroundColor = "#10b981"; 
    setTimeout(() => { if (socket.connected) DOM.statusBar.classList.remove("visible"); }, 1500); 
});
socket.on("disconnect", () => { DOM.statusBar.classList.add("visible"); DOM.statusBar.textContent = T["error_network"]; DOM.statusBar.style.backgroundColor = "#dc2626"; });
socket.on("reconnect_attempt", (attempt) => { DOM.statusBar.classList.add("visible"); DOM.statusBar.style.backgroundColor = "#d97706"; DOM.statusBar.textContent = T["status_reconnecting"].replace("%s", attempt); });

socket.on("updateQueue", (data) => { 
    if(DOM.issuedNumberMain) DOM.issuedNumberMain.textContent = data.issued; 
    handleNewNumber(data.current); 
    updateTicketUI(data.current); 
});
socket.on("adminBroadcast", (msg) => { if (!isLocallyMuted) { speakText(msg, 1.0); showToast(`${T["public_announcement"]}${msg}`, "info"); } });
socket.on("updateWaitTime", (time) => { avgServiceTime = time; updateTicketUI(parseInt(DOM.number.textContent) || 0); });
socket.on("updateSoundSetting", (isEnabled) => { isSoundEnabled = isEnabled; });
socket.on("updatePublicStatus", (status) => { document.body.classList.toggle("is-closed", !status); if (status) socket.connect(); else socket.disconnect(); });
socket.on("updateSystemMode", (mode) => { currentSystemMode = mode; switchSystemModeUI(mode); });
socket.on("updatePassed", (numbers) => renderPassed(numbers));
socket.on("updateFeaturedContents", (contents) => renderFeatured(contents));
socket.on("updateTimestamp", (ts) => { lastUpdateTime = new Date(ts); updateTimeText(); });

function handleNewNumber(num) {
    if (DOM.number.textContent !== String(num)) {
        playNotificationSound();
        setTimeout(() => { if (DOM.number.textContent !== String(num) && isSoundEnabled && !isLocallyMuted) speakText(`現在號碼，${num}號`, 0.9); }, 800);
        DOM.number.textContent = num; document.title = `${num} - ${document.title.split('-')[1] || 'Queue'}`;
    }
}

function renderPassed(numbers) {
    DOM.passedList.innerHTML = ""; const isEmpty = !numbers || numbers.length === 0;
    DOM.passedCount.textContent = numbers ? numbers.length : 0;
    if (isEmpty) {
        DOM.passedEmptyMsg.style.display = 'flex'; DOM.passedList.style.display = 'none';
    } else {
        DOM.passedEmptyMsg.style.display = 'none'; DOM.passedList.style.display = 'flex';
        const frag = document.createDocumentFragment(); 
        numbers.forEach(n => { const li = document.createElement("li"); li.textContent = n; frag.appendChild(li); }); 
        DOM.passedList.appendChild(frag);
    }
}

// --- Render Hyperlinks (Dock Style) ---
function renderFeatured(contents) {
    DOM.featuredContainer.innerHTML = "";
    if (!contents || contents.length === 0) {
        DOM.featuredContainer.style.display = 'none'; return;
    }
    DOM.featuredContainer.style.display = 'flex';
    const frag = document.createDocumentFragment();
    
    contents.forEach(c => {
        const a = document.createElement("a");
        a.className = "link-chip";
        a.href = c.linkUrl; a.target = "_blank"; a.textContent = c.linkText;
        a.addEventListener('click', (e) => e.stopPropagation());
        frag.appendChild(a);
    });
    DOM.featuredContainer.appendChild(frag);
}

// --- Ticket Logic ---
function switchSystemModeUI(mode) {
    const isTicketing = mode === 'ticketing';
    DOM.ticketingModeContainer.style.display = isTicketing ? "block" : "none";
    DOM.inputModeContainer.style.display = isTicketing ? "none" : "block";
    if (myTicket) showMyTicketMode(); else showTakeTicketMode();
}

function showMyTicketMode() { 
    DOM.takeTicketView.style.display = "none"; 
    DOM.inputModeView.style.display = "none"; 
    DOM.myTicketView.style.display = "block"; 
    DOM.myTicketNum.textContent = myTicket; 
}
function showTakeTicketMode() { 
    DOM.myTicketView.style.display = "none"; 
    DOM.takeTicketView.style.display = (currentSystemMode === 'ticketing') ? "block" : "none"; 
    DOM.inputModeView.style.display = (currentSystemMode === 'input') ? "block" : "none"; 
}

function updateTicketUI(currentNum) {
    if (!myTicket) return;
    const diff = myTicket - currentNum;
    let statusText = T["status_wait"].replace("%s", diff); let waitTimeDisplay = "none";
    
    if (diff > 0) {
        DOM.ticketWaitingCount.textContent = diff;
        if (avgServiceTime > 0) { 
            const min = Math.ceil(diff * avgServiceTime); 
            DOM.ticketWaitTime.textContent = T["estimated_wait"].replace("%s", min); 
            waitTimeDisplay = "inline-block"; 
        }
        if (diff <= 3 && document.hidden && Notification.permission === "granted") {
            new Notification("Queue Update", { body: T["queue_notification"].replace("%s", diff) });
        }
    } else if (diff === 0) {
        DOM.ticketWaitingCount.textContent = "0"; statusText = T["status_arrival"];
        if (typeof confetti !== 'undefined') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        vibratePattern([200, 100, 200]);
    } else { 
        DOM.ticketWaitingCount.textContent = "-"; statusText = T["status_passed"]; 
    }
    DOM.ticketStatusText.textContent = statusText; DOM.ticketWaitTime.style.display = waitTimeDisplay;
}

// --- Event Listeners ---
function handleUserInteraction(callback) { unlockAudioContext(); callback(); }

if(DOM.btnTakeTicket) DOM.btnTakeTicket.addEventListener("click", () => handleUserInteraction(async () => {
    if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
    DOM.btnTakeTicket.disabled = true;
    try { 
        const res = await fetch("/api/ticket/take", { method: "POST" }); 
        const data = await res.json(); 
        if (data.success) { 
            myTicket = data.ticket; localStorage.setItem('callsys_ticket', myTicket); 
            showMyTicketMode(); updateTicketUI(parseInt(DOM.number.textContent) || 0); 
            showToast(T["take_success"], "success"); 
        } else showToast(data.error || T["take_fail"], "error"); 
    } catch (e) { showToast(T["error_network"], "error"); } 
    finally { DOM.btnTakeTicket.disabled = false; }
}));

if(DOM.btnTrackTicket) DOM.btnTrackTicket.addEventListener("click", () => handleUserInteraction(() => {
    const val = DOM.manualTicketInput.value; if (!val) return showToast(T["input_empty"], "error");
    if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
    myTicket = parseInt(val); localStorage.setItem('callsys_ticket', myTicket); 
    DOM.manualTicketInput.value = ""; showMyTicketMode(); updateTicketUI(parseInt(DOM.number.textContent) || 0);
}));

if(DOM.btnCancelTicket) DOM.btnCancelTicket.addEventListener("click", () => { 
    if(confirm(T["cancel_confirm"])) { 
        localStorage.removeItem('callsys_ticket'); myTicket = null; showTakeTicketMode(); 
    } 
});

// Sound & Copy
function updateMuteUI(isMuted, needsPermission = false) { 
    isLocallyMuted = isMuted; 
    if (!DOM.soundPrompt) return; 
    const text = needsPermission || isMuted ? T["sound_mute"] : T["sound_on"]; 
    DOM.soundPrompt.innerHTML = `<span>${needsPermission || isMuted ? '🔇' : '🔊'}</span> ${text}`; 
    DOM.soundPrompt.classList.toggle("is-active", !needsPermission && !isMuted); 
}

if (DOM.soundPrompt) DOM.soundPrompt.addEventListener("click", () => handleUserInteraction(() => { 
    if (!audioPermissionGranted) playNotificationSound(); else updateMuteUI(!isLocallyMuted); 
}));

if (DOM.copyLinkPrompt) DOM.copyLinkPrompt.addEventListener("click", () => { 
    if (!navigator.clipboard) return alert("Use HTTPS"); 
    navigator.clipboard.writeText(window.location.href).then(() => { 
        DOM.copyLinkPrompt.innerHTML = `<span style="color:var(--primary)">${T["copy_success"]}</span>`; 
        setTimeout(() => { DOM.copyLinkPrompt.innerHTML = `<span>🔗</span> ${T["copy_link"]}`; }, 2000); 
    }); 
});

// Init
document.addEventListener("DOMContentLoaded", () => { 
    applyI18n(); 
    if (myTicket) showMyTicketMode(); else showTakeTicketMode(); 
    socket.connect(); 
    document.body.addEventListener('click', unlockAudioContext, { once: true });
    
    // QR Code
    try { 
        const qrEl = document.getElementById("qr-code-placeholder"); 
        if (qrEl) new QRCode(qrEl, { text: window.location.href, width: 120, height: 120 }); 
    } catch (e) {}
});
