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

// 【新】票券與取號相關 DOM
const takeTicketView = document.getElementById("take-ticket-view");
const myTicketView = document.getElementById("my-ticket-view");
const issuedNumberEl = document.getElementById("issued-number");
const btnTakeTicket = document.getElementById("btn-take-ticket");
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

// 【新】票券狀態 (從 LocalStorage 讀取)
let lastIssuedNumber = 0;
let myTicket = localStorage.getItem('callsys_ticket') ? parseInt(localStorage.getItem('callsys_ticket')) : null;

// --- 4. Wake Lock API (保持螢幕常亮) ---
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

// 【核心修改】整合 Queue 狀態更新
socket.on("updateQueue", (data) => {
    const current = data.current;
    const issued = data.issued;
    
    // 更新發號顯示
    lastIssuedNumber = issued;
    if(issuedNumberEl) issuedNumberEl.textContent = issued;

    // 處理當前號碼邏輯 (音效與動畫)
    handleNewNumber(current);
    
    // 更新票券 UI (如果有領票)
    updateTicketUI(current);
});

// 接收來自 Server 的單純 update (相容性保留)
socket.on("update", (num) => { 
    // updateQueue 會處理大部分邏輯，這裡僅作為備援
});

socket.on("adminBroadcast", (msg) => {
    if (!isLocallyMuted) {
        speakText(msg, 1.0); 
        alert(`📢 店家公告：${msg}`);
    }
});

socket.on("updateWaitTime", (time) => {
    avgServiceTime = time;
    // 若有票券，立即重算時間
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
socket.on("updatePassed", (numbers) => renderPassed(numbers));
socket.on("updateFeaturedContents", (contents) => renderFeatured(contents));
socket.on("updateTimestamp", (ts) => { lastUpdateTime = new Date(ts); updateTimeText(); });

// --- 6. 核心邏輯 ---

function handleNewNumber(num) {
    // 號碼改變時的音效與 TTS
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

// 【新】票券 UI 更新邏輯
function updateTicketUI(currentNum) {
    if (!myTicket) return;

    // 更新票券卡片上的目前號碼
    ticketCurrentDisplay.textContent = currentNum;
    
    const diff = myTicket - currentNum;
    
    if (diff > 0) {
        // 等待中
        ticketWaitingCount.textContent = diff;
        ticketStatusText.textContent = `⏳ 請稍候，還有 ${diff} 組`;
        myTicketView.style.background = "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)"; // 藍色
        
        // 更新預估時間
        if (avgServiceTime > 0) {
            const min = Math.ceil(diff * avgServiceTime);
            ticketWaitTimeEl.textContent = `預估等待：約 ${min} 分鐘`;
            ticketWaitTimeEl.style.display = "block";
        } else {
            ticketWaitTimeEl.style.display = "none";
        }

        // 接近提醒 (剩 3 組)
        if (diff <= 3) {
             if (document.hidden && Notification.permission === "granted") {
                 // 防止短時間內重複通知的簡單機制可在此擴充
                 new Notification("準備叫號", { body: `再 ${diff} 組就輪到您囉！`, tag: 'approach' });
             }
        }

    } else if (diff === 0) {
        // 到號
        ticketWaitingCount.textContent = "0";
        ticketStatusText.textContent = "🎉 輪到您了！請前往櫃台";
        myTicketView.style.background = "linear-gradient(135deg, #059669 0%, #10b981 100%)"; // 綠色
        ticketWaitTimeEl.style.display = "none";
        
        // 到號特效與通知
        triggerConfetti();
        if (isSoundEnabled && !isLocallyMuted) speakText("恭喜，輪到您了，請前往櫃台", 1.0);
        if (Notification.permission === "granted") {
             new Notification("到號通知", { body: `輪到您了！請前往櫃台`, requireInteraction: true, tag: 'arrival' });
        }

    } else {
        // 過號
        ticketWaitingCount.textContent = "-";
        ticketStatusText.textContent = "⚠️ 您可能已過號";
        myTicketView.style.background = "linear-gradient(135deg, #d97706 0%, #b45309 100%)"; // 橘色
        ticketWaitTimeEl.style.display = "none";
    }
}

// 初始化檢查
document.addEventListener("DOMContentLoaded", () => {
    if (myTicket) {
        showMyTicketMode();
    }
});

function showMyTicketMode() {
    takeTicketView.style.display = "none";
    myTicketView.style.display = "block";
    myTicketNumEl.textContent = myTicket;
    
    // 進入此模式自動請求通知權限 (若為 default)
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

function showTakeTicketMode() {
    takeTicketView.style.display = "block";
    myTicketView.style.display = "none";
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

// --- 7. UI 渲染 (過號/精選連結) ---
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

// --- 8. 使用者互動綁定 ---

// 取號按鈕邏輯
if(btnTakeTicket) {
    btnTakeTicket.addEventListener("click", async () => {
        // 請求通知權限
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
                updateTicketUI(curr); // 立即更新一次
                
                // alert(`取號成功！您的號碼是 ${myTicket} 號`);
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

// 放棄按鈕邏輯
if(btnCancelTicket) {
    btnCancelTicket.addEventListener("click", () => {
        if(confirm("確定要放棄目前的號碼嗎？\n(若要重新排隊需重新取號)")) {
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
        if (!audioPermissionGranted) {
            playNotificationSound(); 
        } else {
            updateMuteUI(!isLocallyMuted);
        }
    });
}

if (copyLinkPrompt) {
    copyLinkPrompt.addEventListener("click", () => {
        if (!navigator.clipboard) return alert("無法複製 (需 HTTPS)");
        navigator.clipboard.writeText(window.location.href).then(() => {
            const original = copyLinkPrompt.innerHTML;
            copyLinkPrompt.innerHTML = '✅ 已複製';
            copyLinkPrompt.classList.add("is-copied");
            setTimeout(() => {
                copyLinkPrompt.innerHTML = original;
                copyLinkPrompt.classList.remove("is-copied");
            }, 2000);
        });
    });
}

try {
    const qrEl = document.getElementById("qr-code-placeholder");
    if (qrEl) {
        new QRCode(qrEl, { text: window.location.href, width: 120, height: 120 });
    }
} catch (e) {}
