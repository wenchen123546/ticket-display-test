/*
 * ==========================================
 * 後台邏輯 (admin.js) - v18.17 Optimized (Login Fix)
 * ==========================================
 */

// [新增] 防抖動工具函式
function debounce(func, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

const adminI18n = {
    "zh-TW": {
        "status_disconnected": "連線中斷，正在嘗試重新連線...",
        "status_connected": "✅ 已連線",
        "admin_label_current": "目前叫號",
        "admin_label_issued": "已發號至",
        "admin_label_waiting": "等待組數",
        "card_title_calling": "叫號控制",
        "card_title_ticketing": "發號機設定",
        "card_title_broadcast": "廣播與音效",
        "card_title_editor": "過號與公告",
        "card_title_logs": "操作日誌",
        "card_title_system": "系統設定",
        "card_title_stats": "數據分析",
        "card_title_links": "精選連結",
        "card_title_online": "在線管理員",
        "card_title_line": "LINE 通知設定",
        "btn_prev": "上一號",
        "btn_next": "下一號",
        "btn_pass": "過號", 
        "btn_issue_prev": "收回",
        "btn_issue_next": "發號",
        "btn_set": "設定",
        "btn_reset_call": "↺ 重置叫號歸零",
        "btn_broadcast": "發送",
        "placeholder_broadcast": "輸入內容...",
        "hint_manual_set": "直接設定「目前叫號」螢幕顯示的數字",
        "label_public_toggle": "🌐 對外開放前台",
        "label_sound_toggle": "啟用前台提示音",
        "btn_reset_all": "💥 全域重置系統",
        "login_verifying": "驗證中...",
        "login_fail": "登入失敗",
        "login_error_server": "無法連線到伺服器",
        "toast_permission_denied": "❌ 權限不足",
        "toast_session_expired": "Session 已過期，請重新登入",
        "toast_mode_switched": "✅ 模式已切換",
        "confirm_switch_mode": "確定要切換為「%s」模式嗎？",
        "mode_ticketing": "線上取號",
        "mode_input": "手動輸入",
        "toast_num_set": "✅ 號碼已設定",
        "toast_issued_updated": "✅ 已發號碼已更新",
        "toast_reset_zero": "✅ 號碼已重置為 0",
        "toast_passed_cleared": "✅ 過號列表已清空",
        "toast_featured_cleared": "✅ 精選連結已清空",
        "toast_all_reset": "💥 所有資料已重置",
        "toast_log_clearing": "🧼 正在清除日誌...",
        "alert_positive_int": "請輸入有效的正整數。",
        "alert_link_required": "「連結文字」和「網址」必填。",
        "alert_url_invalid": "網址需以 http(s):// 開頭。",
        "alert_broadcast_empty": "請輸入廣播內容",
        "toast_broadcast_sent": "📢 廣播已發送",
        "label_confirm_close": "⚠️ 點此確認關閉",
        "toast_stats_cleared": "🗑️ 統計數據已清空",
        "toast_report_downloaded": "✅ 報表下載成功",
        "toast_download_fail": "❌ 下載失敗: ",
        "toast_line_updated": "✅ LINE 文案已更新",
        "toast_line_reset": "↺ 已恢復預設文案",
        "toast_pwd_saved": "✅ 解鎖密碼已設定",
        "alert_pwd_empty": "密碼不可為空",
        "alert_account_required": "帳號和密碼必填。",
        "alert_nick_required": "請輸入帳號與新暱稱",
        "list_loading": "載入中...",
        "list_no_data": "尚無數據",
        "list_load_fail": "載入失敗",
        "list_no_online": "(目前無人在線)",
        "log_no_data": "[目前尚無日誌]",
        "btn_clear_log": "清除紀錄",
        "btn_reset_passed": "清空過號列表",
        "btn_reset_links": "清空連結",
        "toast_passed_marked": "⏩ 已標記過號，跳至下一號",
        "toast_recalled": "↩️ 已重呼過號"
    },
    "en": {
        "status_disconnected": "Disconnected, reconnecting...",
        "status_connected": "✅ Connected",
        "admin_label_current": "CURRENT",
        "admin_label_issued": "ISSUED",
        "admin_label_waiting": "WAITING",
        "card_title_calling": "Calling Control",
        "card_title_ticketing": "Ticketing",
        "card_title_broadcast": "Broadcast & Sound",
        "card_title_editor": "Passed & Notices",
        "card_title_logs": "Logs",
        "card_title_system": "System",
        "card_title_stats": "Analytics",
        "card_title_links": "Links",
        "card_title_online": "Online Admins",
        "card_title_line": "LINE Settings",
        "btn_prev": "Prev",
        "btn_next": "Next",
        "btn_pass": "Skip",
        "btn_issue_prev": "Recall",
        "btn_issue_next": "Issue",
        "btn_set": "Set",
        "btn_reset_call": "↺ Reset Current",
        "btn_broadcast": "Send",
        "placeholder_broadcast": "Type message...",
        "hint_manual_set": "Manually set the display number",
        "label_public_toggle": "🌐 Public Access",
        "label_sound_toggle": "Frontend Sound",
        "btn_reset_all": "💥 Global Reset",
        "login_verifying": "Verifying...",
        "login_fail": "Login Failed",
        "login_error_server": "Server Error",
        "toast_permission_denied": "❌ Permission Denied",
        "toast_session_expired": "Session expired, login again",
        "toast_mode_switched": "✅ Mode switched",
        "confirm_switch_mode": "Switch to '%s' mode?",
        "mode_ticketing": "Online Ticket",
        "mode_input": "Manual Input",
        "toast_num_set": "✅ Number set",
        "toast_issued_updated": "✅ Issued number updated",
        "toast_reset_zero": "✅ Reset to 0",
        "toast_passed_cleared": "✅ Passed list cleared",
        "toast_featured_cleared": "✅ Links cleared",
        "toast_all_reset": "💥 System Reset Complete",
        "toast_log_clearing": "🧼 Clearing logs...",
        "alert_positive_int": "Positive integer only.",
        "alert_link_required": "Text and URL required.",
        "alert_url_invalid": "Must start with http(s)://",
        "alert_broadcast_empty": "Message is empty",
        "toast_broadcast_sent": "📢 Broadcast sent",
        "label_confirm_close": "⚠️ Click to Confirm",
        "toast_stats_cleared": "🗑️ Stats cleared",
        "toast_report_downloaded": "✅ Report downloaded",
        "toast_download_fail": "❌ Download failed: ",
        "toast_line_updated": "✅ LINE settings updated",
        "toast_line_reset": "↺ Reset to default",
        "toast_pwd_saved": "✅ Password saved",
        "alert_pwd_empty": "Password empty",
        "alert_account_required": "Username and password required.",
        "alert_nick_required": "Enter username and new nickname",
        "list_loading": "Loading...",
        "list_no_data": "No Data",
        "list_load_fail": "Load Failed",
        "list_no_online": "(No one online)",
        "log_no_data": "[No logs yet]",
        "btn_clear_log": "Clear Logs",
        "btn_reset_passed": "Clear List",
        "btn_reset_links": "Clear Links",
        "toast_passed_marked": "⏩ Skipped to next",
        "toast_recalled": "↩️ Number recalled"
    }
};

let currentAdminLang = localStorage.getItem('callsys_lang') || 'zh-TW';
let at = adminI18n[currentAdminLang];

function applyAdminI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if(at[key]) { el.textContent = at[key]; }
    });
    const broadcastInput = document.getElementById("broadcast-msg");
    if(broadcastInput) broadcastInput.placeholder = at["placeholder_broadcast"];
}

// --- DOM ---
const loginContainer = document.getElementById("login-container");
const adminPanel = document.getElementById("admin-panel");
const usernameInput = document.getElementById("username-input");
const passwordInput = document.getElementById("password-input");
const loginButton = document.getElementById("login-button");
const loginError = document.getElementById("login-error");
const sidebarUserInfo = document.getElementById("sidebar-user-info");

// --- Global Vars ---
let token = "";
let userRole = "normal";
let username = "";
let uniqueUsername = "";
let toastTimer = null;
let publicToggleConfirmTimer = null;
let editingHour = null;

// --- Socket ---
const socket = io({ autoConnect: false, auth: { token: "" } });

function initTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section-group');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sections.forEach(sec => {
                if(sec.id === targetId) {
                    sec.classList.add('active');
                    if(targetId === 'section-stats') loadStats();
                } else {
                    sec.classList.remove('active');
                }
            });
        });
    });
}

function showLogin() {
    loginContainer.style.display = "block";
    adminPanel.style.display = "none";
    document.title = "後台管理 - 登入";
    socket.disconnect();
}

async function showPanel() {
    loginContainer.style.display = "none";
    adminPanel.style.display = "flex"; 
    document.title = `後台管理 - ${username}`;
    if(sidebarUserInfo) sidebarUserInfo.textContent = `Hi, ${username}`;

    // 權限檢查和 UI 顯示
    const isSuper = userRole === 'super';
    const elementsToToggle = [
        "card-user-management", "btn-export-csv", 
        "mode-switcher-group", "unlock-pwd-group"
    ];
    elementsToToggle.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = isSuper ? "block" : "none";
    });
    
    if (isSuper) await loadAdminUsers();
    
    initTabs();
    await loadStats();
    await loadLineSettings();
    socket.connect();
}

// [修改] 優化後的登入函式：防止按鈕重複點擊
async function attemptLogin(loginName, loginPass) {
    // 1. 防止重複點擊
    if (loginButton.disabled) return;

    // 2. 鎖定按鈕並顯示載入中
    loginButton.disabled = true;
    const originalBtnText = loginButton.textContent;
    loginButton.textContent = at["login_verifying"] || "驗證中...";
    loginError.textContent = "";

    try {
        const res = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: loginName, password: loginPass }),
        });
        const data = await res.json();
        
        if (!res.ok) {
            // 顯示錯誤訊息
            loginError.textContent = data.error || (data.message && data.message.error) || at["login_fail"];
            
            // 登入失敗，解鎖按鈕
            showLogin(); 
            loginButton.disabled = false;
            loginButton.textContent = originalBtnText;
        } else {
            // 登入成功
            token = data.token;
            userRole = data.role;
            username = data.nickname;
            uniqueUsername = data.username;
            socket.auth.token = token;
            
            // 成功後不需要解鎖按鈕，因為畫面會切換
            await showPanel();
            
            // 恢復按鈕狀態 (以防登出後回來)
            loginButton.disabled = false;
            loginButton.textContent = originalBtnText;
        }
    } catch (err) {
        console.error("attemptLogin 失敗:", err);
        loginError.textContent = at["login_error_server"];
        
        // 發生錯誤，解鎖按鈕
        loginButton.disabled = false;
        loginButton.textContent = originalBtnText;
        return false;
    }
}

document.addEventListener("DOMContentLoaded", () => { 
    const adminLangSelector = document.getElementById('admin-lang-selector');
    if(adminLangSelector) {
        adminLangSelector.value = currentAdminLang;
        adminLangSelector.addEventListener('change', (e) => {
            currentAdminLang = e.target.value;
            localStorage.setItem('callsys_lang', currentAdminLang);
            at = adminI18n[currentAdminLang];
            applyAdminI18n();
            loadStats();
        });
    }
    applyAdminI18n();
    showLogin(); 
});

loginButton.addEventListener("click", () => { attemptLogin(usernameInput.value, passwordInput.value); });

usernameInput.addEventListener("keyup", debounce((event) => { 
    if (event.key === "Enter") { passwordInput.focus(); } 
}, 300));

passwordInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { attemptLogin(usernameInput.value, passwordInput.value); } });

function showToast(message, type = 'info') {
    const toast = document.getElementById("toast-notification");
    if (!toast) return;
    toast.textContent = message;
    toast.className = type;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove("show"); }, 3000);
}

// --- Socket Events ---
socket.on("connect", () => {
    document.getElementById("status-bar").classList.remove("visible");
    showToast(`${at["status_connected"]} (${username})`, "success");
});
socket.on("disconnect", () => {
    document.getElementById("status-bar").classList.add("visible");
    showToast(at["status_disconnected"], "error");
});
socket.on("updateQueue", (data) => {
    document.getElementById("number").textContent = data.current;
    document.getElementById("issued-number").textContent = data.issued;
    document.getElementById("waiting-count").textContent = Math.max(0, data.issued - data.current);
    loadStats();
});
socket.on("update", (num) => { document.getElementById("number").textContent = num; loadStats(); });
socket.on("updatePassed", (numbers) => renderPassedListUI(numbers));
socket.on("updateFeaturedContents", (contents) => renderFeaturedListUI(contents));

socket.on("initAdminLogs", (logs) => renderLogs(logs, true));
socket.on("newAdminLog", (log) => renderLogs([log], false));
socket.on("updateOnlineAdmins", (admins) => renderOnlineAdmins(admins));
socket.on("updateSoundSetting", (enabled) => document.getElementById("sound-toggle").checked = enabled);
socket.on("updatePublicStatus", (isPublic) => document.getElementById("public-toggle").checked = isPublic);
socket.on("updateSystemMode", (mode) => {
    const radios = document.getElementsByName("systemMode");
    for(let r of radios) { if(r.value === mode) r.checked = true; }
});

function renderLogs(logs, isInit) {
    const ui = document.getElementById("admin-log-ui");
    
    if(isInit) ui.replaceChildren();

    if(!logs || logs.length === 0) {
        if(isInit) {
            const li = document.createElement("li");
            li.textContent = at["log_no_data"];
            ui.appendChild(li);
        }
        return;
    }
    
    // 如果初始狀態是 (載入中...) 或 [目前尚無日誌]，則清空
    if(isInit && ui.firstElementChild && (ui.firstElementChild.textContent.includes("載入中") || ui.firstElementChild.textContent.includes("尚無"))) {
        ui.replaceChildren();
    }
    
    const fragment = document.createDocumentFragment();
    logs.forEach(logMsg => {
        const li = document.createElement("li");
        li.textContent = logMsg; 
        fragment.appendChild(li);
    });

    if(isInit) {
        ui.appendChild(fragment);
    } else {
        ui.appendChild(fragment); 
    }
    ui.scrollTop = ui.scrollHeight;
}

// --- API Wrapper ---
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
                if(responseData.error === "權限不足" || responseData.error === "Permission Denied") { 
                    showToast(at["toast_permission_denied"], "error"); 
                } else { 
                    showToast(at["toast_session_expired"], "error"); 
                    showLogin(); 
                }
            } else { 
                showToast(`❌ 錯誤: ${responseData.error || '未知錯誤'}`, "error"); 
            }
            return false;
        }
        return a_returnResponse ? responseData : true;
    } catch (err) { 
        showToast(`❌ 連線失敗: ${err.message}`, "error"); 
        return false; 
    }
}

// --- Render Functions ---
function setupConfirmationButton(buttonEl, originalTextKey, confirmTextKey, actionCallback) {
    if (!buttonEl) return;
    let timer = null; let isConfirming = false; let countdown = 5;
    const getTxt = (key) => at[key] || key;
    
    // 根據 confirmTextKey 決定確認文案
    let confirmTxtBase;
    if (confirmTextKey === "btn_confirm_clear") {
        confirmTxtBase = at["zh-TW"] ? "⚠️ 確認清除" : "⚠️ Confirm Clear";
    } else if (confirmTextKey === "btn_confirm_reset") {
        confirmTxtBase = at["zh-TW"] ? "⚠️ 確認重置" : "⚠️ Confirm Reset";
    } else {
        // 適用於 list 元素的刪除按鈕 (✕ -> ⚠️)
        confirmTxtBase = "⚠️"; 
    }

    const resetBtn = () => {
        clearInterval(timer); isConfirming = false; countdown = 5;
        // 如果是刪除按鈕，originalTextKey 可能是 "✕"
        buttonEl.textContent = originalTextKey; 
        buttonEl.classList.remove("is-confirming");
    };
    
    buttonEl.addEventListener("click", () => {
        if (isConfirming) { actionCallback(); resetBtn(); } else {
            isConfirming = true; countdown = 5;
            buttonEl.textContent = `${confirmTxtBase} (${countdown}s)`;
            buttonEl.classList.add("is-confirming");
            
            timer = setInterval(() => {
                countdown--;
                if (countdown > 0) buttonEl.textContent = `${confirmTxtBase} (${countdown}s)`;
                else resetBtn();
            }, 1000);
        }
    });
}

function renderPassedListUI(numbers) {
    const ui = document.getElementById("passed-list-ui");
    ui.replaceChildren(); 

    if (!Array.isArray(numbers)) return;
    const fragment = document.createDocumentFragment();
    
    numbers.forEach((number) => {
        const li = document.createElement("li");
        
        const leftDiv = document.createElement("div"); 
        leftDiv.style.display = "flex"; leftDiv.style.gap = "10px"; leftDiv.style.alignItems = "center";
        
        const numSpan = document.createElement("span"); 
        numSpan.textContent = number; 
        numSpan.style.fontWeight = "bold";
        
        const recallBtn = document.createElement("button");
        recallBtn.className = "btn-secondary"; 
        recallBtn.style.padding = "2px 8px"; recallBtn.style.fontSize = "0.8rem";
        recallBtn.textContent = at["zh-TW"] ? "↩️ 重呼" : "↩️ Recall";
        recallBtn.onclick = async () => { 
            if(confirm(`${at["zh-TW"] ? '確定要插隊重呼' : 'Confirm recall'} ${number} 號嗎？`)) { 
                await apiRequest("/api/control/recall-passed", { number }); 
                showToast(at["toast_recalled"], "success"); 
            } 
        };
        
        leftDiv.appendChild(numSpan); leftDiv.appendChild(recallBtn); li.appendChild(leftDiv);
        
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-item-btn"; 
        deleteBtn.textContent = "✕";
        
        // 統一使用 setupConfirmationButton
        setupConfirmationButton(deleteBtn, "✕", "⚠️", async () => { 
            deleteBtn.disabled = true; 
            await apiRequest("/api/passed/remove", { number }); 
        });
        
        li.appendChild(deleteBtn);
        fragment.appendChild(li);
    });
    ui.appendChild(fragment);
}

function renderFeaturedListUI(contents) {
    const ui = document.getElementById("featured-list-ui");
    ui.replaceChildren();

    if (!Array.isArray(contents)) return;
    const fragment = document.createDocumentFragment();
    
    contents.forEach((item) => {
        const li = document.createElement("li");
        
        const span = document.createElement("span");
        span.style.wordBreak = "break-all"; 
        span.style.whiteSpace = "normal";
        
        const textNode = document.createTextNode(item.linkText);
        const br = document.createElement("br");
        const small = document.createElement("small");
        small.style.color = "#666";
        small.textContent = item.linkUrl;
        
        span.appendChild(textNode);
        span.appendChild(br);
        span.appendChild(small);
        
        li.appendChild(span);
        
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-item-btn"; 
        deleteBtn.textContent = "✕";
        
        // 統一使用 setupConfirmationButton
        setupConfirmationButton(deleteBtn, "✕", "⚠️", async () => { 
            deleteBtn.disabled = true; 
            await apiRequest("/api/featured/remove", { linkText: item.linkText, linkUrl: item.linkUrl }); 
        });
        
        li.appendChild(deleteBtn);
        fragment.appendChild(li);
    });
    ui.appendChild(fragment);
}

function renderOnlineAdmins(admins) {
    const ui = document.getElementById("online-users-list");
    if (!ui) return;
    ui.replaceChildren();

    if (!admins || admins.length === 0) { 
        const li = document.createElement("li");
        li.textContent = at["list_no_online"];
        ui.appendChild(li);
        return; 
    }
    
    admins.sort((a, b) => {
        if (a.username === uniqueUsername) return -1;
        if (b.username === uniqueUsername) return 1;
        if (a.role === 'super' && b.role !== 'super') return -1;
        if (a.role !== 'super' && b.role === 'super') return 1;
        return a.nickname.localeCompare(b.nickname);
    });
    
    const fragment = document.createDocumentFragment();
    admins.forEach(admin => {
        const li = document.createElement("li");
        const icon = admin.role === 'super' ? '👑' : '👤';
        
        const iconSpan = document.createElement("span");
        iconSpan.className = "role-icon";
        iconSpan.textContent = icon;
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "username";
        if(admin.username === uniqueUsername) nameSpan.classList.add("is-self");
        nameSpan.textContent = ` ${admin.nickname}`;
        
        li.appendChild(iconSpan);
        li.appendChild(nameSpan);
        
        fragment.appendChild(li);
    });
    ui.appendChild(fragment);
}

const btnCallPrev = document.getElementById("btn-call-prev");
const btnCallNext = document.getElementById("btn-call-next");
const btnMarkPassed = document.getElementById("btn-mark-passed"); 
const btnIssuePrev = document.getElementById("btn-issue-prev");
const btnIssueNext = document.getElementById("btn-issue-next");

// 號碼控制 API 更新
if(btnCallPrev) btnCallPrev.onclick = () => apiRequest("/api/control/call", { direction: "prev" });
if(btnCallNext) btnCallNext.onclick = () => apiRequest("/api/control/call", { direction: "next" });

if(btnMarkPassed) btnMarkPassed.onclick = async () => {
    btnMarkPassed.disabled = true;
    if(await apiRequest("/api/control/pass-current", {})) showToast(at["toast_passed_marked"], "warning");
    btnMarkPassed.disabled = false;
};

if(btnIssuePrev) btnIssuePrev.onclick = () => apiRequest("/api/control/issue", { direction: "prev" });
if(btnIssueNext) btnIssueNext.onclick = () => apiRequest("/api/control/issue", { direction: "next" });

document.getElementById("setNumber").onclick = async () => {
    const num = document.getElementById("manualNumber").value;
    const n = Number(num);
    if (num === "" || n <= 0 || !Number.isInteger(n)) return showToast(at["alert_positive_int"], "error");
    if (await apiRequest("/api/control/set-call", { number: num })) { 
        document.getElementById("manualNumber").value = ""; 
        showToast(at["toast_num_set"], "success"); 
    }
};

const setIssuedBtn = document.getElementById("setIssuedNumber");
if(setIssuedBtn) setIssuedBtn.onclick = async () => {
    const num = document.getElementById("manualIssuedNumber").value;
    const n = Number(num);
    if (num === "" || n < 0 || !Number.isInteger(n)) return showToast(at["alert_positive_int"], "error");
    if (await apiRequest("/api/control/set-issue", { number: num })) {
        document.getElementById("manualIssuedNumber").value = "";
        showToast(at["toast_issued_updated"], "success");
    }
};

setupConfirmationButton(document.getElementById("resetNumber"), "btn_reset_call", "btn_confirm_reset", async () => { if (await apiRequest("/api/control/set-call", { number: 0 })) { document.getElementById("manualNumber").value = ""; showToast(at["toast_reset_zero"], "success"); } });
setupConfirmationButton(document.getElementById("resetPassed"), "btn_reset_passed", "btn_confirm_reset", async () => { if (await apiRequest("/api/passed/clear", {})) showToast(at["toast_passed_cleared"], "success"); });
setupConfirmationButton(document.getElementById("resetFeaturedContents"), "btn_reset_links", "btn_confirm_reset", async () => { if (await apiRequest("/api/featured/clear", {})) showToast(at["toast_featured_cleared"], "success"); });
setupConfirmationButton(document.getElementById("resetAll"), "btn_reset_all", "btn_confirm_reset", async () => { if (await apiRequest("/reset", {})) { document.getElementById("manualNumber").value = ""; showToast(at["toast_all_reset"], "success"); await loadStats(); } });

const newPassedNumberInput = document.getElementById("new-passed-number");
const addPassedBtn = document.getElementById("add-passed-btn");
if(addPassedBtn) addPassedBtn.onclick = async () => {
    const num = Number(newPassedNumberInput.value);
    if (num <= 0 || !Number.isInteger(num)) return showToast(at["alert_positive_int"], "error");
    addPassedBtn.disabled = true;
    if (await apiRequest("/api/passed/add", { number: num })) newPassedNumberInput.value = "";
    addPassedBtn.disabled = false;
};
if(newPassedNumberInput) newPassedNumberInput.addEventListener("keyup", (event) => { if (event.key === "Enter") addPassedBtn.click(); });

const newLinkTextInput = document.getElementById("new-link-text");
const newLinkUrlInput = document.getElementById("new-link-url");
const addFeaturedBtn = document.getElementById("add-featured-btn");
if(addFeaturedBtn) addFeaturedBtn.onclick = async () => {
    const text = newLinkTextInput.value.trim();
    const url = newLinkUrlInput.value.trim();
    if (!text || !url) return showToast(at["alert_link_required"], "error");
    if (!url.startsWith('http://') && !url.startsWith('https://')) return showToast(at["alert_url_invalid"], "error");
    addFeaturedBtn.disabled = true;
    if (await apiRequest("/api/featured/add", { linkText: text, linkUrl: url })) { newLinkTextInput.value = ""; newLinkUrlInput.value = ""; }
    addFeaturedBtn.disabled = false;
};
if(newLinkTextInput) newLinkTextInput.addEventListener("keyup", (event) => { if (event.key === "Enter") newLinkUrlInput.focus(); });
if(newLinkUrlInput) newLinkUrlInput.addEventListener("keyup", (event) => { if (event.key === "Enter") addFeaturedBtn.click(); });

const broadcastBtn = document.getElementById("btn-broadcast");
const broadcastInput = document.getElementById("broadcast-msg");
if (broadcastBtn) {
    broadcastBtn.onclick = async () => {
        const msg = broadcastInput.value.trim();
        if (!msg) return showToast(at["alert_broadcast_empty"], "error");
        broadcastBtn.disabled = true;
        if (await apiRequest("/api/admin/broadcast", { message: msg })) { showToast(at["toast_broadcast_sent"], "success"); broadcastInput.value = ""; }
        broadcastBtn.disabled = false;
    };
    broadcastInput.addEventListener("keyup", (e) => { if (e.key === "Enter") broadcastBtn.click(); });
}

const soundToggle = document.getElementById("sound-toggle");
const publicToggle = document.getElementById("public-toggle");
// admin.html 中沒有 public-toggle-label，這裡使用 publicToggle 的父層元素
const publicToggleLabel = publicToggle ? publicToggle.closest('.system-toggle-group').querySelector('label[for="public-toggle"]') : null; 

if(soundToggle) soundToggle.addEventListener("change", () => { apiRequest("/set-sound-enabled", { enabled: soundToggle.checked }); });
if(publicToggle && publicToggleLabel) publicToggle.addEventListener("change", () => {
    const isPublic = publicToggle.checked;
    const originalText = publicToggleLabel.getAttribute('data-i18n') ? at[publicToggleLabel.getAttribute('data-i18n')] : '🌐 對外開放前台頁面';
    
    if (isPublic) {
        if (publicToggleConfirmTimer) { 
            clearInterval(publicToggleConfirmTimer.interval); clearTimeout(publicToggleConfirmTimer.timer); 
            publicToggleConfirmTimer = null; 
            publicToggleLabel.textContent = originalText; publicToggleLabel.classList.remove("is-confirming-label"); 
        }
        apiRequest("/set-public-status", { isPublic: true });
    } else {
        if (publicToggleConfirmTimer) { 
            // 如果點擊第二次，則確認關閉
            clearInterval(publicToggleConfirmTimer.interval); clearTimeout(publicToggleConfirmTimer.timer); 
            publicToggleConfirmTimer = null; 
            publicToggleLabel.classList.remove("is-confirming-label"); 
            apiRequest("/set-public-status", { isPublic: false }); 
        } else {
            // 第一次點擊，進入確認模式
            publicToggle.checked = true; let countdown = 5;
            const closeTxt = at["label_confirm_close"];
            publicToggleLabel.textContent = `${closeTxt} (${countdown}s)`;
            publicToggleLabel.classList.add("is-confirming-label");
            const interval = setInterval(() => { 
                countdown--; 
                if (countdown > 0) publicToggleLabel.textContent = `${closeTxt} (${countdown}s)`; 
                else {
                    // 超時自動取消
                    clearInterval(interval); 
                    publicToggleLabel.textContent = originalText; 
                    publicToggleLabel.classList.remove("is-confirming-label"); 
                    publicToggleConfirmTimer = null; 
                }
            }, 1000);
            const timer = setTimeout(() => { 
                // 超時自動取消 (確保)
                clearInterval(interval); 
                publicToggleLabel.textContent = originalText; 
                publicToggleLabel.classList.remove("is-confirming-label"); 
                publicToggleConfirmTimer = null; 
            }, 5000);
            publicToggleConfirmTimer = { timer, interval };
        }
    }
});

const modeRadios = document.getElementsByName("systemMode");
if (modeRadios) {
    modeRadios.forEach(radio => {
        radio.addEventListener("change", async () => {
            const val = radio.value;
            const modeName = val === 'ticketing' ? at["mode_ticketing"] : at["mode_input"];
            const msg = at["confirm_switch_mode"].replace("%s", modeName);
            if(confirm(msg)) {
                if(await apiRequest("/set-system-mode", { mode: val })) { showToast(at["toast_mode_switched"], "success"); } 
                else { socket.emit("requestUpdate"); }
            } else {
                // 如果取消，將狀態改回舊的模式
                const other = val === 'ticketing' ? 'input' : 'ticketing';
                document.querySelector(`input[name="systemMode"][value="${other}"]`).checked = true;
            }
        });
    });
}

async function loadAdminUsers() {
    const ui = document.getElementById("user-list-ui");
    if (!ui) return;
    
    const data = await apiRequest("/api/admin/users", {}, true);
    if (data && data.users) {
        ui.replaceChildren(); 

        data.users.sort((a, b) => { 
            if (a.role === 'super' && b.role !== 'super') return -1; 
            if (a.role !== 'super' && b.role === 'super') return 1; 
            return a.username.localeCompare(b.username); 
        });
        
        const fragment = document.createDocumentFragment();
        data.users.forEach(user => {
            const li = document.createElement("li");
            const icon = user.role === 'super' ? '👑' : '👤';
            
            const span = document.createElement("span");
            const strong = document.createElement("strong");
            strong.textContent = user.nickname;
            
            span.append(`${icon} `, strong, ` (${user.username})`);
            li.appendChild(span);
            
            if (user.role !== 'super') {
                const deleteBtn = document.createElement("button");
                deleteBtn.className = "delete-item-btn"; 
                deleteBtn.textContent = "✕";
                
                // 統一使用 setupConfirmationButton
                setupConfirmationButton(deleteBtn, "✕", "⚠️", async () => { 
                    deleteBtn.disabled = true; 
                    if (await apiRequest("/api/admin/del-user", { delUsername: user.username })) { 
                        showToast(`✅ 已刪除: ${user.username}`, "success"); 
                        await loadAdminUsers(); // 重新載入列表
                    } else { 
                        deleteBtn.disabled = false; 
                    } 
                });
                li.appendChild(deleteBtn);
            }
            fragment.appendChild(li);
        });
        ui.appendChild(fragment);
    }
}

const addUserBtn = document.getElementById("add-user-btn");
const newUserUsernameInput = document.getElementById("new-user-username");
const newUserPasswordInput = document.getElementById("new-user-password");
const newUserNicknameInput = document.getElementById("new-user-nickname");
if (addUserBtn) addUserBtn.onclick = async () => {
    const newUsername = newUserUsernameInput.value.trim(); const newPassword = newUserPasswordInput.value.trim(); const newNickname = newUserNicknameInput.value.trim();
    if (!newUsername || !newPassword) return showToast(at["alert_account_required"], "error");
    addUserBtn.disabled = true;
    if (await apiRequest("/api/admin/add-user", { newUsername, newPassword, newNickname })) { 
        showToast(`✅ 已新增: ${newUsername}`, "success"); 
        newUserUsernameInput.value = ""; newUserPasswordInput.value = ""; newUserNicknameInput.value = ""; 
        await loadAdminUsers(); 
    }
    addUserBtn.disabled = false;
};

const statsListUI = document.getElementById("stats-list-ui");
const hourlyChartEl = document.getElementById("hourly-chart");
const statsTodayCount = document.getElementById("stats-today-count");

async function loadStats() {
    if (!statsListUI) return;
    
    if (statsListUI.children.length === 0 || statsListUI.children[0].textContent.includes(at["list_no_data"]) || statsListUI.children[0].textContent.includes(at["list_load_fail"])) {
        const li = document.createElement("li");
        li.textContent = at["list_loading"];
        statsListUI.replaceChildren(li);
    }

    const data = await apiRequest("/api/admin/stats", {}, true);
    if (data && data.success) {
        statsTodayCount.textContent = data.todayCount;
        renderHourlyChart(data.hourlyCounts, data.serverHour);
        
        statsListUI.replaceChildren(); 

        if (!data.history || data.history.length === 0) { 
            const li = document.createElement("li");
            li.textContent = at["list_no_data"];
            statsListUI.appendChild(li);
            return; 
        }
        
        const fragment = document.createDocumentFragment();
        data.history.forEach(item => {
            const li = document.createElement("li");
            const time = new Date(item.time).toLocaleTimeString('zh-TW', { hour12: false });
            
            const span = document.createElement("span");
            span.textContent = `${time} - 號碼 ${item.num} `;
            
            const small = document.createElement("small");
            small.style.color = "#666";
            small.textContent = `(${item.operator})`;
            
            span.appendChild(small);
            li.appendChild(span);
            fragment.appendChild(li);
        });
        statsListUI.appendChild(fragment);
        statsListUI.scrollTop = 0; // 捲到頂部看最新
    } else { 
        const li = document.createElement("li");
        li.textContent = at["list_load_fail"];
        statsListUI.replaceChildren(li);
    }
}

function renderHourlyChart(counts, serverHour) {
    if (!hourlyChartEl || !Array.isArray(counts)) return;
    hourlyChartEl.replaceChildren();

    const maxVal = Math.max(...counts, 1);
    const currentHour = (typeof serverHour === 'number') ? serverHour : new Date().getHours();
    
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 24; i++) {
        const val = counts[i]; 
        const percent = (val / maxVal) * 100;
        
        const col = document.createElement("div"); 
        col.className = "chart-col";
        if (i === currentHour) col.classList.add("current");
        col.onclick = () => openEditModal(i, val);
        
        const valDiv = document.createElement("div"); 
        valDiv.className = "chart-val"; 
        valDiv.textContent = val > 0 ? val : "";
        
        const barDiv = document.createElement("div"); 
        barDiv.className = "chart-bar"; 
        barDiv.style.height = `${Math.max(percent, 2)}%`; 
        if (val === 0) barDiv.style.backgroundColor = "#e5e7eb";
        
        const labelDiv = document.createElement("div"); 
        labelDiv.className = "chart-label"; 
        labelDiv.textContent = i.toString().padStart(2, '0');
        
        col.appendChild(valDiv); col.appendChild(barDiv); col.appendChild(labelDiv); 
        fragment.appendChild(col);
    }
    hourlyChartEl.appendChild(fragment);
}

const modalOverlay = document.getElementById("edit-stats-overlay");
const modalTitle = document.getElementById("modal-title");
const modalCurrentCount = document.getElementById("modal-current-count");
const btnStatsMinus = document.getElementById("btn-stats-minus");
const btnStatsPlus = document.getElementById("btn-stats-plus");
const btnModalClose = document.getElementById("btn-modal-close");
function openEditModal(hour, count) { modalTitle.textContent = `${at["zh-TW"] ? '編輯' : 'Edit'} ${hour}:00 - ${hour}:59 ${at["zh-TW"] ? '數據' : 'Stats'}`; editingHour = hour; modalCurrentCount.textContent = count; modalOverlay.style.display = "flex"; }
function closeEditModal() { modalOverlay.style.display = "none"; editingHour = null; }
async function adjustStat(delta) { 
    if (editingHour === null) return; 
    let current = parseInt(modalCurrentCount.textContent); 
    let next = current + delta; 
    if (next < 0) next = 0; 
    modalCurrentCount.textContent = next; 
    await apiRequest("/api/admin/stats/adjust", { hour: editingHour, delta: delta }); 
    await loadStats(); 
}
if(btnModalClose) btnModalClose.onclick = closeEditModal; 
if(btnStatsMinus) btnStatsMinus.onclick = () => adjustStat(-1); 
if(btnStatsPlus) btnStatsPlus.onclick = () => adjustStat(1);
if(modalOverlay) modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeEditModal(); }

// --- LINE 設定邏輯 ---
const domKeys = [
    "approach", "arrival", "status", "personal", "passed", 
    "set_ok", "cancel", "login_hint", "err_passed", "err_no_sub", "set_hint" 
];

async function loadLineSettings() {
    if (!document.getElementById(`line-msg-${domKeys[0]}`)) return;
    
    const data = await apiRequest("/api/admin/line-settings/get", {}, true);
    if (data && data.success) {
        domKeys.forEach(key => {
            const el = document.getElementById(`line-msg-${key}`);
            if (el && data[key]) el.value = data[key];
        });
    }
    
    if (userRole === 'super') {
        const pwdData = await apiRequest("/api/admin/line-settings/get-unlock-pass", {}, true);
        if(pwdData && pwdData.success && document.getElementById("line-unlock-pwd")) {
            document.getElementById("line-unlock-pwd").value = pwdData.password;
        }
    }
}

const btnSaveLineMsg = document.getElementById("btn-save-line-msg");
const btnResetLineMsg = document.getElementById("btn-reset-line-msg");
const btnSaveUnlockPwd = document.getElementById("btn-save-unlock-pwd");

if (btnSaveLineMsg) btnSaveLineMsg.onclick = async () => { 
    const payload = {};
    domKeys.forEach(key => {
        const el = document.getElementById(`line-msg-${key}`);
        if (el) payload[key] = el.value.trim();
    });

    if(!payload.approach || !payload.status) return showToast("主要文案不可為空", "error"); 
    
    btnSaveLineMsg.disabled = true; 
    if (await apiRequest("/api/admin/line-settings/save", payload)) { 
        showToast(at["toast_line_updated"], "success"); 
    } 
    btnSaveLineMsg.disabled = false; 
};

if (btnResetLineMsg) setupConfirmationButton(btnResetLineMsg, at["zh-TW"] ? "恢復預設" : "Reset to default", "btn_confirm_reset", async () => { 
    const data = await apiRequest("/api/admin/line-settings/reset", {}, true); 
    if (data && data.success) { 
        domKeys.forEach(key => {
            const el = document.getElementById(`line-msg-${key}`);
            if (el && data[key]) el.value = data[key];
        });

        showToast(at["toast_line_reset"], "success"); 
    } 
});

if (btnSaveUnlockPwd) btnSaveUnlockPwd.onclick = async () => {
    const pwd = document.getElementById("line-unlock-pwd").value.trim();
    if(!pwd) return showToast(at["alert_pwd_empty"], "error");
    btnSaveUnlockPwd.disabled = true;
    if (await apiRequest("/api/admin/line-settings/set-unlock-pass", { password: pwd })) { 
        showToast(at["toast_pwd_saved"], "success"); 
    }
    btnSaveUnlockPwd.disabled = false;
};

const btnRefreshStats = document.getElementById("btn-refresh-stats");
if (btnRefreshStats) {
    btnRefreshStats.onclick = async () => {
        showToast(at["list_loading"] || "載入中...", "info");
        await loadStats();
        showToast("✅ 數據已更新", "success");
    };
}

const btnExportCsv = document.getElementById("btn-export-csv");
if (btnExportCsv) {
    btnExportCsv.onclick = async () => {
        btnExportCsv.disabled = true;
        const data = await apiRequest("/api/admin/export-csv", {}, true);
        if (data && data.success) {
            const blob = new Blob(["\uFEFF" + data.csvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = data.fileName || "stats.csv";
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast(at["toast_report_downloaded"], "success");
        } else {
            showToast(at["toast_download_fail"] + (data ? data.error : 'Network Error'), "error");
        }
        btnExportCsv.disabled = false;
    };
}

const btnClearStats = document.getElementById("btn-clear-stats");
if (btnClearStats) {
    setupConfirmationButton(btnClearStats, at["zh-TW"] ? "⚠ 清空統計資料" : "⚠ Clear Stats", "btn_confirm_clear", async () => {
        if (await apiRequest("/api/admin/stats/clear", {})) {
            showToast(at["toast_stats_cleared"], "success");
            await loadStats();
        }
    });
}
