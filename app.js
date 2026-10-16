const DB_NAME = "chatkeep";
const STORE = "chats";
const COLORS = ["#3b6dff", "#7c5cff", "#19b7a5", "#e08a2b", "#e35d8c", "#4aa3ff"];

const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const chatScreen = document.getElementById("chatScreen");
const threadEl = document.getElementById("thread");
const chatTitle = document.getElementById("chatTitle");
const chatSub = document.getElementById("chatSub");
const chatAvatar = document.getElementById("chatAvatar");
const sheet = document.getElementById("sheet");
const fileInput = document.getElementById("file");

let chats = [];
let db;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "name" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function allChats() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function putChat(chat) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(chat);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function colorFor(name) {
  let n = 0;
  for (const c of name) n = (n + c.charCodeAt(0)) % COLORS.length;
  return COLORS[n];
}

function initials(name) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "C";
}

function chatNameFromFile(filename) {
  const stem = filename.replace(/\.(txt|zip)$/i, "");
  return stem.replace(/^(WhatsApp Chat with |WhatsApp Chat - )/i, "").trim() || stem;
}

function parseExport(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const msgRe = /^\[?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s+-?\s*(?:([^:]{1,80}):\s)?(.*)$/;
  const messages = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(msgRe);
    if (m) {
      if (cur) messages.push(cur);
      cur = { time: `${m[1]} ${m[2]}`, sender: (m[3] || "System").trim(), text: m[4] || "" };
    } else if (cur) {
      cur.text += (cur.text ? "\n" : "") + line;
    }
  }
  if (cur) messages.push(cur);
  return messages;
}

function previewOf(chat) {
  const last = chat.messages[chat.messages.length - 1];
  return last ? last.text.replace(/\s+/g, " ").slice(0, 80) : "Empty chat";
}

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  const items = chats
    .filter((c) => !q || c.name.toLowerCase().includes(q) || previewOf(c).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${chats.length ? "No matches" : "No backups yet.<br/>Import an exported WhatsApp chat to begin."}</div>`;
    return;
  }
  listEl.innerHTML = items.map((c) => `
    <div class="row" data-name="${encodeURIComponent(c.name)}">
      <div class="avatar" style="background:${colorFor(c.name)}">${initials(c.name)}</div>
      <div class="meta">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="preview">${escapeHtml(previewOf(c))}</div>
      </div>
    </div>
  `).join("");
  listEl.querySelectorAll(".row").forEach((row) => {
    row.onclick = () => openChat(decodeURIComponent(row.dataset.name));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function openChat(name) {
  const chat = chats.find((c) => c.name === name);
  if (!chat) return;
  chatTitle.textContent = chat.name;
  chatSub.textContent = `${chat.messages.length} messages · kept on this phone`;
  chatAvatar.style.background = colorFor(chat.name);
  chatAvatar.textContent = initials(chat.name);
  const meGuess = guessMe(chat.messages);
  threadEl.innerHTML = chat.messages.map((m) => {
    const mine = m.sender === meGuess;
    return `<div class="bubble ${mine ? "me" : "them"}">
      ${mine ? "" : `<div class="who">${escapeHtml(m.sender)}</div>`}
      ${escapeHtml(m.text)}
      <div class="time">${escapeHtml(m.time)}</div>
    </div>`;
  }).join("");
  chatScreen.classList.add("on");
  threadEl.scrollTop = threadEl.scrollHeight;
}

function guessMe(messages) {
  const counts = {};
  for (const m of messages) counts[m.sender] = (counts[m.sender] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

async function importText(name, text) {
  const messages = parseExport(text);
  const existing = chats.find((c) => c.name === name);
  const chat = existing || { name, messages: [] };
  if (existing) {
    const seen = new Set(existing.messages.map((m) => m.time + m.sender + m.text));
    for (const m of messages) {
      const key = m.time + m.sender + m.text;
      if (!seen.has(key)) existing.messages.push(m);
    }
  } else {
    chat.messages = messages;
    chats.push(chat);
  }
  await putChat(chat);
}

async function handleFiles(files) {
  let n = 0;
  for (const file of files) {
    const name = chatNameFromFile(file.name);
    if (file.name.toLowerCase().endsWith(".zip")) {
      alert("Please export Without media so WhatsApp creates a .txt file. Zip import needs a computer for now.");
      continue;
    }
    const text = await file.text();
    await importText(name, text);
    n += 1;
  }
  renderList();
  if (n) sheet.classList.remove("on");
}

document.getElementById("importBtn").onclick = () => sheet.classList.add("on");
document.getElementById("helpBtn").onclick = () => sheet.classList.add("on");
document.getElementById("closeSheet").onclick = () => sheet.classList.remove("on");
document.getElementById("chooseBtn").onclick = () => fileInput.click();
document.getElementById("backBtn").onclick = () => chatScreen.classList.remove("on");
searchEl.oninput = renderList;
fileInput.onchange = () => handleFiles(fileInput.files);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

openDb().then(async (database) => {
  db = database;
  chats = await allChats();
  renderList();
});
