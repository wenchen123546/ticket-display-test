/* ==========================================
 * 後台邏輯 (admin.js) - v36.0 (Content Restore)
 * ========================================== */
const $ = i => document.getElementById(i);
const $$ = s => document.querySelectorAll(s);
const mk = (t, c, txt, ev={}) => { const e = document.createElement(t); if(c) e.className=c; if(txt) e.textContent=txt; Object.entries(ev).forEach(([k,v])=>e[k]=v); return e; };

// I18n
const i18n = {
    "zh-TW": { status_conn:"✅ 已連線", status_dis:"連線中斷...", wait:"等待組數", login_fail:"登入失敗", denied:"❌ 權限不足", expired:"Session 過期", saved:"✅ 已儲存", confirm:"⚠️ 確認", recall:"↩️ 重呼", edit:"✎", del:"✕", save:"✓", cancel:"✕" },
    "en": { status_conn:"✅ Connected", status_dis:"Disconnected...", wait:"Waiting", login_fail:"Failed", denied:"❌ Denied", expired:"Expired", saved:"✅ Saved", confirm:"⚠️ Confirm", recall:"↩️ Recall", edit:"Edit", del:"Del", save:"Save", cancel:"Cancel" }
};
let curLang = localStorage.getItem('callsys_lang')||'zh-TW', T = i18n[curLang];
let token="", userRole="normal", username="", uniqueUser="", toastTimer;
const socket = io({ autoConnect: false, auth: { token: "" } });

function toast(msg, type='info') {
    const t = $("toast-notification"); t.textContent = msg; t.className = `${type} show`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

// API Wrapper
async function req(url, data={}, lockBtn=null) {
    if(lockBtn) lockBtn.disabled=true;
    try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, token }) });
        const res = await r.json();
        if(!r.ok) {
            if(r.status===403) { 
                toast(res.error?.includes("權限")?T.denied:T.expired, "error"); 
                if(!res.error?.includes("權限")) logout(); 
            }
            else toast(`❌ ${res.error||'Error'}`, "error");
            return null;
        }
        return res;
    } catch(e) { toast(`❌ ${e.message}`, "error"); return null; }
    finally { if(lockBtn) setTimeout(()=>lockBtn.disabled=false, 300); }
}

function confirmBtn(el, origTxt, action) {
    if(!el) return;
    let t, c=5;
    el.onclick = (e) => {
        e.stopPropagation();
        if(el.classList.contains("is-confirming")) { action(); reset(); } 
        else {
            el.classList.add("is-confirming"); el.textContent = `${T.confirm} (${c})`;
            t = setInterval(() => { c--; el.textContent = `${T.confirm} (${c})`; if(c<=0) reset(); }, 1000);
        }
    };
    const reset = () => { clearInterval(t); el.classList.remove("is-confirming"); el.textContent = origTxt; c=5; };
}

// Session
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
function logout() {
    localStorage.removeItem('callsys_token'); localStorage.removeItem('callsys_user');
    localStorage.removeItem('callsys_role'); localStorage.removeItem('callsys_nick');
    token=""; location.reload();
}

function showLogin() { $("login-container").style.display="block"; $("admin-panel").style.display="none"; socket.disconnect(); }
async function showPanel() {
    $("login-container").style.display="none"; $("admin-panel").style.display="flex";
    if($("sidebar-user-info")) $("sidebar-user-info").textContent = `Hi, ${username}`;
    const isSuper = userRole === 'super';
    ["card-user-management", "btn-export-csv", "mode-switcher-group", "unlock-pwd-group"].forEach(id => { if($(id)) $(id).style.display = isSuper ? "block" : "none"; });
    if($('button[data-target="section-line"]')) $('button[data-target="section-line"]').style.display = isSuper?"flex":"none";
    socket.auth.token = token; socket.connect();
    await loadStats(); if(isSuper) { await loadUsers(); loadLineSettings(); }
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

// Socket
socket.on("connect", () => { $("status-bar").classList.remove("visible"); toast(`${T.status_conn} (${username})`, "success"); });
socket.on("disconnect", () => { $("status-bar").classList.add("visible"); });
socket.on("updateQueue", d => { $("number").textContent=d.current; $("issued-number").textContent=d.issued; $("waiting-count").textContent=Math.max(0, d.issued-d.current); loadStats(); });
socket.on("update", n => { $("number").textContent=n; loadStats(); });
socket.on("initAdminLogs", l => renderLogs(l, true));
socket.on("newAdminLog", l => renderLogs([l], false));
socket.on("updateSoundSetting", b => $("sound-toggle").checked=b);
socket.on("updatePublicStatus", b => $("public-toggle").checked=b);
socket.on("updateSystemMode", m => $$('input[name="systemMode"]').forEach(r => r.checked=(r.value===m)));

socket.on("updatePassed", list => {
    const ul = $("passed-list-ui"); ul.innerHTML="";
    list.forEach(n => {
        const li = mk("li");
        const div = mk("div", null, null, {style:"display:flex; gap:10px; align-items:center;"});
        div.append(mk("span", null, n, {style:"font-weight:bold"}), mk("button", "btn-secondary", T.recall, {onclick:()=>{ if(confirm(`Recall ${n}?`)) req("/api/control/recall-passed",{number:n}); }}));
        const del = mk("button", "delete-item-btn", T.del); confirmBtn(del, T.del, ()=>req("/api/passed/remove",{number:n}));
        li.append(div, del); ul.appendChild(li);
    });
});

socket.on("updateFeaturedContents", list => {
    const ul = $("featured-list-ui"); ul.innerHTML="";
    list.forEach(item => {
        const li = mk("li");
        const view = mk("div", null, null, {style:"display:flex; justify-content:space-between; width:100%; align-items:center;"});
        const info = mk("div", null, null, {style:"display:flex; flex-direction:column; width:100%;"});
        info.append(mk("span", null, item.linkText, {style:"font-weight:600"}), mk("small", null, item.linkUrl, {style:"color:#666;"}));
        
        const editDiv = mk("div", null, null, {style:"display:none; width:100%; flex-direction:column; gap:5px;"});
        const i1 = mk("input", null, null, {value:item.linkText, placeholder:"Name"}), i2 = mk("input", null, null, {value:item.linkUrl, placeholder:"URL"});
        const save = mk("button", "btn-secondary success", T.save, {onclick: async()=>{ if(await req("/api/featured/edit",{oldLinkText:item.linkText,oldLinkUrl:item.linkUrl,newLinkText:i1.value,newLinkUrl:i2.value})) toast(T.saved,"success"); }});
        
        const acts = mk("div", null, null, {style:"display:flex; gap:5px; flex-shrink:0;"});
        acts.append(mk("button", "btn-secondary", T.edit, {onclick:()=>{view.style.display="none"; editDiv.style.display="flex";}}));
        const del = mk("button", "delete-item-btn", T.del); confirmBtn(del, T.del, ()=>req("/api/featured/remove", item));
        acts.append(del);

        editDiv.append(i1, i2, mk("div", null, null, {style:"display:flex; gap:5px; justify-content:flex-end;"}));
        editDiv.lastChild.append(save, mk("button", "btn-secondary", T.cancel, {onclick:()=>{editDiv.style.display="none"; view.style.display="flex";}}));
        view.append(info, acts); li.append(view, editDiv); ul.appendChild(li);
    });
});

socket.on("updateOnlineAdmins", list => {
    const ul = $("online-users-list"); if(!ul) return; ul.innerHTML = "";
    if(!list || !list.length) { ul.innerHTML = `<li>(Offline)</li>`; return; }
    list.sort((a,b)=>(a.role==='super'?-1:1)).forEach(u => {
        ul.appendChild(mk("li", null, `${u.role==='super'?'👑':'👤'} ${u.nickname} ${u.username===uniqueUser?'(You)':''}`));
    });
});

function renderLogs(logs, init) {
    const ul = $("admin-log-ui"); if(!ul) return; if(init) ul.innerHTML="";
    if(!logs?.length && init) { ul.innerHTML="<li>[No Logs]</li>"; return; }
    logs.forEach(msg => { const li=mk("li", null, msg); init ? ul.appendChild(li) : ul.insertBefore(li, ul.firstChild); });
}

// Data
async function loadUsers() {
    const d = await req("/api/admin/users");
    const ul = $("user-list-ui"); if(!d || !ul) return; ul.innerHTML="";
    d.users.forEach(u => {
        const li = mk("li");
        const view = mk("div", null, null, {style:"display:flex; justify-content:space-between; width:100%; align-items:center;"});
        const info = mk("div", null, null, {style:"display:flex; flex-direction:column;"});
        info.append(mk("span", null, `${u.role==='super'?'👑':'👤'} ${u.nickname}`, {style:"font-weight:600"}), mk("small", null, u.username, {style:"color:#666;"}));

        const editDiv = mk("div", null, null, {style:"display:none; width:100%; gap:5px; align-items:center;"});
        const input = mk("input", null, null, {value:u.nickname, type:"text", placeholder:"Nickname"});
        const saveBtn = mk("button", "btn-secondary success", T.save);
        
        saveBtn.onclick = async () => { if(await req("/api/admin/set-nickname", {targetUsername:u.username, nickname:input.value})) { toast(T.saved, "success"); loadUsers(); } };

        const acts = mk("div", null, null, {style:"display:flex; gap:5px; flex-shrink:0;"});
        const editBtn = mk("button", "btn-secondary", T.edit, {onclick:()=>{ view.style.display="none"; editDiv.style.display="flex"; }});
        acts.appendChild(editBtn);

        if(u.role!=='super' && userRole==='super') {
            const del = mk("button", "delete-item-btn", T.del); 
            confirmBtn(del, T.del, async()=>{ await req("/api/admin/del-user",{delUsername:u.username}); loadUsers(); });
            acts.appendChild(del);
        }
        editDiv.append(input, saveBtn, mk("button", "btn-secondary", T.cancel, {onclick:()=>{ editDiv.style.display="none"; view.style.display="flex"; }}));
        view.appendChild(info, acts); li.append(view, editDiv); ul.appendChild(li);
    });
}

// [修正 3] 恢復流量分析列表內容的渲染邏輯
async function loadStats() {
    const ul = $("stats-list-ui"); 
    const d = await req("/api/admin/stats");
    if(d?.success) {
        if($("stats-today-count")) $("stats-today-count").textContent = d.todayCount;
        renderChart(d.hourlyCounts, d.serverHour);
        if(ul) ul.innerHTML = d.history.map(h => `<li><span>${new Date(h.time).toLocaleTimeString('zh-TW',{hour12:false})} - ${h.num} <small>(${h.operator})</small></span></li>`).join("") || `<li>[Empty]</li>`;
    }
}

function renderChart(counts, curHr) {
    const c = $("hourly-chart"); if(!c) return; c.innerHTML=""; const max = Math.max(...counts, 1);
    counts.forEach((val, i) => {
        const col = mk("div", `chart-col ${i===curHr?'current':''}`, null, {onclick:()=>openStatModal(i, val)});
        col.innerHTML = `<div class="chart-val">${val||''}</div><div class="chart-bar" style="height:${Math.max(val/max*100, 2)}%; background:${val===0?'#e5e7eb':''}"></div><div class="chart-label">${String(i).padStart(2,'0')}</div>`;
        c.appendChild(col);
    });
}

// Bindings
const act = (id, api, data={}) => $(id)?.addEventListener("click", () => req(api, data, $(id)));
act("btn-call-prev", "/api/control/call", {direction:"prev"});
act("btn-call-next", "/api/control/call", {direction:"next"});
act("btn-mark-passed", "/api/control/pass-current");
act("btn-issue-prev", "/api/control/issue", {direction:"prev"});
act("btn-issue-next", "/api/control/issue", {direction:"next"});

$("setNumber")?.addEventListener("click", async()=>{ const n=$("manualNumber").value; if(n>0 && await req("/api/control/set-call",{number:n})) { $("manualNumber").value=""; toast(T.saved,"success"); } });
$("setIssuedNumber")?.addEventListener("click", async()=>{ const n=$("manualIssuedNumber").value; if(n>=0 && await req("/api/control/set-issue",{number:n})) { $("manualIssuedNumber").value=""; toast(T.saved,"success"); } });
$("add-passed-btn")?.addEventListener("click", async()=>{ const n=$("new-passed-number").value; if(n>0 && await req("/api/passed/add",{number:n})) $("new-passed-number").value=""; });
$("add-featured-btn")?.addEventListener("click", async()=>{ const t=$("new-link-text").value, u=$("new-link-url").value; if(t&&u && await req("/api/featured/add",{linkText:t, linkUrl:u})) { $("new-link-text").value=""; $("new-link-url").value=""; } });
$("btn-broadcast")?.addEventListener("click", async()=>{ const m=$("broadcast-msg").value; if(m && await req("/api/admin/broadcast",{message:m})) { toast("📢 Sent","success"); $("broadcast-msg").value=""; } });

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
$("admin-lang-selector")?.addEventListener("change", e => { curLang=e.target.value; localStorage.setItem('callsys_lang', curLang); T=i18n[curLang]; location.reload(); });

const modal = $("edit-stats-overlay"); let editHr=null;
function openStatModal(h, val) { $("modal-current-count").textContent=val; editHr=h; modal.style.display="flex"; }
$("btn-modal-close")?.addEventListener("click", ()=>modal.style.display="none");
["btn-stats-minus", "btn-stats-plus"].forEach((id, idx) => $(id)?.addEventListener("click", async()=>{
    if(editHr===null) return; const delta = idx===0 ? -1 : 1; await req("/api/admin/stats/adjust", {hour:editHr, delta}); 
    const n = parseInt($("modal-current-count").textContent)+delta; $("modal-current-count").textContent = n<0?0:n; loadStats();
}));
$("btn-export-csv")?.addEventListener("click", async()=>{ const d=await req("/api/admin/export-csv"); if(d?.csvData) { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+d.csvData],{type:'text/csv'})); a.download=d.fileName; a.click(); toast("✅ Downloaded","success"); }});

const lineKeys = ["approach","arrival","status","personal","passed","set_ok","cancel","login_hint","err_passed","err_no_sub","set_hint"];
async function loadLineSettings() { const d=await req("/api/admin/line-settings/get"); if(d) lineKeys.forEach(k=>{ if($(`line-msg-${k}`)) $(`line-msg-${k}`).value=d[k]||""; }); $("line-unlock-pwd").value = (await req("/api/admin/line-settings/get-unlock-pass"))?.password || ""; }
$("btn-save-line-msg")?.addEventListener("click", async()=>{ const data={}; lineKeys.forEach(k=>data[k]=$(`line-msg-${k}`).value); if(await req("/api/admin/line-settings/save", data)) toast(T.saved,"success"); });
$("btn-save-unlock-pwd")?.addEventListener("click", async()=>{ if(await req("/api/admin/line-settings/set-unlock-pass", {password:$("line-unlock-pwd").value})) toast(T.saved,"success"); });
$("add-user-btn")?.addEventListener("click", async()=>{ if(await req("/api/admin/add-user", {newUsername:$("new-user-username").value, newPassword:$("new-user-password").value, newNickname:$("new-user-nickname").value})) { toast(T.saved,"success"); $("new-user-username").value=""; $("new-user-password").value=""; $("new-user-nickname").value=""; loadUsers(); }});

document.addEventListener("DOMContentLoaded", () => {
    $("admin-lang-selector").value = curLang; 
    checkSession();
    const enter = (i,b) => $(i)?.addEventListener("keyup", e=>{if(e.key==="Enter")$(b).click()});
    enter("username-input","login-button"); enter("password-input","login-button"); enter("manualNumber","setNumber"); enter("new-link-url","add-featured-btn");
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => {
        $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
        $$('.section-group').forEach(s=>s.classList.remove('active')); $(b.dataset.target)?.classList.add('active');
        if(b.dataset.target === 'section-stats') loadStats();
    }));
});
