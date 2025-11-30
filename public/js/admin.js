/* ==========================================
 * 後台邏輯 (admin.js) - Fixed Business Hours (HH:MM)
 * ========================================== */
const $ = i => document.getElementById(i), $$ = s => document.querySelectorAll(s);
const mk = (t, c, txt, ev={}, ch=[]) => {
    const e = document.createElement(t); if(c) e.className=c;
    if(txt!=null) { const s=String(txt); e[s.startsWith('<')?'innerHTML':'textContent']=s; }
    Object.entries(ev).forEach(([k,v])=>k.startsWith('on')?e[k.toLowerCase()]=v:k==='style'?e.style.cssText=v:k.includes('-')?e.setAttribute(k,v):e[k]=v);
    (Array.isArray(ch)?ch:[ch]).forEach(x=>x&&e.appendChild(x)); return e;
};
const toast = (m, t='info') => { const el=$("toast-notification"); el.textContent=m; el.className=`show ${t}`; setTimeout(()=>el.className="",3000); };
const req = async (url, data={}, btn=null) => {
    if(btn) btn.disabled=true;
    try {
        const r = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data)}), res = await r.json();
        if(!r.ok) { if(r.status===403 && !res.error?.includes("權限")) logout(); toast(`❌ ${res.error||'Error'}`,"error"); return null; }
        return res;
    } catch(e) { toast(`❌ ${e.message}`,"error"); return null; } finally { if(btn) setTimeout(()=>btn.disabled=false, 300); }
};

const i18n={"zh-TW":{status_conn:"✅ 已連線",status_dis:"⚠️ 連線中斷...",saved:"✅ 已儲存",denied:"❌ 權限不足",expired:"Session 過期",login_fail:"登入失敗",confirm:"⚠️ 確認",recall:"↩️ 重呼",edit:"✎ 編輯",del:"✕ 刪除",save:"✓ 儲存",cancel:"✕ 取消",login_title:"請登入管理系統",ph_account:"帳號",ph_password:"密碼",login_btn:"登入",admin_panel:"管理後台",nav_live:"現場控台",nav_stats:"數據報表",nav_booking:"預約管理",nav_settings:"系統設定",nav_line:"LINE設定",logout:"登出",dash_curr:"目前叫號",dash_issued:"已發號至",dash_wait:"等待組數",card_call:"指揮中心",btn_next:"下一號 ▶",btn_prev:"◀ 上一號",btn_pass:"過號",lbl_assign:"指定 / 插隊",btn_exec:"GO",btn_reset_call:"↺ 重置叫號",card_issue:"發號管理",btn_recall:"➖ 收回",btn_issue:"發號 ➕",lbl_fix_issue:"修正發號數",btn_fix:"修正",btn_reset_issue:"↺ 重置發號",card_passed:"過號名單",btn_clear_passed:"清空過號",card_stats:"流量分析",lbl_today:"今日人次",btn_refresh:"重整",btn_calibrate:"校正",btn_clear_stats:"🗑️ 清空統計",card_logs:"操作日誌",btn_clear_logs:"清除日誌",card_sys:"系統",lbl_public:"開放前台",lbl_sound:"提示音效",lbl_tts:"TTS 語音廣播",btn_play:"播放",lbl_mode:"取號模式",mode_online:"線上取號",mode_manual:"手動輸入",btn_reset_all:"💥 全域重置",card_online:"在線管理",card_links:"連結管理",ph_link_name:"名稱",btn_clear_links:"清空連結",card_users:"帳號管理",lbl_add_user:"新增帳號",ph_nick:"暱稱",card_roles:"權限設定",btn_save_roles:"儲存權限變更",btn_save:"儲存",btn_restore:"恢復預設值",modal_edit:"編輯數據",btn_done:"完成",card_booking:"預約管理",lbl_add_appt:"新增預約",wait:"等待...",loading:"載入中...",empty:"[ 空 ]",no_logs:"[ 無日誌 ]",no_appt:"暫無預約",role_operator:"操作員",role_manager:"經理",role_admin:"管理員",msg_recall_confirm:"確定要重呼 %s 嗎？\n(當前叫號將移入過號名單)",msg_sent:"📢 已發送",msg_calibrated:"校正完成",perm_role:"角色權限",perm_call:"叫號/指揮",perm_issue:"發號",perm_stats:"數據/日誌",perm_settings:"系統設定",perm_line:"LINE設定",perm_appointment:"預約管理",perm_users:"帳號管理"},"en":{status_conn:"✅ Connected",status_dis:"⚠️ Disconnected...",saved:"✅ Saved",denied:"❌ Denied",expired:"Session Expired",login_fail:"Login Failed",confirm:"⚠️ Confirm",recall:"↩️ Recall",edit:"✎ Edit",del:"✕ Del",save:"✓ Save",cancel:"✕ Cancel",login_title:"Login to Admin Panel",ph_account:"Username",ph_password:"Password",login_btn:"Login",admin_panel:"Admin Panel",nav_live:"Live Console",nav_stats:"Statistics",nav_booking:"Booking",nav_settings:"Settings",nav_line:"Line Config",logout:"Logout",dash_curr:"Current Serving",dash_issued:"Last Issued",dash_wait:"Waiting",card_call:"Command Center",btn_next:"Next ▶",btn_prev:"◀ Prev",btn_pass:"Pass",lbl_assign:"Assign / Jump",btn_exec:"GO",btn_reset_call:"↺ Reset Call",card_issue:"Ticketing",btn_recall:"➖ Recall",btn_issue:"Issue ➕",lbl_fix_issue:"Fix Issued #",btn_fix:"Fix",btn_reset_issue:"↺ Reset Issue",card_passed:"Passed List",btn_clear_passed:"Clear Passed",card_stats:"Analytics",lbl_today:"Today's Count",btn_refresh:"Refresh",btn_calibrate:"Calibrate",btn_clear_stats:"🗑️ Clear Stats",card_logs:"Action Logs",btn_clear_logs:"Clear Logs",card_sys:"System",lbl_public:"Public Access",lbl_sound:"Sound FX",lbl_tts:"TTS Broadcast",btn_play:"Play",lbl_mode:"Mode",mode_online:"Online Ticket",mode_manual:"Manual Input",btn_reset_all:"💥 Factory Reset",card_online:"Online Users",card_links:"Links Manager",ph_link_name:"Name",btn_clear_links:"Clear Links",card_users:"User Manager",lbl_add_user:"Add User",ph_nick:"Nickname",card_roles:"Role Permissions",btn_save_roles:"Save Permission Changes",btn_save:"Save",btn_restore:"Restore Defaults",modal_edit:"Edit Data",btn_done:"Done",card_booking:"Booking Manager",lbl_add_appt:"Add Booking",wait:"Waiting...",loading:"Loading...",empty:"[ Empty ]",no_logs:"[ No Logs ]",no_appt:"No Appointments",role_operator:"Operator",role_manager:"Manager",role_admin:"Admin",msg_recall_confirm:"Recall number %s?\n(Current number will be moved to passed list)",msg_sent:"📢 Sent",msg_calibrated:"Calibrated",perm_role:"Role",perm_call:"Role",perm_issue:"Ticketing",perm_stats:"Stats/Logs",perm_settings:"Settings",perm_line:"Line Config",perm_appointment:"Booking",perm_users:"Users"}};

let curLang=localStorage.getItem('callsys_lang')||'zh-TW', T=i18n[curLang], userRole="normal", username="", uniqueUser="", cachedLine=null, isDark=localStorage.getItem('callsys_admin_theme')==='dark', globalRoleConfig=null;
const socket = io({ autoConnect: false });

const confirmBtn = (el, txt, action) => {
    if(!el) return; let t, c=5;
    el.dataset.originalKey = Object.keys(T).find(key=>T[key]===txt)||txt; el.textContent = T[el.dataset.originalKey]||txt;
    el.onclick = (e) => {
        e.stopPropagation();
        if(el.classList.contains("is-confirming")) { action(); reset(); }
        else { el.classList.add("is-confirming"); el.textContent=`${T.confirm} (${c})`; t=setInterval(()=>{ c--; el.textContent=`${T.confirm} (${c})`; if(c<=0) reset(); },1000); }
    };
    const reset = () => { clearInterval(t); el.classList.remove("is-confirming"); el.textContent=T[el.dataset.originalKey]||txt; c=5; };
};

const updateLangUI = () => {
    T = i18n[curLang]||i18n["zh-TW"];
    $$('[data-i18n]').forEach(e => e.textContent = T[e.getAttribute('data-i18n')]||"");
    $$('[data-i18n-ph]').forEach(e => e.placeholder = T[e.getAttribute('data-i18n-ph')]||"");
    $$('button[data-original-key]').forEach(b => !b.classList.contains('is-confirming') && (b.textContent = T[b.dataset.originalKey]));
    if(checkPerm('users')) loadUsers(); if(checkPerm('stats')) loadStats(); if(checkPerm('appointment')) loadAppointments();
    if(isSuperAdmin()) loadRoles();
    if(checkPerm('settings')) { req("/api/featured/get").then(l => renderList("featured-list-ui", l, renderFeaturedItem)); initBusinessHoursUI(); }
    if($("section-settings").classList.contains("active") && checkPerm('line')) { cachedLine?renderLineSettings():loadLineSettings(); loadLineMessages(); loadLineAutoReplies(); loadLineSystemCommands(); }
    if(username) $("sidebar-user-info").textContent = username;
};

const renderList = (ulId, list, fn, emptyMsgKey="empty") => {
    const ul = $(ulId); if(!ul) return; ul.innerHTML="";
    if(!list?.length) return ul.appendChild(mk("li", "list-item", T[emptyMsgKey]||T.empty, {style:"justify-content:center;color:var(--text-sub);"}));
    const frag = document.createDocumentFragment(); list.forEach(x => { const el = fn(x); if(el) frag.appendChild(el); }); ul.appendChild(frag);
};

const applyTheme = () => { document.body.classList.toggle('dark-mode', isDark); localStorage.setItem('callsys_admin_theme', isDark?'dark':'light'); ['admin-theme-toggle','admin-theme-toggle-mobile'].forEach(i=>$(i)&&($(i).textContent=isDark?'☀️':'🌙')); };
const checkPerm = (p) => isSuperAdmin() || (globalRoleConfig && globalRoleConfig[userRole]?.can.some(x=>x==='*'||x===p));
const isSuperAdmin = () => (uniqueUser === 'superadmin' || userRole === 'super' || userRole === 'ADMIN');
const logout = () => { localStorage.clear(); document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"; location.reload(); };

const checkSession = async () => {
    uniqueUser = localStorage.getItem('callsys_user'); userRole = localStorage.getItem('callsys_role'); username = localStorage.getItem('callsys_nick');
    if(uniqueUser === 'superadmin' && userRole !== 'ADMIN') { userRole = 'ADMIN'; localStorage.setItem('callsys_role', 'ADMIN'); }
    if(uniqueUser) {
        $("login-container").style.display="none"; $("admin-panel").style.display="flex"; $("sidebar-user-info").textContent = username;
        globalRoleConfig = await req("/api/admin/roles/get");
        $$('[data-perm]').forEach(el => el.style.display = checkPerm(el.getAttribute('data-perm')) ? (el.classList.contains('admin-card')?'flex':'') : 'none');
        updateLangUI(); socket.connect(); upgradeSystemModeUI(); initBusinessHoursUI();
        ["card-role-management", "btn-export-csv", "mode-switcher-group", "unlock-pwd-group", 'resetNumber','resetIssued','resetPassed','resetFeaturedContents','btn-clear-logs','btn-clear-stats','btn-reset-line-msg','resetAll'].forEach(id => $(id) && ($(id).style.display = isSuperAdmin() ? "block" : "none"));
    } else { $("login-container").style.display="block"; $("admin-panel").style.display="none"; socket.disconnect(); }
};

function upgradeSystemModeUI() {
    const c = document.querySelector('#card-sys .control-group:nth-of-type(3)'); if(!c || c.querySelector('.segmented-control')) return;
    const radios = c.querySelectorAll('input[type="radio"]'); if(radios.length<2) return;
    const w = mk('div', 'segmented-control');
    radios.forEach(r => {
        const lbl = mk('label', 'segmented-option', T[r.value==='ticketing'?'mode_online':'mode_manual']||r.value, {onclick:()=>{ if(!r.checked){r.checked=true;r.dispatchEvent(new Event('change'));} updateSegmentedVisuals(w); }});
        lbl.dataset.i18n = r.value==='ticketing'?'mode_online':'mode_manual'; w.appendChild(lbl); lbl.appendChild(r);
    });
    c.innerHTML=''; const t=c.querySelector('label:not(.segmented-option)'); if(t) c.appendChild(t); c.appendChild(w); updateSegmentedVisuals(w);
}
const updateSegmentedVisuals = (w) => w.querySelectorAll('input[type="radio"]').forEach(r => r.closest('.segmented-option').classList.toggle('active', r.checked));

// --- Updated Business Hours UI for HH:MM ---
async function initBusinessHoursUI() {
    if(!checkPerm('settings') || !$("card-sys") || $("business-hours-group")) return;
    
    // Changed input type to 'time' and adjusted styles
    const t = mk("input","toggle-switch",null,{type:"checkbox",id:"bh-enabled"}), 
          s = mk("input",null,null,{type:"time",id:"bh-start",style:"width:110px;text-align:center;padding:0 5px;"}), 
          e = mk("input",null,null,{type:"time",id:"bh-end",style:"width:110px;text-align:center;padding:0 5px;"});
    
    const ctr = mk("div","control-group",null,{id:"business-hours-group",style:"margin-top:10px;border-top:1px dashed var(--border-color);padding-top:10px;"}, [
        mk("label",null,"營業時間控制"), 
        mk("div",null,null,{style:"display:flex;gap:10px;align-items:center;flex-wrap:wrap;"}, [
            t, s, mk("span",null,"➜"), e, 
            mk("button","btn-secondary success","儲存",{
                style:"margin-left:auto;", 
                onclick:async()=>await req("/api/admin/settings/hours/save",{enabled:t.checked,start:s.value,end:e.value}) && toast(T.saved,"success")
            })
        ])
    ]);
    const r=$("resetAll"); r ? $("card-sys").insertBefore(ctr,r) : $("card-sys").appendChild(ctr);
    
    // Load config and handle potential legacy integer format
    req("/api/admin/settings/hours/get").then(d=>{ 
        if(d) { 
            t.checked=d.enabled; 
            s.value = String(d.start).includes(':') ? d.start : String(d.start).padStart(2,'0') + ":00";
            e.value = String(d.end).includes(':') ? d.end : String(d.end).padStart(2,'0') + ":00";
        } 
    });
}

async function loadLineMessages() {
    const d = await req("/api/admin/line-messages/get"); if(!d || !$("msg-success")) return;
    ["success","approach","arrival","passed","cancel","help","loginPrompt","loginSuccess","noTracking","noPassed","passedPrefix"].forEach(k => { if($(`msg-${k.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}`)) $(`msg-${k.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}`).value = d[k]||""; });
}
async function loadLineSystemCommands() {
    if(!$("line-cmd-section")) {
        const p = $("msg-success")?.closest('.admin-card'); if(p && $("line-default-msg")) {
            p.insertBefore(mk("div",null,null,{id:"line-cmd-section",style:"margin:20px 0;padding-top:20px;border-top:1px dashed var(--border-color);"},[
                mk("h4",null,"🤖 系統指令設定",{style:"margin:0 0 15px 0;color:var(--text-main);"}),
                ...[["login","後台登入"],["status","查詢狀態"],["passed","過號名單"],["help","設定提醒說明"]].map(([k,l])=>mk("div","control-group",null,{},[mk("label",null,`${l} (預設)`), mk("input",null,null,{id:`cmd-${k}`,type:"text"})])),
                mk("div","control-group",null,{},[mk("label",null,"取消追蹤"), mk("div","input-group",null,{},[mk("input",null,null,{id:"cmd-cancel"}), mk("button","btn-secondary success","儲存",{id:"btn-save-cmd",onclick:async()=>await req("/api/admin/line-system-keywords/save",{login:$("cmd-login").value,status:$("cmd-status").value,cancel:$("cmd-cancel").value,passed:$("cmd-passed").value,help:$("cmd-help").value},$("btn-save-cmd")) && toast(T.saved,"success")})])])
            ]), $("line-default-msg").closest('.control-group').parentElement.nextSibling);
        }
    }
    const d = await req("/api/admin/line-system-keywords/get"); if(d) ["login","status","cancel","passed","help"].forEach(k => $(`cmd-${k}`) && ($(`cmd-${k}`).value = d[k]));
}
async function loadLineAutoReplies() {
    if(!$("line-autoreply-list")) return; req("/api/admin/line-default-reply/get").then(r => $("line-default-msg") && ($("line-default-msg").value = r.reply||""));
    renderList("line-autoreply-list", Object.entries(await req("/api/admin/line-autoreply/list")||{}), ([key, reply]) => {
        const form = mk("div","edit-form-wrapper",null,{style:"display:none;width:100%;gap:8px;align-items:flex-start;"}, [
            mk("input",null,null,{value:key,placeholder:"Key",style:"flex:1;"}), mk("textarea","multi-line-input",null,{value:reply,placeholder:"Reply",style:"flex:2;min-height:80px;"}),
            mk("div","edit-form-actions",null,{},[mk("button","btn-secondary",T.cancel,{onclick:e=>{e.stopPropagation();form.style.display="none";view.style.display="flex";acts.style.display="flex";}}), mk("button","btn-secondary success",T.save,{onclick:async e=>{e.stopPropagation(); if(await req("/api/admin/line-autoreply/edit",{oldKeyword:key,newKeyword:form.children[0].value,newReply:form.children[1].value})) { toast(T.saved,"success"); loadLineAutoReplies(); } }})])
        ]);
        const view = mk("div","list-info",null,{},[mk("span","list-main-text",key,{style:"color:var(--primary);font-weight:bold;"}), mk("span","list-sub-text",reply)]);
        const acts = mk("div","list-actions",null,{},[mk("button","btn-action-icon","✎",{title:T.edit,onclick:()=>{form.style.display="flex";view.style.display="none";acts.style.display="none";}}), (b=>{confirmBtn(b,"✕",async()=>{await req("/api/admin/line-autoreply/del",{keyword:key});loadLineAutoReplies();}); b.className="btn-action-icon danger"; b.title=T.del; return b;})(mk("button"))]);
        return mk("li","list-item",null,{style:"flex-wrap:wrap;align-items:flex-start;"},[view,acts,form]);
    });
}

socket.on("connect", () => { $("status-bar").classList.remove("visible"); toast(`${T.status_conn} (${username})`, "success"); });
socket.on("disconnect", () => $("status-bar").classList.add("visible"));
socket.on("updateQueue", d => { $("number").textContent=d.current; $("issued-number").textContent=d.issued; $("waiting-count").textContent=Math.max(0, d.issued-d.current); if(checkPerm('stats')) loadStats(); });
socket.on("update", n => { $("number").textContent=n; if(checkPerm('stats')) loadStats(); });
socket.on("initAdminLogs", l => checkPerm('stats') && renderLogs(l, true));
socket.on("newAdminLog", l => checkPerm('stats') && renderLogs([l], false));
socket.on("updatePublicStatus", b => $("public-toggle") && ($("public-toggle").checked = b));
socket.on("updateSoundSetting", b => $("sound-toggle") && ($("sound-toggle").checked = b));
socket.on("updateSystemMode", m => { $$('input[name="systemMode"]').forEach(r => r.checked = (r.value === m)); const w = document.querySelector('.segmented-control'); if(w) updateSegmentedVisuals(w); });
socket.on("updateAppointments", l => checkPerm('appointment') && renderAppointments(l));
socket.on("updatePassed", l => renderList("passed-list-ui", l, n => mk("li","list-item",null,{},[mk("span","list-main-text",`${n} 號`,{style:"font-size:1rem;color:var(--primary);"}), mk("div","list-actions",null,{},[mk("button","btn-secondary",T.recall,{onclick:()=>{if(confirm(T.msg_recall_confirm.replace('%s',n))) req("/api/control/recall-passed",{number:n});}}), (b=>{confirmBtn(b,T.del,()=>req("/api/passed/remove",{number:n}));return b;})(mk("button","btn-secondary",T.del))])]), "empty"));
socket.on("updateFeaturedContents", l => checkPerm('settings') && renderList("featured-list-ui", l, renderFeaturedItem, "empty"));
socket.on("updateOnlineAdmins", l => checkPerm('users') && renderList("online-users-list", (l||[]).sort((a,b)=>(a.role==='super'?-1:1)), u => {
    const rC=(u.userRole||u.role||'OPERATOR').toLowerCase(), rL=rC.includes('admin')?'ADMIN':(rC.includes('manager')?'MANAGER':'OPERATOR');
    return mk("li","user-card-item online-mode",null,{},[mk("div","user-card-header",null,{},[mk("div","user-avatar-fancy",(u.nickname||u.username).charAt(0).toUpperCase(),{style:`background:linear-gradient(135deg, hsl(${u.username.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360},75%,60%), hsl(${(u.username.split('').reduce((a,c)=>a+c.charCodeAt(0),0)+50)%360},75%,50%))`}), mk("div","user-info-fancy",null,{},[mk("div","user-nick-fancy",null,{},[mk("span","status-pulse-indicator"),mk("span",null,u.nickname||u.username)]), mk("div","user-id-fancy",`IP/ID: @${u.username}`), mk("div",`role-badge-fancy ${rC.includes('admin')?'admin':rC}`,rL)])]), mk("div","user-card-actions",null,{style:"justify-content:flex-end;opacity:0.7;font-size:0.8rem;"},[mk("span",null,"🟢 Active Now")])]);
}, "loading"));

// Updated socket listener for Business Hours Sync (Handles string format)
socket.on("updateBusinessHours", cfg => {
    if($("bh-enabled")) $("bh-enabled").checked = cfg.enabled;
    if($("bh-start")) $("bh-start").value = String(cfg.start).includes(':') ? cfg.start : String(cfg.start).padStart(2,'0') + ":00";
    if($("bh-end")) $("bh-end").value = String(cfg.end).includes(':') ? cfg.end : String(cfg.end).padStart(2,'0') + ":00";
});

const renderFeaturedItem = (item) => {
    const view = mk("div","list-info",null,{},[mk("span","list-main-text",item.linkText),mk("span","list-sub-text",item.linkUrl)]), form = mk("div","edit-form-wrapper",null,{style:"display:none;position:relative;"},[mk("input",null,null,{value:item.linkText}),mk("input",null,null,{value:item.linkUrl}),mk("div","edit-form-actions",null,{},[mk("button","btn-secondary",T.cancel,{onclick:()=>{form.style.display="none";view.style.display="flex";acts.style.display="flex";}}),mk("button","btn-secondary success",T.save,{onclick:async()=>{if(await req("/api/featured/edit",{oldLinkText:item.linkText,oldLinkUrl:item.linkUrl,newLinkText:form.children[0].value,newLinkUrl:form.children[1].value})) toast(T.saved,"success");}})])]);
    const acts = mk("div","list-actions",null,{},[mk("button","btn-secondary",T.edit,{onclick:()=>{form.style.display="flex";view.style.display="none";acts.style.display="none";}}),mk("button","btn-secondary",T.del,{onclick:()=>req("/api/featured/remove",item)})]);
    return mk("li","list-item",null,{},[view,acts,form]);
};
async function loadAppointments() { try{ renderAppointments((await req("/api/appointment/list"))?.appointments); }catch(e){} }
function renderAppointments(list) { renderList("appointment-list-ui", list, a => mk("li","list-item",null,{},[mk("div","list-info",null,{},[mk("span","list-main-text",`${a.number} 號`,{style:"color:var(--primary);font-size:1rem;"}),mk("span","list-sub-text",`📅 ${new Date(a.scheduled_time).toLocaleString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`)]), mk("div","list-actions",null,{},[(b=>{confirmBtn(b,T.del,async()=>await req("/api/appointment/remove",{id:a.id})); return b;})(mk("button","btn-secondary",T.del))])]), "no_appt"); }
async function loadUsers() {
    const d = await req("/api/admin/users"); if(!d?.users) return;
    renderList("user-list-ui", d.users, u => {
        const rC=(u.role||'OPERATOR').toLowerCase(), acts=mk("div","user-card-actions"), editForm=mk("div","edit-form-wrapper",null,{style:"display:none;"},[mk("h4",null,"修改暱稱",{style:"margin:0 0 10px 0;color:var(--text-main);"}), mk("input",null,null,{value:u.nickname,placeholder:T.ph_nick,style:"margin-bottom:10px;"}), mk("div","edit-form-actions",null,{},[mk("button","btn-secondary",T.cancel,{onclick:e=>{e.stopPropagation();editForm.style.display="none";}}),mk("button","btn-secondary success",T.save,{onclick:async e=>{e.stopPropagation();if(await req("/api/admin/set-nickname",{targetUsername:u.username,nickname:editForm.children[1].value})){toast(T.saved,"success");loadUsers();}}})])]);
        if(u.username===uniqueUser || isSuperAdmin()) acts.appendChild(mk("button","btn-action-icon","✎",{title:T.edit,onclick:()=>editForm.style.display="flex"})); else acts.appendChild(mk("span"));
        if(u.username!=='superadmin' && isSuperAdmin()) {
            const roleSel = mk("select","role-select",null,{title:"變更權限",style:"height:32px;font-size:0.8rem;padding:0 8px;",onchange:async()=>{if(await req("/api/admin/set-role",{targetUsername:u.username,newRole:roleSel.value})){toast(T.saved,"success");loadUsers();}}}); ['OPERATOR','MANAGER','ADMIN'].forEach(r=>roleSel.add(new Option(r,r,false,u.role===r)));
            acts.appendChild(mk("div",null,null,{style:"display:flex;gap:8px;align-items:center;"},[roleSel, (b=>{confirmBtn(b,"✕",async()=>{await req("/api/admin/del-user",{delUsername:u.username});loadUsers();}); b.className="btn-action-icon danger"; b.title=T.del; return b;})(mk("button"))]));
        }
        return mk("li","user-card-item",null,{},[mk("div","user-card-header",null,{},[mk("div","user-avatar-fancy",(u.nickname||u.username).charAt(0).toUpperCase(),{style:`background:linear-gradient(135deg, hsl(${u.username.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360},75%,60%), hsl(${(u.username.split('').reduce((a,c)=>a+c.charCodeAt(0),0)+50)%360},75%,50%))`}), mk("div","user-info-fancy",null,{},[mk("div","user-nick-fancy",u.nickname||u.username),mk("div","user-id-fancy",`@${u.username}`),mk("div",`role-badge-fancy ${rC}`,u.role==='OPERATOR'?'Op (操作員)':(u.role==='MANAGER'?'Mgr (經理)':'Adm (管理員)'))])]), acts, editForm]);
    }, "loading");
    const ctr=$("card-user-management")?.querySelector('.admin-card'); $("add-user-container-fixed")?.remove();
    if(ctr) {
        const uIn=mk("input",null,null,{id:"new-user-username",placeholder:T.ph_account}), pIn=mk("input",null,null,{id:"new-user-password",type:"password",placeholder:"Pwd"}), nIn=mk("input",null,null,{id:"new-user-nickname",placeholder:T.ph_nick}), rIn=mk("select",null,null,{id:"new-user-role"},["Operator","Manager","Admin"].map(x=>new Option(x,x.toUpperCase())));
        ctr.appendChild(mk("div","add-user-container",null,{id:"add-user-container-fixed"},[mk("div","add-user-grid",null,{},[uIn,pIn,nIn,rIn,mk("button","btn-hero btn-add-user-fancy",`+ ${T.lbl_add_user}`,{style:"height:46px;font-size:1rem;",onclick:async()=>{if(!uIn.value||!pIn.value)return toast("請輸入帳號密碼","error"); if(await req("/api/admin/add-user",{newUsername:uIn.value,newPassword:pIn.value,newNickname:nIn.value,newRole:rIn.value})){toast(T.saved,"success");loadUsers();uIn.value=pIn.value=nIn.value="";}}})])]));
    }
}
async function loadRoles() {
    const cfg = globalRoleConfig || await req("/api/admin/roles/get"), ctr = $("role-editor-content"); if(!cfg || !ctr) return; ctr.innerHTML="";
    const perms = [{k:'call',t:T.perm_call},{k:'issue',t:T.perm_issue},{k:'stats',t:T.perm_stats},{k:'settings',t:T.perm_settings},{k:'appointment',t:T.perm_appointment},{k:'line',t:T.perm_line},{k:'users',t:T.perm_users}], roles = ['OPERATOR','MANAGER','ADMIN'], meta = {'OPERATOR':{icon:'🎮',l:T.role_operator,c:'role-op'},'MANAGER':{icon:'🛡️',l:T.role_manager,c:'role-mgr'},'ADMIN':{icon:'👑',l:T.role_admin,c:'role-mgr'}};
    ctr.appendChild(mk("div","perm-table-wrapper",null,{},[mk("table","perm-matrix",null,{},[mk("thead",null,null,{},[mk("tr",null,null,{},[mk("th",null,"權限項目 / 角色"), ...roles.map(r=>mk("th",`th-role ${meta[r].c}`,`<div class="th-content"><span class="th-icon">${meta[r].icon}</span><span>${meta[r].l}</span></div>`))])]), mk("tbody",null,null,{}, perms.map(p => mk("tr",null,null,{},[mk("td","td-perm-name",p.t), ...roles.map(r => mk("td","td-check",null,{},[mk("label","custom-check",null,{},[mk("input","role-chk",null,{type:"checkbox",checked:(cfg[r]?.can||[]).includes('*')||(cfg[r]?.can||[]).includes(p.k), "data-role":r, "data-perm":p.k}), mk("span","checkmark")])]))])))])]));
}
async function loadStats() {
    try {
        const d = await req("/api/admin/stats");
        if (d?.hourlyCounts) {
            if ($("stats-today-count")) $("stats-today-count").textContent = d.todayCount || 0;
            const chart=$("hourly-chart"), max=Math.max(...d.hourlyCounts, 1); chart.innerHTML="";
            d.hourlyCounts.forEach((v, i) => chart.appendChild(mk("div", `chart-col ${i===d.serverHour?'current':''}`, null, {style:`--bar-height:${v?Math.max((v/max)*75,5):0}%`, onclick:e=>{$$('.chart-col').forEach(c=>c!==e.currentTarget&&c.classList.remove('active-touch'));e.currentTarget.classList.toggle('active-touch');openStatModal(i,v);}}, [mk("div","chart-val",v||"0"),mk("div","chart-bar",null,{style:`height:${v===0?'4px':Math.max((v/max)*75,5)+'%'};${v===0?'background:var(--border-color);opacity:0.3;':''}`}),mk("div","chart-label",String(i).padStart(2,'0'))])));
            renderList("stats-list-ui", d.history || [], h => mk("li","list-item",`<span>${new Date(h.timestamp).toLocaleTimeString('zh-TW', {hour:'2-digit',minute:'2-digit'})} - <b style="color:var(--primary)">${h.number}</b> <small style="color:var(--text-sub)">(${h.operator})</small></span>`,{isHtml:true}), "no_logs");
        }
    } catch (e) { console.error(e); }
}
async function loadLineSettings() { cachedLine = await req("/api/admin/line-settings/get"); renderLineSettings(); }
function renderLineSettings() {
    renderList("line-settings-list-ui", Object.keys(cachedLine||{}), k => {
        const val=cachedLine[k]||"", edit=mk("div","line-edit-box",null,{style:"display:none;width:100%;"},[mk("textarea",null,null,{value:val,placeholder:"Content..."}), mk("div",null,null,{style:"display:flex;gap:8px;justify-content:flex-end;margin-top:4px;"},[mk("button","btn-secondary",T.cancel,{onclick:()=>{edit.style.display="none";row.style.display="flex";}}), mk("button","btn-secondary success",T.save,{onclick:async()=>{if(await req("/api/admin/line-settings/save",{[k]:edit.children[0].value})){cachedLine[k]=edit.children[0].value;toast(T.saved,"success");renderLineSettings();}}})])]);
        const row = mk("div","line-setting-row",null,{style:"display:flex;width:100%;align-items:center;justify-content:space-between;"}, [mk("div","line-setting-info",null,{},[mk("div","line-setting-label",k.split(':').pop(),{style:"font-weight:600;"}), mk("code","line-setting-preview",val||"(未設定)",{style:val?"color:var(--text-sub);":"opacity:0.5"})]), mk("button","btn-secondary",T.edit,{onclick:()=>{row.style.display="none";edit.style.display="flex";}})]);
        return mk("li", "list-item", null, {}, [row, edit]);
    }, "empty");
    req("/api/admin/line-settings/get-unlock-pass").then(r=>{ if($("line-unlock-pwd") && r) $("line-unlock-pwd").value=r.password||""; });
}
function renderLogs(logs, init) { const ul=$("admin-log-ui"); if(!ul) return; if(init) ul.innerHTML=""; if(!logs?.length&&init) return ul.innerHTML=`<li class='list-item' style='color:var(--text-sub);'>${T.no_logs}</li>`; const frag=document.createDocumentFragment(); logs.forEach(m=>frag.appendChild(mk("li","list-item",m,{style:"font-family:monospace;font-size:0.8rem;"}))); init?ul.appendChild(frag):ul.insertBefore(frag.firstChild, ul.firstChild); while(ul.children.length>50) ul.removeChild(ul.lastChild); }

const act=(id,api,data={})=>$(id)?.addEventListener("click",async()=>{const n=$("number"),ov=n?parseInt(n.textContent||0):0; if(api.includes('call')&&n&&data.direction){n.textContent=ov+(data.direction==='next'?1:-1);n.style.opacity="0.6";} try{await req(api,data,$(id));}catch(e){if(n)n.textContent=ov;}finally{if(n)n.style.opacity="1";}}), bind=(id,fn)=>$(id)?.addEventListener("click",fn), adjCur=async d=>{const n=$("number"),c=parseInt(n.textContent||0,t=c+d);if(t>0){n.textContent=t;n.style.opacity="0.6";try{if(await req("/api/control/set-call",{number:t}))toast(`${T.saved}: ${t}`,"success");}catch(e){n.textContent=c;}finally{n.style.opacity="1";}}};

bind("btn-call-add-1",()=>adjCur(1)); bind("btn-call-add-5",()=>adjCur(5));
act("btn-call-prev","/api/control/call",{direction:"prev"}); act("btn-call-next","/api/control/call",{direction:"next"});
act("btn-mark-passed","/api/control/pass-current"); act("btn-issue-prev","/api/control/issue",{direction:"prev"}); act("btn-issue-next","/api/control/issue",{direction:"next"});
bind("setNumber",async()=>{const n=$("manualNumber").value; if(n>0 && await req("/api/control/set-call",{number:n})){$("manualNumber").value="";toast(T.saved,"success");}});
bind("setIssuedNumber",async()=>{const n=$("manualIssuedNumber").value; if(n>=0 && await req("/api/control/set-issue",{number:n})){$("manualIssuedNumber").value="";toast(T.saved,"success");}});
bind("add-passed-btn",async()=>{const n=$("new-passed-number").value; if(n>0 && await req("/api/passed/add",{number:n})) $("new-passed-number").value="";});
bind("add-featured-btn",async()=>{const t=$("new-link-text").value,u=$("new-link-url").value; if(t&&u && await req("/api/featured/add",{linkText:t,linkUrl:u})){$("new-link-text").value="";$("new-link-url").value="";}});
bind("btn-broadcast",async()=>{const m=$("broadcast-msg").value; if(m && await req("/api/admin/broadcast",{message:m})){toast(T.msg_sent,"success");$("broadcast-msg").value="";}});
bind("btn-add-appt",async()=>{const n=$("appt-number").value,t=$("appt-time").value; if(n&&t && await req("/api/appointment/add",{number:parseInt(n),timeStr:t})){toast(T.saved,"success");$("appt-number").value="";$("appt-time")._flatpickr?.clear();}});
bind("btn-save-roles",async()=>{
    const c={OPERATOR:{level:1,can:[]},MANAGER:{level:2,can:[]},ADMIN:{level:9,can:['*']}}; $$(".role-chk:checked").forEach(k=>{ if(!c[k.dataset.role].can.includes(k.dataset.perm)) c[k.dataset.role].can.push(k.dataset.perm); });
    if(await req("/api/admin/roles/update",{rolesConfig:c})){toast(T.saved,"success"); globalRoleConfig=c; applyTheme(); $$('[data-perm]').forEach(el => el.style.display = checkPerm(el.getAttribute('data-perm')) ? (el.classList.contains('admin-card')?'flex':'') : 'none');}
});
bind("btn-save-unlock-pwd",async()=>{if(await req("/api/admin/line-settings/save-pass",{password:$("line-unlock-pwd").value}))toast(T.saved,"success");});
bind("btn-export-csv",async()=>{const d=await req("/api/admin/export-csv",{date:new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"})}); if(d?.csvData){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+d.csvData],{type:'text/csv'}));a.download=d.fileName;a.click();}});
bind("btn-save-line-msgs",async()=>{ const d={}; ["success","approach","arrival","passed","cancel","help","loginPrompt","loginSuccess","noTracking","noPassed","passedPrefix"].forEach(k=>d[k]=$(`msg-${k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase())}`)?.value||""); if(await req("/api/admin/line-messages/save",d,$("btn-save-line-msgs"))) toast(T.saved,"success");});
bind("btn-save-default-reply",async()=>{if(await req("/api/admin/line-default-reply/save",{reply:$("line-default-msg").value},$("btn-save-default-reply"))) toast(T.saved,"success");});
bind("btn-add-keyword",async()=>{const k=$("new-keyword-in").value,r=$("new-reply-in").value; if(k&&r&&await req("/api/admin/line-autoreply/save",{keyword:k,reply:r})){$("new-keyword-in").value="";$("new-reply-in").value="";toast(T.saved,"success");loadLineAutoReplies();}});
bind("login-button",async()=>{const r=await fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("username-input").value,password:$("password-input").value})}).then(x=>x.json()).catch(()=>({error:T.login_fail}));if(r.success){localStorage.setItem('callsys_user',r.username);localStorage.setItem('callsys_role',r.userRole);localStorage.setItem('callsys_nick',r.nickname);checkSession();}else $("login-error").textContent=r.error||T.login_fail;});
bind("btn-logout",logout); bind("btn-logout-mobile",logout);
["admin-theme-toggle","admin-theme-toggle-mobile"].forEach(i=>bind(i,()=>{isDark=!isDark;applyTheme();}));

["resetNumber","resetIssued","resetPassed","resetFeaturedContents","resetAll","btn-clear-logs","btn-clear-stats","btn-reset-line-msg"].forEach(id => {
    const el=$(id); if(!el) return; let url;
    if(id.includes('clear')) url=id.includes('logs')?"/api/logs/clear":"/api/admin/stats/clear"; else if(id==='resetAll') url="/reset"; else if(id.includes('line')) url="/api/admin/line-settings/reset"; else url=`/api/${id.includes('Passed')?'passed/clear':(id.includes('Featured')?'featured/clear':`control/${id==='resetNumber'?'set-call':'set-issue'}`)}`;
    confirmBtn(el, el.textContent.trim(), async()=>{ await req(url, id.startsWith('reset')&&!['All','Passed','Featured','line'].some(s=>id.includes(s))?{number:0}:{}); if(id==='btn-clear-stats') { $("stats-today-count").textContent="0"; $("hourly-chart").innerHTML=""; toast(T.saved,"success"); loadStats(); } if(id==='btn-clear-logs') { $("admin-log-ui").innerHTML=`<li class='list-item'>${T.no_logs}</li>`; toast(T.saved,"success"); } if(id.includes('Passed')) $("passed-list-ui").innerHTML=`<li class="list-item" style="justify-content:center;color:var(--text-sub);">${T.empty}</li>`; });
});
bind("btn-refresh-stats",loadStats); bind("btn-calibrate-stats",async()=>{if(confirm(`${T.confirm} ${T.btn_calibrate}?`)){const r=await req("/api/admin/stats/calibrate");if(r?.success){toast(`${T.msg_calibrated} (Diff: ${r.diff})`,"success");loadStats();}}});
let editHr=null; const modal=$("edit-stats-overlay"); bind("btn-modal-close",()=>modal.style.display="none");
window.openStatModal=(h,v)=>{$("modal-current-count").textContent=v;editHr=h;modal.style.display="flex";};
["btn-stats-minus","btn-stats-plus"].forEach((id,i)=>bind(id,async()=>{if(editHr!==null){await req("/api/admin/stats/adjust",{hour:editHr,delta:i?1:-1});$("modal-current-count").textContent=Math.max(0,parseInt($("modal-current-count").textContent)+(i?1:-1));loadStats();}}));

document.addEventListener("DOMContentLoaded", () => {
    checkSession(); applyTheme();
    [ $("admin-lang-selector"), $("admin-lang-selector-mobile") ].forEach(sel => { if(sel){ sel.value=curLang; sel.addEventListener("change",e=>{curLang=e.target.value;localStorage.setItem('callsys_lang',curLang);$$(".lang-sel").forEach(s=>s.value=curLang);updateLangUI();}); }});
    if($("appt-time")) flatpickr("#appt-time",{enableTime:true,dateFormat:"Y-m-d H:i",time_24hr:true,locale:"zh_tw",minDate:"today",disableMobile:"true"});
    $$('.nav-btn').forEach(b => b.onclick = () => { $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.section-group').forEach(s=>s.classList.remove('active')); const t=$(b.dataset.target); if(t){ t.classList.add('active'); if(b.dataset.target==='section-stats') loadStats(); if(b.dataset.target==='section-settings'){ loadAppointments(); loadUsers(); if(checkPerm('line')){cachedLine?renderLineSettings():loadLineSettings(); loadLineMessages(); loadLineAutoReplies(); loadLineSystemCommands();} } } });
    $("sound-toggle")?.addEventListener("change",e=>req("/set-sound-enabled",{enabled:e.target.checked}));
    $("public-toggle")?.addEventListener("change",e=>req("/set-public-status",{isPublic:e.target.checked}));
    $$('input[name="systemMode"]').forEach(r=>r.onchange=()=>confirm(T.confirm+" Switch Mode?")?req("/set-system-mode",{mode:r.value}):(r.checked=!r.checked));
    document.addEventListener("keydown", e => { if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){ if(e.key==="Enter"&&!e.shiftKey) {const m={"username-input":"login-button","manualNumber":"setNumber","manualIssuedNumber":"setIssuedNumber","new-passed-number":"add-passed-btn"}; if(m[document.activeElement.id]) $(m[document.activeElement.id])?.click();} return;} if(e.key==="ArrowRight") $("btn-call-next")?.click(); if(e.key==="ArrowLeft") $("btn-call-prev")?.click(); if(e.key.toLowerCase()==="p") $("btn-mark-passed")?.click(); });
});
