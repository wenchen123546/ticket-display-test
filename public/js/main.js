/* main.js - Optimized v109.2 */
const $ = i => document.getElementById(i), $$ = s => document.querySelectorAll(s), ls = localStorage, doc = document;
const on = (e,ev,f) => e?.addEventListener(ev,f), show = (e,v) => e && (e.style.display=v?'block':'none');
let lang = ls.getItem('callsys_lang')||'zh-TW', myTicket = ls.getItem('callsys_ticket'), sysMode = 'ticketing', sndOn = true, mute = false, avgT = 0, audio, wakeLock;
const T = { "zh-TW":{cur:"目前叫號",iss:"已發至",wait:"⏳ 剩 %s 組",arr:"🎉 輪到您了！",pass:"⚠️ 已過號",est:"約 %s 分",cl:"⛔ 暫停服務",conn:"已連線"}, "en":{cur:"Now Serving",iss:"Issued",wait:"⏳ %s groups",arr:"🎉 Your Turn!",pass:"⚠️ Passed",est:"~%s min",cl:"⛔ Paused",conn:"Online"} }[lang] || {};

const socket = io({ autoConnect: false });
const toast = (m,t='info') => { const c=$('toast-container')||doc.body.appendChild(Object.assign(doc.createElement('div'),{id:'toast-container'})), e=doc.createElement('div'); e.className=`toast-message ${t} show`; e.textContent=m; c.appendChild(e); setTimeout(()=>e.remove(),3000); };
const lock = async (on) => { if('wakeLock' in navigator) try{ if(on && !wakeLock) { wakeLock=await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release',()=>wakeLock=null); } else if(!on && wakeLock) { await wakeLock.release(); wakeLock=null; } }catch{} };
const unlockAudio = () => { if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==='suspended') audio.resume(); if($("notify-sound")) $("notify-sound").load(); };
const speak = (txt) => { if(!mute && sndOn && 'speechSynthesis' in window) { const u=new SpeechSynthesisUtterance(txt); u.lang='zh-TW'; window.speechSynthesis.speak(u); } };
const playDing = () => { if($("notify-sound")&&!mute) $("notify-sound").play().catch(()=>{}); };

const render = () => {
    const isT = sysMode==='ticketing', hasT = !!myTicket;
    show($("ticketing-mode-container"), isT && !hasT); show($("input-mode-container"), !isT && !hasT); show($("my-ticket-view"), hasT);
    if(hasT) { $("my-ticket-num").textContent=myTicket; updTic(parseInt($("number").textContent)||0); lock(true); } else lock(false);
    $$('[data-i18n]').forEach(e => e.textContent = T[e.dataset.i18n] || e.textContent);
};

const updTic = (curr) => {
    if (!myTicket) return; const diff = myTicket - curr, el = $("ticket-wait-time");
    $("ticket-waiting-count").textContent = diff > 0 ? diff : (diff===0?"0":"-");
    $("ticket-status-text").textContent = diff > 0 ? T.wait.replace("%s",diff) : (diff===0?T.arr:T.pass);
    if(diff > 0 && avgT >= 0) { const m=Math.ceil(diff*avgT); el.innerHTML=`${T.est.replace("%s",m)}<br><small>${new Date(Date.now()+m*6e4).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</small>`; show(el,true); } else show(el,false);
    if(diff === 0 && window.confetti) confetti({particleCount:100, spread:70, origin:{y:0.6}});
};

socket.on("connect", () => { $("status-bar").classList.remove("visible"); socket.emit('joinRoom', 'public'); })
    .on("disconnect", () => $("status-bar").classList.add("visible"))
    .on("updateQueue", d => { $("issued-number-main").textContent=d.issued; $("hero-waiting-count").textContent=Math.max(0,d.issued-d.current); const el=$("number"); if(el.textContent!=d.current){ playDing(); setTimeout(()=>speak(`${d.current}號`),800); el.textContent=d.current; el.classList.remove("number-change-anim"); void el.offsetWidth; el.classList.add("number-change-anim"); updTic(d.current); } })
    .on("adminBroadcast", m => { if(!mute) speak(m); toast("📢 "+m); })
    .on("updateWaitTime", t => { avgT=t; updTic(parseInt($("number").textContent)||0); })
    .on("updateSoundSetting", b => sndOn=b)
    .on("updatePublicStatus", b => { if($("closed-overlay")) $("closed-overlay").style.display = b ? 'none' : 'flex'; })
    .on("updateSystemMode", m => { sysMode=m; render(); })
    .on("updatePassed", l => { const u=$("passedList"); u.innerHTML = l.length ? l.map(n=>`<li>${n}</li>`).join("") : ""; show($("passed-empty-msg"), !l.length); if($("passed-count")) $("passed-count").textContent=l.length; })
    .on("updateFeaturedContents", l => $("featured-container").innerHTML = l.map(c=>`<a class="link-chip" href="${c.linkUrl}" target="_blank">${c.linkText}</a>`).join(""));

doc.addEventListener("DOMContentLoaded", () => {
    if(new URLSearchParams(location.search).get('mode')==='kiosk') doc.body.classList.add('kiosk-mode');
    const theme = ls.getItem('callsys_theme'); if(theme==='dark') doc.body.classList.add('dark-mode');
    render(); socket.connect();
    on(doc.body, 'click', () => { unlockAudio(); });
    on($("btn-take-ticket"), "click", async () => {
        if(ls.getItem('callsys_ticket')) return toast("已取號", "error");
        const r = await fetch("/api/ticket/take", {method:"POST"}).then(d=>d.json());
        if(r.success) { myTicket=r.ticket; ls.setItem('callsys_ticket', myTicket); render(); toast("成功", "success"); } else toast(r.error, "error");
    });
    on($("btn-track-ticket"), "click", () => { const v=$("manual-ticket-input").value; if(v){ myTicket=v; ls.setItem('callsys_ticket',v); render(); } });
    on($("btn-cancel-ticket"), "click", () => { if(confirm("取消?")){ ls.removeItem('callsys_ticket'); myTicket=null; render(); } });
    on($("theme-toggle"), "click", () => { doc.body.classList.toggle('dark-mode'); ls.setItem('callsys_theme', doc.body.classList.contains('dark-mode')?'dark':'light'); });
});
