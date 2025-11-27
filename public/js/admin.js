/* ==========================================
 * 後台邏輯 (admin.js) - v88.0 Optimized
 * ========================================== */
const $ = i => document.getElementById(i), $$ = s => document.querySelectorAll(s);
const mk = (t, c, txt, ev={}, ch=[]) => { 
    const e = document.createElement(t); if(c) e.className=c; if(txt) e.textContent=txt; 
    Object.entries(ev).forEach(([k,v])=>e[k.startsWith('on')?k.toLowerCase():k]=v); 
    ch.forEach(x=>x&&e.appendChild(x)); return e; 
};
const toast = (m, t='info') => { const el=$("toast-notification"); el.textContent=m; el.className=`show ${t}`; setTimeout(()=>el.className="", 3000); };

// --- Config & State ---
const i18n = {
    "zh-TW": { status_conn:"✅ 已連線", status_dis:"⚠️ 連線中斷...", saved:"✅ 已儲存", denied:"❌ 權限不足", expired:"Session 過期", login_fail:"登入失敗", confirm:"⚠️ 確認", recall:"↩️ 重呼", edit:"✎", del:"✕", save:"✓", cancel:"✕", login_title:"請登入管理系統", login_btn:"登入", nav_live:"現場控台", nav_stats:"數據報表", nav_booking:"預約管理", nav_settings:"系統設定", nav_line:"LINE設定", logout:"登出", btn_next:"下一號 ▶", btn_prev:"◀ 上一號", btn_pass:"過號", btn_exec:"GO", btn_recall:"➖ 收回", btn_issue:"發號 ➕", btn_fix:"修正", btn_clear_passed:"清空過號", btn_refresh:"重整", btn_clear_stats:"🗑️ 清空", btn_clear_logs:"清除日誌", btn_play:"播放", btn_reset_all:"💥 全域重置", btn_save:"儲存", btn_restore:"恢復預設值", modal_edit:"編輯數據", btn_done:"完成", wait:"等待" },
    "en": { status_conn:"✅ Connected", status_dis:"⚠️ Disconnected...", saved:"✅ Saved", denied:"❌ Denied", expired:"Session Expired", login_fail:"Login Failed", confirm:"⚠️ Confirm", recall:"↩️ Recall", edit:"Edit", del:"Del", save:"Save", cancel:"Cancel", login_title:"Login to Admin Panel", login_btn:"Login", nav_live:"Live Console", nav_stats:"Statistics", nav_booking:"Booking", nav_settings:"Settings", nav_line:"Line Config", logout:"Logout", btn_next:"Next ▶", btn_prev:"◀ Prev", btn_pass:"Pass", btn_exec:"GO", btn_recall:"➖ Recall", btn_issue:"Issue ➕", btn_fix:"Fix", btn_clear_passed:"Clear Passed", btn_refresh:"Refresh", btn_clear_stats:"🗑️ Clear", btn_clear_logs:"Clear Logs", btn_play:"Play", btn_reset_all:"💥 Factory Reset", btn_save:"Save", btn_restore:"Restore Defaults", modal_edit:"Edit Data", btn_done:"Done", wait:"Waiting" }
};
let curLang = localStorage.getItem('callsys_lang')||'zh-TW', T = i18n[curLang], token="", userRole="normal", username="", uniqueUser="", cachedLine=null, isDark = localStorage.getItem('callsys_admin_theme') === 'dark';
const socket = io({ autoConnect: false, auth: { token: "" } });

// --- Core Functions ---
async function req(url, data={}, btn=null) {
    if(btn) btn.disabled=true;
    try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, token }) });
        const res = await r.json();
        if(!r.ok) { if(r.status===403 && !res.error?.includes("權限")) logout(); toast(`❌ ${res.error||'Error'}`, "error"); return null; }
        return res;
    } catch(e) { toast(`❌ ${e.message}`, "error"); return null; } finally { if(btn) setTimeout(()=>btn.disabled=false, 300); }
}
const confirmBtn = (el, txt, action) => {
    if(!el) return; let t, c=5;
    el.onclick = (e) => { e.stopPropagation(); if(el.classList.contains("is-confirming")) { action(); reset(); } else { el.classList.add("is-confirming"); el.textContent = `${T.confirm} (${c})`; t = setInterval(() => { c--; el.textContent = `${T.confirm} (${c})`; if(c<=0) reset(); }, 1000); } };
    const reset = () => { clearInterval(t); el.classList.remove("is-confirming"); el.textContent = txt; c=5; };
};
const updateLangUI = () => {
    T = i18n[curLang]||i18n["zh-TW"]; $$('[data-i18n]').forEach(e => e.textContent = T[e.getAttribute('data-i18n')]||"");
    $$('[data-i18n-ph]').forEach(e => e.placeholder = T[e.getAttribute('data-i18n-ph')]||"");
    loadUsers(); loadStats(); loadAppointments(); if(cachedLine) renderLineSettings(); else loadLineSettings();
};
function renderList(ulId, list, fn, emptyMsg="[ Empty ]") {
    const ul = $(ulId); if(!ul) return; ul.innerHTML = "";
    if(!list?.length) return ul.innerHTML=`<li style="text-align:center;padding:15px;color:var(--text-sub);">${emptyMsg}</li>`;
    list.forEach(x => ul.appendChild(fn(x)));
}
function applyTheme() {
    document.body.classList.toggle('dark-mode', isDark); localStorage.setItem('callsys_admin_theme', isDark?'dark':'light');
    if($('admin-theme-toggle')) $('admin-theme-toggle').textContent = isDark ? '☀️' : '🌙';
}

// --- Logic & UI ---
const checkSession = () => {
    token = localStorage.getItem('callsys_token'); uniqueUser = localStorage.getItem('callsys_user');
    userRole = localStorage.getItem('callsys_role'); username = localStorage.getItem('callsys_nick');
    if(token && uniqueUser) showPanel(); else showLogin();
};
const logout = () => { localStorage.removeItem('callsys_token'); location.reload(); };
const showLogin = () => { $("login-container").style.display="block"; $("admin-panel").style.display="none"; socket.disconnect(); };
const showPanel = () => {
    $("login-container").style.display="none"; $("admin-panel").style.display="flex"; $("sidebar-user-info").textContent = username;
    const isSuper = userRole === 'super';
    if($("nav-btn-booking")) $("nav-btn-booking").style.display = isSuper ? "flex" : "none";
    if(!isSuper && $("section-booking")) $("section-booking").style.display = "none";
    ["card-user-management", "btn-export-csv", "mode-switcher-group", "unlock-pwd-group", "role-editor-container"].forEach(id => $(id) && ($(id).style.display = isSuper ? "block" : "none"));
    ['resetNumber','resetIssued','resetPassed','resetFeaturedContents','btn-clear-logs','btn-clear-stats','btn-reset-line-msg','resetAll'].forEach(id => $(id) && ($(id).style.display = (userRole==='ADMIN'||isSuper)?'block':'none'));
    if(isSuper) loadRoles(); socket.auth.token = token; socket.connect(); updateLangUI();
};

// --- Socket Events ---
socket.on("connect", () => { $("status-bar").classList.remove("visible"); toast(`${T.status_conn} (${username})`, "success"); });
socket.on("disconnect", () => $("status-bar").classList.add("visible"));
socket.on("updateQueue", d => { $("number").textContent=d.current; $("issued-number").textContent=d.issued; $("waiting-count").textContent=Math.max(0, d.issued-d.current); loadStats(); });
socket.on("update", n => { $("number").textContent=n; loadStats(); });
socket.on("initAdminLogs", l => renderLogs(l, true));
socket.on("newAdminLog", l => renderLogs([l], false));
socket.on("updatePublicStatus", b => $("public-toggle").checked = b);
socket.on("updateSoundSetting", b => $("sound-toggle").checked = b);
socket.on("updateSystemMode", m => $$('input[name="systemMode"]').forEach(r => r.checked = (r.value === m)));
socket.on("updateAppointments", l => renderAppointments(l));
socket.on("updateOnlineAdmins", l => renderList("online-users-list", (l||[]).sort((a,b)=>(a.role==='super'?-1:1)), u => mk("li","list-item",null,{},[mk("span","list-main-text",`🟢 ${u.nickname}`), mk("span","list-sub-text",u.username)]), "Wait..."));
socket.on("updatePassed", l => renderList("passed-list-ui", l, n => {
    const li = mk("li", "list-item");
    const acts = mk("div", "list-actions", null, {}, [
        mk("button", "btn-secondary", T.recall, {onclick:()=>{ if(confirm(`Recall ${n}?`)) req("/api/control/recall-passed",{number:n}); }}),
        (b => { confirmBtn(b, T.del, ()=>req("/api/passed/remove",{number:n})); return b; })(mk("button", "btn-secondary", T.del))
    ]);
    return mk("li", "list-item", null, {}, [mk("span","list-main-text",`${n} 號`,{style:"font-size:1.2rem;color:var(--primary);"}), acts]);
}, T.wait));
socket.on("updateFeaturedContents", l => renderList("featured-list-ui", l, item => {
    const view = mk("div", "list-info", null, {}, [mk("span","list-main-text",item.linkText), mk("span","list-sub-text",item.linkUrl)]);
    const form = mk("div", "edit-form-wrapper", null, {style:"display:none;"}, [
        mk("input",null,null,{value:item.linkText, placeholder:"Name"}), mk("input",null,null,{value:item.linkUrl, placeholder:"URL"}),
        mk("div","edit-form-actions",null,{},[
            mk("button","btn-secondary",T.cancel,{onclick:()=>{form.style.display="none";view.style.display="flex";acts.style.display="flex";}}),
            mk("button","btn-secondary success",T.save,{onclick:async()=>{if(await req("/api/featured/edit",{oldLinkText:item.linkText,oldLinkUrl:item.linkUrl,newLinkText:form.children[0].value,newLinkUrl:form.children[1].value})) toast(T.saved,"success");}})
        ])
    ]);
    const acts = mk("div", "list-actions", null, {}, [
        mk("button", "btn-secondary", T.edit, {onclick:()=>{form.style.display="flex";view.style.display="none";acts.style.display="none";}}),
        mk("button", "btn-secondary", T.del, {onclick:()=>req("/api/featured/remove", item)})
    ]);
    return mk("li", "list-item", null, {}, [view, acts, form]);
}));

// --- Data Loading & Rendering ---
async function loadAppointments() {
    try { renderAppointments((await req("/api/appointment/list"))?.appointments); } catch(e){}
}
function renderAppointments(list) {
    renderList("appointment-list-ui", list, a => {
        const dt = new Date(a.scheduled_time), dateStr = dt.toLocaleDateString()+" "+dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        const btnDel = mk("button", "btn-secondary", T.del); confirmBtn(btnDel, T.del, async()=>await req("/api/appointment/remove",{id:a.id}));
        return mk("li", "list-item", null, {}, [
            mk("div", "list-info", null, {}, [mk("span","list-main-text",`${a.number} 號`,{style:"color:var(--primary);font-size:1.1rem;"}), mk("span","list-sub-text",`📅 ${dateStr}`)]),
            mk("div", "list-actions", null, {}, [btnDel])
        ]);
    }, "暫無預約");
}
async function loadUsers() {
    const d = await req("/api/admin/users"); if(!d?.users) return;
    const roles = { 'VIEWER':'Viewer', 'OPERATOR':'Operator', 'MANAGER':'Manager', 'ADMIN':'Admin' };
    renderList("user-list-ui", d.users, u => {
        const view = mk("div", "list-info", null, {}, [mk("span","list-main-text",`${u.role==='ADMIN'?'👑':(u.role==='MANAGER'?'🛡️':'👤')} ${u.nickname}`), mk("span","list-sub-text",`${u.username} (${roles[u.role]||u.role})`)]);
        const acts = mk("div", "list-actions");
        const form = mk("div", "edit-form-wrapper", null, {style:"display:none;"}, [
            mk("input",null,null,{value:u.nickname, placeholder:"Nickname"}),
            mk("div","edit-form-actions",null,{},[
                mk("button","btn-secondary",T.cancel,{onclick:()=>{form.style.display="none";view.style.display="flex";acts.style.display="flex";}}),
                mk("button","btn-secondary success",T.save,{onclick:async()=>{if(await req("/api/admin/set-nickname",{targetUsername:u.username, nickname:form.children[0].value})) {toast(T.saved,"success"); loadUsers();}}})
            ])
        ]);
        if(u.username === uniqueUser || userRole === 'super') acts.appendChild(mk("button","btn-secondary",T.edit,{onclick:()=>{view.style.display="none";acts.style.display="none";form.style.display="flex";}}));
        if(u.username !== 'superadmin' && userRole === 'super') {
            const sel = mk("select","role-select",null,{onchange:async()=>await req("/api/admin/set-role",{targetUsername:u.username, newRole:sel.value})});
            Object.keys(roles).forEach(k=>sel.add(new Option(roles[k], k, false, u.role===k)));
            const btnDel = mk("button","btn-secondary",T.del); confirmBtn(btnDel, T.del, async()=>{await req("/api/admin/del-user",{delUsername:u.username}); loadUsers();});
            acts.append(sel, btnDel);
        }
        return mk("li", "list-item", null, {}, [view, acts, form]);
    }, "Wait...");
}
async function loadRoles() {
    const cfg = await req("/api/admin/roles/get"), ctr = $("role-editor-content"); if(!cfg || !ctr) return; ctr.innerHTML="";
    const tbl = mk("table", "role-table"), th = mk("tr");
    ['Role', '叫號', '過號', '重呼', '發號', '設定', '預約'].forEach(t => th.appendChild(mk("th", null, t)));
    tbl.appendChild(mk("thead", null, null, {}, [th]));
    const tb = mk("tbody");
    ['VIEWER', 'OPERATOR', 'MANAGER'].forEach(r => {
        const tr = mk("tr", null, null, {}, [mk("td", null, r, {style:"font-weight:bold"})]);
        ['call','pass','recall','issue','settings','appointment'].forEach(k => tr.appendChild(mk("td", null, null, {}, [mk("input", "role-chk", null, {type:"checkbox", dataset:{role:r, perm:k}, checked:(cfg[r]?.can||[]).includes(k)})])));
        tb.appendChild(tr);
    });
    tbl.appendChild(tb); ctr.appendChild(mk("div", "role-table-wrapper", null, {}, [tbl]));
}
async function loadStats() {
    try {
        const d = await req("/api/admin/stats");
        if(d?.hourlyCounts) {
            if($("stats-today-count")) $("stats-today-count").textContent = d.todayCount||0;
            const chart = $("hourly-chart"); chart.innerHTML=""; const max = Math.max(...d.hourlyCounts, 1);
            d.hourlyCounts.forEach((v, i) => chart.appendChild(mk("div", `chart-col ${i===d.serverHour?'current':''}`, null, {onclick:()=>openStatModal(i,v)}, [
                mk("div","chart-val",v||""), mk("div","chart-bar",null,{style:`height:${Math.max(v/max*100,2)}%;background:${v===0?'var(--border-color)':''}`}), mk("div","chart-label",String(i).padStart(2,'0'))
            ])));
            renderList("stats-list-ui", d.history||[], h => mk("li",null,null,{},[mk("span",null,null,{innerHTML:`${new Date(h.timestamp).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})} - <b style="color:var(--primary)">${h.number}</b> <small style="color:var(--text-sub)">(${h.operator})</small>`})]), "本日尚無紀錄");
        }
    } catch(e){}
}
async function loadLineSettings() { cachedLine = await req("/api/admin/line-settings/get"); renderLineSettings(); }
function renderLineSettings() {
    renderList("line-settings-list-ui", Object.keys(cachedLine||{}), k => {
        const val = cachedLine[k]||"", row = mk("div", "line-setting-row");
        const edit = mk("div", "line-edit-box", null, {style:"display:none;"}, [
            mk("textarea", null, null, {value:val, placeholder:"Content..."}),
            mk("div", null, null, {style:"display:flex;gap:8px;justify-content:flex-end;"}, [
                mk("button","btn-secondary",T.cancel,{onclick:()=>{edit.style.display="none";row.style.display="flex";}}),
                mk("button","btn-secondary success",T.save,{onclick:async()=>{if(await req("/api/admin/line-settings/save",{[k]:edit.children[0].value})){cachedLine[k]=edit.children[0].value;toast(T.saved,"success");renderLineSettings();}}})
            ])
        ]);
        row.append(mk("div","line-setting-info",null,{},[mk("span","line-setting-label",k.split(':').pop()), mk("code","line-setting-preview",val||"(未設定)",{style:val?"":"opacity:0.5"})]), mk("button","btn-secondary",T.edit,{onclick:()=>{row.style.display="none";edit.style.display="flex";}}));
        return mk("li", "list-item", null, {}, [row, edit]);
    });
    req("/api/admin/line-settings/get-unlock-pass").then(r=>{ if($("line-unlock-pwd") && r) $("line-unlock-pwd").value=r.password||""; });
}
function renderLogs(logs, init) {
    const ul = $("admin-log-ui"); if(!ul) return; if(init) ul.innerHTML=""; 
    if(!logs?.length && init) return ul.innerHTML="<li>[No Logs]</li>";
    logs.forEach(m => { const li = mk("li", null, m); init ? ul.appendChild(li) : ul.insertBefore(li, ul.firstChild); });
}

// --- Interactions ---
const act = (id, api, data={}) => $(id)?.addEventListener("click", async () => {
    const num = $("number"); if(api.includes('call') && num && data.direction) num.textContent = parseInt(num.textContent||0) + (data.direction==='next'?1:-1);
    await req(api, data, $(id));
});
const bind = (id, fn) => $(id)?.addEventListener("click", fn);

// Bindings
act("btn-call-prev", "/api/control/call", {direction:"prev"}); 
act("btn-call-next", "/api/control/call", {direction:"next"});
act("btn-mark-passed", "/api/control/pass-current"); 
act("btn-issue-prev", "/api/control/issue", {direction:"prev"}); 
act("btn-issue-next", "/api/control/issue", {direction:"next"});
bind("setNumber", async()=>{ const n=$("manualNumber").value; if(n>0 && await req("/api/control/set-call",{number:n})) { $("manualNumber").value=""; toast(T.saved,"success"); }});
bind("setIssuedNumber", async()=>{ const n=$("manualIssuedNumber").value; if(n>=0 && await req("/api/control/set-issue",{number:n})) { $("manualIssuedNumber").value=""; toast(T.saved,"success"); }});
bind("add-passed-btn", async()=>{ const n=$("new-passed-number").value; if(n>0 && await req("/api/passed/add",{number:n})) $("new-passed-number").value=""; });
bind("add-featured-btn", async()=>{ const t=$("new-link-text").value, u=$("new-link-url").value; if(t&&u && await req("/api/featured/add",{linkText:t, linkUrl:u})) { $("new-link-text").value=""; $("new-link-url").value=""; }});
bind("btn-broadcast", async()=>{ const m=$("broadcast-msg").value; if(m && await req("/api/admin/broadcast",{message:m})) { toast("📢 Sent","success"); $("broadcast-msg").value=""; }});
bind("btn-add-appt", async()=>{ const n=$("appt-number").value, t=$("appt-time").value; if(n&&t && await req("/api/appointment/add",{number:parseInt(n), timeStr:t})) { toast(T.saved,"success"); $("appt-number").value=""; $("appt-time")._flatpickr?.clear(); }});
bind("btn-save-roles", async()=>{ 
    const c={ VIEWER:{level:0,can:[]}, OPERATOR:{level:1,can:[]}, MANAGER:{level:2,can:[]}, ADMIN:{level:9,can:['*']} };
    $$(".role-chk:checked").forEach(k => c[k.dataset.role].can.push(k.dataset.perm));
    if(await req("/api/admin/roles/update", {rolesConfig:c})) toast(T.saved,"success");
});
bind("btn-export-csv", async()=>{ const d=await req("/api/admin/export-csv"); if(d?.csvData) { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+d.csvData],{type:'text/csv'})); a.download=d.fileName; a.click(); }});
bind("add-user-btn", async()=>{ const u=$("new-user-username").value, p=$("new-user-password").value, n=$("new-user-nickname").value, r=$("new-user-role")?.value; if(await req("/api/admin/add-user", {newUsername:u, newPassword:p, newNickname:n, newRole:r})) { toast(T.saved,"success"); loadUsers(); } });
bind("admin-theme-toggle", ()=>{ isDark = !isDark; applyTheme(); });
bind("admin-theme-toggle-mobile", ()=>{ isDark = !isDark; applyTheme(); });
bind("login-button", async () => {
    const res = await fetch("/login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:$("username-input").value, password:$("password-input").value})}).then(r=>r.json()).catch(()=>({error:T.login_fail}));
    if(res.token) { localStorage.setItem('callsys_token', res.token); localStorage.setItem('callsys_user', res.username); localStorage.setItem('callsys_role', res.userRole); localStorage.setItem('callsys_nick', res.nickname); checkSession(); } else $("login-error").textContent=res.error||T.login_fail;
});
bind("btn-logout", logout); bind("btn-logout-mobile", logout);

["resetNumber","resetIssued","resetPassed","resetFeaturedContents","resetAll","btn-clear-logs","btn-clear-stats","btn-reset-line-msg"].forEach(id => {
    confirmBtn($(id), $(id)?.textContent, () => req(id.includes('clear') ? (id.includes('logs') ? "/api/logs/clear" : "/api/admin/stats/clear") : (id==='resetAll' ? "/reset" : (id.includes('line') ? "/api/admin/line-settings/reset" : (id.includes('Passed') ? "/api/passed/clear" : (id.includes('Featured') ? "/api/featured/clear" : `/api/control/${id==='resetNumber'?'set-call':'set-issue'}`))))), id.startsWith('reset') && !id.includes('All') && !id.includes('Passed') && !id.includes('Featured') && !id.includes('line') ? {number:0} : {} });
});

// Misc UI Handlers
let editHr=null; const modal=$("edit-stats-overlay");
bind("btn-modal-close", ()=>modal.style.display="none");
window.openStatModal = (h,v) => { $("modal-current-count").textContent=v; editHr=h; modal.style.display="flex"; };
["btn-stats-minus", "btn-stats-plus"].forEach((id, i) => bind(id, async()=>{ if(editHr!==null) { await req("/api/admin/stats/adjust", {hour:editHr, delta:i?1:-1}); $("modal-current-count").textContent = Math.max(0, parseInt($("modal-current-count").textContent)+(i?1:-1)); loadStats(); }}));

document.addEventListener("DOMContentLoaded", () => {
    checkSession(); applyTheme();
    if($("admin-lang-selector")) $("admin-lang-selector").value = curLang;
    if($("appt-time")) flatpickr("#appt-time", { enableTime:true, dateFormat:"Y-m-d H:i", time_24hr:true, locale:"zh_tw", minDate:"today", disableMobile:"true" });
    $$('.nav-btn').forEach(b => b.onclick = () => {
        $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
        $$('.section-group').forEach(s=>s.classList.remove('active')); $(b.dataset.target)?.classList.add('active');
        if(b.dataset.target === 'section-stats') loadStats();
        if(b.dataset.target === 'section-booking') loadAppointments();
    });
    $("admin-lang-selector")?.addEventListener("change", e => { curLang=e.target.value; localStorage.setItem('callsys_lang', curLang); updateLangUI(); });
    $("sound-toggle")?.addEventListener("change", e => req("/set-sound-enabled", {enabled:e.target.checked})); 
    $("public-toggle")?.addEventListener("change", e => req("/set-public-status", {isPublic:e.target.checked}));
    $$('input[name="systemMode"]').forEach(r => r.onchange = () => confirm(T.confirm+" Switch Mode?") ? req("/set-system-mode", {mode:r.value}) : (r.checked=!r.checked));
    document.addEventListener("keydown", e => {
        if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) { if(e.key==="Enter" && !e.shiftKey) { const map={"username-input":"login-button","manualNumber":"setNumber","manualIssuedNumber":"setIssuedNumber","new-passed-number":"add-passed-btn"}; if(map[document.activeElement.id]) $(map[document.activeElement.id])?.click(); } return; }
        if(e.key==="ArrowRight") $("btn-call-next")?.click(); if(e.key==="ArrowLeft") $("btn-call-prev")?.click(); if(e.key.toLowerCase()==="p") $("btn-mark-passed")?.click();
    });
});
