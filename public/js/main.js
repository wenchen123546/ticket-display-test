/* ==========================================
 * 前端邏輯 (main.js) - v59.0 Complete Optimized
 * ========================================== */
const $ = i => document.getElementById(i);
const on = (el, evt, fn) => el?.addEventListener(evt, fn);
const show = (el, v) => el && (el.style.display = v ? 'block' : 'none');

// --- I18n Data ---
const i18n = {
    "zh-TW": { cur:"目前叫號", iss:"已發至", online:"線上取號", help:"免排隊，手機領號", man_t:"號碼提醒", man_p:"輸入您的號碼開啟到號提醒", take:"立即取號", track:"追蹤", my:"我的號碼", ahead:"前方", wait:"⏳ 剩 %s 組", arr:"🎉 輪到您了！", pass:"⚠️ 已過號", p_list:"過號", none:"無", links:"精選連結", copy:"複製", sound:"音效", s_on:"開啟", s_off:"靜音", scan:"掃描追蹤", off:"連線中斷", ok:"取號成功", fail:"失敗", no_in:"請輸入號碼", cancel:"取消追蹤？", copied:"已複製", notice:"📢 ", q_left:"還剩 %s 組！", est:"約 %s 分", est_less:"< 1 分", just:"剛剛", ago:"%s 分前", conn:"已連線", retry:"連線中 (%s)...", wait_count:"等待中" },
    "en": { cur:"Now Serving", iss:"Issued", online:"Get Ticket", help:"Digital ticket & notify", man_t:"Number Alert", man_p:"Enter number to get alerted", take:"Get Ticket", track:"Track", my:"Your #", ahead:"Ahead", wait:"⏳ %s groups", arr:"🎉 Your Turn!", pass:"⚠️ Passed", p_list:"Passed", none:"None", links:"Links", copy:"Copy", sound:"Sound", s_on:"On", s_off:"Mute", scan:"Scan", off:"Offline", ok:"Success", fail:"Failed", no_in:"Enter #", cancel:"Stop tracking?", copied:"Copied", notice:"📢 ", q_left:"%s groups left!", est:"~%s min", est_less:"< 1 min", just:"Now", ago:"%s m ago", conn:"Online", retry:"Retry (%s)...", wait_count:"Waiting" }
};

// --- State ---
let lang = localStorage.getItem('callsys_lang')||'zh-TW', T = i18n[lang];
let myTicket = localStorage.getItem('callsys_ticket'), sysMode = 'ticketing';
let sndEnabled = true, localMute = false, avgTime = 0, lastUpd = null, audioCtx = null;
let connTimer, wakeLock = null;
let isDarkMode = localStorage.getItem('callsys_theme') === 'dark';

const socket = io({ autoConnect: false, reconnection: true });

// --- Core Helpers ---
const toast = (msg, type='info', duration=3000) => {
    const c = $('toast-container') || document.body.appendChild(Object.assign(document.createElement('div'),{id:'toast-container'}));
    const el = document.createElement('div'); el.className = `toast-message ${type} show`; el.textContent = msg;
    c.appendChild(el); if(navigator.vibrate) navigator.vibrate(50);
    setTimeout(() => { el.classList.remove('show'); setTimeout(()=>el.remove(), 300); }, duration);
};

const toggleWakeLock = async (active) => {
    if ('wakeLock' in navigator) {
        try {
            if (active && !wakeLock) {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => { wakeLock = null; });
            } else if (!active && wakeLock) {
                await wakeLock.release();
                wakeLock = null;
            }
        } catch (err) { console.error("Wake Lock error:", err); }
    }
};
document.addEventListener('visibilitychange', () => { if (wakeLock !== null && document.visibilityState === 'visible') toggleWakeLock(true); });

const unlockAudio = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer; source.connect(audioCtx.destination); source.start(0);
        audioCtx.resume().then(() => updateMuteUI(false));
    }
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
};

const speak = (txt) => {
    if(!localMute && sndEnabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const u = new SpeechSynthesisUtterance(txt); 
        u.lang = 'zh-TW'; u.rate = 0.9; 
        const voices = window.speechSynthesis.getVoices();
        const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('TW'));
        if (zhVoice) u.voice = zhVoice;
        window.speechSynthesis.speak(u);
    }
};
const playDing = () => { if($("notify-sound") && !localMute) $("notify-sound").play().then(()=>updateMuteUI(false)).catch(()=>updateMuteUI(true, true)); };

// --- UI Logic ---
function applyTheme() {
    if (isDarkMode) { document.body.classList.add('dark-mode'); $('theme-toggle').textContent = '☀️'; } 
    else { document.body.classList.remove('dark-mode'); $('theme-toggle').textContent = '🌙'; }
    localStorage.setItem('callsys_theme', isDarkMode ? 'dark' : 'light');
}

function applyText() {
    document.querySelectorAll('[data-i18n]').forEach(e => {
        const k = e.getAttribute('data-i18n'), map = {
            current_number:'cur', issued_number:'iss', online_ticket_title:'online', help_take_ticket:'help', manual_input_title:'man_t', 
            take_ticket:'take', set_reminder:'track', my_number:'my', wait_count:'wait_count', passed_list_title:'p_list', passed_empty:'none', 
            links_title:'links', copy_link:'copy', sound_enable:'sound', scan_qr:'scan'
        };
        if(map[k] && T[map[k]]) e.textContent = T[map[k]];
    });
    // Special handling for dynamic placeholders/text
    if($("manual-ticket-input")) $("manual-ticket-input").placeholder = T.man_p;
    if($("hero-waiting-count") && $("hero-waiting-count").previousElementSibling) $("hero-waiting-count").previousElementSibling.textContent = T.wait_count;
    if($("ticket-waiting-count") && $("ticket-waiting-count").previousElementSibling) $("ticket-waiting-count").previousElementSibling.textContent = T.ahead;
}

function renderMode() {
    const isT = sysMode === 'ticketing', hasT = !!myTicket;
    show($("ticketing-mode-container"), isT && !hasT);
    show($("input-mode-container"), !isT && !hasT);
    show($("my-ticket-view"), hasT);
    if(hasT) { 
        $("my-ticket-num").textContent = myTicket; 
        updateTicket(parseInt($("number").textContent)||0); 
        toggleWakeLock(true);
    } else { toggleWakeLock(false); }
}

function updateTicket(curr) {
    if (!myTicket) return;
    const diff = myTicket - curr, wEl = $("ticket-wait-time");
    $("ticket-waiting-count").textContent = diff > 0 ? diff : (diff===0 ? "0" : "-");
    $("ticket-status-text").textContent = diff > 0 ? T.wait.replace("%s",diff) : (diff===0 ? T.arr : T.pass);
    if(diff > 0 && avgTime >= 0) { 
        const min = Math.ceil(diff * avgTime);
        const etaTime = new Date(Date.now() + min * 60000);
        const etaStr = etaTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        wEl.innerHTML = `${(min <= 1) ? T.est_less : T.est.replace("%s", min)}<br><small style="opacity:0.8; font-size:0.8em">預計 ${etaStr} 到號</small>`;
        show(wEl, true); 
    } else show(wEl, false);
    if(diff === 0) { if(typeof confetti!=='undefined') confetti({particleCount:100, spread:70, origin:{y:0.6}}); if(navigator.vibrate) navigator.vibrate([200,100,200]); }
    if(diff <= 3 && diff > 0 && document.hidden && Notification.permission==="granted") new Notification("Queue", {body:T.q_left.replace("%s",diff)});
}

function updateMuteUI(mute, forceIcon=false) {
    localMute = mute; const b = $("sound-prompt"); if(!b) return;
    b.querySelector('span:first-child').textContent = (forceIcon||mute) ? '🔇' : '🔊';
    b.querySelector('span:last-child').textContent = (forceIcon||mute) ? T.s_off : T.s_on;
    b.classList.toggle("is-active", !forceIcon && !mute);
}

function feedback(btn, msgKey) {
    const i = btn.querySelector('span:first-child'), t = btn.querySelector('span:last-child'), oi = i.textContent, ot = t.textContent;
    btn.classList.add('is-feedback'); i.textContent='✔'; t.textContent=T[msgKey];
    setTimeout(() => { btn.classList.remove('is-feedback'); i.textContent=oi; t.textContent=ot; if(btn.id==='sound-prompt') updateMuteUI(localMute); }, 1500);
}

// --- Socket Events ---
socket.on("connect", () => { socket.emit('joinRoom', 'public'); clearTimeout(connTimer); $("status-bar").textContent = T.conn; $("status-bar").classList.remove("visible"); });
socket.on("disconnect", () => { connTimer = setTimeout(() => { $("status-bar").textContent = T.off; $("status-bar").classList.add("visible"); }, 1000); });
socket.on("reconnect_attempt", a => $("status-bar").textContent = T.retry.replace("%s",a));

socket.on("updateQueue", d => {
    if($("issued-number-main")) $("issued-number-main").textContent = d.issued;
    
    // [New] Update Hero Waiting Count
    const waitCount = Math.max(0, d.issued - d.current);
    if($("hero-waiting-count")) $("hero-waiting-count").textContent = waitCount;

    const numEl = $("number");
    if(numEl.textContent !== String(d.current)) {
        playDing(); setTimeout(()=>speak(`現在號碼，${d.current}號`), 800);
        numEl.classList.remove("number-change-anim"); void numEl.offsetWidth; numEl.classList.add("number-change-anim");
        numEl.textContent = d.current; document.title = `${d.current} - Queue`;
    }
    updateTicket(d.current);
});

socket.on("adminBroadcast", m => { if(!localMute) speak(m); toast(T.notice+m, 'info', 10000); });
socket.on("updateWaitTime", t => { avgTime = t; updateTicket(parseInt($("number").textContent)||0); });
socket.on("updateSoundSetting", b => sndEnabled = b);
socket.on("updatePublicStatus", b => { document.body.classList.toggle("is-closed", !b); if(b) socket.connect(); else socket.disconnect(); });
socket.on("updateSystemMode", m => { sysMode = m; renderMode(); });
socket.on("updatePassed", list => {
    const ul = $("passedList"), mt = $("passed-empty-msg");
    $("passed-count").textContent = list?list.length:0;
    if(!list || !list.length) { show(ul, false); show(mt, true); }
    else { show(ul, true); show(mt, false); ul.innerHTML = list.map(n=>`<li>${n}</li>`).join(""); }
});
socket.on("updateFeaturedContents", list => { $("featured-container").innerHTML = list.map(c=>`<a class="link-chip" href="${c.linkUrl}" target="_blank">${c.linkText}</a>`).join(""); });
socket.on("updateTimestamp", ts => { lastUpd = new Date(ts); updTime(); });
const updTime = () => { if(lastUpd) { const m = Math.floor((new Date()-lastUpd)/60000); $("last-updated").textContent = m<1?T.just:T.ago.replace("%s",m); }};
setInterval(updTime, 10000);

// --- Interactions ---
on($("btn-take-ticket"), "click", async () => {
    if($("btn-take-ticket").disabled) return; unlockAudio(); if(Notification.permission!=='granted') Notification.requestPermission();
    $("btn-take-ticket").disabled = true;
    try {
        const r = await fetch("/api/ticket/take", {method:"POST"}).then(d=>d.json());
        if(r.success) { myTicket = r.ticket; localStorage.setItem('callsys_ticket', myTicket); renderMode(); toast(T.ok, "success"); }
        else toast(r.error||T.fail, "error");
    } catch(e) { toast(T.off, "error"); }
    setTimeout(() => $("btn-take-ticket").disabled = false, 1000);
});
on($("btn-track-ticket"), "click", () => {
    unlockAudio(); const v = $("manual-ticket-input").value;
    if(!v) return toast(T.no_in, "error"); if(Notification.permission!=='granted') Notification.requestPermission();
    myTicket = parseInt(v); localStorage.setItem('callsys_ticket', myTicket); $("manual-ticket-input").value = ""; renderMode();
});
on($("btn-cancel-ticket"), "click", () => { if(confirm(T.cancel)) { localStorage.removeItem('callsys_ticket'); myTicket=null; renderMode(); }});
on($("sound-prompt"), "click", () => { unlockAudio(); if(audioCtx?.state==='running') updateMuteUI(!localMute); else playDing(); });
on($("copy-link-prompt"), "click", () => { navigator.clipboard?.writeText(location.href).then(()=>feedback($("copy-link-prompt"), 'copied')); });
on($("language-selector"), "change", e => { lang = e.target.value; localStorage.setItem('callsys_lang', lang); T = i18n[lang]; applyText(); renderMode(); updateMuteUI(localMute); updTime(); });
on($("theme-toggle"), "click", () => { isDarkMode = !isDarkMode; applyTheme(); });

// Init
document.addEventListener("DOMContentLoaded", () => {
    $("language-selector").value = lang; applyTheme(); applyText(); renderMode(); socket.connect();
    document.body.addEventListener('click', unlockAudio);
    if($("qr-code-placeholder")) try{ new QRCode($("qr-code-placeholder"), {text:location.href, width:120, height:120}); }catch(e){}
});
