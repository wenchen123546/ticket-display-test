/* ==========================================
 * 後台邏輯 (admin.js) - v49.1 Stats & Nickname Fix
 * ========================================== */
const $ = i => document.getElementById(i);
const $$ = s => document.querySelectorAll(s);
const mk = (t, c, txt, ev={}) => { const e = document.createElement(t); if(c) e.className=c; if(txt) e.textContent=txt; Object.entries(ev).forEach(([k,v])=>e[k]=v); return e; };

const i18n = {
    "zh-TW": { 
        status_conn:"✅ 已連線", status_dis:"連線中斷...", saved:"✅ 已儲存", denied:"❌ 權限不足", expired:"Session 過期", login_fail:"登入失敗",
        confirm:"⚠️ 確認", recall:"↩️ 重呼", edit:"✎", del:"✕", save:"✓", cancel:"✕",
        btn_save:"儲存", btn_cancel:"取消",
        // ... (保留其他常用的翻譯，為節省篇幅省略部分未變動字串)
    },
    "en": { 
        status_conn:"✅ Connected", status_dis:"Disconnected...", saved:"✅ Saved", denied:"❌ Denied", expired:"Expired", login_fail:"Failed",
        confirm:"⚠️ Confirm", recall:"↩️ Recall", edit:"Edit", del:"Del", save:"Save", cancel:"Cancel",
        btn_save:"Save", btn_cancel:"Cancel",
    }
};

let curLang = localStorage.getItem('callsys_lang')||'zh-TW', T = i18n[curLang];
let token="", userRole="normal", username="", uniqueUser="", toastTimer;
const socket = io({ autoConnect: false, auth: { token: "" } });

function toast(msg, type='info') {
    const t = $("toast-notification"); if(!t) return;
    t.textContent = msg; t.className = `${type} show`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

// --- Core API & UI ---
function updateLangUI() {
    T = i18n[curLang] || i18n["zh-TW"]; // Fallback
    $$('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if(T[k]) el.textContent = T[k]; });
    $$('[data-i18n-ph]').forEach(el => { const k = el.getAttribute('data-i18n-ph'); if(T[k]) el.placeholder = T[k]; });
    loadUsers(); loadStats(); loadLineSettings();
    req("/api/featured/get").then(res => { if(res) socket.emit("updateFeaturedContents", res); });
}

async function req(url, data={}, lockBtn=null) {
    if(lockBtn) lockBtn.disabled=true;
    try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, token }) });
        const res = await r.json();
        if(!r.ok) {
            if(r.status===403) { toast(res.error?.includes("權限")?T.denied:T.expired, "error"); if(!res.error?.includes("權限")) logout(); }
            else toast(`❌ ${res.error||'Error'}`, "error");
            return null;
        }
        return res;
    } catch(e) { toast(`❌ ${e.message}`, "error"); return null; }
    finally { if(lockBtn) setTimeout(()=>lockBtn.disabled=false, 300); }
}

function confirmBtn(el, origTxt, action) {
    if(!el) return; let t, c=5;
    el.onclick = (e) => {
        e.stopPropagation();
        if(el.classList.contains("is-confirming")) { action(); reset(); } 
        else { el.classList.add("is-confirming"); el.textContent = `${T.confirm} (${c})`; t = setInterval(() => { c--; el.textContent = `${T.confirm} (${c})`; if(c<=0) reset(); }, 1000); }
    };
    const reset = () => { clearInterval(t); el.classList.remove("is-confirming"); el.textContent = origTxt; c=5; };
}

function checkSession() {
    const storedToken = localStorage.getItem('callsys_token');
    const storedUser = localStorage.getItem('callsys_user');
    const storedRole = localStorage.getItem('callsys_role');
    const storedNick = localStorage.getItem('callsys_nick');
    if(storedToken && storedUser) {
        token = storedToken; uniqueUser = storedUser; userRole = storedRole; username = storedNick;
        showPanel();
    } else { showLogin(); }
}
function logout() { localStorage.removeItem('callsys_token'); token=""; location.reload(); }
function showLogin() { $("login-container").style.display="block"; $("admin-panel").style.display="none"; socket.disconnect(); }
async function showPanel() {
    $("login-container").style.display="none"; $("admin-panel").style.display="flex";
    if($("sidebar-user-info")) $("sidebar-user-info").textContent = `Hi, ${username}`;
    const isSuper = userRole === 'super';
    ["card-user-management", "btn-export-csv", "mode-switcher-group", "unlock-pwd-group"].forEach(id => { if($(id)) $(id).style.display = isSuper ? "block" : "none"; });
    if($('button[data-target="section-line"]')) $('button[data-target="section-line"]').style.display = isSuper?"flex":"none";
    socket.auth.token = token; socket.connect();
    updateLangUI(); 
}

$("btn-logout")?.addEventListener("click", logout);
$("login-button").onclick = async () => {
    const b=$("login-button"); b.disabled=true;
    const res = await fetch("/login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:$("username-input").value, password:$("password-input").value})}).then(r=>r.json()).catch(()=>({error:T.login_fail}));
    if(res.token) { 
        token=res.token; userRole=res.role; username=res.nickname; uniqueUser=res.username;
        localStorage.setItem('callsys_token', token); localStorage.setItem('callsys_user', uniqueUser);
        localStorage.setItem('callsys_role', userRole); localStorage.setItem('callsys_nick', username);
        showPanel(); 
    } else { $("login-error").textContent=res.error||T.login_fail; }
    b.disabled=false;
};

// --- Socket Events ---
socket.on("connect", () => { $("status-bar").classList.remove("visible"); toast(`${T.status_conn} (${username})`, "success"); });
socket.on("disconnect", () => { $("status-bar").classList.add("visible"); });
socket.on("updateQueue", d => { $("number").textContent=d.current; $("issued-number").textContent=d.issued; $("waiting-count").textContent=Math.max(0, d.issued-d.current); loadStats(); });
socket.on("update", n => { $("number").textContent=n; loadStats(); });
socket.on("initAdminLogs", l => renderLogs(l, true));
socket.on("newAdminLog", l => renderLogs([l], false));
socket.on("updatePublicStatus", b => { if($("public-toggle")) $("public-toggle").checked = b; });
socket.on("updateSoundSetting", b => { if($("sound-toggle")) $("sound-toggle").checked=b; });
socket.on("updateSystemMode", m => $$('input[name="systemMode"]').forEach(r => r.checked=(r.value===m)));
socket.on("updatePassed", list => {
    const ul = $("passed-list-ui"); if(!ul) return; ul.innerHTML="";
    list.forEach(n => {
        const li = mk("li");
        const div = mk("div", null, null, {style:"display:flex; gap:10px; align-items:center;"});
        div.append(mk("span", null, n, {style:"font-weight:bold"}), mk("button", "btn-secondary", T.recall, {onclick:()=>{ if(confirm(`Recall ${n}?`)) req("/api/control/recall-passed",{number:n}); }}));
        const del = mk("button", "delete-item-btn", T.del); confirmBtn(del, T.del, ()=>req("/api/passed/remove",{number:n}));
        li.append(div, del); ul.appendChild(li);
    });
});

// --- [修復] User Management (Edit Nickname + Role) ---
async function loadUsers() {
    const ul = $("user-list-ui"); if(!ul) return;
    const d = await req("/api/admin/users");
    if(!d || !d.users) return; ul.innerHTML="";
    
    const roleOpts = { 'VIEWER':'Viewer', 'OPERATOR':'Operator', 'MANAGER':'Manager', 'ADMIN':'Admin' };

    d.users.forEach(u => {
        const li = mk("li");
        
        // 1. View Mode
        const view = mk("div", null, null, {style:"display:flex; justify-content:space-between; width:100%; align-items:center;"});
        const info = mk("div", null, null, {style:"display:flex; flex-direction:column;"});
        const roleLabel = roleOpts[u.role] || u.role;
        info.append(mk("span", null, `${u.role==='ADMIN'?'👑':'👤'} ${u.nickname}`, {style:"font-weight:600"}), mk("small", null, `${u.username} • ${roleLabel}`, {style:"color:#666;"}));
        
        // 2. Edit Mode (Hidden by default)
        const editDiv = mk("div", null, null, {style:"display:none; width:100%; gap:5px; align-items:center;"});
        const inputNick = mk("input", null, null, {value:u.nickname, type:"text", placeholder:"Nickname"});
        const btnSave = mk("button", "btn-secondary success", T.save || "儲存");
        btnSave.onclick = async () => { 
            if(inputNick.value && await req("/api/admin/set-nickname", {targetUsername:u.username, nickname:inputNick.value})) {
                toast("Saved", "success"); loadUsers(); 
            }
        };
        const btnCancel = mk("button", "btn-secondary", T.cancel || "取消", { onclick:()=>{ editDiv.style.display="none"; view.style.display="flex"; } });
        editDiv.append(inputNick, btnSave, btnCancel);

        // Actions
        const acts = mk("div", null, null, {style:"display:flex; gap:5px; flex-shrink:0;"});
        
        // Edit Button (Show for self or if Super Admin)
        if(u.username === uniqueUser || userRole === 'super') {
            const btnEdit = mk("button", "btn-secondary", T.edit || "✎", { onclick:()=>{ view.style.display="none"; editDiv.style.display="flex"; inputNick.focus(); } });
            acts.appendChild(btnEdit);
        }

        // Role Selector & Delete (Super Admin Only)
        if(u.username !== 'superadmin' && userRole === 'super') {
            const roleSel = mk("select", null, null, {style:"padding:2px; font-size:0.8rem;"});
            Object.keys(roleOpts).forEach(k => { const o = mk("option",null,roleOpts[k]); o.value=k; if(u.role===k) o.selected=true; roleSel.appendChild(o); });
            roleSel.onchange = async () => { if(await req("/api/admin/set-role", {targetUsername:u.username, newRole:roleSel.value})) toast("Role Saved", "success"); };
            acts.appendChild(roleSel);
            
            const del = mk("button", "delete-item-btn", T.del); 
            confirmBtn(del, T.del, async()=>{ await req("/api/admin/del-user",{delUsername:u.username}); loadUsers(); });
            acts.appendChild(del);
        }

        view.append(info, acts); 
        li.append(view, editDiv); 
        ul.appendChild(li);
    });
}

// --- [修復] Load Stats ---
async function loadStats() {
    const ul = $("stats-list-ui"); 
    try {
        const d = await req("/api/admin/stats");
        if(d && d.hourlyCounts) {
            if($("stats-today-count")) $("stats-today-count").textContent = d.todayCount;
            renderChart(d.hourlyCounts, d.serverHour);
            
            if(ul) {
                // 確保 history 存在，否則顯示空
                const hist = d.history || [];
                if(hist.length === 0) {
                    ul.innerHTML = `<li><span style="color:#999;">[ 尚無今日數據 ]</span></li>`;
                } else {
                    ul.innerHTML = hist.map(h => {
                        const item = typeof h === 'string' ? JSON.parse(h) : h;
                        return `<li><span>${new Date(item.time||item.timestamp).toLocaleTimeString('zh-TW',{hour12:false})} - <b>${item.num||item.number}</b> <small>(${item.operator})</small></span></li>`;
                    }).join("");
                }
            }
        }
    } catch(e) {
        if(ul) ul.innerHTML = `<li>Error loading stats</li>`;
    }
}

function renderChart(counts, curHr) {
    const c = $("hourly-chart"); if(!c) return; c.innerHTML=""; 
    const safeCounts = counts || new Array(24).fill(0);
    const max = Math.max(...safeCounts, 1);
    safeCounts.forEach((val, i) => {
        const col = mk("div", `chart-col ${i===curHr?'current':''}`, null, {onclick:()=>openStatModal(i, val)});
        col.innerHTML = `<div class="chart-val">${val||''}</div><div class="chart-bar" style="height:${Math.max(val/max*100, 2)}%; background:${val===0?'#e5e7eb':''}"></div><div class="chart-label">${String(i).padStart(2,'0')}</div>`;
        c.appendChild(col);
    });
}

function renderLogs(logs, init) {
    const ul = $("admin-log-ui"); if(!ul) return; if(init) ul.innerHTML="";
    if(!logs?.length && init) { ul.innerHTML="<li>[No Logs]</li>"; return; }
    logs.forEach(msg => { const li=mk("li", null, msg); init ? ul.appendChild(li) : ul.insertBefore(li, ul.firstChild); });
}

// --- Event Listeners ---
const act = (id, api, data={}) => $(id)?.addEventListener("click", () => req(api, data, $(id)));
act("btn-call-prev", "/api/control/call", {direction:"prev"});
act("btn-call-next", "/api/control/call", {direction:"next"});
act("btn-mark-passed", "/api/control/pass-current");
act("btn-issue-prev", "/api/control/issue", {direction:"prev"});
act("btn-issue-next", "/api/control/issue", {direction:"next"});

$("setNumber")?.addEventListener("click", async()=>{ const n=$("manualNumber").value; if(n>0 && await req("/api/control/set-call",{number:n})) { $("manualNumber").value=""; toast("Saved","success"); } });
$("setIssuedNumber")?.addEventListener("click", async()=>{ const n=$("manualIssuedNumber").value; if(n>=0 && await req("/api/control/set-issue",{number:n})) { $("manualIssuedNumber").value=""; toast("Saved","success"); } });
$("add-passed-btn")?.addEventListener("click", async()=>{ const n=$("new-passed-number").value; if(n>0 && await req("/api/passed/add",{number:n})) $("new-passed-number").value=""; });
$("add-featured-btn")?.addEventListener("click", async()=>{ const t=$("new-link-text").value, u=$("new-link-url").value; if(t&&u && await req("/api/featured/add",{linkText:t, linkUrl:u})) { $("new-link-text").value=""; $("new-link-url").value=""; } });
$("btn-broadcast")?.addEventListener("click", async()=>{ const m=$("broadcast-msg").value; if(m && await req("/api/admin/broadcast",{message:m})) { toast("📢 Sent","success"); $("broadcast-msg").value=""; } });

$("quick-add-1")?.addEventListener("click", async()=>{ await req("/api/control/call", {direction:"next"}); }); 
$("quick-add-5")?.addEventListener("click", async()=>{ const c=parseInt($("number").textContent)||0; $("manualNumber").value = c + 5; });
$("quick-clear")?.addEventListener("click", ()=>{ $("manualNumber").value=""; });

confirmBtn($("resetNumber"), "↺ 重置叫號", ()=>req("/api/control/set-call",{number:0}));
confirmBtn($("resetIssued"), "↺ 重置發號", ()=>req("/api/control/set-issue",{number:0}));
confirmBtn($("resetPassed"), "清空列表", ()=>req("/api/passed/clear"));
confirmBtn($("resetFeaturedContents"), "清空連結", ()=>req("/api/featured/clear"));
confirmBtn($("resetAll"), "💥 全域重置", ()=>req("/reset"));
confirmBtn($("btn-clear-logs"), "清除日誌", ()=>req("/api/logs/clear"));
confirmBtn($("btn-clear-stats"), "🗑️ 清空統計", ()=>req("/api/admin/stats/clear").then(()=>loadStats()));
confirmBtn($("btn-reset-line-msg"), "↺ 恢復預設", ()=>req("/api/admin/line-settings/reset").then(d=>{if(d)loadLineSettings();}));

$("sound-toggle")?.addEventListener("change", e => req("/set-sound-enabled", {enabled:e.target.checked}));
$("public-toggle")?.addEventListener("change", e => req("/set-public-status", {isPublic:e.target.checked}));
$$('input[name="systemMode"]').forEach(r => r.addEventListener("change", ()=>confirm("Switch Mode?")?req("/set-system-mode", {mode:r.value}):(r.checked=!r.checked)));

$("admin-lang-selector")?.addEventListener("change", e => { curLang=e.target.value; localStorage.setItem('callsys_lang', curLang); updateLangUI(); });

const modal = $("edit-stats-overlay"); let editHr=null;
function openStatModal(h, val) { $("modal-current-count").textContent=val; editHr=h; modal.style.display="flex"; }
$("btn-modal-close")?.addEventListener("click", ()=>modal.style.display="none");
["btn-stats-minus", "btn-stats-plus"].forEach((id, idx) => $(id)?.addEventListener("click", async()=>{
    if(editHr===null) return; const delta = idx===0 ? -1 : 1; await req("/api/admin/stats/adjust", {hour:editHr, delta}); 
    const n = parseInt($("modal-current-count").textContent)+delta; $("modal-current-count").textContent = n<0?0:n; loadStats();
}));
$("btn-export-csv")?.addEventListener("click", async()=>{ const d=await req("/api/admin/export-csv"); if(d?.csvData) { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+d.csvData],{type:'text/csv'})); a.download=d.fileName; a.click(); toast("✅ Downloaded","success"); }});

$("btn-save-unlock-pwd")?.addEventListener("click", async()=>{ if(await req("/api/admin/line-settings/set-unlock-pass", {password:$("line-unlock-pwd").value})) toast("Saved","success"); });
$("add-user-btn")?.addEventListener("click", async()=>{ 
    const u=$("new-user-username").value, p=$("new-user-password").value, n=$("new-user-nickname").value, r=$("new-user-role")?.value;
    if(await req("/api/admin/add-user", {newUsername:u, newPassword:p, newNickname:n, newRole:r})) { 
        toast("Saved","success"); $("new-user-username").value=""; $("new-user-password").value=""; $("new-user-nickname").value=""; loadUsers(); 
    }
});

// LINE Settings (Partial)
const lineSettingsConfig = { approach: { label: "快到了提醒", hint: "{current} {target} {diff}" }, arrival: { label: "正式到號提醒", hint: "{current} {target}" }, status: { label: "查詢狀態回覆", hint: "{current} {issued} {personal}" }, personal: { label: "個人追蹤資訊 (附加)", hint: "{target} {diff}" }, passed: { label: "過號查詢回覆", hint: "{list}" }, set_ok: { label: "設定追蹤成功", hint: "{target} {current} {diff}" }, cancel: { label: "取消追蹤成功", hint: "{target}" }, login_hint: { label: "後台登入提示", hint: "無變數" }, err_passed: { label: "錯誤：已過號", hint: "{target} {current}" }, err_no_sub: { label: "錯誤：無設定", hint: "無變數" }, set_hint: { label: "設定指令提示", hint: "無變數" } };
async function loadLineSettings() {
    const ul = $("line-settings-list-ui"); if (!ul) return;
    const data = await req("/api/admin/line-settings/get"); if(!data) return; ul.innerHTML="";
    if($("line-unlock-pwd")) $("line-unlock-pwd").value = (await req("/api/admin/line-settings/get-unlock-pass"))?.password||"";
    Object.keys(lineSettingsConfig).forEach(key => {
        const config = lineSettingsConfig[key], val = data[key] || "";
        const li = mk("li"), view = mk("div", null, null, {style:"display:flex;justify-content:space-between;padding:5px 0;"});
        view.innerHTML = `<div style="width:85%;"><span style="font-weight:bold;">${config.label}</span><span class="line-msg-preview">${val||"(未設定)"}</span></div>`;
        const btn = mk("button","btn-secondary",T.edit||"Edit",{onclick:()=>{view.style.display="none";edit.style.display="flex"}});
        view.appendChild(btn);
        const edit = mk("div",null,null,{style:"display:none;flex-direction:column;gap:5px;width:100%;"});
        const ta = mk("textarea",null,null,{value:val,rows:3});
        const save = mk("button","btn-secondary success",T.save||"Save",{onclick:async()=>{if(await req("/api/admin/line-settings/save",{[key]:ta.value})) loadLineSettings();}});
        const cancel = mk("button","btn-secondary",T.cancel||"X",{onclick:()=>{edit.style.display="none";view.style.display="flex";ta.value=val;}});
        const row = mk("div",null,null,{style:"display:flex;gap:5px;justify-content:flex-end;"}); row.append(cancel,save);
        edit.append(mk("div",null,config.hint,{style:"font-size:0.8rem;color:#666"}),ta,row);
        li.append(view,edit); ul.appendChild(li);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    $("admin-lang-selector").value = curLang; 
    checkSession();
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => {
        $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
        $$('.section-group').forEach(s=>s.classList.remove('active')); $(b.dataset.target)?.classList.add('active');
        if(b.dataset.target === 'section-stats') loadStats();
    }));
    const enter = (id, btnId) => { $(id)?.addEventListener("keyup", e => { if(e.key==="Enter") $(btnId)?.click(); }); };
    enter("username-input", "login-button"); enter("password-input", "login-button"); enter("manualNumber", "setNumber");
    enter("manualIssuedNumber", "setIssuedNumber"); enter("new-passed-number", "add-passed-btn"); enter("broadcast-msg", "btn-broadcast");
});
