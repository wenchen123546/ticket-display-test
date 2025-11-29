/* admin.js - Optimized v20.8 */
const $ = i => document.getElementById(i), $$ = s => document.querySelectorAll(s), ls = localStorage;
let curLang = ls.getItem('callsys_lang')||'zh-TW', T={}, userRole="normal", username="", uniqueUser="", globalRoles=null;
const socket = io({ autoConnect: false });

// Helper Functions
const mk = (t,c,txt,ev={},ch=[]) => { const e=document.createElement(t); if(c)e.className=c; if(txt)e.textContent=txt; Object.entries(ev).forEach(([k,v])=>e[k.startsWith('on')?k.toLowerCase():k]=v); ch.forEach(x=>x&&e.appendChild(x)); return e; };
const toast = (m,t='info') => { const e=$("toast-notification"); e.textContent=m; e.className=`show ${t}`; setTimeout(()=>e.className="",3000); };
const req = async (u,d={},b=null) => { if(b)b.disabled=true; try { const r=await fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(x=>x.json()); if(r.error){ if(r.error.includes("權限")) logout(); toast(`❌ ${r.error}`,"error"); return null; } return r; } catch(e){ toast(`❌ ${e.message}`,"error"); return null; } finally { if(b) setTimeout(()=>b.disabled=false,300); } };
const confirmBtn = (el, txt, act) => { if(!el)return; let c=5, t; el.onclick=e=>{ e.stopPropagation(); if(el.classList.contains("ing")){ act(); reset(); } else { el.classList.add("ing"); el.textContent=`${T.confirm||'Confirm'} (${c})`; t=setInterval(()=>{ c--; el.textContent=`${T.confirm||'Confirm'} (${c})`; if(c<=0)reset(); },1000); } }; const reset=()=>{ clearInterval(t); el.classList.remove("ing"); el.textContent=txt; c=5; }; };

// Core Logic
const init = async () => {
    uniqueUser = ls.getItem('callsys_user'); userRole = ls.getItem('callsys_role'); username = ls.getItem('callsys_nick');
    if(uniqueUser) {
        $("login-container").style.display="none"; $("admin-panel").style.display="flex"; $("sidebar-user-info").textContent=username;
        globalRoles = await req("/api/admin/roles/get"); applyPerms();
        socket.connect(); loadAll();
    } else { $("login-container").style.display="block"; $("admin-panel").style.display="none"; }
    const theme = ls.getItem('callsys_theme'); if(theme==='dark') document.body.classList.add('dark-mode');
};
const logout = () => { ls.removeItem('callsys_user'); ls.removeItem('callsys_role'); document.cookie="token=;Max-Age=0"; location.reload(); };
const checkPerm = p => (uniqueUser==='superadmin' || userRole==='ADMIN' || globalRoles?.[userRole]?.can.includes('*') || globalRoles?.[userRole]?.can.includes(p));
const applyPerms = () => $$('[data-perm]').forEach(e => e.style.display = checkPerm(e.dataset.perm) ? 'flex' : 'none');

// Data Loading
const loadAll = () => { if(checkPerm('users')) loadUsers(); if(checkPerm('stats')) loadStats(); if(checkPerm('appointment')) loadAppts(); if(checkPerm('settings')) loadFeat(); if(checkPerm('line')) loadLine(); };
const renderList = (id, l, fn, empty="Empty") => { const ul=$(id); ul.innerHTML=""; if(!l?.length) return ul.innerHTML=`<li class='list-item center' style='justify-content:center'>${empty}</li>`; l.forEach(x=>ul.appendChild(fn(x))); };

const loadUsers = async () => renderList("user-list-ui", (await req("/api/admin/users"))?.users, u => {
    const isMe = u.username===uniqueUser, isSuper = uniqueUser==='superadmin';
    const form = mk("div", "edit-form-wrapper", null, {style:"display:none;width:100%"}, [
        mk("input",null,null,{value:u.nickname,placeholder:"Nick"}),
        mk("div", "flex", null, {style:"display:flex;gap:5px;margin-top:5px"}, [mk("button","btn-secondary","Save",{onclick:async()=>{if(await req("/api/admin/set-nickname",{targetUsername:u.username,nickname:form.firstChild.value})) loadUsers();}}), mk("button","btn-secondary","Cancel",{onclick:()=>{form.style.display="none";info.style.display="block";}})])
    ]);
    const info = mk("div", "user-info-fancy", null, {}, [
        mk("div", "user-nick-fancy", u.nickname || u.username), mk("div", "user-id-fancy", `@${u.username} (${u.role})`)
    ]);
    return mk("li", "user-card-item", null, {style:"flex-direction:column;align-items:flex-start"}, [
        mk("div", "user-card-header", null, {style:"width:100%;display:flex;justify-content:space-between"}, [
            mk("div", "flex", null, {style:"display:flex;gap:10px"}, [mk("div","user-avatar-fancy",u.nickname[0]), info]),
            isMe||isSuper ? mk("button", "btn-action-icon", "✎", {onclick:()=>{form.style.display="block";info.style.display="none";}}) : null
        ]), form,
        (isSuper && u.username!=='superadmin') ? mk("button", "btn-reset-single", "Delete", {onclick:()=>{if(confirm("Del?")) req("/api/admin/del-user",{delUsername:u.username}).then(loadUsers)}}) : null
    ]);
});
const loadAppts = async () => renderList("appointment-list-ui", (await req("/api/appointment/list"))?.appointments, a => mk("li", "list-item", null, {}, [ mk("span", "text", `${a.number}號 - ${new Date(a.scheduled_time).toLocaleString()}`), mk("button", "btn-secondary", "✕", {onclick:()=>req("/api/appointment/remove",{id:a.id})}) ]));
const loadFeat = async () => renderList("featured-list-ui", await req("/api/featured/get"), f => mk("li", "list-item", null, {}, [ mk("span",null,`${f.linkText} (${f.linkUrl})`), mk("button","btn-secondary","✕",{onclick:()=>req("/api/featured/remove",f)}) ]));
const loadLine = async () => {
    const msgs = await req("/api/admin/line-messages/get");
    if(msgs) Object.entries(msgs).forEach(([k,v])=> { if($(`msg-${k}`)) $(`msg-${k}`).value=v; });
    const rules = await req("/api/admin/line-autoreply/list");
    renderList("line-autoreply-list", Object.entries(rules||{}), ([k,v])=> mk("li", "list-item", null, {}, [mk("span",null,`${k} -> ${v}`), mk("button","btn-secondary","✕",{onclick:()=>req("/api/admin/line-autoreply/del",{keyword:k}).then(loadLine)})]));
};
const loadStats = async () => { 
    const d=await req("/api/admin/stats"); 
    if(d?.hourlyCounts) { 
        $("stats-today-count").textContent=d.todayCount; 
        const chart=$("hourly-chart"); chart.innerHTML=""; 
        d.hourlyCounts.forEach((v,i)=>chart.appendChild(mk("div",`chart-col ${i===d.serverHour?'current':''}`,null,{},[mk("div","chart-val",v||""), mk("div","chart-bar",null,{style:`height:${Math.min(v*5,100)}%`}), mk("div","chart-label",i)]))); 
    }
    renderList("admin-log-ui", (await req("/api/admin/stats"))?.history||[], h=>mk("li","list-item",`${h.number}號 (${h.action}) by ${h.operator} @ ${new Date(h.timestamp).toLocaleTimeString()}`));
};

// Event Bindings
const bind = (id, fn) => $(id)?.addEventListener("click", fn);
bind("login-button", async () => { const r=await req("/login", {username:$("username-input").value, password:$("password-input").value}); if(r?.success){ ls.setItem('callsys_user',r.username); ls.setItem('callsys_role',r.userRole); ls.setItem('callsys_nick',r.nickname); init(); } });
bind("btn-logout", logout); bind("admin-theme-toggle", ()=>{ document.body.classList.toggle('dark-mode'); ls.setItem('callsys_theme',document.body.classList.contains('dark-mode')?'dark':'light'); });

bind("btn-call-next", ()=>req("/api/control/call", {direction:"next"}));
bind("btn-call-prev", ()=>req("/api/control/call", {direction:"prev"}));
bind("btn-issue-next", ()=>req("/api/control/issue", {direction:"next"}));
bind("btn-issue-prev", ()=>req("/api/control/issue", {direction:"prev"}));
bind("btn-mark-passed", ()=>req("/api/control/pass-current"));
bind("setNumber", ()=>req("/api/control/set-call", {number:$("manualNumber").value}));
bind("setIssuedNumber", ()=>req("/api/control/set-issue", {number:$("manualIssuedNumber").value}));
bind("add-passed-btn", ()=>req("/api/passed/add", {number:$("new-passed-number").value}));
bind("add-featured-btn", ()=>req("/api/featured/add", {linkText:$("new-link-text").value, linkUrl:$("new-link-url").value}));
bind("btn-add-appt", ()=>req("/api/appointment/add", {number:$("appt-number").value, timeStr:$("appt-time").value}));
bind("btn-add-keyword", ()=>req("/api/admin/line-autoreply/save", {keyword:$("new-keyword-in").value, reply:$("new-reply-in").value}).then(loadLine));
bind("btn-save-line-msgs", ()=>req("/api/admin/line-messages/save", {success:$("msg-success").value, approach:$("msg-approach").value, arrival:$("msg-arrival").value, passed:$("msg-passed").value, cancel:$("msg-cancel").value}));

["resetNumber","resetIssued","resetPassed","resetAll","btn-clear-logs","btn-clear-stats"].forEach(id => {
    const el=$(id); if(el) confirmBtn(el, el.textContent, () => req(id.includes('clear') ? (id.includes('logs')?"/api/logs/clear":"/api/admin/stats/clear") : (id==='resetAll'?"/reset":`/api/control/${id==='resetNumber'?'set-call':(id==='resetPassed'?'passed/clear':'set-issue')}`), {number:0}));
});

$$('.nav-btn').forEach(b => b.onclick = () => { $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.section-group').forEach(s=>s.classList.remove('active')); $(b.dataset.target).classList.add('active'); if(b.dataset.target==='section-settings') { loadUsers(); loadLine(); } else if(b.dataset.target==='section-booking') loadAppts(); });

// Socket Events
socket.on("updateQueue", d => { $("number").textContent=d.current; $("issued-number").textContent=d.issued; $("waiting-count").textContent=Math.max(0,d.issued-d.current); })
      .on("updateOnlineAdmins", l => renderList("online-users-list", l, u => mk("li", "user-card-item", null, {style:"justify-content:flex-start;padding:10px"}, [mk("div","status-pulse-indicator"), mk("span",null,`${u.nickname} (${u.role})`)])))
      .on("updatePassed", l => renderList("passed-list-ui", l, n => mk("li", "list-item", `${n}號`, {}, [mk("button","btn-secondary",T.recall||"Recall",{onclick:()=>req("/api/control/recall-passed",{number:n})})])));

document.addEventListener("DOMContentLoaded", init);
