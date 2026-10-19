const $ = (s) => document.querySelector(s);
const pathParts = location.pathname.split("/").filter(Boolean);
const slug = (pathParts[0] === "ai") ? pathParts[1] : "";
let currentChatId = null;
let isOwner = false;
let recognizing = false;
let recognition = null;

const formData = { email: "", phone: "", username: "", address: "" };

// Grok (xAI) defaults — user only pastes API key
const GROK_BASE = "https://api.x.ai/v1";
const GROK_MODELS = [
  "grok-2-latest",
  "grok-2",
  "grok-2-1212",
  "grok-beta",
  "grok-vision-beta"
];

const LS_PREFIX = "gyan_" + (slug || "land") + "_";

function lsGet(k, def) {
  try { return localStorage.getItem(LS_PREFIX + k) ?? def; } catch { return def; }
}
function lsSet(k, v) {
  try { localStorage.setItem(LS_PREFIX + k, v); } catch {}
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) { btn.dataset.old = btn.textContent; btn.textContent = label || "…"; }
  else if (btn.dataset.old) btn.textContent = btn.dataset.old;
}

function customConfirm(text) {
  return new Promise((resolve) => {
    const modal = $("#confirmModal");
    if (!modal) { resolve(window.confirm(text)); return; }
    $("#confirmText").textContent = text;
    modal.classList.remove("hidden");
    const done = (v) => { modal.classList.add("hidden"); resolve(v); };
    $("#confirmOk").onclick = () => done(true);
    $("#confirmCancel").onclick = () => done(false);
  });
}

/* ========== LANDING ========== */
function showStep(id) {
  ["step1","step2","step3","step4"].forEach(s => {
    const el = $("#"+s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
}

const emailForm = $("#emailForm");
if (emailForm) {
  emailForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = ($("#emailInput").value || "").trim().toLowerCase();
    const status = $("#emailStatus");
    if (!email || !email.includes("@")) {
      status.className = "status error";
      status.textContent = "सही ईमेल डालें";
      return;
    }
    formData.email = email;
    if ($("#detailEmail")) $("#detailEmail").value = email;
    status.textContent = "";
    showStep("step2");
    setTimeout(() => $("#detailPhone")?.focus(), 80);
  });
}

const detailsForm = $("#detailsForm");
if (detailsForm) {
  detailsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const status = $("#detailsStatus");
    formData.email = ($("#detailEmail").value || "").trim().toLowerCase();
    formData.phone = ($("#detailPhone").value || "").trim();
    formData.username = ($("#detailUsername").value || "").trim();
    formData.address = ($("#detailAddress").value || "").trim();
    if (!formData.email.includes("@") || formData.phone.length < 8 || !formData.username || !formData.address) {
      status.className = "status error";
      status.textContent = "सभी फील्ड भरें";
      return;
    }
    status.textContent = "";
    showStep("step3");
    setTimeout(() => {
      const si = $("#searchInput");
      if (si) { si.value = ""; si.focus(); }
    }, 100);
  });
}

const searchForm = $("#searchForm");
if (searchForm) {
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = ($("#searchInput").value || "").trim().toLowerCase();
    const status = $("#searchStatus");
    const thinking = $("#thinkingBox");
    const ok = q.includes("create") || q.includes("ai") || q.length >= 3;
    if (!ok) {
      status.className = "status error";
      status.textContent = 'Type “Create your AI”';
      return;
    }
    status.textContent = "";
    searchForm.classList.add("hidden");
    $(".create-hint")?.classList.add("hidden");
    if (thinking) thinking.classList.remove("hidden");

    // 2.5 – 4.5 sec thinking
    const wait = 2500 + Math.random() * 2000;
    const texts = ["Building your AI…", "Configuring model…", "Almost ready…"];
    let ti = 0;
    const tick = setInterval(() => {
      ti = (ti + 1) % texts.length;
      if ($("#thinkText")) $("#thinkText").textContent = texts[ti];
    }, 900);

    await new Promise(r => setTimeout(r, wait));
    clearInterval(tick);

    try {
      const result = await jsonFetch("/api/create", {
        method: "POST",
        body: JSON.stringify(formData)
      });
      const full = result.full_url || (location.origin + result.ai_url);
      $("#aiLink").href = result.ai_url;
      $("#aiLink").textContent = full;
      $("#openBtn").href = result.ai_url;
      $("#copyBtn").onclick = async () => {
        try { await navigator.clipboard.writeText(full); toast("Link copied"); }
        catch { prompt("Copy:", full); }
      };
      if (thinking) thinking.classList.add("hidden");
      showStep("step4");
    } catch (err) {
      if (thinking) thinking.classList.add("hidden");
      searchForm.classList.remove("hidden");
      $(".create-hint")?.classList.remove("hidden");
      status.className = "status error";
      status.textContent = err.message;
    }
  });
}

/* ========== CHAT ========== */
function applyTheme() {
  const theme = lsGet("theme", "dark");
  document.body.dataset.theme = theme;
  const fs = lsGet("fontSize", "16");
  document.documentElement.style.setProperty("--msg-fs", fs + "px");
  const bubble = lsGet("bubble", "rounded");
  document.body.dataset.bubble = bubble;
  const density = lsGet("density", "comfy");
  document.body.dataset.density = density;
}

function uniqueFormat(text) {
  // Unique signature so responses feel native to this tool
  if (lsGet("signature", "on") === "off") return text;
  // Subtle invisible-ish mark + clean formatting
  const mark = "\u200B\u2060"; // zero-width chars unique pattern
  return text.trim() + mark;
}

function addMessage(role, content, speak = false) {
  const wrap = document.createElement("div");
  wrap.className = "message " + role;
  if (role === "assistant") {
    wrap.innerHTML = formatAssistant(content);
  } else {
    wrap.textContent = content;
  }
  $("#messages").appendChild(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });
  if (speak && role === "assistant" && lsGet("autoSpeak", "on") === "on") {
    speakText(content);
  }
}

function formatAssistant(text) {
  // Distinct response design (harder to copy 1:1)
  let t = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
  return `<div class="msg-inner"><div class="msg-accent"></div><div class="msg-body">${t}</div></div>`;
}

async function loadHistory() {
  if (!slug || !$("#historyList")) return;
  try {
    const data = await jsonFetch("/api/history/" + slug);
    const list = $("#historyList");
    list.replaceChildren();
    data.chats.forEach((chat) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const open = document.createElement("button");
      open.className = "history-open";
      open.textContent = chat.title;
      open.onclick = () => loadChat(chat.id);
      const del = document.createElement("button");
      del.className = "history-delete";
      del.textContent = "×";
      del.onclick = async () => {
        if (!(await customConfirm("यह चैट डिलीट करें?"))) return;
        await jsonFetch(`/api/history/${slug}/${chat.id}`, { method: "DELETE" });
        await loadHistory();
        if (currentChatId === chat.id) await createNewChat();
      };
      row.append(open, del);
      list.appendChild(row);
    });
  } catch (e) { toast(e.message); }
}

async function loadChat(id) {
  try {
    const data = await jsonFetch(`/api/messages/${slug}/${id}`);
    currentChatId = id;
    $("#messages").replaceChildren();
    $("#welcomeCard").classList.toggle("hidden", data.messages.length > 0);
    data.messages.forEach((m) => addMessage(m.role, m.content, false));
    closeDrawer();
  } catch (e) { toast(e.message); }
}

async function createNewChat() {
  try {
    const data = await jsonFetch("/api/new-chat/" + slug, { method: "POST", body: "{}" });
    currentChatId = data.chat_id;
    $("#messages")?.replaceChildren();
    $("#welcomeCard")?.classList.remove("hidden");
    await loadHistory();
    closeDrawer();
  } catch (e) { toast(e.message); }
}

function openDrawer() {
  $("#drawer")?.classList.add("open");
  $("#shade")?.classList.remove("hidden");
  $("#moreMenu")?.classList.add("hidden");
}
function closeDrawer() {
  $("#drawer")?.classList.remove("open");
  $("#shade")?.classList.add("hidden");
}

/* Voice */
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = false;
  r.interimResults = false;
  r.lang = lsGet("inputLang", "hi-IN");
  r.onresult = (ev) => {
    const text = ev.results[0][0].transcript;
    if ($("#messageInput")) {
      $("#messageInput").value = text;
      $("#chatForm")?.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  };
  r.onend = () => {
    recognizing = false;
    $("#voiceBtn")?.classList.remove("listening");
  };
  r.onerror = () => {
    recognizing = false;
    $("#voiceBtn")?.classList.remove("listening");
  };
  return r;
}

async function speakText(text) {
  const engine = lsGet("voiceEngine", "eleven");
  const plain = text.replace(/[*_`#]/g, " ").slice(0, 1200);
  if (engine === "off" || !plain) return;

  if (engine === "eleven") {
    const key = lsGet("elevenKey", "");
    const voiceId = lsGet("elevenVoice", "21m00Tcm4TlvDq8ikWAM");
    if (key) {
      try {
        const speed = parseFloat(lsGet("voiceSpeed", "1"));
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": key,
            "Accept": "audio/mpeg"
          },
          body: JSON.stringify({
            text: plain,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true }
          })
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.playbackRate = speed;
          audio.play();
          return;
        }
      } catch {}
    }
  }
  // Browser fallback
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = lsGet("lang", "auto") === "en" ? "en-IN" : "hi-IN";
    u.rate = parseFloat(lsGet("voiceSpeed", "1"));
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}

/* Settings load/save UI */
function loadSettingsUI() {
  const map = {
    setTheme: "theme", setFontSize: "fontSize", setBubble: "bubble", setDensity: "density",
    setLang: "lang", setInputLang: "inputLang", setStyle: "style", setEmoji: "emoji",
    setTimestamps: "timestamps", setEnterSend: "enterSend", setSound: "sound", setWake: "wake",
    setSaveHistory: "saveHistory", setTyping: "typing", setClearExit: "clearExit",
    setTemp: "temp", setMaxLen: "maxLen", setStreamFeel: "streamFeel", setSignature: "signature",
    setDebug: "debug", setVoiceEngine: "voiceEngine", setElevenVoice: "elevenVoice",
    setAutoSpeak: "autoSpeak", setVoiceSpeed: "voiceSpeed"
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = $("#" + id);
    if (el) el.value = lsGet(key, el.value);
  });
  // keys not restored into password fields for safety (user re-enters)
}

function bindSettings() {
  const map = {
    setTheme: "theme", setFontSize: "fontSize", setBubble: "bubble", setDensity: "density",
    setLang: "lang", setInputLang: "inputLang", setStyle: "style", setEmoji: "emoji",
    setTimestamps: "timestamps", setEnterSend: "enterSend", setSound: "sound", setWake: "wake",
    setSaveHistory: "saveHistory", setTyping: "typing", setClearExit: "clearExit",
    setTemp: "temp", setMaxLen: "maxLen", setStreamFeel: "streamFeel", setSignature: "signature",
    setDebug: "debug", setVoiceEngine: "voiceEngine", setElevenVoice: "elevenVoice",
    setAutoSpeak: "autoSpeak", setVoiceSpeed: "voiceSpeed"
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = $("#" + id);
    if (!el) return;
    el.addEventListener("change", () => {
      lsSet(key, el.value);
      applyTheme();
      if (key === "inputLang" && recognition) recognition.lang = el.value;
    });
  });
}

if ($("#chatForm")) {
  applyTheme();
  loadSettingsUI();
  bindSettings();
  recognition = initRecognition();

  (async () => {
    try {
      const info = await jsonFetch("/api/ai/" + slug);
      document.title = "GyanAI";
      isOwner = !!info.is_owner;
      await loadHistory();
      const hist = await jsonFetch("/api/history/" + slug);
      if (hist.chats.length) await loadChat(hist.chats[0].id);
      else await createNewChat();
    } catch (e) { toast(e.message); }
  })();

  $("#openDrawer").onclick = openDrawer;
  $("#closeDrawer").onclick = closeDrawer;
  $("#shade").onclick = closeDrawer;
  $("#newChatBtn").onclick = createNewChat;

  $("#moreBtn").onclick = () => $("#moreMenu").classList.toggle("hidden");
  $("#settingsBtn").onclick = () => {
    $("#moreMenu").classList.add("hidden");
    $("#settingsPanel").classList.remove("hidden");
  };
  $("#closeSettings").onclick = () => $("#settingsPanel").classList.add("hidden");

  $("#shareBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
    catch { prompt("Copy:", location.href); }
    $("#moreMenu").classList.add("hidden");
  };
  $("#historyMenuBtn").onclick = () => { openDrawer(); $("#moreMenu").classList.add("hidden"); };

  // Save / Connect — Grok only needs API key
  $("#saveSettingsBtn")?.addEventListener("click", async () => {
    const status = $("#settingsStatus");
    const btn = $("#saveSettingsBtn");
    const key = ($("#setKey").value || "").trim();
    const eleven = ($("#setElevenKey").value || "").trim();
    if (eleven) lsSet("elevenKey", eleven);

    if (!key) {
      status.className = "status small error";
      status.textContent = "Grok API Key डालें";
      return;
    }
    setBusy(btn, true, "Connecting…");
    status.className = "status small";
    status.textContent = "";
    try {
      // Prefer latest Grok model
      const model = GROK_MODELS[0];
      const result = await jsonFetch("/api/settings/" + slug, {
        method: "POST",
        body: JSON.stringify({ base_url: GROK_BASE, model, api_key: key })
      });
      status.className = "status small success";
      status.textContent = result.message || "Connected!";
      $("#setKey").value = "";
      toast("Connected");
    } catch (e) {
      status.className = "status small error";
      status.textContent = e.message;
    } finally {
      setBusy(btn, false);
    }
  });

  $("#testBtn")?.addEventListener("click", async () => {
    const status = $("#settingsStatus");
    const btn = $("#testBtn");
    setBusy(btn, true, "Testing…");
    try {
      const key = ($("#setKey").value || "").trim();
      const result = await jsonFetch("/api/test/" + slug, {
        method: "POST",
        body: JSON.stringify({
          base_url: GROK_BASE,
          model: GROK_MODELS[0],
          api_key: key
        })
      });
      status.className = "status small success";
      status.textContent = result.message;
    } catch (e) {
      status.className = "status small error";
      status.textContent = e.message;
    } finally {
      setBusy(btn, false);
    }
  });

  // Voice button
  $("#voiceBtn")?.addEventListener("click", () => {
    if (!recognition) { toast("Voice not supported on this browser"); return; }
    if (recognizing) { recognition.stop(); return; }
    recognizing = true;
    $("#voiceBtn").classList.add("listening");
    recognition.lang = lsGet("inputLang", "hi-IN");
    recognition.start();
  });

  // Send
  $("#chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#messageInput");
    const message = input.value.trim();
    if (!message || !currentChatId) return;
    input.value = "";
    input.style.height = "auto";
    addMessage("user", message);
    $("#welcomeCard").classList.add("hidden");

    const btn = $("#sendBtn");
    btn.disabled = true;
    const waiting = document.createElement("div");
    waiting.className = "message waiting";
    waiting.textContent = lsGet("typing", "on") === "on" ? "…" : "";
    if (lsGet("typing", "on") === "on") {
      $("#messages").appendChild(waiting);
      waiting.scrollIntoView({ behavior: "smooth" });
    }

    try {
      const data = await jsonFetch("/api/chat/" + slug, {
        method: "POST",
        body: JSON.stringify({
          message,
          chat_id: currentChatId,
          // pass client prefs so server can shape system prompt
          lang: lsGet("lang", "auto"),
          style: lsGet("style", "balanced"),
          emoji: lsGet("emoji", "normal"),
          temp: lsGet("temp", "0.7"),
          max_tokens: lsGet("maxLen", "2048")
        })
      });
      waiting.remove();
      const answer = uniqueFormat(data.answer || "");
      addMessage("assistant", answer, true);
      await loadHistory();
    } catch (err) {
      waiting.remove();
      let msg = err.message || "";
      if (/api|key|connect|settings/i.test(msg)) {
        msg = "⚠ पहले Settings में Grok API Key डालकर Connect करें।\n\n⋮ → Settings → API Key → Save";
      } else msg = "⚠ " + msg;
      addMessage("assistant", msg, false);
    } finally {
      btn.disabled = false;
      input.focus();
    }
  });

  const ta = $("#messageInput");
  ta?.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  });
}
