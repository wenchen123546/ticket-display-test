// --- 1. Socket.io 初始化 ---
const socket = io();

// --- 2. 元素節點 (DOM) ---
const numberEl = document.getElementById("number");
const passedListEl = document.getElementById("passedList");
const featuredContainerEl = document.getElementById("featured-container");
const statusBar = document.getElementById("status-bar");
const notifySound = document.getElementById("notify-sound");
const lastUpdatedEl = document.getElementById("last-updated");
const soundPrompt = document.getElementById("sound-prompt");
const copyLinkPrompt = document.getElementById("copy-link-prompt"); 
const passedContainerEl = document.getElementById("passed-container");

// 票券與取號相關 DOM
const ticketingModeContainer = document.getElementById("ticketing-mode-container");
const inputModeContainer = document.getElementById("input-mode-container");
const takeTicketView = document.getElementById("take-ticket-view");
const inputModeView = document.getElementById("input-mode-view");
const myTicketView = document.getElementById("my-ticket-view");

const issuedNumberEl = document.getElementById("issued-number");
const btnTakeTicket = document.getElementById("btn-take-ticket");
const btnTrackTicket = document.getElementById("btn-track-ticket");
const manualTicketInput = document.getElementById("manual-ticket-input");

const myTicketNumEl = document.getElementById("my-ticket-num");
const ticketCurrentDisplay = document.getElementById("ticket-current-display");
const ticketWaitingCount = document.getElementById("ticket-waiting-count");
const btnCancelTicket = document.getElementById("btn-cancel-ticket");
const ticketStatusText = document.getElementById("ticket-status-text");
const ticketWaitTimeEl = document.getElementById("ticket-wait-time");

// --- 3. 狀態變數 ---
let isSoundEnabled = false; 
let isLocallyMuted = false; 
let lastUpdateTime = null;
let isPublic = true;
let audioPermissionGranted = false;
let ttsEnabled = false; 
let wakeLock = null; 
let avgServiceTime = 0; 
let currentSystemMode = 'ticketing'; // 預設

// 票券狀態 (從 LocalStorage 讀取)
let lastIssuedNumber = 0;
let myTicket = localStorage.getItem('callsys_ticket') ? parseInt(localStorage.getItem('callsys_ticket')) : null;

// --- 4. Wake Lock API ---
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

// --- 5. Socket Events ---
socket.on("connect", () => {
    console.log("Socket.io 已連接");
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
    if(issuedNumberEl) issuedNumberEl.textContent = issued;

    handleNewNumber(current);
    updateTicketUI(current);
});

socket.on("update", (num) => { });

socket.on("adminBroadcast", (msg) => {
    if (!isLocallyMuted) {
        speakText(msg, 1.0); 
        alert(`📢 店家公告：${msg}`);
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

// 【新】監聽系統模式變更
socket.on("updateSystemMode", (mode) => {
    currentSystemMode = mode;
    switchSystemModeUI(mode);
});

socket.on("updatePassed", (numbers) => renderPassed(numbers));
socket.on("updateFeaturedContents", (contents) => renderFeatured(contents));
socket.on("updateTimestamp", (ts) => { lastUpdateTime = new Date(ts); updateTimeText(); });

// --- 6. 核心邏輯 ---

function switchSystemModeUI(mode) {
    if (mode === 'ticketing') {
        ticketingModeContainer.style.display = "block";
        inputModeContainer.style.display = "none";
    } else {
        ticketingModeContainer.style.display = "none";
        inputModeContainer.style.display = "block";
    }
    
    // 如果使用者已經有票，不管哪個模式都顯示「我的票券」介面
    if (myTicket) {
        showMyTicketMode();
    } else {
        showTakeTicketMode(); // 這會根據上面的 container display 設定來顯示正確的輸入介面
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
        ticketStatusText.textContent = `⏳ 請稍候，還有 ${diff} 組`;
        myTicketView.style.background = "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)"; 
        
        if (avgServiceTime > 0) {
            const min = Math.ceil(diff * avgServiceTime);
            ticketWaitTimeEl.textContent = `預估等待：約 ${min} 分鐘`;
            ticketWaitTimeEl.style.display = "block";
        } else {
            ticketWaitTimeEl.style.display = "none";
        }

        if (diff <= 3) {
             if (document.hidden && Notification.permission === "granted") {
                 new Notification("準備叫號", { body: `再 ${diff} 組就輪到您囉！`, tag: 'approach' });
             }
        }
    } else if (diff === 0) {
        ticketWaitingCount.textContent = "0";
        ticketStatusText.textContent = "🎉 輪到您了！請前往櫃台";
        myTicketView.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)"; 
        ticketWaitTimeEl.style.display = "none";
        
        triggerConfetti();
        if (isSoundEnabled && !isLocallyMuted) speakText("恭喜，輪到您了，請前往櫃台", 1.0);
        if (Notification.permission === "granted") {
             new Notification("到號通知", { body: `輪到您了！請前往櫃台`, requireInteraction: true, tag: 'arrival' });
        }
    } else {
        ticketWaitingCount.textContent = "-";
        ticketStatusText.textContent = "⚠️ 您可能已過號";
        myTicketView.style.background = "linear-gradient(135deg, #d97706 0%, #b45309 100%)"; 
        ticketWaitTimeEl.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // 預設先檢查是否有票
    if (myTicket) {
        showMyTicketMode();
    }
});

function showMyTicketMode() {
    // 隱藏取號/輸入介面
    takeTicketView.style.display = "none";
    inputModeView.style.display = "none";
    // 顯示票券介面
    myTicketView.style.display = "block";
    
    myTicketNumEl.textContent = myTicket;
    
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

function showTakeTicketMode() {
    // 根據目前的模式顯示對應介面
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

// 線上取號按鈕
if(btnTakeTicket) {
    btnTakeTicket.addEventListener("click", async () => {
        if ("Notification" in window && Notification.permission !== "granted") {
            const p = await Notification.requestPermission();
            if (p !== "granted") {
                if(!confirm("如果不開啟通知，您必須保持網頁開啟才能看到進度。\n確定要繼續嗎？")) return;
            }
        }

        btnTakeTicket.disabled = true;
        btnTakeTicket.textContent = "取號中...";
        
        try {
            const res = await fetch("/api/ticket/take", { method: "POST" });
            const data = await res.json();
            
            if (data.success) {
                myTicket = data.ticket;
                localStorage.setItem('callsys_ticket', myTicket);
                showMyTicketMode();
                const curr = parseInt(numberEl.textContent) || 0;
                updateTicketUI(curr);
            } else {
                alert(data.error || "取號失敗");
            }
        } catch (e) {
            alert("連線錯誤，請稍後再試");
        } finally {
            btnTakeTicket.disabled = false;
            btnTakeTicket.textContent = "🎫 立即取號";
        }
    });
}

// 手動輸入按鈕
if(btnTrackTicket) {
    btnTrackTicket.addEventListener("click", async () => {
        const val = manualTicketInput.value;
        if (!val) return alert("請輸入號碼");
        
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
    });
}

// 放棄按鈕
if(btnCancelTicket) {
    btnCancelTicket.addEventListener("click", () => {
        if(confirm("確定要放棄/清除目前的追蹤嗎？")) {
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
        soundPrompt.innerHTML = '<span class="emoji">🔇</span> 啟用音效';
        soundPrompt.classList.remove("is-active");
    } else {
        soundPrompt.innerHTML = '<span class="emoji">🔊</span> 音效開啟';
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
            copyLinkPrompt.innerHTML = '✅ 已複製';
            copyLinkPrompt.classList.add("is-copied");
            setTimeout(() => { copyLinkPrompt.innerHTML = original; copyLinkPrompt.classList.remove("is-copied"); }, 2000);
        });
    });
}
try {
    const qrEl = document.getElementById("qr-code-placeholder");
    if (qrEl) { new QRCode(qrEl, { text: window.location.href, width: 120, height: 120 }); }
} catch (e) {}
