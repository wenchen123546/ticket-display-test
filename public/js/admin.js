// --- 1. 元素節點 (DOM) ---
const loginContainer = document.getElementById("login-container");
const adminPanel = document.getElementById("admin-panel");
const usernameInput = document.getElementById("username-input"); 
const passwordInput = document.getElementById("password-input");
const loginButton = document.getElementById("login-button");
const loginError = document.getElementById("login-error");
const numberEl = document.getElementById("number");
const statusBar = document.getElementById("status-bar");
// (主要控制台卡片元素)
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
const resetAllConfirmBtn = document.getElementById("resetAllConfirm");

// 【修正】 移除頂部 Super Admin 元素的宣告，改在函式內取得。
const superAdminCard = document.getElementById("card-superadmin");


// --- 2. 全域變數 ---
let token = sessionStorage.getItem('admin_jwt') || ""; 
let userRole = sessionStorage.getItem('admin_role') || ""; 
let resetAllTimer = null;
let toastTimer = null; 

// --- 3. Socket.io ---
const socket = io({ 
    autoConnect: false,
    auth: () => {
        return { token: token }; 
    }
});

// --- 4. Toast 通知函式 ---
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

// --- 5. 登入/顯示邏輯 ---
function showLogin() {
    loginContainer.style.display = "block";
    adminPanel.style.display = "none";
    document.title = "後台管理 - 登入";
    token = ""; 
    userRole = ""; 
    sessionStorage.removeItem('admin_jwt'); 
    sessionStorage.removeItem('admin_role');
    socket.disconnect();
}

async function showPanel() {
    loginContainer.style.display = "none";
    adminPanel.style.display = "block";
    document.title = "後台管理 - 控制台";

    if (userRole === 'superadmin') {
        superAdminCard.style.display = "block";
        initSuperAdminBindings(); 
        loadAdmins(); 
    } else {
        superAdminCard.style.display = "none";
    }
    
    if (!socket.connected) {
        socket.connect();
    }
    
    showToast("ℹ️ 使用預設排版", "info"); 
}

async function attemptLogin() {
    const username = usernameInput.value;
    const password = passwordInput.value;
    if (!username || !password) {
        loginError.textContent = "請輸入使用者名稱和密碼。";
        return;
    }

    loginError.textContent = "驗證中...";
    try {
        const res = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username, password: password }),
        });

        const data = await res.json();

        if (res.ok && data.token) {
            token = data.token; 
            userRole = data.role; 
            sessionStorage.setItem('admin_jwt', token); 
            sessionStorage.setItem('admin_role', userRole);
            await showPanel(); 
        } else {
            loginError.textContent = data.error || "登入失敗";
            showLogin();
        }
    } catch (err) {
        console.error("Login 失敗:", err);
        loginError.textContent = "網路錯誤或伺服器無回應。";
    }
}

document.addEventListener("DOMContentLoaded", () => { 
    if (token && userRole) {
        console.log("偵測到 sessionStorage 中的 JWT，嘗試直接登入...");
        showPanel(); 
    } else {
        showLogin();
    }
});

loginButton.addEventListener("click", attemptLogin);
passwordInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { attemptLogin(); } });
usernameInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { passwordInput.focus(); } });

// --- 6. 控制台 Socket 監聽器 ---
socket.on("connect", () => {
    console.log("Socket.io 已連接 (Admin)");
    statusBar.classList.remove("visible");
    showToast("✅ 已連線到伺服器", "success");
});
socket.on("disconnect", () => {
    console.warn("Socket.io 已斷線");
    statusBar.classList.add("visible");
    showToast("❌ 已從伺服器斷線", "error");
});
socket.on("connect_error", (err) => {
    console.error("Socket 連線失敗:", err.message);
    if (err.message.includes("Authentication failed")) { 
        alert("認證已過期或無效，請重新登入。");
        showLogin(); 
    }
});

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
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify(body), 
        });
        
        const responseData = await res.json(); 

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                alert("認證已過期，請重新登入。");
                showLogin();
            } else {
                const errorMsg = responseData.error || "未知錯誤";
                showToast(`❌ API 錯誤: ${errorMsg}`, "error");
            }
            return false;
        }

        if (a_returnResponse) {
            return responseData; 
        }
        
        return true; 
    } catch (err) {
        showToast(`❌ 網路連線失敗: ${err.message}`, "error");
        return false;
    }
}

// --- 8. GUI 渲染函式 ---
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
        deleteBtn.onclick = async () => {
            if (confirm(`確定要刪除過號 ${number} 嗎？`)) {
                deleteBtn.disabled = true;
                await apiRequest("/api/passed/remove", { number: number });
            }
        };
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
        
        deleteBtn.onclick = async () => {
            if (confirm(`確定要刪除連結 ${item.linkText} 嗎？`)) { 
                deleteBtn.disabled = true;
                await apiRequest("/api/featured/remove", {
                    linkText: item.linkText,
                    linkUrl: item.linkUrl
                });
            }
        };
        li.appendChild(deleteBtn);
        fragment.appendChild(li);
    });
    featuredListUI.appendChild(fragment);
}

// --- 9. 控制台按鈕功能 ---
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
async function resetNumber() {
    if (!confirm("確定要將「目前號碼」重置為 0 嗎？")) return;
    const success = await apiRequest("/set-number", { number: 0 });
    if (success) {
        document.getElementById("manualNumber").value = "";
        showToast("✅ 號碼已重置為 0", "success");
    }
}
async function resetPassed_fixed() {
    if (!confirm("確定要清空「已叫號碼(過號)」列表嗎？")) return;
    const success = await apiRequest("/api/passed/clear", {});
    if (success) {
        showToast("✅ 過號列表已清空", "success");
    }
}
async function resetFeaturedContents_fixed() {
    if (!confirm("確定要清空「精選連結」嗎？")) return;
    const success = await apiRequest("/api/featured/clear", {});
    if (success) {
        showToast("✅ 精選連結已清空", "success");
    }
}
function cancelResetAll() {
    resetAllConfirmBtn.style.display = "none";
    resetAllBtn.style.display = "block";
    if (resetAllTimer) {
        clearTimeout(resetAllTimer);
        resetAllTimer = null;
    }
}
async function confirmResetAll() {
    const success = await apiRequest("/reset", {});
    if (success) {
        document.getElementById("manualNumber").value = "";
        showToast("💥 所有資料已重置", "success");
    }
    cancelResetAll();
}
function requestResetAll() {
    resetAllBtn.style.display = "none";
    resetAllConfirmBtn.style.display = "block";
    resetAllTimer = setTimeout(() => {
        cancelResetAll();
    }, 5000);
}

async function clearAdminLog() {
    if (confirm("確定要永久清除「所有」管理員的操作日誌嗎？\n此動作無法復原。")) {
        showToast("🧼 正在清除日誌...", "info");
        await apiRequest("/api/logs/clear", {});
    }
}

// --- 10. 綁定按鈕事件 ---
document.getElementById("next").onclick = () => changeNumber("next");
document.getElementById("prev").onclick = () => changeNumber("prev");
document.getElementById("setNumber").onclick = setNumber;
document.getElementById("resetNumber").onclick = resetNumber;
document.getElementById("resetFeaturedContents").onclick = resetFeaturedContents_fixed;
document.getElementById("resetPassed").onclick = resetPassed_fixed;
resetAllBtn.onclick = requestResetAll;
resetAllConfirmBtn.onclick = confirmResetAll;
clearLogBtn.onclick = clearAdminLog; 

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

// --- 11. 綁定 Enter 鍵 ---
newPassedNumberInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { addPassedBtn.click(); } });
newLinkTextInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { newLinkUrlInput.focus(); } });
newLinkUrlInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { addFeaturedBtn.click(); } });

// --- 12. 綁定開關 ---
soundToggle.addEventListener("change", () => {
    const isEnabled = soundToggle.checked;
    apiRequest("/set-sound-enabled", { enabled: isEnabled });
});
publicToggle.addEventListener("change", () => {
    const isPublic = publicToggle.checked;
    if (!isPublic) {
        if (!confirm("確定要關閉前台嗎？\n所有使用者將會看到「維護中」畫面。")) {
            publicToggle.checked = true; 
            return;
        }
    }
    apiRequest("/set-public-status", { isPublic: isPublic });
});

// --- 13. 【新增】 Super Admin 功能函式和綁定 ---

// 【最終修正】 初始化 Super Admin 按鈕綁定
function initSuperAdminBindings() {
    // 這次直接在函式內部取得元素，確保它們在 DOM 顯示後才被引用。
    const adminListUI_local = document.getElementById("admin-list-ui");
    const refreshAdminListBtn_local = document.getElementById("refresh-admin-list");
    const newAdminUsernameInput_local = document.getElementById("new-admin-username");
    const newAdminPasswordInput_local = document.getElementById("new-admin-password");
    const newAdminRoleSelect_local = document.getElementById("new-admin-role");
    const addAdminBtn_local = document.getElementById("add-admin-btn");
    const setPwUsernameInput_local = document.getElementById("set-pw-username");
    const setNewPasswordInput_local = document.getElementById("set-pw-new-password");
    const setPwBtn_local = document.getElementById("set-pw-btn");
    
    // 綁定事件，並使用新的本地變數
    if (refreshAdminListBtn_local) refreshAdminListBtn_local.onclick = loadAdmins;
    if (addAdminBtn_local) addAdminBtn_local.onclick = addAdmin;
    if (setPwBtn_local) setPwBtn_local.onclick = setAdminPassword;
    
    // 重新定義 loadAdmins，使用本地變數
    async function loadAdmins() {
        if (!adminListUI_local) return; // 安全檢查
        adminListUI_local.innerHTML = "<li>正在載入...</li>";
        const data = await apiRequest("/api/admin/list", {}, true);
        if (data && data.admins) {
            adminListUI_local.innerHTML = "";
            data.admins.forEach(admin => {
                const li = document.createElement("li");
                li.innerHTML = `<span>${admin.username} (<strong>${admin.role}</strong>)</span>`;
                
                const myUsername = jwt_decode(token) ? jwt_decode(token).username : null;

                if (admin.username !== myUsername) { 
                    const deleteBtn = document.createElement("button");
                    deleteBtn.type = "button";
                    deleteBtn.className = "delete-item-btn";
                    deleteBtn.textContent = "×";
                    deleteBtn.onclick = () => deleteAdmin(admin.username);
                    li.appendChild(deleteBtn);
                }
                adminListUI_local.appendChild(li);
            });
        } else {
            adminListUI_local.innerHTML = "<li>載入失敗</li>";
        }
    }
    
    // 重新定義 addAdmin，使用本地變數
    async function addAdmin() {
        const username = newAdminUsernameInput_local.value;
        const password = newAdminPasswordInput_local.value;
        const role = newAdminRoleSelect_local.value;

        if (!username || !password) {
            showToast("❌ 使用者名稱和密碼為必填", "error");
            return;
        }

        const success = await apiRequest("/api/admin/add", { username, password, role });
        if (success) {
            showToast("✅ 管理員已新增", "success");
            newAdminUsernameInput_local.value = "";
            newAdminPasswordInput_local.value = "";
            loadAdmins(); 
        }
    }

    // 重新定義 setAdminPassword，使用本地變數
    async function setAdminPassword() {
        const username = setPwUsernameInput_local.value;
        const newPassword = setNewPasswordInput_local.value;

        if (!username || !newPassword) {
            showToast("❌ 請輸入使用者名稱和新密碼", "error");
            return;
        }

        if (!confirm(`確定要重設 ${username} 的密碼嗎？`)) return;

        const success = await apiRequest("/api/admin/set-password", { username, newPassword });
        if (success) {
            showToast(`✅ ${username} 的密碼已重設`, "success");
            setPwUsernameInput_local.value = "";
            setNewPasswordInput_local.value = "";
        }
    }
}


// (簡易的 JWT 解碼函式)
function jwt_decode(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}
