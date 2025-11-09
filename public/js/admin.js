// --- 1. 元素節點 (DOM) ---
const loginContainer = document.getElementById("login-container");
const adminPanel = document.getElementById("admin-panel");
const usernameInput = document.getElementById("username-input"); 
const passwordInput = document.getElementById("password-input");
const loginButton = document.getElementById("login-button");
const loginError = document.getElementById("login-error");
const numberEl = document.getElementById("number");
const statusBar = document.getElementById("status-bar");
const passedListUI = document.getElementById("passed-list-ui");
const newPassedNumberInput = document.getElementById("new-passed-number");
const addPassedBtn = document.getElementById("add-passed-btn");
const featuredListUI = document.getElementById("featured-list-ui");
const newLinkTextInput = document.getElementById("new-link-text");
const newLinkUrlInput = document.getElementById("new-link-url");
const addFeaturedBtn = document.getElementById("add-featured-btn");
const soundToggle = document.getElementById("sound-toggle");
const publicToggle = document.getElementById("public-toggle"); 
const adminLogUI = document.getElementById("admin-log-ui");
const clearLogBtn = document.getElementById("clear-log-btn");
const resetAllBtn = document.getElementById("resetAll");
const onlineUsersList = document.getElementById("online-users-list"); // 【新】

// --- 2. 全域變數 ---
let token = ""; // 儲存 Session Token
let userRole = "normal"; 
let username = ""; 
let toastTimer = null; 
let publicToggleConfirmTimer = null; 


// --- 3. Socket.io ---
const socket = io({ 
    autoConnect: false,
    auth: {
        token: "" 
    }
});

// --- 4. 登入/顯示邏輯 ---
function showLogin() {
    loginContainer.style.display = "block";
    adminPanel.style.display = "none";
    document.title = "後台管理 - 登入";
    socket.disconnect();
}

async function showPanel() {
    loginContainer.style.display = "none";
    adminPanel.style.display = "block";
    document.title = `後台管理 - ${username}`; 
    socket.connect();

    // 根據角色顯示「用戶管理」面板
    if (userRole === 'super') {
        const userManagementCard = document.getElementById("card-user-management");
        if (userManagementCard) {
            userManagementCard.style.display = "block";
            await loadAdminUsers(); 
        }
    }
}

// 登入邏輯
async function attemptLogin(username, password) {
    loginError.textContent = "驗證中...";
    try {
        const res = await fetch("/login", { 
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }), 
        });
        
        const data = await res.json();

        if (!res.ok) {
            loginError.textContent = data.error || "登入失敗";
            showLogin();
        } else {
            // 登入成功
            token = data.token;       
            userRole = data.role;     
            username = data.username; 
            socket.auth.token = token; 
            await showPanel();
        }

    } catch (err) {
        console.error("attemptLogin 失敗:", err);
        loginError.textContent = "無法連線到伺服器";
        return false;
    }
}

document.addEventListener("DOMContentLoaded", () => { showLogin(); });

loginButton.addEventListener("click", () => { 
    attemptLogin(usernameInput.value, passwordInput.value); 
});
usernameInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { passwordInput.focus(); } });
passwordInput.addEventListener("keyup", (event) => { 
    if (event.key === "Enter") { 
        attemptLogin(usernameInput.value, passwordInput.value);
    } 
});


// --- 5. Toast 通知函式 ---
function showToast(message, type = 'info') {
    const toast = document.getElementById("toast-notification");
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = type; 
    
    toast.classList.add("show");
    
    if (toastTimer) clearTimeout(toastTimer);
    
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


// --- 6. 控制台 Socket 監聽器 ---
socket.on("connect", () => {
    console.log("Socket.io 已連接");
    statusBar.classList.remove("visible");
    showToast(`✅ 已連線 (${username})`, "success");
});
socket.on("disconnect", () => {
    console.warn("Socket.io 已斷線");
    statusBar.classList.add("visible");
    showToast("❌ 已從伺服器斷線", "error");
    renderOnlineAdmins([]); // 斷線時清空在線列表
});
socket.on("connect_error", (err) => {
    console.error("Socket 連線失敗:", err.message);
    if (err.message === "Authentication failed" || err.message === "驗證失敗或 Session 已過期") {
        alert("驗證失敗或 Session 已過期，請重新登入。");
        showLogin();
    }
});

// --- 伺服器日誌監聽器 ---
socket.on("initAdminLogs", (logs) => {
    adminLogUI.innerHTML = "";
    if (!logs || logs.length === 0) {
        adminLogUI.innerHTML = "<li>[目前尚無日誌]</li>";
        return;
    }
    const fragment = document.createDocumentFragment();
    logs.forEach(logMsg => {
        const li = document.createElement("li");
        li.textContent = logMsg;
        fragment.appendChild(li);
    });
    adminLogUI.appendChild(fragment);
    adminLogUI.scrollTop = adminLogUI.scrollHeight; 
});

socket.on("newAdminLog", (logMessage) => {
    const firstLi = adminLogUI.querySelector("li");
    if (firstLi && firstLi.textContent.includes("[目前尚無日誌]")) {
        adminLogUI.innerHTML = "";
    }
    
    const li = document.createElement("li");
    li.textContent = logMessage;
    adminLogUI.prepend(li); 
});

// --- 【新】 在線管理員監聽器 ---
socket.on("updateOnlineAdmins", (admins) => {
    console.log("在線列表更新:", admins);
    renderOnlineAdmins(admins);
});

// --- 資料更新監聽器 ---
socket.on("update", (num) => {
    numberEl.textContent = num;
});
socket.on("updatePassed", (numbers) => {
    renderPassedListUI(numbers);
});
socket.on("updateFeaturedContents", (contents) => {
    renderFeaturedListUI(contents);
});
socket.on("updateSoundSetting", (isEnabled) => {
    console.log("收到音效設定:", isEnabled);
    soundToggle.checked = isEnabled;
});
socket.on("updatePublicStatus", (isPublic) => {
    console.log("收到公開狀態:", isPublic);
    publicToggle.checked = isPublic;
});
socket.on("updateTimestamp", (timestamp) => {
    console.log("Timestamp updated:", timestamp);
});

// --- 7. API 請求函式 ---
async function apiRequest(endpoint, body, a_returnResponse = false) {
    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, token }), 
        });
        
        const responseData = await res.json(); 

        if (!res.ok) {
            if (res.status === 403) {
                alert("驗證失敗或 Session 已過期，請重新登入。");
                showLogin();
            } else {
                const errorMsg = responseData.error || "未知錯誤";
                showToast(`❌ API 錯誤: ${errorMsg}`, "error");
                alert("發生錯誤：" + errorMsg);
            }
            return false;
        }

        if (a_returnResponse) {
            return responseData; 
        }
        
        return true; 
    } catch (err) {
        showToast(`❌ 網路連線失敗: ${err.message}`, "error");
        alert("網路連線失敗或伺服器無回應：" + err.message);
        return false;
    }
}

// --- 8. 按鈕確認邏輯 ---
function setupConfirmationButton(buttonEl, originalText, confirmText, actionCallback) {
    if (!buttonEl) return;
    
    let timer = null;
    let interval = null;
    let isConfirming = false;
    let countdown = 5;

    const showCountdown = confirmText.includes("點此") || confirmText.includes("重置");

    const resetBtn = () => {
        clearInterval(interval);
        clearTimeout(timer);
        isConfirming = false;
        countdown = 5;
        buttonEl.textContent = originalText;
        buttonEl.classList.remove("is-confirming");
        interval = null;
        timer = null;
    };

    buttonEl.addEventListener("click", () => {
        if (isConfirming) {
            actionCallback();
            resetBtn();
        } else {
            isConfirming = true;
            countdown = 5;
            buttonEl.textContent = showCountdown ? `${confirmText} (${countdown}s)` : confirmText;
            buttonEl.classList.add("is-confirming");

            if (showCountdown) {
                interval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        buttonEl.textContent = `${confirmText} (${countdown}s)`;
                    } else {
                        clearInterval(interval);
                    }
                }, 1000);
            }

            timer = setTimeout(() => {
                resetBtn();
            }, 5000);
        }
    });
}


// --- 9. GUI 渲染函式 ---
function renderPassedListUI(numbers) {
    passedListUI.innerHTML = ""; 
    if (!Array.isArray(numbers)) return;
    const fragment = document.createDocumentFragment();
    numbers.forEach((number) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${number}</span>`;
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-item-btn";
        deleteBtn.textContent = "×";
        
        const actionCallback = async () => {
            deleteBtn.disabled = true;
            await apiRequest("/api/passed/remove", { number: number });
        };
        
        setupConfirmationButton(deleteBtn, "×", "⚠️", actionCallback);
        
        li.appendChild(deleteBtn);
        fragment.appendChild(li);
    });
    passedListUI.appendChild(fragment);
}

function renderFeaturedListUI(contents) {
    featuredListUI.innerHTML = "";
    if (!Array.isArray(contents)) return;
    
    const fragment = document.createDocumentFragment();
    
    contents.forEach((item) => {
        const li = document.createElement("li");
        const span = document.createElement("span");
        const textNode = document.createTextNode(item.linkText);
        span.appendChild(textNode);
        span.appendChild(document.createElement("br"));
        const small = document.createElement("small");
        small.style.color = "#666";
        small.textContent = item.linkUrl; 
        span.appendChild(small);
        li.appendChild(span);

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-item-btn";
        deleteBtn.textContent = "×";
        
        const actionCallback = async () => {
            deleteBtn.disabled = true;
            await apiRequest("/api/featured/remove", {
                linkText: item.linkText,
                linkUrl: item.linkUrl
            });
        };
        
        setupConfirmationButton(deleteBtn, "×", "⚠️", actionCallback);
        
        li.appendChild(deleteBtn);
        fragment.appendChild(li);
    });
    featuredListUI.appendChild(fragment);
}

// 【新】 渲染在線管理員列表
function renderOnlineAdmins(admins) {
    if (!onlineUsersList) return;
    
    onlineUsersList.innerHTML = "";
    
    if (!admins || admins.length === 0) {
        onlineUsersList.innerHTML = "<li>(目前無人在線)</li>";
        return;
    }
    
    // 排序：自己 > 超管 > 其他 (按字母)
    admins.sort((a, b) => {
        if (a.username === username) return -1;
        if (b.username === username) return 1;
        if (a.role === 'super' && b.role !== 'super') return -1;
        if (a.role !== 'super' && b.role === 'super') return 1;
        return a.username.localeCompare(b.username);
    });

    const fragment = document.createDocumentFragment();
    admins.forEach(admin => {
        const li = document.createElement("li");
        const icon = admin.role === 'super' ? '👑' : '👤';
        const isSelf = admin.username === username;
        const selfClass = isSelf ? 'is-self' : '';
        
        li.innerHTML = `<span class="role-icon">${icon}</span> <span class="username ${selfClass}">${admin.username}</span>`;
        fragment.appendChild(li);
    });
    onlineUsersList.appendChild(fragment);
}


// --- 10. 控制台按鈕功能 ---

const actionResetNumber = async () => {
    const success = await apiRequest("/set-number", { number: 0 });
    if (success) {
        document.getElementById("manualNumber").value = "";
        showToast("✅ 號碼已重置為 0", "success");
    }
};
const actionResetPassed = async () => {
    const success = await apiRequest("/api/passed/clear", {});
    if (success) {
        showToast("✅ 過號列表已清空", "success");
    }
};
const actionResetFeatured = async () => {
    const success = await apiRequest("/api/featured/clear", {});
    if (success) {
        showToast("✅ 精選連結已清空", "success");
    }
};
const actionResetAll = async () => {
    const success = await apiRequest("/reset", {});
    if (success) {
        document.getElementById("manualNumber").value = "";
        showToast("💥 所有資料已重置", "success");
    }
};
async function changeNumber(direction) {
    await apiRequest("/change-number", { direction });
}
async function setNumber() {
    const num = document.getElementById("manualNumber").value;
    if (num === "") return;
    const success = await apiRequest("/set-number", { number: num });
    if (success) {
        document.getElementById("manualNumber").value = "";
        showToast("✅ 號碼已設定", "success");
    }
}
const actionClearAdminLog = async () => {
    showToast("🧼 正在清除日誌...", "info");
    await apiRequest("/api/logs/clear", {});
}

// --- 11. 綁定按鈕事件 ---
document.getElementById("next").onclick = () => changeNumber("next");
document.getElementById("prev").onclick = () => changeNumber("prev");
document.getElementById("setNumber").onclick = setNumber;

setupConfirmationButton(
    document.getElementById("clear-log-btn"),
    "清除日誌",
    "⚠️ 點此確認清除",
    actionClearAdminLog
);
setupConfirmationButton(
    document.getElementById("resetNumber"),
    "重置號碼",
    "⚠️ 點此確認重置",
    actionResetNumber
);
setupConfirmationButton(
    document.getElementById("resetPassed"),
    "重置過號列表",
    "⚠️ 點此確認重置",
    actionResetPassed
);
setupConfirmationButton(
    document.getElementById("resetFeaturedContents"),
    "重置精選連結",
    "⚠️ 點此確認重置",
    actionResetFeatured
);
setupConfirmationButton(
    document.getElementById("resetAll"),
    "💥 重置所有 (點擊確認)",
    "⚠️ 點此確認重置 ⚠️",
    actionResetAll
);

addPassedBtn.onclick = async () => {
    const num = Number(newPassedNumberInput.value);
    if (num <= 0 || !Number.isInteger(num)) {
        alert("請輸入有效的正整數。");
        return;
    }
    addPassedBtn.disabled = true;
    const success = await apiRequest("/api/passed/add", { number: num });
    if (success) {
        newPassedNumberInput.value = "";
    }
    addPassedBtn.disabled = false;
};
addFeaturedBtn.onclick = async () => {
    const text = newLinkTextInput.value.trim();
    const url = newLinkUrlInput.value.trim();
    if (!text || !url) {
        alert("「連結文字」和「網址」都必須填寫。");
        return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        alert("網址請務必以 http:// 或 https:// 開頭。");
        return;
    }
    addFeaturedBtn.disabled = true;
    const success = await apiRequest("/api/featured/add", {
        linkText: text,
        linkUrl: url
    });
    if (success) {
        newLinkTextInput.value = "";
        newLinkUrlInput.value = "";
    }
    addFeaturedBtn.disabled = false;
};

// --- 12. 綁定 Enter 鍵 ---
newPassedNumberInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { addPassedBtn.click(); } });
newLinkTextInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { newLinkUrlInput.focus(); } });
newLinkUrlInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { addFeaturedBtn.click(); } });

// --- 13. 綁定開關 ---
soundToggle.addEventListener("change", () => {
    const isEnabled = soundToggle.checked;
    apiRequest("/set-sound-enabled", { enabled: isEnabled });
});

const publicToggleLabel = document.getElementById("public-toggle-label");
const originalToggleText = "對外開放前台";

publicToggle.addEventListener("change", () => {
    const isPublic = publicToggle.checked;

    if (isPublic) {
        // 從「關閉」切換回「開啟」
        if (publicToggleConfirmTimer) {
            clearTimeout(publicToggleConfirmTimer.timer);
            clearInterval(publicToggleConfirmTimer.interval);
            publicToggleConfirmTimer = null;
            publicToggleLabel.textContent = originalToggleText;
            publicToggleLabel.classList.remove("is-confirming-label");
        }
        apiRequest("/set-public-status", { isPublic: true });
    } else {
        // 從「開啟」切換到「關閉」
        if (publicToggleConfirmTimer) {
            // 正在確認中，執行動作
            clearTimeout(publicToggleConfirmTimer.timer);
            clearInterval(publicToggleConfirmTimer.interval);
            publicToggleConfirmTimer = null;
            publicToggleLabel.textContent = originalToggleText;
            publicToggleLabel.classList.remove("is-confirming-label");
            
            apiRequest("/set-public-status", { isPublic: false });
            
        } else {
            // 首次點擊，開始確認
            publicToggle.checked = true; // 立即取消
            
            let countdown = 5;
            publicToggleLabel.textContent = `⚠️ 點此確認關閉 (${countdown}s)`;
            publicToggleLabel.classList.add("is-confirming-label");

            const interval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    publicToggleLabel.textContent = `⚠️ 點此確認關閉 (${countdown}s)`;
                } else {
                    clearInterval(interval);
                }
            }, 1000);

            const timer = setTimeout(() => {
                clearInterval(interval);
                publicToggleLabel.textContent = originalToggleText;
                publicToggleLabel.classList.remove("is-confirming-label");
                publicToggleConfirmTimer = null;
            }, 5000);
            
            publicToggleConfirmTimer = { timer, interval };
        }
    }
});

// --- 14. 超級管理員功能 ---

const userListUI = document.getElementById("user-list-ui");
const newUserUsernameInput = document.getElementById("new-user-username");
const newUserPasswordInput = document.getElementById("new-user-password");
const addUserBtn = document.getElementById("add-user-btn");

// 載入用戶列表
async function loadAdminUsers() {
    if (userRole !== 'super' || !userListUI) return;
    
    const data = await apiRequest("/api/admin/users", {}, true); 
    
    if (data && data.users) {
        userListUI.innerHTML = "";
        if (data.users.length === 0) {
            userListUI.innerHTML = "<li>(尚無普通管理員)</li>";
            return;
        }
        
        data.users.forEach(user => {
            const li = document.createElement("li");
            li.innerHTML = `<span>${user}</span>`;
            
            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "delete-item-btn";
            deleteBtn.textContent = "×";
            
            const actionCallback = async () => {
                deleteBtn.disabled = true;
                const success = await apiRequest("/api/admin/del-user", { delUsername: user });
                if (success) {
                    showToast(`✅ 已刪除用戶: ${user}`, "success");
                    await loadAdminUsers(); 
                } else {
                    deleteBtn.disabled = false;
                }
            };
            
            setupConfirmationButton(deleteBtn, "×", "⚠️", actionCallback);
            li.appendChild(deleteBtn);
            userListUI.appendChild(li);
        });
    }
}

// 綁定新增用戶按鈕
if (addUserBtn) {
    addUserBtn.onclick = async () => {
        const newUsername = newUserUsernameInput.value;
        const newPassword = newUserPasswordInput.value;

        if (!newUsername || !newPassword) {
            alert("帳號和密碼皆為必填。");
            return;
        }

        addUserBtn.disabled = true;
        const success = await apiRequest("/api/admin/add-user", { newUsername, newPassword });
        
        if (success) {
            showToast(`✅ 已新增用戶: ${newUsername}`, "success");
            newUserUsernameInput.value = "";
            newUserPasswordInput.value = "";
            await loadAdminUsers(); 
        }
        addUserBtn.disabled = false;
    };
}
