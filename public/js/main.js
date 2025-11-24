// --- 0. i18n 字典與設定 (New: 國際化) ---
const i18nData = {
    "zh-TW": {
        "current_number": "目前叫號",
        "issued_number": "已發號碼",
        "take_ticket": "🎫 立即取號",
        "taking_ticket": "取號中...",
        "my_number": "您的號碼",
        "wait_count": "前方等待",
        "status_wait": "⏳ 請稍候，還有 %s 組",
        "status_arrival": "🎉 輪到您了！請前往櫃台",
        "status_passed": "⚠️ 您可能已過號",
        "error_network": "連線錯誤，請稍後再試",
        "manual_input_placeholder": "輸入號碼",
        "take_success": "取號成功！",
        "take_fail": "取號失敗",
        "input_empty": "請輸入號碼",
        "cancel_confirm": "確定要放棄/清除目前的追蹤嗎？",
        "copy_success": "✅ 已複製",
        "sound_enable": "🔊 啟用音效",
        "sound_on": "🔊 音效開啟",
        "sound_mute": "🔇 啟用音效",
        "public_announcement": "📢 店家公告：",
        "queue_notification": "再 %s 組就輪到您囉！",
        "arrival_notification": "輪到您了！請前往櫃台"
    },
    "en": {
        "current_number": "Current Number",
        "issued_number": "Issued Number",
        "take_ticket": "🎫 Take Ticket",
        "taking_ticket": "Processing...",
        "my_number": "Your Number",
        "wait_count": "Waiting",
        "status_wait": "⏳ Waiting: %s groups ahead",
        "status_arrival": "🎉 It's your turn!",
        "status_passed": "⚠️ Number passed",
        "error_network": "Network error, try again",
        "manual_input_placeholder": "Enter Number",
        "take_success": "Success!",
        "take_fail": "Failed",
        "input_empty": "Please enter a number",
        "cancel_confirm": "Are you sure you want to stop tracking?",
        "copy_success": "✅ Copied",
        "sound_enable": "🔊 Enable Sound",
        "sound_on": "🔊 Sound On",
        "sound_mute": "🔇 Enable Sound",
        "public_announcement": "📢 Announcement: ",
        "queue_notification": "%s groups to go!",
        "arrival_notification": "It's your turn!"
    }
};

// 偵測語言
const userLang = navigator.language || navigator.userLanguage; 
const currentLang = userLang.startsWith('zh') ? 'zh-TW' : 'en';
const t = i18nData[currentLang];

function applyI18n() {
    // 針對有 data-i18n 屬性的元素進行替換
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if(t[key]) el.textContent = t[key];
    });
    // 特殊處理 placeholder
    const manualInput = document.getElementById("manual-ticket-input");
    if(manualInput) manualInput.placeholder = t["manual_input_placeholder"];
}

// --- 1. Helper: Toast & Vibration (New: UX 優化) ---
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
    
    // 動畫進場
    requestAnimationFrame(() => el.classList.add('show'));
    
    // 震動回饋 (手機端)
    if (navigator.vibrate) navigator.vibrate(50); 

    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

function vibratePattern(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

// --- PWA Service Worker 註冊 (New) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('SW registered');
        }).catch(err => console.log('SW fail', err));
    });
}

// --- 2. Socket.io 初始化 ---
const socket = io();

// --- 3. 元素節點 (DOM) ---
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

// --- 4. 狀態變數 ---
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

// --- 5. Wake Lock API ---
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {});
        } catch (err) { console.error(`${err.name}, ${err.message}`); }
    }
}
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') { await requestWakeLock(); }
});

// --- 6. Socket Events ---
socket.on("connect", () => {
    console.log("Socket.io 已連接");
    // [New] 主動加入 public 房間
    socket.emit('joinRoom', 'public');
    
    if (isPublic) statusBar.classList.remove("visible");
    requestWakeLock(); 
});

socket.on("disconnect", () => {
    statusBar.classList.add("visible");
    lastUpdatedEl.textContent = "連線中斷...";
});

socket.on("updateQueue", (data) => {
    const current = data.current;
    const issued = data.issued;
    
    lastIssuedNumber = issued;
    if(issuedNumberMainEl) issuedNumberMainEl.textContent = issued;

    handleNewNumber(current);
    updateTicketUI(current);
});

socket.on("update", (num) => { });

socket.on("adminBroadcast", (msg) => {
    if (!isLocallyMuted) {
        speakText(msg, 1.0); 
        // [Mod] 使用 Toast 取代 alert，體驗更好
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

// --- 7. 核心邏輯 ---

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
        document.title = `${num}號 - 候位中`;
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
        // [Mod] i18n
        ticketStatusText.textContent = t["status_wait"].replace("%s", diff);
        myTicketView.style.background = "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)"; 
        
        if (avgServiceTime > 0) {
            const min = Math.ceil(diff * avgServiceTime);
            ticketWaitTimeEl.textContent = `預估等待：約 ${min} 分鐘`;
            ticketWaitTimeEl.style.display = "block";
        } else {
            ticketWaitTimeEl.style.display = "none";
        }

        if (diff <= 3) {
             // [New] 震動提示
             vibratePattern([100]);
             if (document.hidden && Notification.permission === "granted") {
                 new Notification("準備叫號", { body: t["queue_notification"].replace("%s", diff), tag: 'approach' });
             }
        }
    } else if (diff === 0) {
        ticketWaitingCount.textContent = "0";
        // [Mod] i18n
        ticketStatusText.textContent = t["status_arrival"];
        myTicketView.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)"; 
        ticketWaitTimeEl.style.display = "none";
        
        triggerConfetti();
        // [New] 強烈震動
        vibratePattern([200, 100, 200, 100, 200]);

        if (isSoundEnabled && !isLocallyMuted) speakText("恭喜，輪到您了，請前往櫃台", 1.0);
        if (Notification.permission === "granted") {
             new Notification("到號通知", { body: t["arrival_notification"], requireInteraction: true, tag: 'arrival' });
        }
    } else {
        ticketWaitingCount.textContent = "-";
        // [Mod] i18n
        ticketStatusText.textContent = t["status_passed"];
        myTicketView.style.background = "linear-gradient(135deg, #d97706 0%, #b45309 100%)"; 
        ticketWaitTimeEl.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    applyI18n(); // [New] 套用語言
    if (myTicket) {
        showMyTicketMode();
    }
});

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
        featuredContainerEl.innerHTML = '<p class="empty-state-message">暫無精選連結</p>';
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

function updateTimeText() {
    if (!lastUpdateTime) return;
    const diff = Math.floor((new Date() - lastUpdateTime) / 1000);
    lastUpdatedEl.textContent = diff < 60 ? `剛剛更新` : `最後更新於 ${Math.floor(diff/60)} 分鐘前`;
}
setInterval(updateTimeText, 10000);

// --- 8. 按鈕事件 ---

if(btnTakeTicket) {
    btnTakeTicket.addEventListener("click", async () => {
        if ("Notification" in window && Notification.permission !== "granted") {
            const p = await Notification.requestPermission();
            if (p !== "granted") {
                if(!confirm("如果不開啟通知，您必須保持網頁開啟才能看到進度。\n確定要繼續嗎？")) return;
            }
        }

        btnTakeTicket.disabled = true;
        btnTakeTicket.textContent = t["taking_ticket"]; // i18n
        
        try {
            const res = await fetch("/api/ticket/take", { method: "POST" });
            const data = await res.json();
            
            if (data.success) {
                myTicket = data.ticket;
                localStorage.setItem('callsys_ticket', myTicket);
                showMyTicketMode();
                const curr = parseInt(numberEl.textContent) || 0;
                updateTicketUI(curr);
                showToast(t["take_success"], "success"); // Toast
            } else {
                showToast(data.error || t["take_fail"], "error"); // Toast
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
        if (!val) return showToast(t["input_empty"], "error"); // Toast
        
        if ("Notification" in window && Notification.permission !== "granted") {
            const p = await Notification.requestPermission();
            if (p !== "granted" && !confirm("如果不開啟通知，您必須保持網頁開啟才能看到進度。\n確定要繼續嗎？")) return;
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
        if (!navigator.clipboard) return alert("無法複製 (需 HTTPS)");
        navigator.clipboard.writeText(window.location.href).then(() => {
            const original = copyLinkPrompt.innerHTML;
            copyLinkPrompt.innerHTML = t["copy_success"];
            copyLinkPrompt.classList.add("is-copied");
            setTimeout(() => { copyLinkPrompt.innerHTML = original; copyLinkPrompt.classList.remove("is-copied"); }, 2000);
        });
    });
}
try {
    const qrEl = document.getElementById("qr-code-placeholder");
    if (qrEl) { new QRCode(qrEl, { text: window.location.href, width: 120, height: 120 }); }
} catch (e) {}
