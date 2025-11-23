let token = localStorage.getItem("admin_token");
const socket = io({ autoConnect: false });

// DOM Elements
const loginDiv = document.getElementById("login-container");
const adminPanel = document.getElementById("admin-panel");
const queuesWrapper = document.getElementById("queues-wrapper");
const logList = document.getElementById("log-list");
const passedList = document.getElementById("passed-list");

if (token) showPanel();

function login() {
    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;
    
    fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p })
    }).then(r => r.json()).then(data => {
        if (data.token) {
            token = data.token;
            localStorage.setItem("admin_token", token);
            showPanel();
        } else {
            document.getElementById("error-msg").textContent = "登入失敗";
        }
    });
}

function showPanel() {
    loginDiv.style.display = "none";
    adminPanel.style.display = "block";
    socket.auth = { token };
    socket.connect();
    fetchData();
}

function logout() {
    localStorage.removeItem("admin_token");
    location.reload();
}

// Socket Listeners
socket.on("updateQueues", (queues) => renderQueueCards(queues));
socket.on("newAdminLog", (msg) => {
    const li = document.createElement("li"); li.textContent = msg;
    logList.insertBefore(li, logList.firstChild);
});
socket.on("updatePassed", (list) => renderPassed(list));

// API Wrappers
async function api(url, body = {}) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, token })
    });
    if (res.status === 401 || res.status === 403) logout();
    return res.json();
}

// Renders
function renderQueueCards(queues) {
    queuesWrapper.innerHTML = "";
    queues.forEach(q => {
        const div = document.createElement("div");
        div.className = "queue-control-card";
        div.style.borderLeftColor = q.color;
        div.innerHTML = `
            <h3>${q.name} (${q.prefix}) <button onclick="deleteQueue(${q.id})" class="danger" style="font-size:0.8rem">×</button></h3>
            <div class="queue-display">${q.current}</div>
            <div class="btn-group">
                <button class="btn-prev" onclick="changeNum(${q.id}, -1)">-1</button>
                <button class="btn-next" onclick="changeNum(${q.id}, 1)">下一位</button>
            </div>
            <div style="margin-top:10px; display:flex; gap:5px;">
                 <input type="number" id="set-${q.id}" placeholder="設定號碼" style="width: 60%">
                 <button class="btn-set" onclick="setNum(${q.id})">設定</button>
            </div>
        `;
        queuesWrapper.appendChild(div);
    });
}

function renderPassed(list) {
    passedList.innerHTML = "";
    list.forEach(item => {
        const li = document.createElement("li");
        li.innerHTML = `${item.queuePrefix}-${item.number} <span onclick="removePassed('${item.queuePrefix}', ${item.number})" style="cursor:pointer; color:red">×</span>`;
        passedList.appendChild(li);
    });
}

// Actions
function changeNum(queueId, delta) {
    api("/api/queue/change", { queueId, delta });
}
function setNum(queueId) {
    const val = document.getElementById(`set-${queueId}`).value;
    if(val) api("/api/queue/set", { queueId, number: parseInt(val) });
}
function showCreateQueueModal() {
    document.getElementById("create-queue-modal").style.display = "flex";
}
function createQueue() {
    const name = document.getElementById("new-q-name").value;
    const prefix = document.getElementById("new-q-prefix").value;
    const color = document.getElementById("new-q-color").value;
    if (name && prefix) {
        api("/api/queue/create", { name, prefix, color }).then(() => {
            document.getElementById("create-queue-modal").style.display = "none";
        });
    }
}
function deleteQueue(id) {
    if(confirm("確定刪除此櫃台？")) api("/api/queue/delete", { id });
}
function clearLogs() { api("/api/logs/clear"); logList.innerHTML = ""; }
function clearPassed() { api("/api/passed/clear"); }
function removePassed(prefix, number) { api("/api/passed/remove", { prefix, number }); }
function resetAll() { if(confirm("確定重置所有資料？")) api("/reset"); }

function fetchData() {
    api("/api/init-data").then(data => {
        renderQueueCards(data.queues);
        renderPassed(data.passed);
        // 處理 logs
    });
}

// Toggles
document.getElementById("sound-toggle").onchange = (e) => api("/set-sound", { enabled: e.target.checked });
document.getElementById("public-toggle").onchange = (e) => api("/set-public", { isPublic: e.target.checked });
