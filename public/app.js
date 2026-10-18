const $ = (s) => document.querySelector(s);
const pathParts = location.pathname.split("/").filter(Boolean);
const slug = pathParts[0] === "ai" || pathParts[0] === "manage" ? pathParts[1] : "";
let currentChatId = null;

async function jsonFetch(url, options={}) {
  const response = await fetch(url, {headers: {"Content-Type":"application/json", ...(options.headers||{})}, ...options});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "कुछ गलत हुआ।");
  return data;
}
function showStatus(el, message, isError=false) {
  if (!el) return;
  el.textContent = message;
  el.className = "status " + (isError ? "error" : "success");
}
function toast(message) {
  const el = $("#toast"); if (!el) return;
  el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  if (busy) { button.dataset.oldText = button.textContent; button.textContent = label || "कृपया रुकें…"; }
  else if (button.dataset.oldText) button.textContent = button.dataset.oldText;
}

const createForm = $("#createForm");
if (createForm) {
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#createBtn"), status = $("#formStatus");
    const data = Object.fromEntries(new FormData(createForm).entries());
    setBusy(btn, true, "AI बनाया जा रहा है…");
    showStatus(status, "जानकारी और API कनेक्शन सेट हो रहे हैं…");
    try {
      const result = await jsonFetch("/api/create", {method:"POST", body:JSON.stringify(data)});
      showStatus(status, "AI तैयार है! आपका AI लिंक: " + location.origin + result.ai_url);
      const owner = document.createElement("a");
      owner.href = result.owner_url; owner.textContent = "Owner Settings खोलें"; owner.className = "primary link-button";
      owner.style.display = "inline-flex"; owner.style.marginTop = "12px";
      status.appendChild(document.createElement("br")); status.appendChild(owner);
      const link = document.createElement("a"); link.href = result.ai_url; link.textContent = " अपना AI खोलें →"; link.className = "primary link-button"; link.style.marginTop = "10px"; link.style.display="inline-flex";
      status.appendChild(document.createElement("br")); status.appendChild(link);
    } catch (err) { showStatus(status, err.message, true); }
    finally { setBusy(btn, false); }
  });
}

function addMessage(role, content) {
  const wrap = document.createElement("div"); wrap.className = "message " + role;
  const label = document.createElement("div"); label.className = "message-label"; label.textContent = role === "user" ? "आप" : ($("#aiName")?.textContent || "AI");
  const body = document.createElement("div"); body.className = "message-content"; body.textContent = content;
  wrap.append(label, body); $("#messages")?.appendChild(wrap); wrap.scrollIntoView({behavior:"smooth", block:"end"});
}
async function loadHistory() {
  if (!slug || !$("#historyList")) return;
  try {
    const data = await jsonFetch("/api/history/" + slug);
    const list = $("#historyList"); list.replaceChildren();
    data.chats.forEach((chat) => {
      const row = document.createElement("div"); row.className = "history-row";
      const open = document.createElement("button"); open.className = "history-open"; open.textContent = chat.title; open.onclick = () => loadChat(chat.id);
      const del = document.createElement("button"); del.className = "history-delete"; del.textContent = "×"; del.title = "हिस्ट्री डिलीट करें";
      del.onclick = async () => { if (!confirm("इस चैट की हिस्ट्री डिलीट करें?")) return; try { await jsonFetch(`/api/history/${slug}/${chat.id}`, {method:"DELETE"}); await loadHistory(); if (currentChatId === chat.id) await createNewChat(); } catch(e) { toast(e.message); } };
      row.append(open, del); list.appendChild(row);
    });
  } catch(e) { toast(e.message); }
}
async function loadChat(id) {
  try {
    const data = await jsonFetch(`/api/messages/${slug}/${id}`);
    currentChatId = id; $("#messages").replaceChildren(); $("#welcomeCard").classList.toggle("hidden", data.messages.length > 0);
    data.messages.forEach(m => addMessage(m.role, m.content));
    closeDrawer();
  } catch(e) { toast(e.message); }
}
async function createNewChat() {
  try {
    const data = await jsonFetch("/api/new-chat/" + slug, {method:"POST", body:"{}"});
    currentChatId = data.chat_id; $("#messages")?.replaceChildren(); $("#welcomeCard")?.classList.remove("hidden");
    await loadHistory(); closeDrawer();
  } catch(e) { toast(e.message); }
}
function openDrawer() { $("#drawer")?.classList.add("open"); $("#shade")?.classList.remove("hidden"); }
function closeDrawer() { $("#drawer")?.classList.remove("open"); $("#shade")?.classList.add("hidden"); $("#moreMenu")?.classList.add("hidden"); }

if ($("#chatForm")) {
  (async () => {
    try {
      const info = await jsonFetch("/api/ai/" + slug);
      $("#creatorName").textContent = info.creator_name;
      document.title = info.creator_name + " का AI";
      const ownerLink = "/manage/" + slug;
      const manageLink = $("#manageLink"), shortcut = $("#settingsShortcut");
      // Settings appear only if the server recognizes this browser as the owner.
      try { await jsonFetch("/api/manage/" + slug); manageLink.href = ownerLink; manageLink.classList.remove("hidden"); shortcut.href = ownerLink; shortcut.classList.remove("hidden"); } catch {}
      await loadHistory();
      const first = await jsonFetch("/api/history/" + slug);
      if (first.chats.length) await loadChat(first.chats[0].id); else await createNewChat();
    } catch(e) { toast(e.message); }
  })();
  $("#openDrawer").onclick = openDrawer;
  $("#closeDrawer").onclick = closeDrawer;
  $("#shade").onclick = closeDrawer;
  $("#newChat").onclick = createNewChat;
  $("#historyBtn").onclick = () => { openDrawer(); $("#moreMenu").classList.add("hidden"); };
  $("#moreBtn").onclick = () => $("#moreMenu").classList.toggle("hidden");
  $("#shareBtn").onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast("AI लिंक कॉपी हो गया।"); } catch { prompt("AI लिंक कॉपी करें:", location.href); } };
  $("#chatForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const input = $("#messageInput"), message = input.value.trim();
    if (!message || !currentChatId) return;
    input.value = ""; addMessage("user", message); $("#welcomeCard").classList.add("hidden");
    const btn = $("#sendBtn"); btn.disabled = true;
    const waiting = document.createElement("div"); waiting.className = "message assistant waiting"; waiting.textContent = "जवाब तैयार हो रहा है…"; $("#messages").appendChild(waiting);
    try {
      const data = await jsonFetch("/api/chat/" + slug, {method:"POST", body:JSON.stringify({message, chat_id:currentChatId})});
      waiting.remove(); addMessage("assistant", data.answer); await loadHistory();
    } catch(err) { waiting.remove(); addMessage("assistant", "माफ़ कीजिए: " + err.message); }
    finally { btn.disabled = false; input.focus(); }
  });
}

const settingsForm = $("#settingsForm");
if (settingsForm) {
  const manageSlug = pathParts[1];
  async function fillSettings() {
    try {
      const d = await jsonFetch("/api/manage/" + manageSlug);
      settingsForm.elements.base_url.value = d.base_url;
      settingsForm.elements.model.value = d.model;
    } catch(e) { showStatus($("#settingsStatus"), e.message, true); }
  }
  fillSettings();
  $("#testConnection").onclick = async () => {
    const data = Object.fromEntries(new FormData(settingsForm).entries());
    const btn = $("#testConnection"); setBusy(btn, true, "टेस्ट हो रहा है…");
    try { const result = await jsonFetch("/api/test/" + manageSlug, {method:"POST", body:JSON.stringify(data)}); showStatus($("#settingsStatus"), result.message); }
    catch(e) { showStatus($("#settingsStatus"), e.message, true); }
    finally { setBusy(btn, false); }
  };
  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(settingsForm).entries());
    try { const result = await jsonFetch("/api/manage/" + manageSlug, {method:"POST", body:JSON.stringify(data)}); showStatus($("#settingsStatus"), result.message); settingsForm.elements.api_key.value = ""; }
    catch(err) { showStatus($("#settingsStatus"), err.message, true); }
  });
}
