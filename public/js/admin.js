/* ==========================================
 * 後台邏輯 (admin.js) - v71.0 UI Fix
 * ========================================== */
const $ = i => document.getElementById(i);
const $$ = s => document.querySelectorAll(s);
const mk = (t, c, txt, ev={}) => { const e = document.createElement(t); if(c) e.className=c; if(txt) e.textContent=txt; Object.entries(ev).forEach(([k,v])=>e[k]=v); return e; };

const i18n = {
    "zh-TW": { 
        status_conn:"✅ 已連線", status_dis:"⚠️ 連線中斷...", saved:"✅ 已儲存", denied:"❌ 權限不足", 
        expired:"Session 過期", login_fail:"登入失敗", confirm:"⚠️ 確認", recall:"↩️ 重呼", 
        edit:"✎", del:"✕", save:"✓", cancel:"✕",
        login_title: "請登入管理系統", ph_account: "帳號", ph_password: "密碼", login_btn: "登入",
        admin_panel: "管理後台", nav_live: "現場控台", nav_stats: "數據報表", 
        nav_settings: "系統設定", nav_line: "LINE設定", logout: "登出",
        dash_curr: "目前叫號", dash_issued: "已發號至", dash_wait: "等待組數",
        card_call: "指揮中心", btn_next: "下一號 ▶", btn_prev: "◀ 上一號", btn_pass: "過號", 
        lbl_assign: "指定 / 插隊", btn_exec: "GO", btn_reset_call: "↺ 重置叫號",
        card_issue: "發號管理", btn_recall: "➖ 收回", btn_issue: "發號 ➕", 
        lbl_fix_issue: "修正發號數", btn_fix: "修正", btn_reset_issue: "↺ 重置發號",
        card_passed: "過號名單", btn_clear_passed: "清空過號",
        card_stats: "流量分析", lbl_today: "今日人次", btn_refresh: "重整", btn_clear_stats: "🗑️ 清空統計",
        card_logs: "操作日誌", btn_clear_logs: "清除日誌",
        card_sys: "系統", lbl_public: "開放前台", lbl_sound: "提示音效", 
        lbl_tts: "TTS 語音廣播", btn_play: "播放", 
        lbl_mode: "取號模式", mode_online: "線上取號", mode_manual: "手動輸入", btn_reset_all: "💥 全域重置",
        card_online: "在線管理", card_links: "連結管理", ph_link_name: "名稱", btn_clear_links: "清空連結",
        card_users: "帳號管理", lbl_add_user: "新增帳號", ph_nick: "暱稱",
        btn_save: "儲存", btn_restore: "恢復預設值",
        modal_edit: "編輯數據", btn_done: "完成"
    },
    "en": { 
        status_conn:"✅ Connected", status_dis:"⚠️ Disconnected...", saved:"✅ Saved", denied:"❌ Denied", 
        expired:"Session Expired", login_fail:"Login Failed", confirm:"⚠️ Confirm", recall:"↩️ Recall", 
        edit:"Edit", del:"Del", save:"Save", cancel:"Cancel",
        login_title: "Login to Admin Panel", ph_account: "Username", ph_password: "Password", login_btn: "Login",
        admin_panel: "Admin Panel", nav_live: "Live Console", nav_stats: "Statistics", 
        nav_settings: "Settings", nav_line: "Line Config", logout: "Logout",
        dash_curr: "Current Serving", dash_issued: "Last Issued", dash_wait: "Waiting",
        card_call: "Command Center", btn_next: "Next ▶", btn_prev: "◀ Prev", btn_pass: "Pass", 
        lbl_assign: "Assign / Jump", btn_exec: "GO", btn_reset_call: "↺ Reset Call",
        card_issue: "Ticketing", btn_recall: "➖ Recall", btn_issue: "Issue ➕", 
        lbl_fix_issue: "Fix Issued #", btn_fix: "Fix", btn_reset_issue: "↺ Reset Issue",
        card_passed: "Passed List", btn_clear_passed: "Clear Passed",
        card_stats: "Analytics", lbl_today: "Today's Count", btn_refresh: "Refresh", btn_clear_stats: "🗑️ Clear Stats",
        card_logs: "Action Logs", btn_clear_logs: "Clear Logs",
        card_sys: "System", lbl_public: "Public Access", lbl_sound: "Sound FX", 
        lbl_tts: "TTS Broadcast", btn_play: "Play", 
        lbl_mode: "Mode", mode_online: "Online Ticket", mode_manual: "Manual Input", btn_reset_all: "💥 Factory Reset",
        card_online: "Online Users", card_links: "Links Manager", ph_link_name: "Name", btn_clear_links: "Clear Links",
        card_users: "User Manager", lbl_add_user: "Add User", ph_nick: "Nickname",
        btn_save: "Save", btn_restore: "Restore Defaults",
        modal_edit: "Edit Data", btn_done: "Done"
    }
};

let curLang = localStorage.getItem('callsys_lang')||'zh-TW', T = i18n[curLang];
let token="", userRole="normal", username="", uniqueUser="", toastTimer;
let currentSystemMode = 'ticketing'; 
let isDark = localStorage.getItem('callsys_admin_theme') === 'dark';
let cachedLineSettings = null; 

const socket = io({ autoConnect: false, auth: { token: "" } });

// --- Theme Logic ---
function applyAdminTheme() {
    if (isDark) { document.body.classList.add('dark-mode'); if($('admin-theme-toggle')) $('admin-theme-toggle').textContent = '☀️'; if($('admin-theme-toggle-mobile')) $('admin-theme-toggle-mobile').textContent = '☀️ Light'; }
    else { document.body.classList.remove('dark-mode'); if($('admin-theme-toggle')) $('admin-theme-toggle').textContent = '🌙'; if($('admin-theme-toggle-mobile')) $('admin-theme-toggle-mobile').textContent = '🌙 Dark'; }
    localStorage.setItem('callsys_admin_theme', isDark ? 'dark' : 'light');
}

function toast(msg, type='info') { 
    const t = $("toast-notification"); if(!t) return; 
    t.textContent = msg; t.className = ""; t.classList.add(type === 'success' ? 'success' : (type === 'error' ? 'error' : 'info'));
    t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3000); 
}

function updateLangUI() {
    T = i18n[curLang] || i18n["zh-TW"];
    $$('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if(T[k]) el.textContent = T[k]; });
    $$('[data-i18n-ph]').forEach(el => { const k = el.getAttribute('data-i18n-ph'); if(T[k]) el.placeholder = T[k]; });
    
    if($("admin-lang-selector-mobile")) $("admin-lang-selector-mobile").value = curLang;
    if($("admin-lang-selector")) $("admin-lang-selector").value = curLang;

    loadUsers(); 
    loadStats(); 
    
    if (!cachedLineSettings) loadLineSettings(); else renderLineSettings();
    req("/api/featured/get").then(res => { if(res) socket.emit("updateFeaturedContents", res); });
}

async function req(url, data={}, lockBtn=null, delay=300) {
    if(lockBtn) lockBtn.disabled=true;
    try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, token }) });
        const res = await r.json();
        if(!r.ok) { 
            if(r.status===403) { 
                toast(res.error?.includes("權限")?T.denied:T.expired, "error"); 
                if(!res.error?.includes("權限")) logout(); 
            } else toast(`❌ ${res.error||'Error'}`, "error"); 
            return null; 
        }
        return res;
    } catch(e) { toast(`❌ ${e.message}`, "error"); return null; } finally { if(lockBtn) setTimeout(()=>lockBtn.disabled=false, delay); }
}

function confirmBtn(el, origTxt, action) {
    if(!el) return; let t, c=5;
    el.onclick = (e) => { e.stopPropagation(); if(el.classList.contains("is-confirming")) { action(); reset(); } else { el.classList.add("is-confirming"); el.textContent = `${T.confirm} (${c})`; t = setInterval(() => { c--; el.textContent = `${T.confirm} (${c})`; if(c<=0) reset(); }, 1000); } };
    const reset = () => { clearInterval(t); el.classList.remove("is-confirming"); el.textContent = origTxt; c=5; };
}

function checkSession() {
    const storedToken = localStorage.getItem('callsys_token'), storedUser = localStorage.getItem('callsys_user'), storedRole = localStorage.getItem('callsys_role'), storedNick = localStorage.getItem('callsys_nick');
    if(storedToken && storedUser) { token = storedToken; uniqueUser = storedUser; userRole = storedRole; username = storedNick; showPanel(); } else { showLogin(); }
}
function logout() { localStorage.removeItem('callsys_token'); token=""; location.reload(); }
function showLogin() { $("login-container").style.display="block"; $("admin-panel").style.display="none"; socket.disconnect(); }
async function showPanel() {
    $("login-container").style.display="none"; $("admin-panel").style.display="flex";
    if($("sidebar-user-info")) $("sidebar-user-info").textContent = `${username}`;
    const isSuper = userRole === 'super';
    ["card-user-management", "btn-export-csv", "mode-switcher-group", "unlock-pwd-group"].forEach(id => { if($(id)) $(id).style.display = isSuper ? "block" : "none"; });
    if($('button[data-target="section-line"]')) $('button[data-target="section-line"]').style.display = isSuper?"flex":"none";
    if(isSuper) { $("role-editor-container").style.display = "block"; loadRoles(); }
    socket.auth.token = token; socket.connect(); updateLangUI(); 
}

$("btn-logout")?.addEventListener("click", logout);
$("login-button").onclick = async () => {
    const b=$("login-button"); b.disabled=true;
    const res = await fetch("/login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:$("username-input").value, password:$("password-input").value})}).then(r=>r.json()).catch(()=>({error:T.login_fail}));
    if(res.token) { token=res.token; userRole=res.role; username=res.nickname; uniqueUser=res.username; localStorage.setItem('callsys_token', token); localStorage.setItem('callsys_user', uniqueUser); localStorage.setItem('callsys_role', userRole); localStorage.setItem('callsys_nick', username); showPanel(); } else { $("login-error").textContent=res.error||T.login_fail; } b.disabled=false;
};

// --- Socket Events ---
socket.on("connect", () => { $("status-bar").classList.remove("visible"); toast(`${T.status_conn} (${username})`, "success"); });
socket.on("disconnect", () => { $("status-bar").classList.add("visible"); });
socket.on("updateQueue", d => { 
    if($("number")) $("number").textContent=d.current; 
    if($("issued-number")) $("issued-number").textContent=d.issued; 
    if($("waiting-count")) $("waiting-count").textContent=Math.max(0, d.issued-d.current); 
    loadStats(); 
});
socket.on("update", n => { if($("number")) $("number").textContent=n; loadStats(); });
socket.on("initAdminLogs", l => renderLogs(l, true));
socket.on("newAdminLog", l => renderLogs([l], false));
socket.on("updatePublicStatus", b => { if($("public-toggle")) $("public-toggle").checked = b; });
socket.on("updateSoundSetting", b => { if($("sound-toggle")) $("sound-toggle").checked=b; });
socket.on("updateSystemMode", m => { currentSystemMode = m; $$('input[name="systemMode"]').forEach(r => r.checked = (r.value === m)); });

// [UI 修正] 渲染連結管理列表
socket.on("updateFeaturedContents", list => {
    const ul = $("featured-list-ui"); if(!ul) return; ul.innerHTML="";
    if(!list) return;
    list.forEach(item => {
        const li = mk("li", "list-item");
        
        // View Mode
        const viewInfo = mk("div", "list-info");
        viewInfo.innerHTML = `<span class="list-main-text">${item.linkText}</span><span class="list-sub-text">${item.linkUrl}</span>`;
        
        const actions = mk("div", "list-actions");
        const btnEdit = mk("button", "btn-secondary", T.edit, { onclick:()=>{ li.classList.add('editing'); form.style.display="flex"; viewInfo.style.display="none"; actions.style.display="none"; } });
        const btnDel = mk("button", "btn-secondary", T.del, { onclick:()=>req("/api/featured/remove", item) });
        actions.append(btnEdit, btnDel);

        // Edit Mode
        const form = mk("div", null, null, { style: "display:none; width:100%; gap:8px; flex-wrap:wrap;" });
        const i1 = mk("input", null, null, {value:item.linkText, style:"flex:1; min-width:100px;"});
        const i2 = mk("input", null, null, {value:item.linkUrl, style:"flex:2; min-width:150px;"});
        const btnSave = mk("button", "btn-secondary success", T.save, { onclick: async()=>{ if(await req("/api/featured/edit",{oldLinkText:item.linkText,oldLinkUrl:item.linkUrl,newLinkText:i1.value,newLinkUrl:i2.value})) toast(T.saved,"success"); }});
        const btnCancel = mk("button", "btn-secondary", T.cancel, { onclick:()=>{ form.style.display="none"; viewInfo.style.display="flex"; actions.style.display="flex"; } });
        form.append(i1, i2, btnSave, btnCancel);

        li.append(viewInfo, actions, form);
        ul.appendChild(li);
    });
});

// [UI 修正] 渲染過號名單
socket.on("updatePassed", list => {
    const ul = $("passed-list-ui"); if(!ul) return; ul.innerHTML="";
    if(!list) return;
    list.forEach(n => {
        const li = mk("li", "list-item");
        const info = mk("div", "list-info");
        info.innerHTML = `<span class="list-main-text" style="font-size:1.2rem; color:var(--primary);">${n} 號</span>`;
        
        const actions = mk("div", "list-actions");
        const btnRecall = mk("button", "btn-secondary", T.recall, {onclick:()=>{ if(confirm(`Recall ${n}?`)) req("/api/control/recall-passed",{number:n}); }});
        const btnDel = mk("button", "btn-secondary", T.del); 
        confirmBtn(btnDel, T.del, ()=>req("/api/passed/remove",{number:n}));
        
        actions.append(btnRecall, btnDel);
        li.append(info, actions);
        ul.appendChild(li);
    });
});

socket.on("updateOnlineAdmins", list => {
    const ul = $("online-users-list"); if(!ul) return; 
    ul.innerHTML = "";
    if(!list || !list.length) { ul.innerHTML = `<li class="list-item" style="justify-content:center; color:var(--text-sub);">Waiting...</li>`; return; }
    list.sort((a,b)=>(a.role==='super'?-1:1)).forEach(u => {
        const li = mk("li", "list-item");
        li.innerHTML = `<span class="list-main-text">🟢 ${u.nickname}</span><span class="list-sub-text">${u.username}</span>`;
        ul.appendChild(li);
    });
});

// [UI 修正] 渲染使用者列表
async function loadUsers() {
    const ul = $("user-list-ui"); if(!ul) return; const d = await req("/api/admin/users"); if(!d || !d.users) return; ul.innerHTML="";
    const roleOpts = { 'VIEWER':'Viewer', 'OPERATOR':'Operator', 'MANAGER':'Manager', 'ADMIN':'Admin' };
    d.users.forEach(u => {
        const li = mk("li", "list-item");
        
        // View
        const info = mk("div", "list-info");
        info.innerHTML = `<span class="list-main-text">${u.role==='ADMIN'?'👑':(u.role==='MANAGER'?'🛡️':'👤')} ${u.nickname}</span><span class="list-sub-text">${u.username} (${roleOpts[u.role]||u.role})</span>`;
        
        const actions = mk("div", "list-actions");
        
        // Edit Form
        const form = mk("div", null, null, { style: "display:none; width:100%; gap:8px; flex-wrap:wrap;" });
        const iNick = mk("input", null, null, {value:u.nickname});
        const btnSave = mk("button", "btn-secondary success", T.save);
        btnSave.onclick = async () => { if(await req("/api/admin/set-nickname", {targetUsername:u.username, nickname:iNick.value})) { toast("Saved", "success"); loadUsers(); } };
        const btnCancel = mk("button", "btn-secondary", T.cancel, { onclick:()=>{ form.style.display="none"; info.style.display="flex"; actions.style.display="flex"; } });
        
        form.append(iNick, btnSave, btnCancel);

        if(u.username === uniqueUser || userRole === 'super') {
            const btnEdit = mk("button", "btn-secondary", T.edit, { onclick:()=>{ info.style.display="none"; actions.style.display="none"; form.style.display="flex"; } });
            actions.appendChild(btnEdit);
        }

        if(u.username !== 'superadmin' && userRole === 'super') {
            const roleSel = mk("select", "role-select", null, {style:"padding:2px; height:36px;"});
            Object.keys(roleOpts).forEach(k => { const o = mk("option",null,roleOpts[k]); o.value=k; if(u.role===k) o.selected=true; roleSel.appendChild(o); });
            roleSel.onchange = async () => { if(await req("/api/admin/set-role", {targetUsername:u.username, newRole:roleSel.value})) toast("Role Saved", "success"); };
            actions.appendChild(roleSel);
            
            const btnDel = mk("button", "btn-secondary", T.del); 
            confirmBtn(btnDel, T.del, async()=>{ await req("/api/admin/del-user",{delUsername:u.username}); loadUsers(); });
            actions.appendChild(btnDel);
        }

        li.append(info, actions, form);
        ul.appendChild(li);
    });
}

async function loadRoles() {
    const rolesConfig = await req("/api/admin/roles/get");
    if(!rolesConfig) return;
    const container = $("role-editor-content"); if(!container) return; container.innerHTML = "";
    const wrapper = mk("div", "role-table-wrapper");
    const table = mk("table", "role-table"), thead = mk("thead"), trHead = mk("tr");
    trHead.appendChild(mk("th", null, "Role")); [{key:'call',label:'叫號'},{key:'pass',label:'過號'},{key:'recall',label:'重呼'},{key:'issue',label:'發號'},{key:'settings',label:'設定'},{key:'appointment',label:'預約'}].forEach(p => trHead.appendChild(mk("th", null, p.label)));
    thead.appendChild(trHead); table.appendChild(thead); const tbody = mk("tbody");
    ['VIEWER', 'OPERATOR', 'MANAGER'].forEach(role => {
        const config = rolesConfig[role] || { can: [] }; const tr = mk("tr");
        tr.appendChild(mk("td", null, role, {style:"font-weight:bold"}));
        [{key:'call'},{key:'pass'},{key:'recall'},{key:'issue'},{key:'settings'},{key:'appointment'}].forEach(p => { const td = mk("td"); td.appendChild(mk("input", "role-chk", null, { type: "checkbox", dataset: { role: role, perm: p.key }, checked: config.can.includes(p.key) })); tr.appendChild(td); });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody); wrapper.appendChild(table); container.appendChild(wrapper);
}

$("btn-save-roles")?.addEventListener("click", async () => {
    const newConfig = { VIEWER: { level: 0, can: [] }, OPERATOR: { level: 1, can: [] }, MANAGER: { level: 2, can: [] }, ADMIN: { level: 9, can: ['*'] } };
    $$(".role-chk").forEach(chk => { if(chk.checked) newConfig[chk.dataset.role].can.push(chk.dataset.perm); });
    if(await req("/api/admin/roles/update", { rolesConfig: newConfig })) toast("Permissions Updated", "success");
});

async function loadStats() {
    const ul = $("stats-list-ui");
    try {
        const d = await req("/api/admin/stats");
        if (d && d.hourlyCounts) {
            if ($("stats-today-count")) $("stats-today-count").textContent = d.todayCount || 0;
            renderChart(d.hourlyCounts, d.serverHour);
            if (ul) {
                const hist = Array.isArray(d.history) ? d.history : [];
                if (hist.length === 0) ul.innerHTML = `<li style="text-align:center; color:var(--text-sub); padding:20px;">[ 本日尚無紀錄 ]</li>`;
                else ul.innerHTML = hist.map(h => {
                    try { const item = (typeof h === 'string') ? JSON.parse(h) : h; const timeStr = new Date(item.time || item.timestamp).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }); return `<li><span>${timeStr} - <b style="color:var(--primary);">${item.num || item.number}</b> <small style="color:var(--text-sub);">(${item.operator})</small></span></li>`; } catch (err) { return ""; }
                }).join("");
            }
        } else { if (ul) ul.innerHTML = `<li style="text-align:center; padding:20px; color:var(--text-sub);">等待數據...</li>`; }
    } catch (e) { if (ul) ul.innerHTML = `<li style="color:var(--danger); text-align:center; padding:10px;">載入失敗</li>`; }
}

function renderChart(counts, curHr) {
    const c = $("hourly-chart"); if(!c) return; c.innerHTML=""; 
    const safeCounts = counts || new Array(24).fill(0); const max = Math.max(...safeCounts, 1);
    safeCounts.forEach((val, i) => {
        const col = mk("div", `chart-col ${i===curHr?'current':''}`, null, {onclick:()=>openStatModal(i, val)});
        col.innerHTML = `<div class="chart-val">${val||''}</div><div class="chart-bar" style="height:${Math.max(val/max*100, 2)}%; background:${val===0?'var(--border-color)':''}"></div><div class="chart-label">${String(i).padStart(2,'0')}</div>`;
        c.appendChild(col);
    });
}

function renderLogs(logs, init) {
    const ul = $("admin-log-ui"); if(!ul) return; if(init) ul.innerHTML=""; if(!logs?.length && init) { ul.innerHTML="<li>[No Logs]</li>"; return; }
    logs.forEach(msg => { const li=mk("li", null, msg); init ? ul.appendChild(li) : ul.insertBefore(li, ul.firstChild); });
}

const act = (id, api, data={}) => $(id)?.addEventListener("click", async () => {
    const numEl = $("number");
    if(api.includes('call') && numEl) {
        const curr = parseInt(numEl.textContent)||0;
        if(data.direction === 'next') numEl.textContent = curr + 1;
        if(data.direction === 'prev' && curr > 0) numEl.textContent = curr - 1;
    }
    await req(api, data, $(id), 100);
});

act("btn-call-prev", "/api/control/call", {direction:"prev"}); 
act("btn-call-next", "/api/control/call", {direction:"next"}); 
act("btn-mark-passed", "/api/control/pass-current"); 
act("btn-issue-prev", "/api/control/issue", {direction:"prev"}); 
act("btn-issue-next", "/api/control/issue", {direction:"next"});

document.addEventListener("keydown", (e) => {
    if(["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if(e.key === "ArrowRight") $("btn-call-next")?.click();
    if(e.key === "ArrowLeft") $("btn-call-prev")?.click();
    if(e.key.toLowerCase() === "p") $("btn-mark-passed")?.click();
});

$("setNumber")?.addEventListener("click", async()=>{ const n=$("manualNumber").value; if(n>0 && await req("/api/control/set-call",{number:n})) { $("manualNumber").value=""; toast("Saved","success"); } });
$("setIssuedNumber")?.addEventListener("click", async()=>{ const n=$("manualIssuedNumber").value; if(n>=0 && await req("/api/control/set-issue",{number:n})) { $("manualIssuedNumber").value=""; toast("Saved","success"); } });
$("add-passed-btn")?.addEventListener("click", async()=>{ const n=$("new-passed-number").value; if(n>0 && await req("/api/passed/add",{number:n})) $("new-passed-number").value=""; });
$("add-featured-btn")?.addEventListener("click", async()=>{ const t=$("new-link-text").value, u=$("new-link-url").value; if(t&&u && await req("/api/featured/add",{linkText:t, linkUrl:u})) { $("new-link-text").value=""; $("new-link-url").value=""; } });
$("btn-broadcast")?.addEventListener("click", async()=>{ const m=$("broadcast-msg").value; if(m && await req("/api/admin/broadcast",{message:m})) { toast("📢 Sent","success"); $("broadcast-msg").value=""; } });
$("quick-add-1")?.addEventListener("click", async()=>{ await req("/api/control/call", {direction:"next"}, $("quick-add-1"), 100); }); 
$("quick-add-5")?.addEventListener("click", async()=>{ const c=parseInt($("number").textContent)||0; $("manualNumber").value = c + 5; });
confirmBtn($("resetNumber"), "↺ 重置叫號", ()=>req("/api/control/set-call",{number:0})); confirmBtn($("resetIssued"), "↺ 重置發號", ()=>req("/api/control/set-issue",{number:0})); confirmBtn($("resetPassed"), "清空列表", ()=>req("/api/passed/clear")); confirmBtn($("resetFeaturedContents"), "清空連結", ()=>req("/api/featured/clear")); confirmBtn($("resetAll"), "💥 全域重置", ()=>req("/reset")); confirmBtn($("btn-clear-logs"), "清除日誌", ()=>req("/api/logs/clear")); confirmBtn($("btn-clear-stats"), "🗑️ 清空統計", ()=>req("/api/admin/stats/clear").then(()=>loadStats())); confirmBtn($("btn-reset-line-msg"), "↺ 恢復預設", ()=>req("/api/admin/line-settings/reset").then(d=>{if(d)loadLineSettings();}));
$("sound-toggle")?.addEventListener("change", e => req("/set-sound-enabled", {enabled:e.target.checked})); $("public-toggle")?.addEventListener("change", e => req("/set-public-status", {isPublic:e.target.checked}));
$$('input[name="systemMode"]').forEach(r => r.addEventListener("change", async (e) => { if(confirm(T.confirm + " Switch Mode?")) { const res = await req("/set-system-mode", {mode: r.value}); if(!res) { const old = document.querySelector(`input[name="systemMode"][value="${currentSystemMode}"]`); if(old) old.checked = true; } } else { const old = document.querySelector(`input[name="systemMode"][value="${currentSystemMode}"]`); if(old) old.checked = true; } }));

$("admin-lang-selector")?.addEventListener("change", e => { curLang=e.target.value; localStorage.setItem('callsys_lang', curLang); updateLangUI(); });
const modal = $("edit-stats-overlay"); let editHr=null;
function openStatModal(h, val) { $("modal-current-count").textContent=val; editHr=h; modal.style.display="flex"; }
$("btn-modal-close")?.addEventListener("click", ()=>modal.style.display="none");
["btn-stats-minus", "btn-stats-plus"].forEach((id, idx) => $(id)?.addEventListener("click", async()=>{ if(editHr===null) return; const delta = idx===0 ? -1 : 1; await req("/api/admin/stats/adjust", {hour:editHr, delta}); const n = parseInt($("modal-current-count").textContent)+delta; $("modal-current-count").textContent = n<0?0:n; loadStats(); }));
$("btn-export-csv")?.addEventListener("click", async()=>{ const d=await req("/api/admin/export-csv"); if(d?.csvData) { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+d.csvData],{type:'text/csv'})); a.download=d.fileName; a.click(); toast("✅ Downloaded","success"); }});
$("btn-save-unlock-pwd")?.addEventListener("click", async()=>{ if(await req("/api/admin/line-settings/set-unlock-pass", {password:$("line-unlock-pwd").value})) toast("Saved","success"); });
$("add-user-btn")?.addEventListener("click", async()=>{ const u=$("new-user-username").value, p=$("new-user-password").value, n=$("new-user-nickname").value, r=$("new-user-role")?.value; if(await req("/api/admin/add-user", {newUsername:u, newPassword:p, newNickname:n, newRole:r})) { toast("Saved","success"); $("new-user-username").value=""; $("new-user-password").value=""; $("new-user-nickname").value=""; loadUsers(); } });
const lineSettingsConfig = { approach: { label: "快到了", hint: "{current} {target}" }, arrival: { label: "正式到號", hint: "{current} {target}" }, status: { label: "狀態回覆", hint: "{current} {issued}" }, personal: { label: "個人資訊", hint: "{target}" }, passed: { label: "過號回覆", hint: "{list}" }, set_ok: { label: "設定成功", hint: "{target}" }, cancel: { label: "取消成功", hint: "{target}" }, login_hint: { label: "登入提示", hint: "" }, err_passed: { label: "已過號錯誤", hint: "" }, err_no_sub: { label: "無設定錯誤", hint: "" }, set_hint: { label: "設定提示", hint: "" } };

async function loadLineSettings() { 
    const ul = $("line-settings-list-ui"); if (!ul) return;
    const data = await req("/api/admin/line-settings/get"); 
    if(!data) return;
    cachedLineSettings = data;
    renderLineSettings();
}

function renderLineSettings() {
    const ul = $("line-settings-list-ui"); if (!ul || !cachedLineSettings) return; ul.innerHTML=""; 
    req("/api/admin/line-settings/get-unlock-pass").then(res => { if($("line-unlock-pwd") && res) $("line-unlock-pwd").value = res.password || ""; });
    Object.keys(lineSettingsConfig).forEach(key => { 
        const config = lineSettingsConfig[key], val = cachedLineSettings[key] || ""; 
        const li = mk("li", "list-item"); 
        
        // View Mode
        const view = mk("div", "line-setting-row"); 
        const infoDiv = mk("div", "line-setting-info"); 
        const label = mk("span", "line-setting-label", config.label);
        const preview = mk("code", "line-setting-preview", val ? val : "(未設定)");
        if(!val) preview.style.opacity = "0.5";
        infoDiv.append(label, preview);
        const btnEdit = mk("button","btn-secondary", T.edit || "Edit", { onclick:()=>{ view.style.display="none"; editContainer.style.display="flex"; } }); 
        view.append(infoDiv, btnEdit); 
        
        // Edit Mode
        const editContainer = mk("div", "line-edit-box", null, {style:"display:none;"});
        const hint = mk("div", "line-edit-hint", `可用變數: ${config.hint || "無"}`);
        const ta = mk("textarea", null, null, {value:val, placeholder:"請輸入訊息內容..."});
        const btnRow = mk("div", null, null, {style:"display:flex; gap:8px; justify-content:flex-end;"});
        const btnCancel = mk("button","btn-secondary", T.cancel || "Cancel", { onclick:()=>{ editContainer.style.display="none"; view.style.display="flex"; ta.value=val; } });
        const btnSave = mk("button","btn-secondary success", T.save || "Save", { onclick: async()=>{ if(await req("/api/admin/line-settings/save", {[key]:ta.value})) { cachedLineSettings[key] = ta.value; toast(T.saved, "success"); renderLineSettings(); } } });
        btnRow.append(btnCancel, btnSave);
        editContainer.append(hint, ta, btnRow);
        
        li.append(view, editContainer); ul.appendChild(li); 
    }); 
}

document.addEventListener("DOMContentLoaded", () => {
    $("admin-lang-selector").value = curLang; 
    if($("admin-lang-selector-mobile")) $("admin-lang-selector-mobile").value = curLang;
    checkSession(); applyAdminTheme();
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => { 
        $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); 
        $$('.section-group').forEach(s=>s.classList.remove('active')); $(b.dataset.target)?.classList.add('active'); 
        if(b.dataset.target === 'section-stats') loadStats(); 
    }));
    const enter = (id, btnId) => { $(id)?.addEventListener("keyup", e => { if(e.key==="Enter") $(btnId)?.click(); }); };
    enter("username-input", "login-button"); enter("password-input", "login-button"); enter("manualNumber", "setNumber"); enter("manualIssuedNumber", "setIssuedNumber"); enter("new-passed-number", "add-passed-btn"); enter("broadcast-msg", "btn-broadcast");
    const handleLangChange = (e) => { curLang = e.target.value; localStorage.setItem('callsys_lang', curLang); if($("admin-lang-selector")) $("admin-lang-selector").value = curLang; if($("admin-lang-selector-mobile")) $("admin-lang-selector-mobile").value = curLang; updateLangUI(); };
    $("admin-lang-selector")?.addEventListener("change", handleLangChange);
    if($("admin-lang-selector-mobile")) $("admin-lang-selector-mobile").addEventListener("change", handleLangChange);
    $("btn-logout-mobile")?.addEventListener("click", logout);
    $("admin-theme-toggle")?.addEventListener("click", () => { isDark = !isDark; applyAdminTheme(); });
    $("admin-theme-toggle-mobile")?.addEventListener("click", () => { isDark = !isDark; applyAdminTheme(); });
});
