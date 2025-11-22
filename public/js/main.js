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

// 通知相關 UI
const notifyBtn = document.getElementById("enable-notify-btn");
const myNumInput = document.getElementById("my-number");
const notifyStatus = document.getElementById("notify-status");

// --- 3. 狀態變數 ---
let isSoundEnabled = false; 
let isLocallyMuted = false; 
let lastUpdateTime = null;
let isPublic = true;
let audioPermissionGranted = false;
let ttsEnabled = false; 
let myTargetNumber = null;
let wakeLock = null; // 【新】 Wake Lock 物件

// --- 4. Wake Lock API (保持螢幕常亮) ---
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('💡 Screen Wake Lock active');
            wakeLock.addEventListener('release', () => {
                console.log('💡 Screen Wake Lock released');
            });
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}
// 當頁面可見性改變時重新申請鎖
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// --- 5. Socket Events ---
socket.on("connect", () => {
    console.log("Socket.io 已連接");
    if (isPublic) statusBar.classList.remove("visible");
    requestWakeLock(); // 連線成功時嘗試鎖定螢幕
});

socket.on("disconnect", () => {
    statusBar.classList.add("visible");
    lastUpdatedEl.textContent = "連線中斷...";
});

socket.on("update", (num) => {
    handleNewNumber(num);
});

// 【新】 接收管理員廣播
socket.on("adminBroadcast", (msg) => {
    // 無論設定如何，廣播通常優先級較高，但仍受本地靜音控制
    if (!isLocallyMuted) {
        speakText(msg, 1.0); // 語速正常
        alert(`📢 店家公告：${msg}`);
    }
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
    // 1. 播放提示音
    playNotificationSound();
    
    // 2. TTS 語音 (延遲避免重疊)
    setTimeout(() => {
        if (numberEl.textContent !== String(num) && isSoundEnabled && !isLocallyMuted) {
            speakText(`現在號碼，${num}號`, 0.9);
        }
    }, 800);

    // 3. 檢查是否到號
    checkMyNumber(num);

    // 4. 更新 UI
    if (numberEl.textContent !== String(num)) {
        numberEl.textContent = num;
        document.title = `${num}號 - 候位中`;
        numberEl.classList.add("updated");
        setTimeout(() => numberEl.classList.remove("updated"), 500);
    }
}

function speakText(text, rate) {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // 取消上一句
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW';
    utterance.rate = rate || 0.9;
    window.speechSynthesis.speak(utterance);
}

function playNotificationSound() {
    if (!notifySound) return;
    // 嘗試播放以觸發 Audio Context
    notifySound.play().then(() => {
        audioPermissionGranted = true;
        ttsEnabled = true; // 獲得權限後開啟 TTS
        updateMuteUI(false);
        
        // 如果系統設定靜音或本地靜音，則暫停播放
        if (!isSoundEnabled || isLocallyMuted) {
            notifySound.pause(); notifySound.currentTime = 0;
        }
    }).catch(() => {
        console.warn("Autoplay blocked");
        audioPermissionGranted = false;
        updateMuteUI(true, true); // 顯示 "點此啟用"
    });
}

function checkMyNumber(current) {
    if (!myTargetNumber) return;
    const diff = myTargetNumber - current;
    
    // 剩餘 3 號以內或剛好到號
    if (diff <= 3 && diff >= 0) {
        const msg = diff === 0 ? `輪到您了！` : `剩 ${diff} 組！`;
        // 僅在背景執行時發送通知
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            new Notification("叫號提醒", { body: `${msg} 目前 ${current} 號`, icon: "/icons/icon-192.png" });
        }
    }
}

// --- 7. UI 渲染 ---
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

function updateMuteUI(isMuted, needsPermission = false) {
    isLocallyMuted = isMuted;
    if (!soundPrompt) return;
    
    soundPrompt.style.display = 'block';
    if (needsPermission || isMuted) {
        soundPrompt.innerHTML = '<span class="emoji">🔇</span> 點此啟用音效';
        soundPrompt.classList.remove("is-active");
    } else {
        soundPrompt.innerHTML = '<span class="emoji">🔊</span> 音效已開啟';
        soundPrompt.classList.add("is-active");
    }
}

if (soundPrompt) {
    soundPrompt.addEventListener("click", () => {
        if (!audioPermissionGranted) {
            playNotificationSound(); // 使用者點擊觸發音效
        } else {
            updateMuteUI(!isLocallyMuted);
        }
    });
}

if (notifyBtn) {
    notifyBtn.addEventListener("click", () => {
        if (!("Notification" in window)) return alert("此瀏覽器不支援通知");
        Notification.requestPermission().then(p => {
            if (p === "granted") {
                const val = myNumInput.value;
                if (val) {
                    myTargetNumber = parseInt(val);
                    notifyStatus.textContent = `✅ 將於接近 ${myTargetNumber} 號時通知`;
                    notifyStatus.style.color = "#10b981";
                    // 測試通知
                    new Notification("通知已設定", { body: "當號碼接近時我們會通知您" });
                } else alert("請輸入號碼");
            } else alert("請允許通知權限");
        });
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

// QR Code
try {
    const qrEl = document.getElementById("qr-code-placeholder");
    if (qrEl) {
        new QRCode(qrEl, {
            text: window.location.href, width: 120, height: 120
        });
    }
} catch (e) {}
