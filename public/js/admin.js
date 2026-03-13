/* ==========================================
 * 後台邏輯 (admin.js) - View/Edit Separation, Grouped Permissions & Frontend Texts
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

const i18n={"zh-TW":{status_conn:"✅ 已連線",status_dis:"⚠️ 連線中斷...",saved:"✅ 已儲存",denied:"❌ 權限不足",expired:"Session 過期",login_fail:"登入失敗",confirm:"⚠️ 確認",recall:"↩️ 重呼",edit:"✎ 編輯",del:"✕ 刪除",save:"✓ 儲存",cancel:"✕ 取消",login_title:"請登入管理系統",ph_account:"帳號",ph_password:"密碼",login_btn:"登入",admin_panel:"管理後台",nav_live:"現場控台",nav_stats:"數據報表",nav_booking:"預約管理",nav_settings:"系統設定",nav_line:"LINE設定",logout:"登出",dash_curr:"目前叫號",dash_issued:"已發號至",dash_wait:"等待組數",card_call:"指揮中心",btn_next:"下一號 ▶",btn_prev:"◀ 上一號",btn_pass:"過號",lbl_assign:"指定 / 插隊",btn_exec:"GO",btn_reset_call:"↺ 重置叫號",card_issue:"發號管理",btn_recall:"➖ 收回",btn_issue:"發號 ➕",lbl_fix_issue:"修正發號數",btn_fix:"修正",btn_reset_issue:"↺ 重置發號",card_passed:"過號名單",btn_clear_passed:"清空過號",card_stats:"流量分析",lbl_today:"今日人次",btn_refresh:"重整",btn_calibrate:"校正",btn_clear_stats:"🗑️ 清空統計",card_logs:"操作日誌",btn_clear_logs:"清除日誌",card_sys:"系統",lbl_public:"開放前台",lbl_sound:"提示音效",lbl_tts:"TTS 語音廣播",btn_play:"播放",lbl_mode:"取號模式",mode_online:"線上取號",mode_manual:"手動輸入",btn_reset_all:"💥 全域重置",card_online:"在線管理",card_links:"連結管理",ph_link_name:"名稱",btn_clear_links:"清空連結",card_users:"帳號管理",lbl_add_user:"新增帳號",ph_nick:"暱稱",card_roles:"權限設定",btn_save_roles:"儲存權限變更",btn_save:"儲存",btn_restore:"恢復預設值",modal_edit:"編輯數據",btn_done:"完成",card_booking:"預約管理",lbl_add_appt:"新增預約",wait:"等待...",loading:"載入中...",empty:"[ 空 ]",no_logs:"[ 無日誌 ]",no_appt:"暫無預約",role_operator:"操作員",role_manager:"經理",role_admin:"管理員",msg_recall_confirm:"確定要重呼 %s 嗎？",msg_sent:"📢 已發送",msg_calibrated:"校正完成",perm_role:"角色權限",perm_call:"叫號/指揮",perm_issue:"發號",perm_stats:"數據/日誌",perm_settings:"系統設定",perm_line:"LINE設定",perm_appointment:"預約管理",perm_users:"帳號管理"},"en":{status_conn:"✅ Connected",status_dis:"⚠️ Disconnected...",saved:"✅ Saved",denied:"❌ Denied",expired:"Session Expired",login_fail:"Login Failed",confirm:"⚠️ Confirm",recall:"↩️ Recall",edit:"✎ Edit",del:"✕ Del",save:"✓ Save",cancel:"✕ Cancel",login_title:"Login to Admin Panel",ph_account:"Username",ph_password:"Password",login_btn:"Login",admin_panel:"Admin Panel",nav_live:"Live Console",nav_stats:"Statistics",nav_booking:"Booking",nav_settings:"Settings",nav_line:"Line Config",logout:"Logout",dash_curr:"Current Serving",dash_issued:"Last Issued",dash_wait:"Waiting",card_call:"Command Center",btn_next:"Next ▶",btn_prev:"◀ Prev",btn_pass:"Pass",lbl_assign:"Assign / Jump",btn_exec:"GO",btn_reset_call:"↺ Reset Call",card_issue:"Ticketing",btn_recall:"➖ Recall",btn_issue:"Issue ➕",lbl_fix_issue:"Fix Issued #",btn_fix:"Fix",btn_reset_issue:"↺ Reset Issue",card_passed:"Passed List",btn_clear_passed:"Clear Passed",card_stats:"Analytics",lbl_today:"Today's Count",btn_refresh:"Refresh",btn_calibrate:"Calibrate",btn_clear_stats:"🗑️ Clear Stats",card_logs:"Action Logs",btn_clear_logs:"Clear Logs",card_sys:"System",lbl_public:"Public Access",lbl_sound:"Sound FX",lbl_tts:"TTS Broadcast",btn_play:"Play",lbl_mode:"Mode",mode_online:"Online Ticket",mode_manual:"Manual Input",btn_reset_all:"💥 Factory Reset",card_online:"Online Users",card_links:"Links Manager",ph_link_name:"Name",btn_clear_links:"Clear Links",card_users:"User Manager",lbl_add_user:"Add User",ph_nick:"Nickname",card_roles:"Role Permissions",btn_save_roles:"Save Permission Changes",btn_save:"Save",btn_restore:"Restore Defaults",modal_edit:"Edit Data",btn_done:"Done",card_booking:"Booking Manager",lbl_add_appt:"Add Booking",wait:"Waiting...",loading:"Loading...",empty:"[ Empty ]",no_logs:"[ No Logs ]",no_appt:"No Appointments",role_operator:"Operator",role_manager:"Manager",role_admin:"Admin",msg_recall_confirm:"Recall number %s?",msg_sent:"📢 Sent",msg_calibrated:"Calibrated",perm_role:"Role",perm_call:"Role",perm_issue:"Ticketing",perm_stats:"Stats/Logs",perm_settings:"Settings",perm_line:"Line Config",perm_appointment:"Booking",perm_users:"Users"}};

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
    
    if(checkPerm('perm_users_view')) loadUsers();
    if(checkPerm('perm_stats_view') || checkPerm('perm_logs_view')) loadStats();
    if(checkPerm('perm_booking_view')) loadAppointments();
    if(isSuperAdmin() || checkPerm('perm_roles')) loadRoles();
    if(checkPerm('perm_links_view')) req("/api/featured/get").then(l => renderList("featured-list-ui", l, renderFeaturedItem)); 
    initBusinessHoursUI(); 

    if($("section-settings").classList.contains("active") && checkPerm('perm_line_view')) { cachedLine?renderLineSettings():loadLineSettings(); loadLineMessages(); loadLineAutoReplies(); loadLineSystemCommands(); }
    if(username) $("sidebar-user-info").textContent = username;

    const canSysEdit = checkPerm('perm_system_edit');
    if($("public-toggle")) $("public-toggle").disabled = !canSysEdit;
    if($("sound-toggle")) $("sound-toggle").disabled = !canSysEdit;
    if($("ticketing-toggle")) $("ticketing-toggle").disabled = !canSysEdit;
    $$('input[name="systemMode"]').forEach(r => r.disabled = !canSysEdit);
    
    ["resetNumber","resetIssued","resetPassed","resetFeaturedContents","resetAll","btn-clear-logs","btn-clear-stats","btn-reset-line-msg"].forEach(id => {
        const el = $(id); if(!el) return;
        let visible = isSuperAdmin();
        if(id === 'resetPassed') visible = visible || checkPerm('perm_passed_edit');
        else if(id === 'resetFeaturedContents') visible = visible || checkPerm('perm_links_edit');
        else if(id === 'btn-clear-logs') visible = visible || checkPerm('perm_logs_edit');
        else if(id === 'btn-clear-stats') visible = visible || checkPerm('perm_stats_edit');
        else if(id === 'btn-reset-line-msg') visible = visible || checkPerm('perm_line_edit');
        else visible = visible || checkPerm('perm_system_edit');
        el.style.display = visible ? "block" : "none";
    });
};

const renderList = (ulId, list, fn, emptyMsgKey="empty") => {
    const ul = $(ulId); if(!ul) return; ul.innerHTML="";
    if(!list?.length) return ul.appendChild(mk("li", "list-item", T[emptyMsgKey]||T.empty, {style:"justify-content:center;color:var(--text-sub);"}));
    const frag = document.createDocumentFragment(); list.forEach(x => { const el = fn(x); if(el) frag.appendChild(el); }); ul.appendChild(frag);
};

const applyTheme = () => { document.body.classList.toggle('dark-mode', isDark); localStorage.setItem('callsys_admin_theme', isDark?'dark':'light'); ['admin-theme-toggle','admin-theme-toggle-mobile'].forEach(i=>$(i)&&($(i).textContent=isDark?'☀️':'🌙')); };

const checkPerm = (p) => {
    if (isSuperAdmin()) return true;
    if (!globalRoleConfig || !globalRoleConfig[userRole]) return false;
    const userPerms = globalRoleConfig[userRole].can || [];
    if (userPerms.includes('*')) return true;
    const required = p.split(',').map(s => s.trim());
    return required.some(req => userPerms.includes(req));
};

const isSuperAdmin = () => (uniqueUser === 'superadmin' || userRole === 'super' || userRole === 'ADMIN');
const logout = () => { localStorage.clear(); document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"; location.reload(); };

// ==========================================
// 閒置自動登出機制 (Idle Timeout)
// ==========================================
let idleTimer;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 預設 30 分鐘 (1800000 毫秒)

const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    // 只有在已經登入 (uniqueUser 存在) 且後台畫面顯示時才啟動計時
    if (uniqueUser && $("admin-panel").style.display !== "none") {
        idleTimer = setTimeout(() => {
            alert(T.expired || "閒置時間過長，為保護系統安全，已自動登出。");
            logout();
        }, IDLE_TIMEOUT);
    }
};

// 監聽使用者的各種互動行為來重置計時器 (加入 passive: true 提升效能)
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
});

// ==========================================
// Session 檢查
// ==========================================
const checkSession = async () => {
    uniqueUser = localStorage.getItem('callsys_user'); userRole = localStorage.getItem('callsys_role'); username = localStorage.getItem('callsys_nick');
    if(uniqueUser === 'superadmin' && userRole !== 'ADMIN') { userRole = 'ADMIN'; localStorage.setItem('callsys_role', 'ADMIN'); }
    if(uniqueUser) {
        $("login-container").style.display="none"; $("admin-panel").style.display="flex"; $("sidebar-user-info").textContent = username;
        globalRoleConfig = await req("/api/admin/roles/get");
        
        $$('[data-perm]').forEach(el => {
            const permStr = el.getAttribute('data-perm');
            const hasPerm = checkPerm(permStr);
            if (el.classList.contains('admin-card') || el.classList.contains('nav-btn') || el.classList.contains('card-wrapper')) {
                el.style.display = hasPerm ? (el.classList.contains('card-wrapper')||el.classList.contains('nav-btn') ? '' : 'flex') : 'none';
            }
        });

        updateLangUI(); socket.connect(); upgradeSystemModeUI(); initBusinessHoursUI(); loadFrontendTexts();
        if($("card-role-management")) $("card-role-management").style.display = (isSuperAdmin() || checkPerm('perm_roles')) ? "flex" : "none";
        
        // 啟動閒置偵測計時器
        resetIdleTimer();
    } else { 
        $("login-container").style.display="block"; $("admin-panel").style.display="none"; socket.disconnect(); 
        // 確保未登入時清除計時器
        clearTimeout(idleTimer);
    }
};

function upgradeSystemModeUI() {
    const c = document.querySelector('#card-sys .control-group:nth-of-type(3)'); if(!c || c.querySelector('.segmented-control')) return;
    const radios = c.querySelectorAll('input[type="radio"]'); if(radios.length<2) return;
    const w = mk('div', 'segmented-control');
    radios.forEach(r => {
        const lbl = mk('label', 'segmented-option', T[r.value==='ticketing'?'mode_online':'mode_manual']||r.value, {onclick:()=>{ if(!r.disabled && !r.checked){r.checked=true;r.dispatchEvent(new Event('change'));} updateSegmentedVisuals(w); }});
        lbl.dataset.i18n = r.value==='ticketing'?'mode_online':'mode_manual'; w.appendChild(lbl); lbl.appendChild(r);
    });
    c.innerHTML=''; const t=c.querySelector('label:not(.segmented-option)'); if(t) c.appendChild(t); c.appendChild(w); updateSegmentedVisuals(w);
}
const updateSegmentedVisuals = (w) => w.querySelectorAll('input[type="radio"]').forEach(r => r.closest('.segmented-option').classList.toggle('active', r.checked));

async function initBusinessHoursUI() {
    if(!checkPerm('perm_system_view') || !$("card-sys") || $("business-hours-group")) return;
    
    const canEdit = checkPerm('perm_system_edit');
    const inputStyle = "flex:1; min-width:130px; text-align:center; padding:0 5px; height:42px;";
    
    const t = mk("input","toggle-switch",null,{type:"checkbox",id:"bh-enabled", style:"flex-shrink:0;", disabled:!canEdit}), 
          s = mk("input",null,null,{type:"time",id:"bh-start",style:inputStyle, disabled:!canEdit}), 
          e = mk("input",null,null,{type:"time",id:"bh-end",style:inputStyle, disabled:!canEdit});
    
    const ctr = mk("div","control-group",null,{id:"business-hours-group",style:"margin-top:10px;border-top:1px dashed var(--border-color);padding-top:15px;"}, [
        mk("label",null,"營業時間控制"), 
        mk("div",null,null,{style:"display:flex;gap:12px;align-items:center;flex-wrap:wrap;width:100%;"}, [
            t, 
            mk("div",null,null,{style:"display:flex;flex:1;gap:8px;align-items:center;min-width:280px;"}, [
                s, mk("span",null,"➜",{style:"color:var(--text-sub);font-weight:bold;"}), e
            ])
        ])
    ]);
    
    if(canEdit) {
        ctr.children[1].appendChild(mk("button","btn-secondary success","儲存",{
            style:"padding:0 24px;height:42px;flex-shrink:0;", 
            onclick:async()=>await req("/api/admin/settings/hours/save",{enabled:t.checked,start:s.value,end:e.value}) && toast(T.saved,"success")
        }));
    }

    const r=$("resetAll"); r ? $("card-sys").insertBefore(ctr,r) : $("card-sys").appendChild(ctr);
    
    req("/api/admin/settings/hours/get").then(d=>{ 
        if(d) { 
            t.checked=d.enabled; 
            s.value = String(d.start).includes(':') ? d.start : String(d.start).padStart(2,'0') + ":00";
            e.value = String(d.end).includes(':') ? d.end : String(d.end).padStart(2,'0') + ":00";
        } 
    });
}

// 載入前台自定義文字
async function loadFrontendTexts() {
    if(!checkPerm('perm_system_view')) return;
    const d = await req("/api/admin/frontend-texts/get") || {};
    const ctr = $("frontend-texts-grid"); if(!ctr) return;
    
    const keys = [
        {k:'brand_title', l:'前台大標題 (預設: 即時叫號系統)'},
        {k:'cur', l:'目前叫號標題 (預設: 目前叫號)'}, {k:'iss', l:'已發至標題 (預設: 已發至)'}, {k:'wait_count', l:'等待中標題 (預設: 等待中)'},
        {k:'online', l:'線上取號標題 (預設: 線上取號)'}, {k:'help', l:'線上取號說明 (預設: 免排隊，手機領號)'}, {k:'take', l:'取號按鈕 (預設: 立即取號)'},
        {k:'man_t', l:'號碼提醒標題 (預設: 號碼提醒)'}, {k:'man_p', l:'提醒框提示文字 (預設: 輸入您的號碼...)'}, {k:'track', l:'追蹤按鈕 (預設: 追蹤)'},
        {k:'recall_badge', l:'過號重呼提示標籤 (預設: ↩️ 過號重呼)'}, {k:'sys_close', l:'系統暫停標題 (預設: ⛔ 系統已暫停服務)'}, {k:'sys_close_desc', l:'系統暫停說明 (預設: 請稍候...)'}
    ];
    ctr.innerHTML = "";
    const canEdit = checkPerm('perm_system_edit');
    
    keys.forEach(obj => {
        ctr.appendChild(mk("div", "control-group", null, {}, [
            mk("label", null, obj.l, {style:"font-size:0.8rem; opacity:0.8;"}),
            mk("input", "frontend-text-input", null, {id: `f-text-${obj.k}`, placeholder: "留白使用預設", value: d[obj.k]||"", disabled: !canEdit})
        ]));
    });
    const btn = $("btn-save-frontend-texts");
    if(btn) btn.style.display = canEdit ? "block" : "none";
}

async function loadLineMessages() {
    const d = await req("/api/admin/line-messages/get"); if(!d || !$("msg-success")) return;
    const canEdit = checkPerm('perm_line_edit');
    ["success","approach","arrival","passed","cancel","help","loginPrompt","loginSuccess","noTracking","noPassed","passedPrefix"].forEach(k => { 
        const el = $(`msg-${k.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}`);
        if(el) { el.value = d[k]||""; el.disabled = !canEdit; }
    });
    if($("btn-save-line-msgs")) $("btn-save-line-msgs").style.display = canEdit ? "block" : "none";
}

async function loadLineSystemCommands() {
    const canEdit = checkPerm('perm_line_edit');
    if(!$("line-cmd-section")) {
        const p = $("msg-success")?.closest('.admin-card'); if(p && $("line-default-msg")) {
            const btn = mk("button","btn-secondary success","儲存",{id:"btn-save-cmd",onclick:async()=>await req("/api/admin/line-system-keywords/save",{login:$("cmd-login").value,status:$("cmd-status").value,cancel:$("cmd-cancel").value,passed:$("cmd-passed").value,help:$("cmd-help").value},$("btn-save-cmd")) && toast(T.saved,"success")});
            if(!canEdit) btn.style.display = "none";

            p.insertBefore(mk("div",null,null,{id:"line-cmd-section",style:"margin:20px 0;padding-top:20px;border-top:1px dashed var(--border-color);"},[
                mk("h4",null,"🤖 系統指令設定",{style:"margin:0 0 15px 0;color:var(--text-main);"}),
                ...[["login","後台登入"],["status","查詢狀態"],["passed","過號名單"],["help","設定提醒說明"]].map(([k,l])=>mk("div","control-group",null,{},[mk("label",null,`${l} (預設)`), mk("input",null,null,{id:`cmd-${k}`,type:"text", disabled:!canEdit})])),
                mk("div","control-group",null,{},[mk("label",null,"取消追蹤"), mk("div","input-group",null,{},[mk("input",null,null,{id:"cmd-cancel", disabled:!canEdit}), btn])])
            ]), $("line-default-msg").closest('.control-group').parentElement.nextSibling);
        }
    }
    const d = await req("/api/admin/line-system-keywords/get"); if(d) ["login","status","cancel","passed","help"].forEach(k => $(`cmd-${k}`) && ($(`cmd-${k}`).value = d[k]));
}

async function loadLineAutoReplies() {
    if(!$("line-autoreply-list")) return; 
    const canEdit = checkPerm('perm_line_edit');
    req("/api/admin/line-default-reply/get").then(r => {
        if($("line-default-msg")) { $("line-default-msg").value = r.reply||""; $("line-default-msg").disabled = !canEdit; }
    });
    if($("btn-save-default-reply")) $("btn-save-default-reply").style.display = canEdit ? "block" : "none";
    if($("new-keyword-in")) $("new-keyword-in").disabled = !canEdit;
    if($("new-reply-in")) $("new-reply-in").disabled = !canEdit;
    if($("btn-add-keyword")) $("btn-add-keyword").style.display = canEdit ? "flex" : "none";

    renderList("line-autoreply-list", Object.entries(await req("/api/admin/line-autoreply/list")||{}), ([key, reply]) => {
        const form = mk("div","edit-form-wrapper",null,{style:"display:none;width:100%;gap:8px;align-items:flex-start;"}, [
            mk("input",null,null,{value:key,placeholder:"Key",style:"flex:1;"}), mk("textarea","multi-line-input",null,{value:reply,placeholder:"Reply",style:"flex:2;min-height:80px;"}),
            mk("div","edit-form-actions",null,{},[mk("button","btn-secondary",T.cancel,{onclick:e=>{e.stopPropagation();form.style.display="none";view.style.display="flex";acts.style.display="flex";}}), mk("button","btn-secondary success",T.save,{onclick:async e=>{e.stopPropagation(); if(await req("/api/admin/line-autoreply/edit",{oldKeyword:key,newKeyword:form.children[0].value,newReply:form.children[1].value})) { toast(T.saved,"success"); loadLineAutoReplies(); } }})])
        ]);
        const view = mk("div","list-info",null,{},[mk("span","list-main-text",key,{style:"color:var(--primary);font-weight:bold;"}), mk("span","list-sub-text",reply)]);
        const acts = mk("div","list-actions",null,{},[]);
        if(canEdit) {
            acts.appendChild(mk("button","btn-action-icon","✎",{title:T.edit,onclick:()=>{form.style.display="flex";view.style.display="none";acts.style.display="none";}}));
            acts.appendChild((b=>{confirmBtn(b,"✕",async()=>{await req("/api/admin/line-autoreply/del",{keyword:key});loadLineAutoReplies();}); b.className="btn-action-icon danger"; b.title=T.del; return b;})(mk("button")));
        }
        return mk("li","list-item",null,{style:"flex-wrap:wrap;align-items:flex-start;"},[view,acts,form]);
    });
}

// 渲染操作日誌
const renderLogs = (logs, isInit) => {
    const ul = $("admin-log-ui"); 
    if(!ul) return;
    
    // 如果是初始載入，先清空列表
    if(isInit) ul.innerHTML = "";
    
    // 如果沒有日誌資料
    if(!logs || logs.length === 0) {
        if(isInit) ul.innerHTML = `<li class="list-item" style="justify-content:center;color:var(--text-sub);">${T.no_logs||'[ 無日誌 ]'}</li>`;
        return;
    }
    
    // 移除「無日誌」的提示文字
    if(ul.firstChild && ul.firstChild.textContent === (T.no_logs||'[ 無日誌 ]')) {
        ul.innerHTML = "";
    }
    
    const frag = document.createDocumentFragment();
    logs.forEach(l => {
        const li = mk("li", "list-item", null, {style:"font-size:0.85rem; padding: 8px 12px;"});
        
        // 解析後端傳來的格式: [時間] [操作人] 動作
        const match = l.match(/^\[(.*?)\] \[(.*?)\] (.*)$/);
        if(match) {
            li.innerHTML = `
                <span style="color:var(--text-light); margin-right:8px; font-family:'JetBrains Mono', monospace;">[${match[1]}]</span>
                <span style="color:var(--primary); font-weight:bold; margin-right:8px;">${match[2]}</span>
                <span style="color:var(--text-main);">${match[3]}</span>
            `;
        } else {
            // 如果格式不符，直接顯示純文字
            li.textContent = l;
        }
        frag.appendChild(li);
    });
    
    // 如果是初始載入，往下附加；如果是單筆新增，則插入到最頂端
    isInit ? ul.appendChild(frag) : ul.insertBefore(frag, ul.firstChild);
};

socket.on("connect", () => { $("status-bar").classList.remove("visible"); toast(`${T.status_conn} (${username})`, "success"); });
socket.on("disconnect", () => $("status-bar").classList.add("visible"));

socket.on("updateQueue", d => { 
    $("number").textContent = d.current; 
    $("issued-number").textContent = d.issued; 
    $("waiting-count").textContent = Math.max(0, d.issued - (d.max || d.current)); 
    if(checkPerm('perm_stats_view')) loadStats(); 
});

socket.on("update", n => { $("number").textContent=n; if(checkPerm('perm_stats_view')) loadStats(); });
socket.on("initAdminLogs", l => checkPerm('perm_logs_view') && renderLogs(l, true));
socket.on("newAdminLog", l => checkPerm('perm_logs_view') && renderLogs([l], false));
socket.on("updatePublicStatus", b => $("public-toggle") && ($("public-toggle").checked = b));
socket.on("updateSoundSetting", b => $("sound-toggle") && ($("sound-toggle").checked = b));
socket.on("updateSystemMode", m => { $$('input[name="systemMode"]').forEach(r => r.checked = (r.value === m)); const w = document.querySelector('.segmented-control'); if(w) updateSegmentedVisuals(w); });
socket.on("updateTicketingEnabled", b => $("ticketing-toggle") && ($("ticketing-toggle").checked = b));
socket.on("updateAppointments", l => checkPerm('perm_booking_view') && renderAppointments(l));
socket.on("updatePassed", l => renderList("passed-list-ui", l, n => {
    const canEdit = checkPerm('perm_passed_edit');
    const acts = mk("div","list-actions",null,{},[]);
    if(canEdit) {
        acts.appendChild(mk("button","btn-secondary",T.recall,{onclick:()=>{if(confirm(T.msg_recall_confirm.replace('%s',n))) req("/api/control/recall-passed",{number:n});}}));
        acts.appendChild((b=>{confirmBtn(b,T.del,()=>req("/api/passed/remove",{number:n}));return b;})(mk("button","btn-secondary",T.del)));
    }
    return mk("li","list-item",null,{},[mk("span","list-main-text",`${n} 號`,{style:"font-size:1rem;color:var(--primary);"}), acts]);
}, "empty"));
socket.on("updateFeaturedContents", l => checkPerm('perm_links_view') && renderList("featured-list-ui", l, renderFeaturedItem, "empty"));
socket.on("updateOnlineAdmins", l => checkPerm('perm_online_view') && renderList("online-users-list", (l||[]).sort((a,b)=>(a.role==='super'?-1:1)), u => {
    const rC=(u.userRole||u.role||'OPERATOR').toLowerCase(), rL=rC.includes('admin')?'ADMIN':(rC.includes('manager')?'MANAGER':'OPERATOR');
    return mk("li","user-card-item online-mode",null,{},[mk("div","user-card-header",null,{},[mk("div","user-avatar-fancy",(u.nickname||u.username).charAt(0).toUpperCase(),{style:`background:linear-gradient(135deg, hsl(${u.username.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360},75%,60%), hsl(${(u.username.split('').reduce((a,c)=>a+c.charCodeAt(0),0)+50)%360},75%,50%))`}), mk("div","user-info-fancy",null,{},[mk("div","user-nick-fancy",null,{},[mk("span","status-pulse-indicator"),mk("span",null,u.nickname||u.username)]), mk("div","user-id-fancy",`IP/ID: @${u.username}`), mk("div",`role-badge-fancy ${rC.includes('admin')?'admin':rC}`,rL)])]), mk("div","user-card-actions",null,{style:"justify-content:flex-end;opacity:0.7;font-size:0.8rem;"},[mk("span",null,"🟢 Active Now")])]);
}, "loading"));

socket.on("updateBusinessHours", cfg => {
    if($("bh-enabled")) $("bh-enabled").checked = cfg.enabled;
    if($("bh-start")) $("bh-start").value = String(cfg.start).includes(':') ? cfg.start : String(cfg.start).padStart(2,'0') + ":00";
    if($("bh-end")) $("bh-end").value = String(cfg.end).includes(':') ? cfg.end : String(cfg.end).padStart(2,'0') + ":00";
});

const renderFeaturedItem = (item) => {
    const canEdit = checkPerm('perm_links_edit');
    const view = mk("div","list-info",null,{},[mk("span","list-main-text",item.linkText),mk("span","list-sub-text",item.linkUrl)]), form = mk("div","edit-form-wrapper",null,{style:"display:none;position:relative;"},[mk("input",null,null,{value:item.linkText}),mk("input",null,null,{value:item.linkUrl}),mk("div","edit-form-actions",null,{},[mk("button","btn-secondary",T.cancel,{onclick:()=>{form.style.display="none";view.style.display="flex";acts.style.display="flex";}}),mk("button","btn-secondary success",T.save,{onclick:async()=>{if(await req("/api/featured/edit",{oldLinkText:item.linkText,oldLinkUrl:item.linkUrl,newLinkText:form.children[0].value,newLinkUrl:form.children[1].value})) toast(T.saved,"success");}})])]);
    const acts = mk("div","list-actions",null,{},[]);
    if(canEdit) {
        acts.appendChild(mk("button","btn-secondary",T.edit,{onclick:()=>{form.style.display="flex";view.style.display="none";acts.style.display="none";}}));
        acts.appendChild(mk("button","btn-secondary",T.del,{onclick:()=>req("/api/featured/remove",item)}));
    }
    return mk("li","list-item",null,{},[view,acts,form]);
};
async function loadAppointments() { try{ renderAppointments((await req("/api/appointment/list"))?.appointments); }catch(e){} }
function renderAppointments(list) { 
    const canEdit = checkPerm('perm_booking_edit');
    if($("appt-number")) $("appt-number").disabled = !canEdit;
    if($("appt-time")) $("appt-time").disabled = !canEdit;
    if($("btn-add-appt")) $("btn-add-appt").style.display = canEdit ? "block" : "none";

    renderList("appointment-list-ui", list, a => {
        const acts = mk("div","list-actions",null,{},[]);
        if(canEdit) acts.appendChild((b=>{confirmBtn(b,T.del,async()=>await req("/api/appointment/remove",{id:a.id})); return b;})(mk("button","btn-secondary",T.del)));
        return mk("li","list-item",null,{},[mk("div","list-info",null,{},[mk("span","list-main-text",`${a.number} 號`,{style:"color:var(--primary);font-size:1rem;"}),mk("span","list-sub-text",`📅 ${new Date(a.scheduled_time).toLocaleString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`)]), acts]);
    }, "no_appt"); 
}
async function loadUsers() {
    const d = await req("/api/admin/users"); if(!d?.users) return;
    const canEdit = checkPerm('perm_users_edit');

    renderList("user-list-ui", d.users, u => {
        const rC=(u.role||'OPERATOR').toLowerCase(), acts=mk("div","user-card-actions"), editForm=mk("div","edit-form-wrapper",null,{style:"display:none;"},[mk("h4",null,"修改暱稱",{style:"margin:0 0 10px 0;color:var(--text-main);"}), mk("input",null,null,{value:u.nickname,placeholder:T.ph_nick,style:"margin-bottom:10px;"}), mk("div","edit-form-actions",null,{},[mk("button","btn-secondary",T.cancel,{onclick:e=>{e.stopPropagation();editForm.style.display="none";}}),mk("button","btn-secondary success",T.save,{onclick:async e=>{e.stopPropagation();if(await req("/api/admin/set-nickname",{targetUsername:u.username,nickname:editForm.children[1].value})){toast(T.saved,"success");loadUsers();}}})])]);
        
        if(canEdit || u.username===uniqueUser || isSuperAdmin()) acts.appendChild(mk("button","btn-action-icon","✎",{title:T.edit,onclick:()=>editForm.style.display="flex"})); else acts.appendChild(mk("span"));
        
        if(u.username!=='superadmin' && isSuperAdmin()) {
            const roleSel = mk("select","role-select",null,{title:"變更權限",style:"height:32px;font-size:0.8rem;padding:0 8px;",onchange:async()=>{if(await req("/api/admin/set-role",{targetUsername:u.username,newRole:roleSel.value})){toast(T.saved,"success");loadUsers();}}}); ['OPERATOR','MANAGER','ADMIN'].forEach(r=>roleSel.add(new Option(r,r,false,u.role===r)));
            acts.appendChild(mk("div",null,null,{style:"display:flex;gap:8px;align-items:center;"},[roleSel, (b=>{confirmBtn(b,"✕",async()=>{await req("/api/admin/del-user",{delUsername:u.username});loadUsers();}); b.className="btn-action-icon danger"; b.title=T.del; return b;})(mk("button"))]));
        }
        return mk("li","user-card-item",null,{},[mk("div","user-card-header",null,{},[mk("div","user-avatar-fancy",(u.nickname||u.username).charAt(0).toUpperCase(),{style:`background:linear-gradient(135deg, hsl(${u.username.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360},75%,60%), hsl(${(u.username.split('').reduce((a,c)=>a+c.charCodeAt(0),0)+50)%360},75%,50%))`}), mk("div","user-info-fancy",null,{},[mk("div","user-nick-fancy",u.nickname||u.username),mk("div","user-id-fancy",`@${u.username}`),mk("div",`role-badge-fancy ${rC}`,u.role==='OPERATOR'?'Op (操作員)':(u.role==='MANAGER'?'Mgr (經理)':'Adm (管理員)'))])]), acts, editForm]);
    }, "loading");

    const ctr=$("card-user-management")?.querySelector('.admin-card'); $("add-user-container-fixed")?.remove();
    if(ctr && canEdit) {
        const uIn=mk("input",null,null,{id:"new-user-username",placeholder:T.ph_account}), pIn=mk("input",null,null,{id:"new-user-password",type:"password",placeholder:"Pwd"}), nIn=mk("input",null,null,{id:"new-user-nickname",placeholder:T.ph_nick}), rIn=mk("select",null,null,{id:"new-user-role"},["Operator","Manager","Admin"].map(x=>new Option(x,x.toUpperCase())));
        ctr.appendChild(mk("div","add-user-container",null,{id:"add-user-container-fixed"},[mk("div","add-user-grid",null,{},[uIn,pIn,nIn,rIn,mk("button","btn-hero btn-add-user-fancy",`+ ${T.lbl_add_user}`,{style:"height:46px;font-size:1rem;",onclick:async()=>{if(!uIn.value||!pIn.value)return toast("請輸入帳號密碼","error"); if(await req("/api/admin/add-user",{newUsername:uIn.value,newPassword:pIn.value,newNickname:nIn.value,newRole:rIn.value})){toast(T.saved,"success");loadUsers();uIn.value=pIn.value=nIn.value="";}}})])]));
    }
}

async function loadRoles() {
    const cfg = globalRoleConfig || await req("/api/admin/roles/get"), ctr = $("role-editor-content"); if(!cfg || !ctr) return; ctr.innerHTML="";
    
    const permGroups = {
        "🎮 現場控台 (Live)": [
            {k:'perm_command', t:'指揮中心 (叫號/重置)'},
            {k:'perm_issue',   t:'發號管理 (發號/收回)'},
            {k:'perm_passed_view',  t:'過號名單 (檢視)'},
            {k:'perm_passed_edit',  t:'過號名單 (操作)'},
        ],
        "📊 數據與日誌 (Data)": [
            {k:'perm_stats_view',   t:'流量分析 (檢視)'},
            {k:'perm_stats_edit',   t:'流量分析 (校正/清空)'},
            {k:'perm_logs_view',    t:'操作日誌 (檢視)'},
            {k:'perm_logs_edit',    t:'操作日誌 (清除)'},
        ],
        "⚙️ 系統與連結 (System)": [
            {k:'perm_system_view',  t:'系統設定 (檢視)'},
            {k:'perm_system_edit',  t:'系統設定 (修改)'},
            {k:'perm_links_view',   t:'連結管理 (檢視)'},
            {k:'perm_links_edit',   t:'連結管理 (修改)'},
            {k:'perm_line_view',    t:'LINE 設定 (檢視)'},
            {k:'perm_line_edit',    t:'LINE 設定 (修改)'},
        ],
        "👥 人員與預約 (Users)": [
            {k:'perm_online_view',  t:'在線管理 (查看人員)'},
            {k:'perm_users_view',   t:'帳號管理 (檢視)'},
            {k:'perm_users_edit',   t:'帳號管理 (新增/修改)'},
            {k:'perm_booking_view', t:'預約管理 (檢視)'},
            {k:'perm_booking_edit', t:'預約管理 (操作)'},
            {k:'perm_roles',   t:'權限設定 (僅管理員)'}
        ]
    };

    const roles = ['OPERATOR','MANAGER','ADMIN'], meta = {'OPERATOR':{icon:'🎮',l:T.role_operator,c:'role-op'},'MANAGER':{icon:'🛡️',l:T.role_manager,c:'role-mgr'},'ADMIN':{icon:'👑',l:T.role_admin,c:'role-mgr'}};

    const thead = mk("thead",null,null,{},[mk("tr",null,null,{},[mk("th",null,"權限分組 / 角色"), ...roles.map(r=>mk("th",`th-role ${meta[r].c}`,`<div class="th-content"><span class="th-icon">${meta[r].icon}</span><span>${meta[r].l}</span></div>`))])]);
    const tbody = mk("tbody");

    Object.entries(permGroups).forEach(([groupName, items], gIdx) => {
        const headerRow = mk("tr", "group-header", null, {
            onclick: (e) => {
                const tr = e.currentTarget; tr.classList.toggle('collapsed');
                $$(`.group-item-${gIdx}`).forEach(row => row.classList.toggle('hidden'));
            }
        });
        headerRow.appendChild(mk("td", null, null, {colSpan: roles.length + 1}, [mk("span", "group-toggle-icon", "▼"), mk("span", null, groupName)]));
        tbody.appendChild(headerRow);

        items.forEach(p => {
            const row = mk("tr", `perm-row group-item-${gIdx}`, null, {}, [mk("td","td-perm-name",p.t), ...roles.map(r => mk("td","td-check",null,{},[mk("label","custom-check",null,{},[mk("input","role-chk",null,{type:"checkbox",checked:(cfg[r]?.can||[]).includes('*')||(cfg[r]?.can||[]).includes(p.k), "data-role":r, "data-perm":p.k}), mk("span","checkmark")])]))]);
            tbody.appendChild(row);
        });
    });

    ctr.appendChild(mk("div","perm-table-wrapper",null,{},[mk("table","perm-matrix",null,{},[thead, tbody])]));
}

async function loadStats() {
    try {
        const d = await req("/api/admin/stats");
        if (d?.hourlyCounts) {
            if ($("stats-today-count")) $("stats-today-count").textContent = d.todayCount || 0;
            const chart=$("hourly-chart"), max=Math.max(...d.hourlyCounts, 1); chart.innerHTML="";
            const canEdit = checkPerm('perm_stats_edit');
            d.hourlyCounts.forEach((v, i) => chart.appendChild(mk("div", `chart-col ${i===d.serverHour?'current':''}`, null, {style:`--bar-height:${v?Math.max((v/max)*75,5):0}%`, onclick:e=>{if(!canEdit)return;$$('.chart-col').forEach(c=>c!==e.currentTarget&&c.classList.remove('active-touch'));e.currentTarget.classList.toggle('active-touch');openStatModal(i,v);}}, [mk("div","chart-val",v||"0"),mk("div","chart-bar",null,{style:`height:${v===0?'4px':Math.max((v/max)*75,5)+'%'};${v===0?'background:var(--border-color);opacity:0.3;':''}`}),mk("div","chart-label",String(i).padStart(2,'0'))])));
            renderList("stats-list-ui", d.history || [], h => mk("li","list-item",`<span>${new Date(h.timestamp).toLocaleTimeString('zh-TW', {hour:'2-digit',minute:'2-digit'})} - <b style="color:var(--primary)">${h.number}</b> <small style="color:var(--text-sub)">(${h.operator})</small></span>`,{isHtml:true}), "no_logs");
        }
    } catch (e) { console.error(e); }
}

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
    if(await req("/api/admin/roles/update",{rolesConfig:c})){toast(T.saved,"success"); globalRoleConfig=c; applyTheme(); $$('[data-perm]').forEach(el => el.style.display = checkPerm(el.getAttribute('data-perm')) ? (el.classList.contains('admin-card')||el.classList.contains('nav-btn')||el.classList.contains('card-wrapper')? (el.classList.contains('nav-btn')||el.classList.contains('card-wrapper')?'':'flex') : 'none') : 'none');}
});
bind("btn-save-unlock-pwd",async()=>{if(await req("/api/admin/line-settings/save-pass",{password:$("line-unlock-pwd").value}))toast(T.saved,"success");});
bind("btn-export-csv",async()=>{const d=await req("/api/admin/export-csv",{date:new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"})}); if(d?.csvData){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+d.csvData],{type:'text/csv'}));a.download=d.fileName;a.click();}});
bind("btn-save-line-msgs",async()=>{ const d={}; ["success","approach","arrival","passed","cancel","help","loginPrompt","loginSuccess","noTracking","noPassed","passedPrefix"].forEach(k=>d[k]=$(`msg-${k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase())}`)?.value||""); if(await req("/api/admin/line-messages/save",d,$("btn-save-line-msgs"))) toast(T.saved,"success");});
bind("btn-save-default-reply",async()=>{if(await req("/api/admin/line-default-reply/save",{reply:$("line-default-msg").value},$("btn-save-default-reply"))) toast(T.saved,"success");});
bind("btn-add-keyword",async()=>{const k=$("new-keyword-in").value,r=$("new-reply-in").value; if(k&&r&&await req("/api/admin/line-autoreply/save",{keyword:k,reply:r})){$("new-keyword-in").value="";$("new-reply-in").value="";toast(T.saved,"success");loadLineAutoReplies();}});

// 綁定儲存前台文字按鈕
bind("btn-save-frontend-texts", async () => {
    const d = {};
    $$('.frontend-text-input').forEach(inp => {
        const k = inp.id.replace('f-text-', '');
        if(inp.value.trim()) d[k] = inp.value.trim();
    });
    if(await req("/api/admin/frontend-texts/save", {texts: d}, $("btn-save-frontend-texts"))) {
        toast(T.saved, "success");
    }
});

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
    $$('.nav-btn').forEach(b => b.onclick = () => { $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.section-group').forEach(s=>s.classList.remove('active')); const t=$(b.dataset.target); if(t){ t.classList.add('active'); if(b.dataset.target==='section-stats') loadStats(); if(b.dataset.target==='section-settings'){ loadAppointments(); loadUsers(); if(checkPerm('perm_line_view')){cachedLine?renderLineSettings():loadLineSettings(); loadLineMessages(); loadLineAutoReplies(); loadLineSystemCommands();} } } });
    $("sound-toggle")?.addEventListener("change",e=>req("/set-sound-enabled",{enabled:e.target.checked}));
    $("public-toggle")?.addEventListener("change",e=>req("/set-public-status",{isPublic:e.target.checked}));
    $("ticketing-toggle")?.addEventListener("change", e => req("/set-ticketing-enabled", {enabled: e.target.checked}));
    $$('input[name="systemMode"]').forEach(r=>r.onchange=()=>confirm(T.confirm+" Switch Mode?")?req("/set-system-mode",{mode:r.value}):(r.checked=!r.checked));
    document.addEventListener("keydown", e => { if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){ if(e.key==="Enter"&&!e.shiftKey) {const m={"username-input":"login-button","manualNumber":"setNumber","manualIssuedNumber":"setIssuedNumber","new-passed-number":"add-passed-btn"}; if(m[document.activeElement.id]) $(m[document.activeElement.id])?.click();} return;} if(e.key==="ArrowRight") $("btn-call-next")?.click(); if(e.key==="ArrowLeft") $("btn-call-prev")?.click(); if(e.key.toLowerCase()==="p") $("btn-mark-passed")?.click(); });
});
