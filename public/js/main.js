/*
 * ==========================================
 * 前端邏輯 (main.js) - v18.13 Optimized (Reconnection UX)
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
        "status_connected": "✅ 已連線"
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
        "status_connected": "✅ Connected"
    }
};

// 語言設定邏輯
const langSelector = document.getElementById('language-selector');
let storedLang = localStorage.getItem('callsys_lang');
if (!storedLang) {
    storedLang = (navigator.language || navigator.userLanguage).startsWith('zh') ? 'zh-TW' : 'en';
}
let currentLang = storedLang;
let t = i18nData[currentLang];

// --- 1. Helper: Toast & Vibration (UX 優化) ---
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

// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW fail', err));
    });
}

// --- 2. Socket.io 初始化 ---
const socket = io();

// --- 3. DOM Elements ---
const numberEl = document.getElementById("number");
const issuedNumberMainEl = document.getElementById("issued-number-main");
const passedListEl = document.getElementById("passedList");
const featuredContainerEl = document.getElementById("featured-container");
const statusBar = document.getElementById("status-bar");
const notifySound = document.getElementById("notify-sound");
const lastUpdatedEl = document.getElementById("last-updated");
const soundPrompt = document.getElementById("sound-prompt");
const copyLinkPrompt = document.getElementById("copy-link-prompt"); 
const passedContainerEl = document.getElementById("passed-container");

const ticketingModeContainer = document.getElementById("ticketing-mode-container");
const inputModeContainer = document.getElementById("input-mode-container");
const takeTicketView = document.getElementById("take-ticket-view");
const inputModeView = document.getElementById("input-mode-view");
const myTicketView = document.getElementById("my-ticket-view");

const btnTakeTicket = document.getElementById("btn-take-ticket");
const btnTrackTicket = document.getElementById("btn-track-ticket");
const manualTicketInput = document.getElementById("manual-ticket-input");

const myTicketNumEl = document.getElementById("my-ticket-num");
const ticketCurrentDisplay = document.getElementById("ticket-current-display");
const ticketWaitingCount = document.getElementById("ticket-waiting-count");
const btnCancelTicket = document.getElementById("btn-cancel-ticket");
const ticketStatusText = document.getElementById("ticket-status-text");
const ticketWaitTimeEl = document.getElementById("ticket-wait-time");

// --- 4. State Variables ---
let isSoundEnabled = false; 
let isLocallyMuted = false; 
let lastUpdateTime = null;
let isPublic = true;
let audioPermissionGranted = false;
let ttsEnabled = false; 
let wakeLock = null; 
let avgServiceTime = 0; 
let currentSystemMode = 'ticketing'; 
let lastIssuedNumber = 0;
let myTicket = localStorage.getItem('callsys_ticket') ? parseInt(localStorage.getItem('callsys_ticket')) : null;
let reconnectTimer = null; // [新增] 用於管理重連倒數

// --- 5. Wake Lock ---
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

// --- 6. i18n Application Logic ---
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if(t[key]) el.textContent = t[key];
    });
    if(manualTicketInput) manualTicketInput.placeholder = t["manual_input_placeholder"];
    if(btnTakeTicket && !btnTakeTicket.disabled) {
        btnTakeTicket.textContent = t["take_ticket"];
    }
}

function updateTimeText() {
    if (!lastUpdateTime) return;
    const diff = Math.floor((new Date() - lastUpdateTime) / 1000);
    if (diff < 60) {
        lastUpdatedEl.textContent = t["time_just_now"];
    } else {
        lastUpdatedEl.textContent = t["time_min_ago"].replace("%s", Math.floor(diff/60));
    }
}
setInterval(updateTimeText, 10000);

if(langSelector) {
    langSelector.value = currentLang;
    langSelector.addEventListener('change', (e) => {
        currentLang = e.target.value;
        localStorage.setItem('callsys_lang', currentLang);
        t = i18nData[currentLang];
        applyI18n();
        const curr = parseInt(numberEl.textContent) || 0;
        updateTicketUI(curr);
        updateMuteUI(isLocallyMuted);
        updateTimeText();
    });
}

// --- 7. Socket Events (Optimized) ---

socket.on("connect", () => {
    console.log("Socket connected");
    socket.emit('joinRoom', 'public');
    
    // [UX 優化] 清除重連倒數，顯示綠色成功
    if (reconnectTimer) clearInterval(reconnectTimer);
    statusBar.textContent = t["status_connected"] || "Connected";
    statusBar.style.backgroundColor = "#10b981"; 
    
    // 延遲隱藏 Status Bar
    setTimeout(() => {
        if (socket.connected && isPublic) statusBar.classList.remove("visible");
    }, 1500);
    
    requestWakeLock(); 
});

socket.on("disconnect", (reason) => {
    console.warn("Socket disconnected:", reason);
    statusBar.classList.add("visible");
    
    // [UX 優化] 倒數計時提示
    if (reconnectTimer) clearInterval(reconnectTimer);
    
    let countdownVal = 3;
    const errorText = t["error_network"] || "Connection Lost";
    statusBar.textContent = `${errorText} (${countdownVal}s)`;
    statusBar.style.backgroundColor = "#dc2626"; // 紅色

    reconnectTimer = setInterval(() => {
        countdownVal--;
        if (countdownVal > 0) {
            statusBar.textContent = `${errorText} (${countdownVal}s)`;
        } else {
            statusBar.textContent = "Connecting...";
            statusBar.style.backgroundColor = "#d97706"; // 橘色嘗試中
            clearInterval(reconnectTimer);
        }
    }, 1000);
    
    lastUpdatedEl.textContent = errorText;
});

socket.on("updateQueue", (data) => {
    const current = data.current;
    const issued = data.issued;
    lastIssuedNumber = issued;
    if(issuedNumberMainEl) issuedNumberMainEl.textContent = issued;
    handleNewNumber(current);
    updateTicketUI(current);
});

socket.on("update", (num) => {}); 

socket.on("adminBroadcast", (msg) => {
    if (!isLocallyMuted) {
        speakText(msg, 1.0); 
        showToast(`${t["public_announcement"]}${msg}`, "info");
    }
});

socket.on("updateWaitTime", (time) => {
    avgServiceTime = time;
    const curr = parseInt(numberEl.textContent) || 0;
    updateTicketUI(curr);
});

socket.on("updateSoundSetting", (isEnabled) => { isSoundEnabled = isEnabled; });
socket.on("updatePublicStatus", (status) => {
    isPublic = status;
    document.body.classList.toggle("is-closed", !isPublic);
    if (isPublic) { socket.connect(); } 
    else { socket.disconnect(); statusBar.classList.remove("visible"); }
});

socket.on("updateSystemMode", (mode) => {
    currentSystemMode = mode;
    switchSystemModeUI(mode);
});

socket.on("updatePassed", (numbers) => renderPassed(numbers));
socket.on("updateFeaturedContents", (contents) => renderFeatured(contents));
socket.on("updateTimestamp", (ts) => { lastUpdateTime = new Date(ts); updateTimeText(); });

// --- 8. Core Logic ---

function switchSystemModeUI(mode) {
    if (mode === 'ticketing') {
        ticketingModeContainer.style.display = "block";
        inputModeContainer.style.display = "none";
    } else {
        ticketingModeContainer.style.display = "none";
        inputModeContainer.style.display = "block";
    }
    
    if (myTicket) {
        showMyTicketMode();
    } else {
        showTakeTicketMode();
    }
}

function handleNewNumber(num) {
    if (numberEl.textContent !== String(num)) {
        playNotificationSound();
        setTimeout(() => {
            if (numberEl.textContent !== String(num) && isSoundEnabled && !isLocallyMuted) {
                speakText(`現在號碼，${num}號`, 0.9);
            }
        }, 800);
        
        numberEl.textContent = num;
        document.title = `${num} - ${t["app_title"]}`;
        numberEl.classList.add("updated");
        setTimeout(() => numberEl.classList.remove("updated"), 500);
    }
}

function updateTicketUI(currentNum) {
    if (!myTicket) return;

    ticketCurrentDisplay.textContent = currentNum;
    const diff = myTicket - currentNum;
    
    if (diff > 0) {
        ticketWaitingCount.textContent = diff;
        ticketStatusText.textContent = t["status_wait"].replace("%s", diff);
        myTicketView.style.background = "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)"; 
        
        if (avgServiceTime > 0) {
            const min = Math.ceil(diff * avgServiceTime);
            ticketWaitTimeEl.textContent = t["estimated_wait"].replace("%s", min);
            ticketWaitTimeEl.style.display = "block";
        } else {
            ticketWaitTimeEl.style.display = "none";
        }

        if (diff <= 3) {
             vibratePattern([100]); 
             if (document.hidden && Notification.permission === "granted") {
                 new Notification(t["app_title"], { body: t["queue_notification"].replace("%s", diff), tag: 'approach' });
             }
        }
    } else if (diff === 0) {
        ticketWaitingCount.textContent = "0";
        ticketStatusText.textContent = t["status_arrival"];
        myTicketView.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)"; 
        ticketWaitTimeEl.style.display = "none";
        
        triggerConfetti();
        vibratePattern([200, 100, 200, 100, 200]); 

        if (isSoundEnabled && !isLocallyMuted) speakText("恭喜，輪到您了，請前往櫃台", 1.0);
        if (Notification.permission === "granted") {
             new Notification(t["app_title"], { body: t["arrival_notification"], requireInteraction: true, tag: 'arrival' });
        }
    } else {
        ticketWaitingCount.textContent = "-";
        ticketStatusText.textContent = t["status_passed"];
        myTicketView.style.background = "linear-gradient(135deg, #d97706 0%, #b45309 100%)"; 
        ticketWaitTimeEl.style.display = "none";
    }
}

function showMyTicketMode() {
    takeTicketView.style.display = "none";
    inputModeView.style.display = "none";
    myTicketView.style.display = "block";
    myTicketNumEl.textContent = myTicket;
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

function showTakeTicketMode() {
    myTicketView.style.display = "none";
    if (currentSystemMode === 'ticketing') {
        takeTicketView.style.display = "block";
        inputModeView.style.display = "none";
    } else {
        takeTicketView.style.display = "none";
        inputModeView.style.display = "block";
    }
}

function speakText(text, rate) {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW'; 
    utterance.rate = rate || 0.9;
    window.speechSynthesis.speak(utterance);
}

function playNotificationSound() {
    if (!notifySound) return;
    notifySound.play().then(() => {
        audioPermissionGranted = true;
        ttsEnabled = true; 
        updateMuteUI(false);
        if (!isSoundEnabled || isLocallyMuted) {
            notifySound.pause(); notifySound.currentTime = 0;
        }
    }).catch(() => {
        console.warn("Autoplay blocked");
        audioPermissionGranted = false;
        updateMuteUI(true, true); 
    });
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

function renderPassed(numbers) {
    passedListEl.innerHTML = "";
    const isEmpty = !numbers || numbers.length === 0;
    passedContainerEl.classList.toggle("is-empty", isEmpty);
    if (!isEmpty) {
        const frag = document.createDocumentFragment();
        numbers.forEach(n => {
            const li = document.createElement("li"); li.textContent = n; frag.appendChild(li);
        });
        passedListEl.appendChild(frag);
    }
}

function renderFeatured(contents) {
    featuredContainerEl.innerHTML = "";
    if (!contents || contents.length === 0) {
        featuredContainerEl.innerHTML = `<p class="empty-state-message" data-i18n="featured_empty">${t["featured_empty"]}</p>`;
        featuredContainerEl.classList.add("is-empty");
        return;
    }
    featuredContainerEl.classList.remove("is-empty");
    const frag = document.createDocumentFragment();
    contents.forEach(c => {
        const a = document.createElement("a");
        a.className = "featured-link";
        a.href = c.linkUrl; a.target = "_blank"; a.textContent = c.linkText;
        frag.appendChild(a);
    });
    featuredContainerEl.appendChild(frag);
}

// --- 9. Interaction Events ---

if(btnTakeTicket) {
    btnTakeTicket.addEventListener("click", async () => {
        if ("Notification" in window && Notification.permission !== "granted") {
            const p = await Notification.requestPermission();
            if (p !== "granted") {
                if(!confirm("Without notifications, you must keep this tab open. Continue?")) return;
            }
        }

        btnTakeTicket.disabled = true;
        btnTakeTicket.textContent = t["taking_ticket"];
        
        try {
            const res = await fetch("/api/ticket/take", { method: "POST" });
            const data = await res.json();
            
            if (data.success) {
                myTicket = data.ticket;
                localStorage.setItem('callsys_ticket', myTicket);
                showMyTicketMode();
                const curr = parseInt(numberEl.textContent) || 0;
                updateTicketUI(curr);
                showToast(t["take_success"], "success");
            } else {
                showToast(data.error || t["take_fail"], "error");
            }
        } catch (e) {
            showToast(t["error_network"], "error");
        } finally {
            btnTakeTicket.disabled = false;
            btnTakeTicket.textContent = t["take_ticket"];
        }
    });
}

if(btnTrackTicket) {
    btnTrackTicket.addEventListener("click", async () => {
        const val = manualTicketInput.value;
        if (!val) return showToast(t["input_empty"], "error");
        
        if ("Notification" in window && Notification.permission !== "granted") {
            const p = await Notification.requestPermission();
            if (p !== "granted" && !confirm("Continue without notifications?")) return;
        }

        myTicket = parseInt(val);
        localStorage.setItem('callsys_ticket', myTicket);
        manualTicketInput.value = "";
        
        showMyTicketMode();
        const curr = parseInt(numberEl.textContent) || 0;
        updateTicketUI(curr);
        showToast(t["take_success"], "success");
    });
}

if(btnCancelTicket) {
    btnCancelTicket.addEventListener("click", () => {
        if(confirm(t["cancel_confirm"])) {
            localStorage.removeItem('callsys_ticket');
            myTicket = null;
            showTakeTicketMode();
        }
    });
}

function updateMuteUI(isMuted, needsPermission = false) {
    isLocallyMuted = isMuted;
    if (!soundPrompt) return;
    if (needsPermission || isMuted) {
        soundPrompt.innerHTML = `<span class="emoji">🔇</span> ${t["sound_mute"]}`;
        soundPrompt.classList.remove("is-active");
    } else {
        soundPrompt.innerHTML = `<span class="emoji">🔊</span> ${t["sound_on"]}`;
        soundPrompt.classList.add("is-active");
    }
}
if (soundPrompt) {
    soundPrompt.addEventListener("click", () => {
        if (!audioPermissionGranted) { playNotificationSound(); } else { updateMuteUI(!isLocallyMuted); }
    });
}
if (copyLinkPrompt) {
    copyLinkPrompt.addEventListener("click", () => {
        if (!navigator.clipboard) return alert("Use HTTPS to copy");
        navigator.clipboard.writeText(window.location.href).then(() => {
            const original = copyLinkPrompt.innerHTML;
            copyLinkPrompt.innerHTML = t["copy_success"];
            copyLinkPrompt.classList.add("is-copied");
            setTimeout(() => { 
                copyLinkPrompt.innerHTML = `<span class="emoji">🔗</span> ${t["copy_link"]}`; 
                copyLinkPrompt.classList.remove("is-copied"); 
            }, 2000);
        });
    });
}
try {
    const qrEl = document.getElementById("qr-code-placeholder");
    if (qrEl) { new QRCode(qrEl, { text: window.location.href, width: 120, height: 120 }); }
} catch (e) {}

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    applyI18n();
    if (myTicket) {
        showMyTicketMode();
    }
});
