/* ==========================================
 * 後台邏輯 (admin.js) - v18.0 Fixed & Polished
 * ========================================== */
const $ = i => document.getElementById(i), $$ = s => document.querySelectorAll(s);
const mk = (t, c, txt, ev={}, ch=[]) => { 
    const e = document.createElement(t); if(c) e.className=c; if(txt) e.textContent=txt; 
    Object.entries(ev).forEach(([k,v])=>e[k.startsWith('on')?k.toLowerCase():k]=v); 
    ch.forEach(x=>x&&e.appendChild(x)); return e; 
};
const toast = (m, t='info') => { 
    const el=$("toast-notification"); el.textContent=m; 
    el.className = `show ${t}`; setTimeout(()=>el.className="", 3000); 
};

const i18n = {
    "zh-TW": { 
        status_conn:"✅ 已連線", status_dis:"⚠️ 連線中斷...", saved:"✅ 已儲存", denied:"❌ 權限不足", 
        expired:"Session 過期", login_fail:"登入失敗", confirm:"⚠️ 確認", recall:"↩️ 重呼", 
        edit:"✎ 編輯", del:"✕ 刪除", save:"✓ 儲存", cancel:"✕ 取消",
        login_title: "請登入管理系統", ph_account: "帳號", ph_password: "密碼", login_btn: "登入",
        admin_panel: "管理後台", nav_live: "現場控台", nav_stats: "數據報表", nav_booking: "預約管理",
        nav_settings: "系統設定", nav_line: "LINE設定", logout: "登出",
        dash_curr: "目前叫號", dash_issued: "已發號至", dash_wait: "等待組數",
        card_call: "指揮中心", btn_next: "下一號 ▶", btn_prev: "◀ 上一號", btn_pass: "過號", 
        lbl_assign: "指定 / 插隊", btn_exec: "GO", btn_reset_call: "↺ 重置叫號",
        card_issue: "發號管理", btn_recall: "➖ 收回", btn_issue: "發號 ➕", 
        lbl_fix_issue: "修正發號數", btn_fix: "修正", btn_reset_issue: "↺ 重置發號",
        card_passed: "過號名單", btn_clear_passed: "清空過號",
        card_stats: "流量分析", lbl_today: "今日人次", btn_refresh: "重整", btn_calibrate: "校正", btn_clear_stats: "🗑️ 清空統計",
        card_logs: "操作日誌", btn_clear_logs: "清除日誌",
        card_sys: "系統", lbl_public: "開放前台", lbl_sound: "提示音效", 
        lbl_tts: "TTS 語音廣播", btn_play: "播放", 
        lbl_mode: "取號模式", mode_online: "線上取號", mode_manual: "手動輸入", btn_reset_all: "💥 全域重置",
        card_online: "在線管理", card_links: "連結管理", ph_link_name: "名稱", btn_clear_links: "清空連結",
        card_users: "帳號管理", lbl_add_user: "新增帳號", ph_nick: "暱稱",
        card_roles: "權限設定", btn_save_roles: "儲存權限變更",
        btn_save: "儲存", btn_restore: "恢復預設值",
        modal_edit: "編輯數據", btn_done: "完成",
        card_booking: "預約管理", lbl_add_appt: "新增預約", wait: "等待...",
        loading: "載入中...", empty: "[ 空 ]", no_logs: "[ 無日誌 ]", no_appt: "暫無預約",
        role_operator: "操作員", role_manager: "經理", role_admin: "管理員",
        msg_recall_confirm: "確定要重呼 %s 嗎？", msg_sent: "📢 已發送", msg_calibrated: "校正完成",
        perm_role: "角色權限", perm_call: "叫號/指揮", perm_issue: "發號", perm_stats: "數據/日誌", 
        perm_settings: "系統設定", perm_line: "LINE設定", perm_appointment: "預約管理", perm_users: "帳號管理"
    },
    "en": { 
        status_conn:"✅ Connected", status_dis:"⚠️ Disconnected...", saved:"✅ Saved", denied:"❌ Denied", 
        expired:"Session Expired", login_fail:"Login Failed", confirm:"⚠️ Confirm", recall:"↩️ Recall", 
        edit:"✎ Edit", del:"✕ Del", save:"✓ Save", cancel:"✕ Cancel",
        login_title: "Login to Admin Panel", ph_account: "Username", ph_password: "Password", login_btn: "Login",
        admin_panel: "Admin Panel", nav_live: "Live Console", nav_stats: "Statistics", nav_booking: "Booking",
        nav_settings: "Settings", nav_line: "Line Config", logout: "Logout",
        dash_curr: "Current Serving", dash_issued: "Last Issued", dash_wait: "Waiting",
        card_call: "Command Center", btn_next: "Next ▶", btn_prev: "◀ Prev", btn_pass: "Pass", 
        lbl_assign: "Assign / Jump", btn_exec: "GO", btn_reset_call: "↺ Reset Call",
        card_issue: "Ticketing", btn_recall: "➖ Recall", btn_issue: "Issue ➕", 
        lbl_fix_issue: "Fix Issued #", btn_fix: "Fix", btn_reset_issue: "↺ Reset Issue",
        card_passed: "Passed List", btn_clear_passed: "Clear Passed",
        card_stats: "Analytics", lbl_today: "Today's Count", btn_refresh: "Refresh", btn_calibrate: "Calibrate", btn_clear_stats: "🗑️ Clear Stats",
        card_logs: "Action Logs", btn_clear_logs: "Clear Logs",
        card_sys: "System", lbl_public: "Public Access", lbl_sound: "Sound FX", 
        lbl_tts: "TTS Broadcast", btn_play: "Play", 
        lbl_mode: "Mode", mode_online: "Online Ticket", mode_manual: "Manual Input", btn_reset_all: "💥 Factory Reset",
        card_online: "Online Users", card_links: "Links Manager", ph_link_name: "Name", btn_clear_links: "Clear Links",
        card_users: "User Manager", lbl_add_user: "Add User", ph_nick: "Nickname",
        card_roles: "Role Permissions", btn_save_roles: "Save Permission Changes",
        btn_save: "Save", btn_restore: "Restore Defaults",
        modal_edit: "Edit Data", btn_done: "Done",
        card_booking: "Booking Manager", lbl_add_appt: "Add Booking", wait: "Waiting...",
        loading: "Loading...", empty: "[ Empty ]", no_logs: "[ No Logs ]", no_appt: "No Appointments",
        role_operator: "Operator", role_manager: "Manager", role_admin: "Admin",
        msg_recall_confirm: "Recall number %s?", msg_sent: "📢 Sent", msg_calibrated: "Calibrated",
        perm_role: "Role", perm_call: "Role", perm_issue: "Ticketing", perm_stats: "Stats/Logs", 
        perm_settings: "Settings", perm_line: "Line Config", perm_appointment: "Booking", perm_users: "Users"
    }
};

let curLang = localStorage.getItem('callsys_lang')||'zh-TW', T = i18n[curLang], userRole="normal", username="", uniqueUser="", cachedLine=null, isDark = localStorage.getItem('callsys_admin_theme') === 'dark';
const socket = io({ autoConnect: false });
let globalRoleConfig = null;

async function req(url, data={}, btn=null) {
    if(btn) btn.disabled=true;
    try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        const res = await r.json();
        if(!r.ok) { if(r.status===403) { if(!res.error?.includes("權限")) logout(); } toast(`❌ ${res.error||'Error'}`, "error"); return null; }
        return res;
    } catch(e) { toast(`❌ ${e.message}`, "error"); return null; } finally { if(btn) setTimeout(()=>btn.disabled=false, 300); }
}

const confirmBtn = (el, txt, action) => {
    if(!el) return; let t, c=5;
    el.dataset.originalKey = Object.keys(T).find(key => T[key] === txt) || txt; 
    el.onclick = (e) => { 
        e.stopPropagation(); 
        if(el.classList.contains("is-confirming")) { action(); reset(); } 
        else { el.classList.add("is-confirming"); el.textContent = `${T.confirm} (${c})`; t = setInterval(() => { c--; el.textContent = `${T.confirm} (${c})`; if(c<=0) reset(); }, 1000); } 
    };
    const reset = () => { clearInterval(t); el.classList.remove("is-confirming"); el.textContent = T[el.dataset.originalKey] || txt; c=5; };
};

const updateLangUI = () => {
    T = i18n[curLang]||i18n["zh-TW"]; 
    $$('[data-i18n]').forEach(e => { const k = e.getAttribute('data-i18n'); if(T[k]) e.textContent = T[k]; });
    $$('[data-i18n-ph]').forEach(e => e.placeholder = T[e.getAttribute('data-i18n-ph')]||"");
    $$('button[data-original-key]').forEach(b => { if(!b.classList.contains('is-confirming')) b.textContent = T[b.dataset.originalKey]; });
    
    if(checkPerm('users')) loadUsers(); 
    if(checkPerm('stats')) loadStats(); 
    if(checkPerm('appointment')) loadAppointments(); 
    if(isSuperAdmin()) loadRoles(); 
    if(checkPerm('settings')) req("/api/featured/get").then(l => renderList("featured-list-ui", l, renderFeaturedItem));
    
    if($("section-settings").classList.contains("active") && checkPerm('line')) {
        if(cachedLine) renderLineSettings(); else loadLineSettings();
    }

    if(username) $("sidebar-user-info").textContent = username;
};

function renderList(ulId, list, fn, emptyMsgKey="empty") {
    const ul = $(ulId); if(!ul) return; 
    while (ul.firstChild) ul.removeChild(ul.firstChild); 
    if(!list?.length) { ul.innerHTML=`<li class="list-item" style="justify-content:center;color:var(--text-sub);">${T[emptyMsgKey] || T.empty}</li>`; return; }
    const frag = document.createDocumentFragment();
    list.forEach(x => { const el = fn(x); if(el) frag.appendChild(el); });
    ul.appendChild(frag);
}

function applyTheme() {
    document.body.classList.toggle('dark-mode', isDark); localStorage.setItem('callsys_admin_theme', isDark?'dark':'light');
    if($('admin-theme-toggle')) $('admin-theme-toggle').textContent = isDark ? '☀️' : '🌙';
    if($('admin-theme-toggle-mobile')) $('admin-theme-toggle-mobile').textContent = isDark ? '☀️' : '🌙';
}

const checkPerm = (perm) => {
    if(isSuperAdmin()) return true;
    if(!globalRoleConfig) return false;
    const myRoleConfig = globalRoleConfig[userRole];
    if(!myRoleConfig) return false;
    return myRoleConfig.can.includes('*') || myRoleConfig.can.includes(perm);
};

const applyUIPermissions = async () => {
    globalRoleConfig = await req("/api/admin/roles/get");
    if(!globalRoleConfig) return;
    $$('[data-perm]').forEach(el => {
        const requiredPerm = el.getAttribute('data-perm');
        if (checkPerm(requiredPerm)) {
            el.style.display = ''; 
            if(el.classList.contains('admin-card')) el.style.display = 'flex';
        } else {
            el.style.display = 'none'; 
        }
    });
    const visibleNav = document.querySelector('.nav-btn[style="display: none;"]');
    if(visibleNav && visibleNav.classList.contains('active')) {
        const firstVisible = document.querySelector('.nav-btn:not([style*="none"])');
        if(firstVisible) firstVisible.click();
    }
};

const checkSession = async () => {
    uniqueUser = localStorage.getItem('callsys_user');
    userRole = localStorage.getItem('callsys_role'); 
    username = localStorage.getItem('callsys_nick');
    if (uniqueUser === 'superadmin' && userRole !== 'ADMIN') { userRole = 'ADMIN'; localStorage.setItem('callsys_role', 'ADMIN'); }
    
    if(uniqueUser) {
        showPanel();
        await applyUIPermissions();
        updateLangUI();
    } else showLogin();
};

const logout = () => { 
    localStorage.removeItem('callsys_user'); localStorage.removeItem('callsys_role'); localStorage.removeItem('callsys_nick');
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    location.reload(); 
};
const showLogin = () => { $("login-container").style.display="block"; $("admin-panel").style.display="none"; socket.disconnect(); };
const isSuperAdmin = () => (uniqueUser === 'superadmin' || userRole === 'super' || userRole === 'ADMIN');

const showPanel = () => {
    $("login-container").style.display="none"; $("admin-panel").style.display="flex"; $("sidebar-user-info").textContent = username;
    const isSuper = isSuperAdmin();
    const setBlock = (id, show) => { if($(id)) $(id).style.display = show ? "block" : "none"; };
    ["card-role-management", "btn-export-csv", "mode-switcher-group", "unlock-pwd-group"].forEach(id => setBlock(id, isSuper));
    ['resetNumber','resetIssued','resetPassed','resetFeaturedContents','btn-clear-logs','btn-clear-stats','btn-reset-line-msg','resetAll'].forEach(id => setBlock(id, isSuper));
    socket.connect(); 
    upgradeSystemModeUI();
};

function upgradeSystemModeUI() {
    const container = document.querySelector('#card-sys .control-group:nth-of-type(3)');
    if (!container || container.querySelector('.segmented-control')) return;
    const radios = container.querySelectorAll('input[type="radio"]');
    if (radios.length < 2) return;
    const wrapper = mk('div', 'segmented-control');
    radios.forEach(radio => {
        const textNode = radio.nextSibling;
        const labelKey = radio.value === 'ticketing' ? 'mode_online' : 'mode_manual';
        const labelText = T[labelKey]; 
        if(textNode) textNode.remove();
        const label = mk('div', 'segmented-option', labelText);
        label.dataset.i18n = labelKey; 
        label.onclick = () => { radio.checked = true; radio.dispatchEvent(new Event('change')); updateSegmentedVisuals(wrapper); };
        wrapper.appendChild(label); wrapper.appendChild(radio);
    });
    const title = container.querySelector('label');
    container.innerHTML = ''; if(title) container.appendChild(title); container.appendChild(wrapper);
    updateSegmentedVisuals(wrapper);
}
function updateSegmentedVisuals(wrapper) {
    const radios = wrapper.querySelectorAll('input[type="radio"]');
    const labels = wrapper.querySelectorAll('.segmented-option');
    radios.forEach((r, i) => { if(labels[i]) labels[i].classList.toggle('active', r.checked); });
}

socket.on("connect", () => { $("status-bar").classList.remove("visible"); toast(`${T.status_conn} (${username})`, "success"); });
socket.on("disconnect", () => $("status-bar").classList.add("visible"));
socket.on("updateQueue", d => { $("number").textContent=d.current; $("issued-number").textContent=d.issued; $("waiting-count").textContent=Math.max(0, d.issued-d.current); if(checkPerm('stats')) loadStats(); });
socket.on("update", n => { $("number").textContent=n; if(checkPerm('stats')) loadStats(); });
socket.on("initAdminLogs", l => { if(checkPerm('stats')) renderLogs(l, true); });
socket.on("newAdminLog", l => { if(checkPerm('stats')) renderLogs([l], false); });
socket.on("updatePublicStatus", b => $("public-toggle").checked = b);
socket.on("updateSoundSetting", b => $("sound-toggle").checked = b);
socket.on("updateSystemMode", m => { $$('input[name="systemMode"]').forEach(r => r.checked = (r.value === m)); const w = document.querySelector('.segmented-control'); if(w) updateSegmentedVisuals(w); });
socket.on("updateAppointments", l => { if(checkPerm('appointment')) renderAppointments(l); });

/* --- [Polished] Online Users Socket Handler --- */
socket.on("updateOnlineAdmins", l => { 
    if(checkPerm('users')) {
        const getGradient = (str) => {
            const hash = str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
            return `linear-gradient(135deg, hsl(${hash%360}, 75%, 60%), hsl(${(hash+50)%360}, 75%, 50%))`;
        };

        renderList("online-users-list", (l||[]).sort((a,b)=>(a.role==='super'?-1:1)), u => {
            const roleClass = (u.userRole || u.role || 'OPERATOR').toLowerCase();
            const roleLabel = (u.userRole || u.role) === 'ADMIN' ? 'ADMIN' : ((u.userRole || u.role) === 'MANAGER' ? 'MANAGER' : 'OPERATOR');
            const displayNick = u.nickname || u.username;

            const card = mk("li", "user-card-item online-mode");
            
            const avatar = mk("div", "user-avatar-fancy", displayNick.charAt(0).toUpperCase(), { 
                style: `background: ${getGradient(u.username)}` 
            });
            
            const pulse = mk("span", "status-pulse-indicator");
            const nickDiv = mk("div", "user-nick-fancy", null, {}, [pulse, mk("span", null, displayNick)]);
            
            const infoDiv = mk("div", "user-info-fancy", null, {}, [
                nickDiv,
                mk("div", "user-id-fancy", `IP/ID: @${u.username}`),
                mk("div", `role-badge-fancy ${roleClass.includes('admin')?'admin':roleClass}`, roleLabel)
            ]);
            
            const header = mk("div", "user-card-header", null, {}, [avatar, infoDiv]);
            
            const actions = mk("div", "user-card-actions", null, {style:"justify-content:flex-end; opacity:0.7; font-size:0.8rem;"}, [
                mk("span", null, "🟢 Active Now")
            ]);

            card.append(header, actions);
            return card;
        }, "loading");
    }
});

socket.on("updatePassed", l => renderList("passed-list-ui", l, n => {
    const acts = mk("div", "list-actions", null, {}, [
        mk("button", "btn-secondary", T.recall, {onclick:()=>{ if(confirm(T.msg_recall_confirm.replace('%s', n))) req("/api/control/recall-passed",{number:n}); }}),
        (b => { confirmBtn(b, T.del, ()=>req("/api/passed/remove",{number:n})); return b; })(mk("button", "btn-secondary", T.del))
    ]);
    return mk("li", "list-item", null, {}, [mk("span","list-main-text",`${n} 號`,{style:"font-size:1rem;color:var(--primary);"}), acts]);
}, "empty"));

const renderFeaturedItem = (item) => {
    const view = mk("div", "list-info", null, {}, [mk("span","list-main-text",item.linkText), mk("span","list-sub-text",item.linkUrl)]);
    const form = mk("div", "edit-form-wrapper", null, {style:"display:none; position:relative;"}, [
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
};
socket.on("updateFeaturedContents", l => { if(checkPerm('settings')) renderList("featured-list-ui", l, renderFeaturedItem, "empty"); });

async function loadAppointments() { try { renderAppointments((await req("/api/appointment/list"))?.appointments); } catch(e){} }
function renderAppointments(list) {
    renderList("appointment-list-ui", list, a => {
        const dt = new Date(a.scheduled_time), dateStr = dt.toLocaleDateString()+" "+dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        const btnDel = mk("button", "btn-secondary", T.del); confirmBtn(btnDel, T.del, async()=>await req("/api/appointment/remove",{id:a.id}));
        return mk("li", "list-item", null, {}, [
            mk("div", "list-info", null, {}, [mk("span","list-main-text",`${a.number} 號`,{style:"color:var(--primary);font-size:1rem;"}), mk("span","list-sub-text",`📅 ${dateStr}`)]),
            mk("div", "list-actions", null, {}, [btnDel])
        ]);
    }, "no_appt");
}

/* --- [UI Fixed] Load Users Function --- */
async function loadUsers() {
    const d = await req("/api/admin/users"); if(!d?.users) return;
    const isSuper = isSuperAdmin(); 
    
    // 漸層生成
    const getGradient = (str) => {
        const hash = str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return `linear-gradient(135deg, hsl(${hash%360}, 75%, 60%), hsl(${(hash+50)%360}, 75%, 50%))`;
    };

    // 渲染卡片列表
    renderList("user-list-ui", d.users, u => {
        const roleClass = (u.role||'OPERATOR').toLowerCase();
        const roleLabel = u.role === 'OPERATOR' ? 'Op (操作員)' : (u.role === 'MANAGER' ? 'Mgr (經理)' : 'Adm (管理員)');
        
        // 1. 卡片本體
        const card = mk("li", "user-card-item");
        
        // 2. 資訊區 (Header)
        const avatar = mk("div", "user-avatar-fancy", (u.nickname||u.username).charAt(0).toUpperCase(), { style: `background: ${getGradient(u.username)}` });
        const infoDiv = mk("div", "user-info-fancy", null, {}, [
            mk("div", "user-nick-fancy", u.nickname || u.username),
            mk("div", "user-id-fancy", `@${u.username}`),
            mk("div", `role-badge-fancy ${roleClass}`, roleLabel)
        ]);
        const header = mk("div", "user-card-header", null, {}, [avatar, infoDiv]);

        // 3. 底部操作區 (Footer)
        const actions = mk("div", "user-card-actions");
        
        // 4. 編輯覆蓋層
        const editForm = mk("div", "edit-form-wrapper", null, {style: "display:none;"}, [
            mk("h4", null, "修改暱稱", {style:"margin:0 0 10px 0; color:var(--text-main);"}),
            mk("input", null, null, {value: u.nickname, placeholder: T.ph_nick, style:"margin-bottom:10px;"}),
            mk("div", "edit-form-actions", null, {}, [
                mk("button", "btn-secondary", T.cancel, {onclick: (e) => { e.stopPropagation(); editForm.style.display = "none"; }}),
                mk("button", "btn-secondary success", T.save, {onclick: async (e) => {
                    e.stopPropagation();
                    if(await req("/api/admin/set-nickname", {targetUsername: u.username, nickname: editForm.children[1].value})) {
                        toast(T.saved, "success"); loadUsers();
                    }
                }})
            ])
        ]);

        // 操作按鈕邏輯
        if (u.username === uniqueUser || isSuper) {
            const btnEdit = mk("button", "btn-action-icon", "✎", { title: T.edit });
            btnEdit.onclick = () => { editForm.style.display = "flex"; };
            actions.appendChild(btnEdit);
        } else {
            actions.appendChild(mk("span")); // 佔位
        }

        if (u.username !== 'superadmin' && isSuper) {
            const rightGrp = mk("div", null, null, {style:"display:flex; gap:8px; align-items:center;"});
            
            const roleSel = mk("select", "role-select", null, {
                title: "變更權限",
                style: "height:32px; font-size:0.8rem; padding:0 8px;",
                onchange: async () => { if(await req("/api/admin/set-role", {targetUsername: u.username, newRole: roleSel.value})) { toast(T.saved, "success"); loadUsers(); } }
            });
            ['OPERATOR', 'MANAGER', 'ADMIN'].forEach(r => roleSel.add(new Option(r, r, false, u.role === r)));
            
            const btnDel = mk("button", "btn-action-icon danger", "✕", { title: T.del });
            confirmBtn(btnDel, "✕", async () => { await req("/api/admin/del-user", {delUsername: u.username}); loadUsers(); });

            rightGrp.append(roleSel, btnDel);
            actions.appendChild(rightGrp);
        }

        card.append(header, actions, editForm);
        return card;
    }, "loading");

    // 重繪 "新增使用者" 區塊 (從卡片列表分離出來)
    const cardContainer = $("card-user-management");
    let addSection = document.getElementById("add-user-section-fixed");
    
    if(!addSection && cardContainer) {
        // 清理舊的結構
        const oldControls = cardContainer.querySelectorAll('.control-group.compact-group, .add-user-container');
        oldControls.forEach(el => el.remove());

        // 建立新的新增區塊卡片
        const containerDiv = mk("div", "admin-card", null, {id: "add-user-wrapper", style:"margin-top: 20px; padding: 24px;"});
        const header = mk("h3", null, null, {}, [mk("span", "card-icon", "👤"), mk("span", null, T.lbl_add_user)]);
        
        addSection = mk("div", "add-user-grid", null, {id:"add-user-section-fixed", style:"margin-top:16px;"});
        
        containerDiv.append(header, addSection);
        cardContainer.appendChild(containerDiv);
    }
    
    if(addSection) {
        addSection.innerHTML = '';
        const iUser = mk("input", null, null, {id:"new-user-username", placeholder: T.ph_account});
        const iPass = mk("input", null, null, {id:"new-user-password", type:"password", placeholder: "Pwd"});
        const iNick = mk("input", null, null, {id:"new-user-nickname", placeholder: T.ph_nick});
        const iRole = mk("select", null, null, {id:"new-user-role"});
        iRole.add(new Option("Operator", "OPERATOR")); iRole.add(new Option("Manager", "MANAGER")); iRole.add(new Option("Admin", "ADMIN"));
        
        const btnAdd = mk("button", "btn-hero", `+ ${T.lbl_add_user}`, {style: "height:46px; font-size:1rem; grid-column: 1 / -1;"});
        btnAdd.onclick = async()=>{ 
            if(!iUser.value || !iPass.value) return toast("請輸入帳號密碼", "error");
            if(await req("/api/admin/add-user", {newUsername:iUser.value, newPassword:iPass.value, newNickname:iNick.value, newRole:iRole.value})) { 
                toast(T.saved,"success"); loadUsers(); iUser.value=""; iPass.value=""; iNick.value="";
            } 
        };
        addSection.append(iUser, iPass, iNick, iRole, btnAdd);
    }
}

async function loadRoles() {
    const cfg = globalRoleConfig || await req("/api/admin/roles/get"); 
    const ctr = $("role-editor-content"); if(!cfg || !ctr) return; ctr.innerHTML="";
    
    const perms = [
        {k:'call', t:T.perm_call}, {k:'issue', t:T.perm_issue}, {k:'stats', t:T.perm_stats},
        {k:'settings', t:T.perm_settings}, {k:'appointment', t:T.perm_appointment}, 
        {k:'line', t:T.perm_line}, {k:'users', t:T.perm_users}
    ];
    const roleMeta = {
        'OPERATOR': { icon: '🎮', label: T.role_operator },
        'MANAGER': { icon: '🛡️', label: T.role_manager }
    };

    const container = mk("div", "role-editor-container");
    ['OPERATOR', 'MANAGER'].forEach(r => {
        const block = mk("div", "role-block");
        const meta = roleMeta[r] || {icon:'👤', label:r};
        const header = mk("div", "role-header", null, {}, [
            mk("span", null, meta.icon),
            mk("span", null, `${meta.label} (${r})`)
        ]);

        const grid = mk("div", "perm-grid");
        perms.forEach(p => {
            const isChecked = (cfg[r]?.can||[]).includes(p.k);
            const chk = mk("input", "role-chk", null, {type:"checkbox", dataset:{role:r, perm:p.k}, checked:isChecked});
            const label = mk("label", "perm-item", null, {}, [chk, mk("span", null, p.t)]);
            grid.appendChild(label);
        });

        block.appendChild(header); block.appendChild(grid); container.appendChild(block);
    });
    ctr.appendChild(container);
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
            renderList("stats-list-ui", d.history||[], h => mk("li","list-item",null,{},[mk("span",null,null,{innerHTML:`${new Date(h.timestamp).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})} - <b style="color:var(--primary)">${h.number}</b> <small style="color:var(--text-sub)">(${h.operator})</small>`})]), "no_logs");
        }
    } catch(e){}
}

async function loadLineSettings() { cachedLine = await req("/api/admin/line-settings/get"); renderLineSettings(); }
function renderLineSettings() {
    renderList("line-settings-list-ui", Object.keys(cachedLine||{}), k => {
        const val = cachedLine[k]||"", row = mk("div", "line-setting-row", null, {style:"display:flex;width:100%;align-items:center;justify-content:space-between;"});
        const edit = mk("div", "line-edit-box", null, {style:"display:none;width:100%;"}, [
            mk("textarea", null, null, {value:val, placeholder:"Content..."}),
            mk("div", null, null, {style:"display:flex;gap:8px;justify-content:flex-end;margin-top:4px;"}, [
                mk("button","btn-secondary",T.cancel,{onclick:()=>{edit.style.display="none";row.style.display="flex";}}),
                mk("button","btn-secondary success",T.save,{onclick:async()=>{if(await req("/api/admin/line-settings/save",{[k]:edit.children[0].value})){cachedLine[k]=edit.children[0].value;toast(T.saved,"success");renderLineSettings();}}})
            ])
        ]);
        row.append(mk("div","line-setting-info",null,{},[mk("div","line-setting-label",k.split(':').pop(),{style:"font-weight:600;"}), mk("code","line-setting-preview",val||"(未設定)",{style:val?"color:var(--text-sub);":"opacity:0.5"})]), mk("button","btn-secondary",T.edit,{onclick:()=>{row.style.display="none";edit.style.display="flex";}}));
        return mk("li", "list-item", null, {}, [row, edit]);
    }, "empty");
    req("/api/admin/line-settings/get-unlock-pass").then(r=>{ if($("line-unlock-pwd") && r) $("line-unlock-pwd").value=r.password||""; });
}

function renderLogs(logs, init) {
    const ul = $("admin-log-ui"); if(!ul) return; if(init) ul.innerHTML=""; 
    if(!logs?.length && init) return ul.innerHTML=`<li class='list-item' style='color:var(--text-sub);'>${T.no_logs}</li>`;
    const frag = document.createDocumentFragment();
    logs.forEach(m => frag.appendChild(mk("li", "list-item", m, {style:"font-family:monospace;font-size:0.8rem;"})));
    init ? ul.appendChild(frag) : ul.insertBefore(frag.firstChild, ul.firstChild);
    while(ul.children.length > 50) ul.removeChild(ul.lastChild);
}

const act = (id, api, data={}) => $(id)?.addEventListener("click", async () => {
    const numEl = $("number");
    const originalVal = numEl ? parseInt(numEl.textContent || 0) : 0;
    if(api.includes('call') && numEl && data.direction) { numEl.textContent = originalVal + (data.direction === 'next' ? 1 : -1); numEl.style.opacity = "0.6"; }
    try { await req(api, data, $(id)); } catch(e) { if(numEl) numEl.textContent = originalVal; } finally { if(numEl) numEl.style.opacity = "1"; }
});
const bind = (id, fn) => $(id)?.addEventListener("click", fn);

async function adjustCurrent(delta) {
    const numEl = $("number"); const c = parseInt(numEl.textContent) || 0; const target = c + delta;
    if(target > 0) {
        numEl.textContent = target; numEl.style.opacity = "0.6";
        try { if(await req("/api/control/set-call", {number: target})) toast(`${T.saved}: ${target}`, "success"); } 
        catch(e) { numEl.textContent = c; } finally { numEl.style.opacity = "1"; }
    }
}
bind("btn-call-add-1", () => adjustCurrent(1));
bind("btn-call-add-5", () => adjustCurrent(5));

act("btn-call-prev", "/api/control/call", {direction:"prev"}); 
act("btn-call-next", "/api/control/call", {direction:"next"});
act("btn-mark-passed", "/api/control/pass-current"); 
act("btn-issue-prev", "/api/control/issue", {direction:"prev"}); 
act("btn-issue-next", "/api/control/issue", {direction:"next"});
bind("setNumber", async()=>{ const n=$("manualNumber").value; if(n>0 && await req("/api/control/set-call",{number:n})) { $("manualNumber").value=""; toast(T.saved,"success"); }});
bind("setIssuedNumber", async()=>{ const n=$("manualIssuedNumber").value; if(n>=0 && await req("/api/control/set-issue",{number:n})) { $("manualIssuedNumber").value=""; toast(T.saved,"success"); }});
bind("add-passed-btn", async()=>{ const n=$("new-passed-number").value; if(n>0 && await req("/api/passed/add",{number:n})) $("new-passed-number").value=""; });
bind("add-featured-btn", async()=>{ const t=$("new-link-text").value, u=$("new-link-url").value; if(t&&u && await req("/api/featured/add",{linkText:t, linkUrl:u})) { $("new-link-text").value=""; $("new-link-url").value=""; }});
bind("btn-broadcast", async()=>{ const m=$("broadcast-msg").value; if(m && await req("/api/admin/broadcast",{message:m})) { toast(T.msg_sent,"success"); $("broadcast-msg").value=""; }});
bind("btn-add-appt", async()=>{ const n=$("appt-number").value, t=$("appt-time").value; if(n&&t && await req("/api/appointment/add",{number:parseInt(n), timeStr:t})) { toast(T.saved,"success"); $("appt-number").value=""; $("appt-time")._flatpickr?.clear(); }});
bind("btn-save-roles", async()=>{ 
    const c={ OPERATOR:{level:1,can:[]}, MANAGER:{level:2,can:[]}, ADMIN:{level:9,can:['*']} };
    $$(".role-chk:checked").forEach(k => c[k.dataset.role].can.push(k.dataset.perm));
    if(await req("/api/admin/roles/update", {rolesConfig:c})) {
        toast(T.saved,"success");
        globalRoleConfig = c;
        applyUIPermissions();
    }
});
bind("btn-save-unlock-pwd", async()=>{ const p=$("line-unlock-pwd").value; if(await req("/api/admin/line-settings/save-pass", {password:p})) toast(T.saved,"success"); });
bind("btn-export-csv", async()=>{ 
    const d=await req("/api/admin/export-csv", { date: new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}) }); 
    if(d?.csvData) { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+d.csvData],{type:'text/csv'})); a.download=d.fileName; a.click(); }
});

bind("admin-theme-toggle", ()=>{ isDark = !isDark; applyTheme(); });
bind("admin-theme-toggle-mobile", ()=>{ isDark = !isDark; applyTheme(); });
bind("login-button", async () => {
    const res = await fetch("/login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:$("username-input").value, password:$("password-input").value})}).then(r=>r.json()).catch(()=>({error:T.login_fail}));
    if(res.success) { 
        localStorage.setItem('callsys_user', res.username); localStorage.setItem('callsys_role', res.userRole); localStorage.setItem('callsys_nick', res.nickname); checkSession(); 
    } else $("login-error").textContent=res.error||T.login_fail;
});
bind("btn-logout", logout); bind("btn-logout-mobile", logout);

["resetNumber","resetIssued","resetPassed","resetFeaturedContents","resetAll","btn-clear-logs","btn-clear-stats","btn-reset-line-msg"].forEach(id => {
    const el = $(id); if(!el) return;
    let url;
    if (id.includes('clear')) url = id.includes('logs') ? "/api/logs/clear" : "/api/admin/stats/clear";
    else if (id === 'resetAll') url = "/reset";
    else if (id.includes('line')) url = "/api/admin/line-settings/reset";
    else if (id.includes('Passed')) url = "/api/passed/clear";
    else if (id.includes('Featured')) url = "/api/featured/clear";
    else url = `/api/control/${id==='resetNumber'?'set-call':'set-issue'}`;
    const needsZero = id.startsWith('reset') && !['All','Passed','Featured','line'].some(s => id.includes(s));
    confirmBtn(el, el.textContent.trim(), async () => {
        await req(url, needsZero ? {number: 0} : {});
        if(id === 'btn-clear-stats') { 
            $("stats-today-count").textContent="0"; 
            const chart = $("hourly-chart"); chart.innerHTML="";
            for(let i=0; i<24; i++) {
                chart.appendChild(mk("div", `chart-col ${i===new Date().getHours()?'current':''}`, null, {}, [
                    mk("div","chart-val","0"),
                    mk("div","chart-bar",null,{style:"height:2%;background:var(--border-color)"}),
                    mk("div","chart-label",String(i).padStart(2,'0'))
                ]));
            }
            toast(T.saved, "success"); 
        }
        if(id === 'btn-clear-logs') { $("admin-log-ui").innerHTML=`<li class='list-item'>${T.no_logs}</li>`; toast(T.saved, "success"); }
    });
});

bind("btn-refresh-stats", loadStats);
bind("btn-calibrate-stats", async () => { if(confirm(`${T.confirm} ${T.btn_calibrate}?`)) { const r = await req("/api/admin/stats/calibrate"); if(r && r.success) { toast(`${T.msg_calibrated} (Diff: ${r.diff})`, "success"); loadStats(); } } });

let editHr=null; const modal=$("edit-stats-overlay");
bind("btn-modal-close", ()=>modal.style.display="none");
window.openStatModal = (h,v) => { $("modal-current-count").textContent=v; editHr=h; modal.style.display="flex"; };
["btn-stats-minus", "btn-stats-plus"].forEach((id, i) => bind(id, async()=>{ if(editHr!==null) { await req("/api/admin/stats/adjust", {hour:editHr, delta:i?1:-1}); $("modal-current-count").textContent = Math.max(0, parseInt($("modal-current-count").textContent)+(i?1:-1)); loadStats(); }}));

document.addEventListener("DOMContentLoaded", () => {
    checkSession(); applyTheme();
    if($("admin-lang-selector")) $("admin-lang-selector").value = curLang;
    if($("admin-lang-selector-mobile")) $("admin-lang-selector-mobile").value = curLang;
    if($("appt-time")) flatpickr("#appt-time", { enableTime:true, dateFormat:"Y-m-d H:i", time_24hr:true, locale:"zh_tw", minDate:"today", disableMobile:"true" });
    
    $$('.nav-btn').forEach(b => b.onclick = () => {
        $$('.nav-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
        $$('.section-group').forEach(s=>s.classList.remove('active')); 
        const target = $(b.dataset.target);
        if(target) {
            target.classList.add('active');
            
            if(b.dataset.target === 'section-stats') loadStats();
            if(b.dataset.target === 'section-settings') { 
                loadAppointments(); 
                loadUsers(); 
                if(checkPerm('line')) {
                    if(cachedLine) renderLineSettings(); else loadLineSettings();
                }
            }
        }
    });
    
    [ $("admin-lang-selector"), $("admin-lang-selector-mobile") ].forEach(sel => {
        sel?.addEventListener("change", e => { 
            curLang = e.target.value; localStorage.setItem('callsys_lang', curLang); 
            if($("admin-lang-selector")) $("admin-lang-selector").value = curLang;
            if($("admin-lang-selector-mobile")) $("admin-lang-selector-mobile").value = curLang;
            updateLangUI(); 
        });
    });

    $("sound-toggle")?.addEventListener("change", e => req("/set-sound-enabled", {enabled:e.target.checked})); 
    $("public-toggle")?.addEventListener("change", e => req("/set-public-status", {isPublic:e.target.checked}));
    $$('input[name="systemMode"]').forEach(r => r.onchange = () => confirm(T.confirm+" Switch Mode?") ? req("/set-system-mode", {mode:r.value}) : (r.checked=!r.checked));
    
    document.addEventListener("keydown", e => {
        if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) { if(e.key==="Enter" && !e.shiftKey) { const map={"username-input":"login-button","manualNumber":"setNumber","manualIssuedNumber":"setIssuedNumber","new-passed-number":"add-passed-btn"}; if(map[document.activeElement.id]) $(map[document.activeElement.id])?.click(); } return; }
        if(e.key==="ArrowRight") $("btn-call-next")?.click(); if(e.key==="ArrowLeft") $("btn-call-prev")?.click(); if(e.key.toLowerCase()==="p") $("btn-mark-passed")?.click();
    });
});
