/*
 * ==========================================
 * 後台邏輯 (admin.js) - v18.12 Final Logic
 * ==========================================
 */

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
        "alert_positive_int": "請輸入正整數。",
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
        "btn_confirm_clear": "⚠️ Confirm Clear",
        "btn_confirm_reset": "⚠️ Confirm Reset",
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
        "btn_confirm_clear": "⚠️ Confirm Clear",
        "btn_confirm_reset": "⚠️ Confirm Reset",
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

    if (userRole === 'super') {
        const userManagementCard = document.getElementById("card-user-management");
        if (userManagementCard) userManagementCard.style.display = "block";
        const clearLogBtn = document.getElementById("clear-log-btn");
        if (clearLogBtn) clearLogBtn.style.display = "block";
        const btnExportCsv = document.getElementById("btn-export-csv");
        if (btnExportCsv) btnExportCsv.style.display = "block";
        const modeSwitcherGroup = document.getElementById("mode-switcher-group");
        if (modeSwitcherGroup) modeSwitcherGroup.style.display = "block";
        const unlockPwdGroup = document.getElementById("unlock-pwd-group");
        if (unlockPwdGroup) unlockPwdGroup.style.display = "block";
        await loadAdminUsers();
    } else {
        const unlockPwdGroup = document.getElementById("unlock-pwd-group");
        if (unlockPwdGroup) unlockPwdGroup.style.display = "none";
    }
    
    initTabs();
    await loadStats();
    await loadLineSettings();
    socket.connect();
}

async function attemptLogin(loginName, loginPass) {
    loginError.textContent = at["login_verifying"];
    try {
        const res = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: loginName, password: loginPass }),
        });
        const data = await res.json();
        if (!res.ok) {
            loginError.textContent = data.error || at["login_fail"];
            showLogin();
        } else {
            token = data.token;
            userRole = data.role;
            username = data.nickname;
            uniqueUsername = data.username;
            socket.auth.token = token;
            await showPanel();
        }
    } catch (err) {
        console.error("attemptLogin 失敗:", err);
        loginError.textContent = at["login_error_server"];
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
usernameInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { passwordInput.focus(); } });
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
    if(isInit) ui.innerHTML = "";
    if(!logs || logs.length === 0) return;
    if(ui.querySelector("li")?.textContent.includes("尚無")) ui.innerHTML = "";
    const fragment = document.createDocumentFragment();
    logs.forEach(log => {
        const li = document.createElement("li");
        li.textContent = log;
        isInit ? fragment.appendChild(li) : ui.appendChild(li); 
    });
    if(isInit) ui.appendChild(fragment);
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
                if(responseData.error === "權限不足") showToast(at["toast_permission_denied"], "error");
                else { alert(at["toast_session_expired"]); showLogin(); }
            } else { showToast(`❌ 錯誤: ${responseData.error}`, "error"); }
            return false;
        }
        return a_returnResponse ? responseData : true;
    } catch (err) { showToast(`❌ 連線失敗: ${err.message}`, "error"); return false; }
}

// --- Render Functions ---
function setupConfirmationButton(buttonEl, originalTextKey, confirmTextKey, actionCallback) {
    if (!buttonEl) return;
    let timer = null; let isConfirming = false; let countdown = 5;
    const getTxt = (key) => at[key] || key;
    const showCountdown = confirmTextKey.includes("confirm"); 

    const resetBtn = () => {
        clearInterval(timer); isConfirming = false; countdown = 5;
        buttonEl.textContent = getTxt(originalTextKey);
        buttonEl.classList.remove("is-confirming");
    };
    buttonEl.addEventListener("click", () => {
        if (isConfirming) { actionCallback(); resetBtn(); } else {
            isConfirming = true; countdown = 5;
            const confirmTxt = getTxt(confirmTextKey);
            buttonEl.textContent = showCountdown ? `${confirmTxt} (${countdown}s)` : confirmTxt;
            buttonEl.classList.add("is-confirming");
            if (showCountdown) {
                timer = setInterval(() => {
                    countdown--;
                    if (countdown > 0) buttonEl.textContent = `${confirmTxt} (${countdown}s)`;
                    else resetBtn();
                }, 1000);
            } else {
                setTimeout(resetBtn, 5000);
            }
        }
    });
}

function renderPassedListUI(numbers) {
    const ui = document.getElementById("passed-list-ui");
    ui.innerHTML = "";
    if (!Array.isArray(numbers)) return;
    const fragment = document.createDocumentFragment();
    numbers.forEach((number) => {
        const li = document.createElement("li");
        li.style.display = "flex"; li.style.justifyContent = "space-between"; li.style.alignItems = "center";
        const leftDiv = document.createElement("div"); 
        leftDiv.style.display = "flex"; leftDiv.style.gap = "10px"; leftDiv.style.alignItems = "center";
        const numSpan = document.createElement("span"); 
        numSpan.textContent = number; numSpan.style.fontWeight = "bold";
        const recallBtn = document.createElement("button");
        recallBtn.className = "btn-secondary"; 
        recallBtn.style.padding = "2px 8px"; recallBtn.style.fontSize = "0.8rem";
        recallBtn.textContent = "↩️ 重呼";
        recallBtn.onclick = async () => { 
            if(confirm(`確定要插隊重呼 ${number} 號嗎？`)) { 
                await apiRequest("/api/control/recall-passed", { number }); 
                showToast(at["toast_recalled"], "success"); 
            } 
        };
        leftDiv.appendChild(numSpan); leftDiv.appendChild(recallBtn); li.appendChild(leftDiv);
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-item-btn"; deleteBtn.innerHTML = "✕";
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
    ui.innerHTML = "";
    if (!Array.isArray(contents)) return;
    const fragment = document.createDocumentFragment();
    contents.forEach((item) => {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.style.wordBreak = "break-all"; 
        span.style.whiteSpace = "normal";
        span.innerHTML = `${item.linkText}<br><small style="color:#666">${item.linkUrl}</small>`;
        li.appendChild(span);
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-item-btn"; deleteBtn.innerHTML = "✕";
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
    ui.innerHTML = "";
    if (!admins || admins.length === 0) { ui.innerHTML = `<li>${at["list_no_online"]}</li>`; return; }
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
        const selfClass = (admin.username === uniqueUsername) ? 'is-self' : '';
        li.innerHTML = `<span class="role-icon">${icon}</span> <span class="username ${selfClass}">${admin.nickname}</span>`;
        fragment.appendChild(li);
    });
    ui.appendChild(fragment);
}

const btnCallPrev = document.getElementById("btn-call-prev");
const btnCallNext = document.getElementById("btn-call-next");
const btnMarkPassed = document.getElementById("btn-mark-passed"); 
const btnIssuePrev = document.getElementById("btn-issue-prev");
const btnIssueNext = document.getElementById("btn-issue-next");

if(btnCallPrev) btnCallPrev.onclick = () => apiRequest("/change-number", { direction: "prev" });
if(btnCallNext) btnCallNext.onclick = () => apiRequest("/change-number", { direction: "next" });

if(btnMarkPassed) btnMarkPassed.onclick = async () => {
    btnMarkPassed.disabled = true;
    if(await apiRequest("/api/control/pass-current", {})) showToast(at["toast_passed_marked"], "warning");
    btnMarkPassed.disabled = false;
};

if(btnIssuePrev) btnIssuePrev.onclick = () => apiRequest("/change-issued-number", { direction: "prev" });
if(btnIssueNext) btnIssueNext.onclick = () => apiRequest("/change-issued-number", { direction: "next" });

document.getElementById("setNumber").onclick = async () => {
    const num = document.getElementById("manualNumber").value;
    if (num === "") return;
    if (await apiRequest("/set-number", { number: num })) { 
        document.getElementById("manualNumber").value = ""; 
        showToast(at["toast_num_set"], "success"); 
    }
};

const setIssuedBtn = document.getElementById("setIssuedNumber");
if(setIssuedBtn) setIssuedBtn.onclick = async () => {
    const num = document.getElementById("manualIssuedNumber").value;
    if (num === "") return;
    if (await apiRequest("/set-issued-number", { number: num })) {
        document.getElementById("manualIssuedNumber").value = "";
        showToast(at["toast_issued_updated"], "success");
    }
};

setupConfirmationButton(document.getElementById("clear-log-btn"), "btn_clear_log", "btn_confirm_clear", async () => { showToast(at["toast_log_clearing"], "info"); await apiRequest("/api/logs/clear", {}); });
setupConfirmationButton(document.getElementById("resetNumber"), "btn_reset_call", "btn_confirm_reset", async () => { if (await apiRequest("/set-number", { number: 0 })) { document.getElementById("manualNumber").value = ""; showToast(at["toast_reset_zero"], "success"); } });
setupConfirmationButton(document.getElementById("resetPassed"), "btn_reset_passed", "btn_confirm_reset", async () => { if (await apiRequest("/api/passed/clear", {})) showToast(at["toast_passed_cleared"], "success"); });
setupConfirmationButton(document.getElementById("resetFeaturedContents"), "btn_reset_links", "btn_confirm_reset", async () => { if (await apiRequest("/api/featured/clear", {})) showToast(at["toast_featured_cleared"], "success"); });
setupConfirmationButton(document.getElementById("resetAll"), "btn_reset_all", "btn_confirm_reset", async () => { if (await apiRequest("/reset", {})) { document.getElementById("manualNumber").value = ""; showToast(at["toast_all_reset"], "success"); await loadStats(); } });

const newPassedNumberInput = document.getElementById("new-passed-number");
const addPassedBtn = document.getElementById("add-passed-btn");
if(addPassedBtn) addPassedBtn.onclick = async () => {
    const num = Number(newPassedNumberInput.value);
    if (num <= 0 || !Number.isInteger(num)) return alert(at["alert_positive_int"]);
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
    if (!text || !url) return alert(at["alert_link_required"]);
    if (!url.startsWith('http://') && !url.startsWith('https://')) return alert(at["alert_url_invalid"]);
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
        if (!msg) return alert(at["alert_broadcast_empty"]);
        broadcastBtn.disabled = true;
        if (await apiRequest("/api/admin/broadcast", { message: msg })) { showToast(at["toast_broadcast_sent"], "success"); broadcastInput.value = ""; }
        broadcastBtn.disabled = false;
    };
    broadcastInput.addEventListener("keyup", (e) => { if (e.key === "Enter") broadcastBtn.click(); });
}

const soundToggle = document.getElementById("sound-toggle");
const publicToggle = document.getElementById("public-toggle");
const publicToggleLabel = document.getElementById("public-toggle-label");

if(soundToggle) soundToggle.addEventListener("change", () => { apiRequest("/set-sound-enabled", { enabled: soundToggle.checked }); });
if(publicToggle) publicToggle.addEventListener("change", () => {
    const isPublic = publicToggle.checked;
    if (isPublic) {
        if (publicToggleConfirmTimer) { 
            clearInterval(publicToggleConfirmTimer.interval); clearTimeout(publicToggleConfirmTimer.timer); 
            publicToggleConfirmTimer = null; 
            publicToggleLabel.textContent = at["label_public_toggle"]; publicToggleLabel.classList.remove("is-confirming-label"); 
        }
        apiRequest("/set-public-status", { isPublic: true });
    } else {
        if (publicToggleConfirmTimer) { 
            clearInterval(publicToggleConfirmTimer.interval); clearTimeout(publicToggleConfirmTimer.timer); 
            publicToggleConfirmTimer = null; 
            publicToggleLabel.textContent = at["label_public_toggle"]; publicToggleLabel.classList.remove("is-confirming-label"); 
            apiRequest("/set-public-status", { isPublic: false }); 
        } else {
            publicToggle.checked = true; let countdown = 5;
            const closeTxt = at["label_confirm_close"];
            publicToggleLabel.textContent = `${closeTxt} (${countdown}s)`;
            publicToggleLabel.classList.add("is-confirming-label");
            const interval = setInterval(() => { 
                countdown--; 
                if (countdown > 0) publicToggleLabel.textContent = `${closeTxt} (${countdown}s)`; 
                else clearInterval(interval); 
            }, 1000);
            const timer = setTimeout(() => { 
                clearInterval(interval); 
                publicToggleLabel.textContent = at["label_public_toggle"]; publicToggleLabel.classList.remove("is-confirming-label"); 
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
        ui.innerHTML = "";
        data.users.sort((a, b) => { if (a.role === 'super' && b.role !== 'super') return -1; if (a.role !== 'super' && b.role === 'super') return 1; return a.username.localeCompare(b.username); });
        data.users.forEach(user => {
            const li = document.createElement("li");
            const icon = user.role === 'super' ? '👑' : '👤';
            li.innerHTML = `<span>${icon} <strong>${user.nickname}</strong> (${user.username})</span>`;
            if (user.role !== 'super') {
                const deleteBtn = document.createElement("button");
                deleteBtn.className = "delete-item-btn"; deleteBtn.innerHTML = "✕";
                setupConfirmationButton(deleteBtn, "✕", "⚠️", async () => { 
                    deleteBtn.disabled = true; 
                    if (await apiRequest("/api/admin/del-user", { delUsername: user.username })) { 
                        showToast(`✅ 已刪除: ${user.username}`, "success"); await loadAdminUsers(); 
                    } else { deleteBtn.disabled = false; } 
                });
                li.appendChild(deleteBtn);
            }
            ui.appendChild(li);
        });
    }
}

const addUserBtn = document.getElementById("add-user-btn");
const newUserUsernameInput = document.getElementById("new-user-username");
const newUserPasswordInput = document.getElementById("new-user-password");
const newUserNicknameInput = document.getElementById("new-user-nickname");
if (addUserBtn) addUserBtn.onclick = async () => {
    const newUsername = newUserUsernameInput.value; const newPassword = newUserPasswordInput.value; const newNickname = newUserNicknameInput.value.trim();
    if (!newUsername || !newPassword) return alert("帳號和密碼必填。");
    addUserBtn.disabled = true;
    if (await apiRequest("/api/admin/add-user", { newUsername, newPassword, newNickname })) { showToast(`✅ 已新增: ${newUsername}`, "success"); newUserUsernameInput.value = ""; newUserPasswordInput.value = ""; newUserNicknameInput.value = ""; await loadAdminUsers(); }
    addUserBtn.disabled = false;
};

const statsListUI = document.getElementById("stats-list-ui");
const hourlyChartEl = document.getElementById("hourly-chart");
const statsTodayCount = document.getElementById("stats-today-count");

async function loadStats() {
    if (!statsListUI) return;
    if (statsListUI.children.length === 0) statsListUI.innerHTML = `<li>${at["list_loading"]}</li>`;
    const data = await apiRequest("/api/admin/stats", {}, true);
    if (data && data.success) {
        statsTodayCount.textContent = data.todayCount;
        renderHourlyChart(data.hourlyCounts, data.serverHour);
        statsListUI.innerHTML = "";
        if (!data.history || data.history.length === 0) { statsListUI.innerHTML = `<li>${at["list_no_data"]}</li>`; return; }
        const fragment = document.createDocumentFragment();
        data.history.forEach(item => {
            const li = document.createElement("li");
            const time = new Date(item.time).toLocaleTimeString('zh-TW', { hour12: false });
            li.innerHTML = `<span>${time} - 號碼 ${item.num} <small style="color:#666">(${item.operator})</small></span>`;
            fragment.appendChild(li);
        });
        statsListUI.appendChild(fragment);
    } else { statsListUI.innerHTML = `<li>${at["list_load_fail"]}</li>`; }
}
function renderHourlyChart(counts, serverHour) {
    if (!hourlyChartEl || !Array.isArray(counts)) return;
    hourlyChartEl.innerHTML = "";
    const maxVal = Math.max(...counts, 1);
    const currentHour = (typeof serverHour === 'number') ? serverHour : new Date().getHours();
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 24; i++) {
        const val = counts[i]; const percent = (val / maxVal) * 100;
        const col = document.createElement("div"); col.className = "chart-col";
        if (i === currentHour) col.classList.add("current");
        col.onclick = () => openEditModal(i, val);
        const valDiv = document.createElement("div"); valDiv.className = "chart-val"; valDiv.textContent = val > 0 ? val : "";
        const barDiv = document.createElement("div"); barDiv.className = "chart-bar"; barDiv.style.height = `${Math.max(percent, 2)}%`; if (val === 0) barDiv.style.backgroundColor = "#e5e7eb";
        const labelDiv = document.createElement("div"); labelDiv.className = "chart-label"; labelDiv.textContent = i.toString().padStart(2, '0');
        col.appendChild(valDiv); col.appendChild(barDiv); col.appendChild(labelDiv); fragment.appendChild(col);
    }
    hourlyChartEl.appendChild(fragment);
}

const modalOverlay = document.getElementById("edit-stats-overlay");
const modalTitle = document.getElementById("modal-title");
const modalCurrentCount = document.getElementById("modal-current-count");
const btnStatsMinus = document.getElementById("btn-stats-minus");
const btnStatsPlus = document.getElementById("btn-stats-plus");
const btnModalClose = document.getElementById("btn-modal-close");
function openEditModal(hour, count) { editingHour = hour; modalTitle.textContent = `編輯 ${hour}:00 - ${hour}:59 數據`; modalCurrentCount.textContent = count; modalOverlay.style.display = "flex"; }
function closeEditModal() { modalOverlay.style.display = "none"; editingHour = null; }
async function adjustStat(delta) { if (editingHour === null) return; let current = parseInt(modalCurrentCount.textContent); let next = current + delta; if (next < 0) next = 0; modalCurrentCount.textContent = next; await apiRequest("/api/admin/stats/adjust", { hour: editingHour, delta: delta }); await loadStats(); }
if(btnModalClose) btnModalClose.onclick = closeEditModal; if(btnStatsMinus) btnStatsMinus.onclick = () => adjustStat(-1); if(btnStatsPlus) btnStatsPlus.onclick = () => adjustStat(1);
if(modalOverlay) modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeEditModal(); }

// --- LINE 設定邏輯 (Updated with Login Hint) ---
const domIds = {
    approach:  "line-msg-approach",
    arrival:   "line-msg-arrival",
    status:    "line-msg-status",
    personal:  "line-msg-personal",
    passed:    "line-msg-passed",
    setOk:     "line-msg-set-ok",
    cancel:    "line-msg-cancel",
    loginHint: "line-msg-login-hint", 
    unlock:    "line-unlock-pwd"
};

const btnSaveLineMsg = document.getElementById("btn-save-line-msg");
const btnResetLineMsg = document.getElementById("btn-reset-line-msg");
const btnSaveUnlockPwd = document.getElementById("btn-save-unlock-pwd");

async function loadLineSettings() {
    if (!document.getElementById(domIds.approach)) return;
    
    const data = await apiRequest("/api/admin/line-settings/get", {}, true);
    if (data && data.success) {
        document.getElementById(domIds.approach).value  = data.approach;
        document.getElementById(domIds.arrival).value   = data.arrival;
        document.getElementById(domIds.status).value    = data.status;
        document.getElementById(domIds.personal).value  = data.personal;
        document.getElementById(domIds.passed).value    = data.passed;
        document.getElementById(domIds.setOk).value     = data.set_ok;
        document.getElementById(domIds.cancel).value    = data.cancel;
        document.getElementById(domIds.loginHint).value = data.login_hint; 
    }
    
    if (userRole === 'super') {
        const pwdData = await apiRequest("/api/admin/line-settings/get-unlock-pass", {}, true);
        if(pwdData && pwdData.success && document.getElementById(domIds.unlock)) {
            document.getElementById(domIds.unlock).value = pwdData.password;
        }
    }
}

if (btnSaveLineMsg) btnSaveLineMsg.onclick = async () => { 
    const payload = {
        approach:   document.getElementById(domIds.approach).value.trim(),
        arrival:    document.getElementById(domIds.arrival).value.trim(),
        status:     document.getElementById(domIds.status).value.trim(),
        personal:   document.getElementById(domIds.personal).value.trim(),
        passed:     document.getElementById(domIds.passed).value.trim(),
        set_ok:     document.getElementById(domIds.setOk).value.trim(),
        cancel:     document.getElementById(domIds.cancel).value.trim(),
        login_hint: document.getElementById(domIds.loginHint).value.trim() 
    };

    if(!payload.approach || !payload.status) return alert("主要文案不可為空"); 
    
    btnSaveLineMsg.disabled = true; 
    if (await apiRequest("/api/admin/line-settings/save", payload)) { 
        showToast("✅ LINE 文案已全數更新", "success"); 
    } 
    btnSaveLineMsg.disabled = false; 
};

if (btnResetLineMsg) setupConfirmationButton(btnResetLineMsg, "恢復預設值", "btn_confirm_reset", async () => { 
    const data = await apiRequest("/api/admin/line-settings/reset", {}, true); 
    if (data && data.success) { 
        document.getElementById(domIds.approach).value  = data.approach;
        document.getElementById(domIds.arrival).value   = data.arrival;
        document.getElementById(domIds.status).value    = data.status;
        document.getElementById(domIds.personal).value  = data.personal;
        document.getElementById(domIds.passed).value    = data.passed;
        document.getElementById(domIds.setOk).value     = data.set_ok;
        document.getElementById(domIds.cancel).value    = data.cancel;
        document.getElementById(domIds.loginHint).value = data.login_hint; 
        showToast("↺ 已恢復預設文案", "success"); 
    } 
});

if (btnSaveUnlockPwd) btnSaveUnlockPwd.onclick = async () => {
    const pwd = document.getElementById(domIds.unlock).value.trim();
    if(!pwd) return alert("密碼不可為空");
    btnSaveUnlockPwd.disabled = true;
    if (await apiRequest("/api/admin/line-settings/set-unlock-pass", { password: pwd })) { 
        showToast("✅ 解鎖密碼已設定", "success"); 
    }
    btnSaveUnlockPwd.disabled = false;
};

const btnSetNickname = document.getElementById("set-nickname-btn");
if (btnSetNickname) {
    btnSetNickname.onclick = async () => {
        const targetUsername = document.getElementById("set-nick-username").value.trim();
        const nickname = document.getElementById("set-nick-nickname").value.trim();
        if (!targetUsername || !nickname) return alert("請輸入帳號與新暱稱");
        btnSetNickname.disabled = true;
        if (await apiRequest("/api/admin/set-nickname", { targetUsername, nickname })) {
            showToast(`✅ 暱稱已更新`, "success");
            document.getElementById("set-nick-username").value = "";
            document.getElementById("set-nick-nickname").value = "";
            await loadAdminUsers();
        }
        btnSetNickname.disabled = false;
    };
}

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
            showToast(at["toast_download_fail"], "error");
        }
        btnExportCsv.disabled = false;
    };
}

const btnClearStats = document.getElementById("btn-clear-stats");
if (btnClearStats) {
    setupConfirmationButton(btnClearStats, "btn_clear_log", "btn_confirm_clear", async () => {
        if (await apiRequest("/api/admin/stats/clear", {})) {
            showToast(at["toast_stats_cleared"], "success");
            await loadStats();
        }
    });
}
