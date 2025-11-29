/* ==========================================
 * 前台邏輯 (main.js) - v109.1 UX/Kiosk Optimized
 * ========================================== */
const $ = i => document.getElementById(i), $$ = s => document.querySelectorAll(s);
const on = (el, ev, fn) => el?.addEventListener(ev, fn), show = (el, v) => el && (el.style.display = v ? 'block' : 'none');
const ls = localStorage, doc = document;

// --- Config & State ---
const i18n = {
    "zh-TW": { cur:"目前叫號", iss:"已發至", online:"線上取號", help:"免排隊，手機領號", man_t:"號碼提醒", man_p:"輸入您的號碼開啟到號提醒", take:"立即取號", track:"追蹤", my:"我的號碼", ahead:"前方", wait:"⏳ 剩 %s 組", arr:"🎉 輪到您了！", pass:"⚠️ 已過號", p_list:"過號", none:"無", links:"精選連結", copy:"複製", sound:"音效", s_on:"開啟", s_off:"靜音", scan:"掃描追蹤", off:"連線中斷", ok:"取號成功", fail:"失敗", no_in:"請輸入號碼", cancel:"取消追蹤？", copied:"已複製", notice:"📢 ", q_left:"還剩 %s 組！", est:"約 %s 分", est_less:"< 1 分", just:"剛剛", ago:"%s 分前", conn:"已連線", retry:"連線中 (%s)...", wait_count:"等待中", sys_close:"⛔ 系統已暫停服務", sys_close_desc:"請稍候，我們將很快回來" },
    "en": { cur:"Now Serving", iss:"Issued", online:"Get Ticket", help:"Digital ticket & notify", man_t:"Number Alert", man_p:"Enter number to get alerted", take:"Get Ticket", track:"Track", my:"Your #", ahead:"Ahead", wait:"⏳ %s groups", arr:"🎉 Your Turn!", pass:"⚠️ Passed", p_list:"Passed", none:"None", links:"Links", copy:"Copy", sound:"Sound", s_on:"On", s_off:"Mute", scan:"Scan", off:"Offline", ok:"Success", fail:"Failed", no_in:"Enter #", cancel:"Stop tracking?", copied:"Copied", notice:"📢 ", q_left:"%s groups left!", est:"~%s min", est_less:"< 1 min", just:"Now", ago:"%s m ago", conn:"Online", retry:"Retry (%s)...", wait_count:"Waiting", sys_close:"⛔ System Paused", sys_close_desc:"Please wait, we will be back soon" }
};
let lang = ls.getItem('callsys_lang')||'zh-TW', T = i18n[lang], myTicket = ls.getItem('callsys_ticket'), sysMode = 'ticketing';
let sndEnabled = true, localMute = false, avgTime = 0, lastUpd = null, audioCtx = null, connTimer, wakeLock = null;
let isDarkMode = ls.getItem('callsys_theme') === 'dark';
let cachedMode = ls.getItem('callsys_mode_cache');
let cachedPublic = ls.getItem('callsys_public_cache');

const socket = io({ autoConnect: false, reconnection: true });

// --- Core Helpers ---
const toast = (msg, type='info', ms=3000) => {
    const c = $('toast-container') || doc.body.appendChild(Object.assign(doc.createElement('div'),{id:'toast-container'}));
    const el = doc.createElement('div'); el.className = `toast-message ${type} show`; el.textContent = msg; c.appendChild(el);
    if(navigator.vibrate) navigator.vibrate(50); setTimeout(() => { el.classList.remove('show'); setTimeout(()=>el.remove(), 300); }, ms);
};

// [UX] Enhanced Wake Lock
const toggleWakeLock = async (act) => {
    if(!('wakeLock' in navigator)) return;
    try { 
        if(act) {
            if(!wakeLock) wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; if(doc.visibilityState==='visible' && (myTicket || isKioskMode())) toggleWakeLock(true); });
        } else if(wakeLock) { await wakeLock.release(); wakeLock=null; } 
    } catch(e){}
};

// [UX] iOS Safari Silent Buffer Fix & Enhanced TTS
const unlockAudio = () => {
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume().then(()=>updateMuteUI(false));
    const buffer = audioCtx.createBuffer(1, 1, 22050); 
    const source = audioCtx.createBufferSource(); 
    source.buffer = buffer; source.connect(audioCtx.destination); source.start(0);
    if('speechSynthesis' in window) window.speechSynthesis.getVoices();
    if($("notify-sound")) $("notify-sound").load();
};

const speak = (txt) => {
    if(!localMute && sndEnabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const u = new SpeechSynthesisUtterance(txt); 
        // [Optimization] Robust Voice Selection for Mobile Devices
        let v = window.speechSynthesis.getVoices().find(v => v.lang === 'zh-TW' || v.lang === 'zh_TW');
        if(!v) v = window.speechSynthesis.getVoices().find(v => v.lang.includes('zh'));
        
        u.lang = 'zh-TW'; // Default fallback
        if(v) u.voice = v; 
        
        // Fix for some browsers cutting off speech
        u.onend = () => { /* Optional: post-speech actions */ };
        window.speechSynthesis.speak(u);
    }
};

const playDing = () => { if($("notify-sound") && !localMute) { $("notify-sound").currentTime = 0; $("notify-sound").play().then(()=>updateMuteUI(false)).catch(()=>updateMuteUI(true, true)); } };

// --- UI Logic ---
const applyTheme = () => { doc.body.classList.toggle('dark-mode', isDarkMode); if($('theme-toggle')) $('theme-toggle').textContent = isDarkMode ? '☀️' : '🌙'; ls.setItem('callsys_theme', isDarkMode ? 'dark' : 'light'); };
const applyText = () => {
    $$('[data-i18n]').forEach(e => { const k={current_number:'cur', issued_number:'iss', online_ticket_title:'online', help_take_ticket:'help', manual_input_title:'man_t', take_ticket:'take', set_reminder:'track', my_number:'my', wait_count:'wait_count', passed_list_title:'p_list', passed_empty:'none', links_title:'links', copy_link:'copy', sound_enable:'sound', scan_qr:'scan'}[e.dataset.i18n]; if(k && T[k]) e.textContent = T[k]; });
    if($("manual-ticket-input")) $("manual-ticket-input").placeholder = T.man_p;
    $$("#hero-waiting-count, #ticket-waiting-count").forEach(e => e.previousElementSibling && (e.previousElementSibling.textContent = e.id.includes('hero') ? T.wait_count : T.ahead));
    if($("overlay-title")) $("overlay-title").textContent = T.sys_close;
    if($("overlay-desc")) $("overlay-desc").textContent = T.sys_close_desc;
};
const renderMode = () => {
    const isT = sysMode==='ticketing', hasT = !!myTicket;
    show($("ticketing-mode-container"), isT && !hasT); show($("input-mode-container"), !isT && !hasT); show($("my-ticket-view"), hasT);
    if(hasT) { $("my-ticket-num").textContent = myTicket; updateTicket(parseInt($("number").textContent)||0); toggleWakeLock(true); } else if(!isKioskMode()) toggleWakeLock(false);
};
const updateTicket = (curr) => {
    if (!myTicket) return;
    const diff = myTicket - curr, wEl = $("ticket-wait-time");
    $("ticket-waiting-count").textContent = diff > 0 ? diff : (diff===0?"0":"-");
    $("ticket-status-text").textContent = diff > 0 ? T.wait.replace("%s",diff) : (diff===0?T.arr:T.pass);
    if(diff > 0 && avgTime >= 0) {
        const min = Math.ceil(diff * avgTime), tStr = new Date(Date.now() + min * 60000).toLocaleTimeString('zh-TW', {hour:'2-digit',minute:'2-digit',hour12:false});
        wEl.innerHTML = `${(min<=1)?T.est_less:T.est.replace("%s",min)}<br><small style="opacity:0.8;font-size:0.8em">預計 ${tStr} 到號</small>`; show(wEl, true);
    } else show(wEl, false);
    if(diff === 0) { if(window.confetti) confetti({particleCount:100, spread:70, origin:{y:0.6}}); if(navigator.vibrate) navigator.vibrate([200,100,200]); }
    if(diff <= 3 && diff > 0 && doc.hidden && Notification.permission==="granted") new Notification("Queue", {body:T.q_left.replace("%s",diff)});
};
const updateMuteUI = (mute, force=false) => {
    localMute = mute; const b = $("sound-prompt"); if(!b) return;
    b.children[0].textContent = (force||mute)?'🔇':'🔊'; b.children[1].textContent = (force||mute)?T.s_off:T.s_on; b.classList.toggle("is-active", !force && !mute);
};
const updTime = () => { if(lastUpd) { const m = Math.floor((new Date()-lastUpd)/60000); $("last-updated").textContent = m<1?T.just:T.ago.replace("%s",m); }};

// [UX] System Closed Overlay
const toggleClosedOverlay = (isClosed) => {
    let ov = $("closed-overlay");
    if (!ov) {
        ov = doc.createElement('div'); ov.id = "closed-overlay";
        ov.innerHTML = `<div style="text-align:center;"><div style="font-size:4rem;">⛔</div><h2 id="overlay-title" style="margin:20px 0 10px;font-weight:900;">${T.sys_close}</h2><p id="overlay-desc" style="opacity:0.8;">${T.sys_close_desc}</p></div>`;
        Object.assign(ov.style, { position:'fixed', inset:0, background:'var(--bg-body)', zIndex:9998, display:'none', justifyContent:'center', alignItems:'center', flexDirection:'column' });
        doc.body.appendChild(ov);
    }
    ov.style.display = isClosed ? 'flex' : 'none';
};

// --- Socket Events ---
socket.on("connect", () => { socket.emit('joinRoom', 'public'); clearTimeout(connTimer); $("status-bar").textContent=T.conn; $("status-bar").classList.remove("visible"); })
    .on("disconnect", () => connTimer = setTimeout(() => { $("status-bar").textContent=T.off; $("status-bar").classList.add("visible"); }, 1000))
    .on("reconnect_attempt", a => $("status-bar").textContent = T.retry.replace("%s",a))
    .on("updateQueue", d => {
        if($("issued-number-main")) $("issued-number-main").textContent = d.issued;
        if($("hero-waiting-count")) $("hero-waiting-count").textContent = Math.max(0, d.issued - d.current);
        const el = $("number");
        if(el.textContent !== String(d.current)) {
            playDing(); setTimeout(()=>speak(`現在號碼，${d.current}號`), 800);
            el.classList.remove("number-change-anim"); void el.offsetWidth; el.classList.add("number-change-anim");
            el.textContent = d.current; doc.title = `${d.current} - Queue`;
        }
        updateTicket(d.current);
    })
    .on("adminBroadcast", m => { if(!localMute) speak(m); toast(T.notice+m, 'info', 10000); })
    .on("updateWaitTime", t => { avgTime = t; updateTicket(parseInt($("number").textContent)||0); })
    .on("updateSoundSetting", b => sndEnabled = b)
    .on("updatePublicStatus", b => { 
        const s = b ? '1' : '0';
        if(cachedPublic !== s) ls.setItem('callsys_public_cache', s);
        cachedPublic = s;
        toggleClosedOverlay(!b); 
    })
    .on("updateSystemMode", m => { 
        if(cachedMode !== m) ls.setItem('callsys_mode_cache', m);
        cachedMode = m; sysMode = m; renderMode();
    })
    .on("updatePassed", l => { 
        const ul=$("passedList"), mt=$("passed-empty-msg"); if($("passed-count")) $("passed-count").textContent = l?.length||0;
        if(!l?.length) { show(ul, false); show(mt, true); } else { show(ul, true); show(mt, false); ul.innerHTML = l.map(n=>`<li>${n}</li>`).join(""); }
    })
    .on("updateFeaturedContents", l => $("featured-container") && ($("featured-container").innerHTML = l.map(c=>`<a class="link-chip" href="${c.linkUrl}" target="_blank">${c.linkText}</a>`).join("")))
    .on("updateTimestamp", ts => { lastUpd = new Date(ts); updTime(); });

setInterval(updTime, 10000); 
doc.addEventListener('visibilitychange', () => { if(doc.visibilityState==='visible' && (myTicket||isKioskMode())) toggleWakeLock(true); });

// [Feature] Kiosk Mode Detection
const isKioskMode = () => new URLSearchParams(window.location.search).get('mode') === 'kiosk';

// --- Interactions ---
doc.addEventListener("DOMContentLoaded", () => {
    if(isKioskMode()) {
        // [Optimization] Use CSS class instead of JS injection
        doc.body.classList.add('kiosk-mode');
        toggleWakeLock(true);
    }

    if($("language-selector")) $("language-selector").value = lang;
    applyTheme(); applyText(); renderMode(); socket.connect();
    
    // [UX] Prevent duplicate ticket via local check
    if(ls.getItem('callsys_ticket')) { $("btn-take-ticket").disabled = true; $("btn-take-ticket").textContent = "已取號"; }

    const unlock = () => { unlockAudio(); doc.body.removeEventListener('click', unlock); }; doc.body.addEventListener('click', unlock);
    if($("qr-code-placeholder")) try{ new QRCode($("qr-code-placeholder"), {text:location.href, width:120, height:120}); }catch(e){}

    on($("btn-take-ticket"), "click", async () => {
        const b = $("btn-take-ticket"); if(b.disabled) return; 
        if(ls.getItem('callsys_ticket')) return toast("您已有號碼", "error"); 
        
        unlockAudio(); if(Notification.permission!=='granted') Notification.requestPermission();
        b.disabled = true;
        try { const r = await fetch("/api/ticket/take", {method:"POST"}).then(d=>d.json()); if(r.success) { myTicket=r.ticket; ls.setItem('callsys_ticket', myTicket); renderMode(); toast(T.ok, "success"); } else toast(r.error||T.fail, "error"); } catch(e) { toast(T.off, "error"); }
        setTimeout(() => { if(!myTicket) b.disabled = false; }, 1000);
    });
    on($("btn-track-ticket"), "click", () => {
        unlockAudio(); const v = $("manual-ticket-input").value; if(!v) return toast(T.no_in, "error");
        if(Notification.permission!=='granted') Notification.requestPermission(); myTicket=parseInt(v); ls.setItem('callsys_ticket', myTicket); $("manual-ticket-input").value=""; renderMode();
    });
    on($("btn-cancel-ticket"), "click", () => { if(confirm(T.cancel)) { ls.removeItem('callsys_ticket'); myTicket=null; renderMode(); $("btn-take-ticket").disabled = false; $("btn-take-ticket").textContent = T.take; }});
    on($("sound-prompt"), "click", () => { unlockAudio(); updateMuteUI(!localMute); });
    on($("copy-link-prompt"), "click", () => navigator.clipboard?.writeText(location.href).then(() => {
        const b=$("copy-link-prompt"), i=b.children[0], t=b.children[1], oi=i.textContent, ot=t.textContent;
        b.classList.add('is-feedback'); i.textContent='✔'; t.textContent=T.copied; setTimeout(()=>{b.classList.remove('is-feedback'); i.textContent=oi; t.textContent=ot;},1500);
    }));
    on($("language-selector"), "change", e => { lang = e.target.value; ls.setItem('callsys_lang', lang); T=i18n[lang]; applyText(); renderMode(); updateMuteUI(localMute); updTime(); });
    on($("theme-toggle"), "click", () => { isDarkMode = !isDarkMode; applyTheme(); });
});
