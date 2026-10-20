const $ = (s) => document.querySelector(s);
const pathParts = location.pathname.split("/").filter(Boolean);
const slug = (pathParts[0] === "ai") ? pathParts[1] : "";
let currentChatId = null;
let isOwner = false;
let recognizing = false;
let recognition = null;

const formData = { email: "", phone: "", username: "", address: "", password: "" };
let existingAiUrl = "";

// Defaults (Groq-friendly)
const DEFAULT_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

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
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong");
    err.details = data.details || null;
    err.data = data;
    throw err;
  }
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
  ["step1","step2","step3","step4","forgotStep1","forgotStep2","forgotStep3"].forEach(s => {
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
    formData.password = "";
    if (!formData.email.includes("@") || formData.phone.length < 8 || !formData.username || !formData.address) {
      status.className = "status error";
      status.textContent = "सभी फील्ड भरें";
      return;
    }
    status.textContent = "";
    if (existingAiUrl) {
      const full = existingAiUrl.startsWith("http") ? existingAiUrl : (location.origin + existingAiUrl);
      const a = $("#aiLink");
      if (a) { a.href = full; a.textContent = full; }
      if ($("#openBtn")) $("#openBtn").href = full;
      if ($("#successMsg")) $("#successMsg").textContent = "आपके अकाउंट में पहले से एक AI है। एक मोबाइल नंबर से केवल एक AI बनाया जा सकता है।";
      if ($("#copyBtn")) $("#copyBtn").onclick = async () => {
        try { await navigator.clipboard.writeText(full); toast("Link copied"); }
        catch { prompt("Copy:", full); }
      };
      showStep("step4");
    } else {
      showStep("step3");
      setTimeout(() => {
        const si = $("#searchInput");
        if (si) { si.value = ""; si.focus(); }
      }, 100);
    }
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

    // Minimum ~5 minutes build animation (user requested)
    const totalMs = 5 * 60 * 1000;
    const start = Date.now();
    const texts = [
      "Building your AI…",
      "Configuring model…",
      "Setting up memory…",
      "Securing your link…",
      "Almost ready…"
    ];
    let ti = 0;
    await new Promise((resolve) => {
      const tick = setInterval(() => {
        const elapsed = Date.now() - start;
        const pct = Math.min(99, (elapsed / totalMs) * 100);
        const left = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
        const m = Math.floor(left / 60);
        const s = left % 60;
        if ($("#thinkText")) $("#thinkText").textContent = texts[ti % texts.length];
        if ($("#thinkCountdown")) $("#thinkCountdown").textContent =
          `कृपया प्रतीक्षा करें — ${m}:${String(s).padStart(2, "0")} बाकी`;
        if ($("#thinkProgress")) $("#thinkProgress").style.width = pct + "%";
        if (elapsed % 12000 < 250) ti++;
        if (elapsed >= totalMs) {
          clearInterval(tick);
          resolve();
        }
      }, 250);
    });

    try {
      const result = await jsonFetch("/api/create", {
        method: "POST",
        body: JSON.stringify(formData)
      });
      if (thinking) thinking.classList.add("hidden");
      const full = result.full_url || (location.origin + result.ai_url);
      const a = $("#aiLink");
      if (a) { a.href = result.ai_url || full; a.textContent = full; }
      if ($("#openBtn")) $("#openBtn").href = result.ai_url || full;
      if ($("#copyBtn")) {
        $("#copyBtn").onclick = async () => {
          try { await navigator.clipboard.writeText(full); toast("Link copied"); }
          catch { prompt("Copy:", full); }
        };
      }
      // Save to local permanent history too (survives until browser clear)
      try {
        const key = "gyan_link_history";
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        list.unshift({ email: formData.email, slug: result.slug, full_url: full, name: formData.username, created_at: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
        localStorage.setItem("gyan_user_email", formData.email);
      } catch {}
      if ($("#successMsg")) {
        $("#successMsg").textContent = [result.message, result.email_notice].filter(Boolean).join(" ");
      }
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
  // GyanAI native signature — zero-width + subtle structure
  if (lsGet("signature", "on") === "off") return text;
  return text.trim() + "\u200B\u2060\u200C";
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
  if (speak && role === "assistant" && lsGet("autoSpeak", "off") === "on") {
    speakText(content);
  }
}

function formatAssistant(text) {
  // ChatGPT / Grok style: headings, mixed bold, clean lists
  let t = String(text || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  t = t.replace(/^###\s+(.+)$/gm, '<div class="h3">$1</div>');
  t = t.replace(/^##\s+(.+)$/gm, '<div class="h2">$1</div>');
  t = t.replace(/^#\s+(.+)$/gm, '<div class="h1">$1</div>');
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/^[-•]\s+(.+)$/gm, '<div class="li">• $1</div>');
  t = t.replace(/^\d+\.\s+(.+)$/gm, '<div class="li">$1</div>');
  t = t.replace(/\n/g, "<br>");
  return `<div class="msg-inner gyan-bubble"><div class="msg-accent"></div><div class="msg-body">${t}</div></div>`;
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
  } catch (e) { if (!String(e.message || "").includes("निजी")) toast(e.message); }
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
    $("#voiceOrbOverlay")?.classList.add("hidden");
  };
  r.onerror = () => {
    recognizing = false;
    $("#voiceBtn")?.classList.remove("listening");
    $("#voiceOrbOverlay")?.classList.add("hidden");
  };
  return r;
}

function cleanForSpeech(text) {
  // Remove markdown, zero-width, emojis that confuse TTS → clear spoken text
  return String(text || "")
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "")
    .replace(/[*_`#~>\[\]()]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[😀-🙏🌀-🗿🚀-🛿]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

let currentAudio = null;

async function speakText(text) {
  const engine = lsGet("voiceEngine", "eleven");
  const plain = cleanForSpeech(text);
  if (engine === "off" || !plain) return;

  // Stop any previous speech first (silent)
  try { if (currentAudio) { currentAudio.pause(); currentAudio = null; } } catch {}
  try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch {}

  if (engine === "eleven") {
    const key = lsGet("elevenKey", "");
    // Default: Adam (clear) — better for Hindi+English than Rachel sometimes
    const voiceId = lsGet("elevenVoice", "pNInz6obpgDQGcFmaJgB");
    if (key) {
      try {
        const speed = Math.min(1.15, Math.max(0.75, parseFloat(lsGet("voiceSpeed", "1")) || 1));
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
            // Clear, natural, ChatGPT/Grok-like pacing
            voice_settings: {
              stability: 0.55,
              similarity_boost: 0.75,
              style: 0.2,
              use_speaker_boost: true
            }
          })
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          currentAudio = audio;
          audio.playbackRate = speed;
          audio.onended = () => { currentAudio = null; URL.revokeObjectURL(url); };
          await audio.play().catch(() => {});
          return;
        }
      } catch {}
    }
  }

  // Browser fallback — pick best Hindi/English voice available
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(plain);
    const wantEn = lsGet("lang", "auto") === "en";
    u.lang = wantEn ? "en-IN" : "hi-IN";
    u.rate = Math.min(1.05, Math.max(0.85, parseFloat(lsGet("voiceSpeed", "1")) || 0.95));
    u.pitch = 1;
    // Prefer a natural Google/Android voice if present
    const voices = speechSynthesis.getVoices() || [];
    const prefer = voices.find(v =>
      (wantEn ? /en/i.test(v.lang) : /hi/i.test(v.lang)) && /google|neural|premium|natural/i.test(v.name)
    ) || voices.find(v => wantEn ? /^en/i.test(v.lang) : /^hi/i.test(v.lang));
    if (prefer) u.voice = prefer;
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
      document.title = (info.custom_config && info.custom_config.customTitle) || "GyanAI";
      isOwner = !!info.is_owner;
      window.__gyanCustom = { css: info.custom_css || "", cfg: info.custom_config || {} };
      applyCustomConfig(window.__gyanCustom.cfg || {});
      injectCustomCss(window.__gyanCustom.css || "");
      fillDevForm(window.__gyanCustom.cfg || {}, window.__gyanCustom.css || "");
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
  const deleteAiBtn = $("#deleteAiBtn");
  if (deleteAiBtn) {
    deleteAiBtn.disabled = true;
    deleteAiBtn.textContent = "Checking owner…";
    (async () => {
      try {
        const info = await jsonFetch("/api/ai/" + slug);
        deleteAiBtn.style.display = info.is_owner ? "block" : "none";
        deleteAiBtn.disabled = !info.is_owner;
        deleteAiBtn.textContent = "Delete My AI";
      } catch (_) { deleteAiBtn.style.display = "none"; }
    })();
    deleteAiBtn.addEventListener("click", async () => {
      if (!isOwner) return;
      const yes = await customConfirm("पक्का इस AI को डिलीट करना है? इसकी चैट, custom design और settings हट जाएँगी। इसी नंबर से नया AI बनाने के लिए 24 घंटे इंतज़ार करना होगा।");
      if (!yes) return;
      const status = $("#deleteAiStatus");
      setBusy(deleteAiBtn, true, "Deleting…");
      if (status) status.textContent = "AI और उसका निजी डेटा डिलीट हो रहा है…";
      try {
        const result = await jsonFetch("/api/ai/" + slug, { method: "DELETE" });
        if (status) status.textContent = result.message || "Deleted";
        alert(result.message || "AI deleted. You can create another after 24 hours.");
        location.href = "/";
      } catch (e) {
        if (status) status.textContent = e.message;
        setBusy(deleteAiBtn, false);
      }
    });
  }

  $("#shareBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
    catch { prompt("Copy:", location.href); }
    $("#moreMenu").classList.add("hidden");
  };
  $("#historyMenuBtn").onclick = () => { openDrawer(); $("#moreMenu").classList.add("hidden"); };

  // Save / Connect — 3 boxes: URL + Model + Key
  $("#saveSettingsBtn")?.addEventListener("click", async () => {
    const status = $("#settingsStatus");
    const btn = $("#saveSettingsBtn");
    const key = ($("#setKey").value || "").trim();
    const baseUrl = ($("#setBaseUrl").value || "").trim();
    const model = ($("#setModel").value || "").trim();
    const eleven = ($("#setElevenKey").value || "").trim();
    if (eleven) lsSet("elevenKey", eleven);
    if (baseUrl) lsSet("baseUrl", baseUrl);
    if (model) lsSet("model", model);

    if (!key) {
      status.className = "status small error";
      status.textContent = "API Key डालें";
      return;
    }
    setBusy(btn, true, "Connecting…");
    status.className = "status small";
    status.textContent = "Connecting…";
    try {
      const result = await jsonFetch("/api/settings/" + slug, {
        method: "POST",
        body: JSON.stringify({ base_url: baseUrl, model, api_key: key })
      });
      status.className = "status small success";
      status.textContent = result.message || "Connected!";
      if (result.base_url) $("#setBaseUrl").value = result.base_url;
      if (result.model) $("#setModel").value = result.model;
      lsSet("baseUrl", result.base_url || baseUrl);
      lsSet("model", result.model || model);
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
      const baseUrl = ($("#setBaseUrl").value || "").trim() || DEFAULT_BASE;
      const model = ($("#setModel").value || "").trim() || DEFAULT_MODEL;
      const result = await jsonFetch("/api/test/" + slug, {
        method: "POST",
        body: JSON.stringify({ base_url: baseUrl, model, api_key: key })
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

  // Prefill URL/Model from localStorage
  if ($("#setBaseUrl")) $("#setBaseUrl").value = lsGet("baseUrl", DEFAULT_BASE);
  if ($("#setModel")) $("#setModel").value = lsGet("model", DEFAULT_MODEL);


  // Attach photo / file
  let pendingAttach = null; // { name, type, dataUrl }
  $("#attachBtn")?.addEventListener("click", () => $("#attachInput")?.click());
  $("#attachInput")?.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast("फाइल 8MB से छोटी हो"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      pendingAttach = { name: file.name, type: file.type, dataUrl: reader.result };
      const prev = $("#attachPreview");
      if (prev) {
        prev.classList.remove("hidden");
        if (file.type.startsWith("image/")) {
          prev.innerHTML = `<img src="${reader.result}" alt=""><span class="ap-name">${file.name}</span><button type="button" class="ap-x" id="clearAttach">×</button>`;
        } else {
          prev.innerHTML = `<span class="ap-name">📎 ${file.name}</span><button type="button" class="ap-x" id="clearAttach">×</button>`;
        }
        $("#clearAttach")?.addEventListener("click", () => {
          pendingAttach = null;
          prev.classList.add("hidden");
          prev.innerHTML = "";
          $("#attachInput").value = "";
        });
      }
    };
    reader.readAsDataURL(file);
  });

  // Voice button → big center orb, COMPLETELY SILENT (no click/beep from us)
  $("#voiceBtn")?.addEventListener("click", () => {
    if (!recognition) { toast("Voice not supported on this browser"); return; }
    if (recognizing) {
      try { recognition.stop(); } catch {}
      $("#voiceOrbOverlay")?.classList.add("hidden");
      $("#voiceBtn")?.classList.remove("listening");
      recognizing = false;
      return;
    }
    // Stop any ongoing TTS so mic is quiet
    try { if (currentAudio) { currentAudio.pause(); currentAudio = null; } } catch {}
    try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch {}

    recognizing = true;
    $("#voiceBtn").classList.add("listening");
    let ov = $("#voiceOrbOverlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "voiceOrbOverlay";
      ov.className = "voice-orb-overlay";
      ov.innerHTML = '<div class="voice-orb-big"></div>';
      document.body.appendChild(ov);
    }
    ov.classList.remove("hidden");
    recognition.lang = lsGet("inputLang", "hi-IN");
    try { recognition.start(); } catch {}
  });

  // keep recognition end/error hiding orb
  if (recognition) {
    const oldEnd = recognition.onend;
    recognition.onend = () => {
      recognizing = false;
      $("#voiceBtn")?.classList.remove("listening");
      $("#voiceOrbOverlay")?.classList.add("hidden");
      if (typeof oldEnd === "function") oldEnd();
    };
    const oldErr = recognition.onerror;
    recognition.onerror = () => {
      recognizing = false;
      $("#voiceBtn")?.classList.remove("listening");
      $("#voiceOrbOverlay")?.classList.add("hidden");
      if (typeof oldErr === "function") oldErr();
    };
  }

  // Send — NO counting animation, instant chat
  $("#chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#messageInput");
    const message = input.value.trim();
    if (!message || !currentChatId) return;
    input.value = "";
    input.style.height = "auto";
    addMessage("user", message);
    $("#welcomeCard").classList.add("hidden");
    if (pendingAttach) {
      const cap = pendingAttach.type.startsWith("image/") ? "[📷 image]" : ("[📎 " + pendingAttach.name + "]");
      // already showing user message text; preview cleared below
      pendingAttach = null;
      const prev = $("#attachPreview");
      if (prev) { prev.classList.add("hidden"); prev.innerHTML = ""; }
      if ($("#attachInput")) $("#attachInput").value = "";
    }

    const btn = $("#sendBtn");
    btn.disabled = true;
    const waiting = document.createElement("div");
    waiting.className = "message waiting";
    waiting.innerHTML = '<div class="msg-inner"><div class="msg-accent"></div><div class="msg-body">…</div></div>';
    $("#messages").appendChild(waiting);
    waiting.scrollIntoView({ behavior: "smooth" });

    try {
      const data = await jsonFetch("/api/chat/" + slug, {
        method: "POST",
        body: JSON.stringify({
          message,
          chat_id: currentChatId,
          lang: lsGet("lang", "auto"),
          style: lsGet("style", "balanced"),
          emoji: lsGet("emoji", "normal"),
          temp: lsGet("temp", "0.7"),
          max_tokens: lsGet("maxLen", "2048"),
          image: pendingAttach && pendingAttach.type && pendingAttach.type.startsWith("image/") ? pendingAttach.dataUrl : null,
          file_name: pendingAttach ? pendingAttach.name : null
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
        msg = "⚠ पहले Settings में Base URL + Model + API Key डालकर Connect करें।\\n\\n⋮ → Settings → Save";
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



/* ========== Developer Edit Mode (per-AI only) ========== */
function injectCustomCss(css) {
  let el = document.getElementById("gyan-custom-css");
  if (!el) {
    el = document.createElement("style");
    el.id = "gyan-custom-css";
    document.head.appendChild(el);
  }
  // Always force protected sections visible
  const protected = `
#settingsPanel .set-section.protected-api,
#settingsPanel .set-section.protected-voice {
  display: block !important; visibility: visible !important; opacity: 1 !important;
  height: auto !important; max-height: none !important; pointer-events: auto !important;
}
#setBaseUrl, #setModel, #setKey, #setElevenKey {
  display: block !important; visibility: visible !important; opacity: 1 !important;
}`;
  el.textContent = protected + "\n" + (css || "");
}

function applyCustomConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return;
  const root = document.documentElement;
  const body = document.body;
  if (cfg.accentColor) root.style.setProperty("--accent", cfg.accentColor);
  if (cfg.bgColor) root.style.setProperty("--bg", cfg.bgColor);
  if (cfg.userBubbleColor) root.style.setProperty("--user-bubble", cfg.userBubbleColor);
  if (cfg.aiBubbleColor) root.style.setProperty("--ai-bubble", cfg.aiBubbleColor);
  if (cfg.headerColor) root.style.setProperty("--header-bg", cfg.headerColor);
  if (cfg.composerColor) root.style.setProperty("--composer-bg", cfg.composerColor);
  if (cfg.sphereColor) root.style.setProperty("--sphere", cfg.sphereColor);
  if (cfg.sphereSize) root.style.setProperty("--sphere-size", cfg.sphereSize + "px");
  if (cfg.borderRadius) root.style.setProperty("--radius", cfg.borderRadius + "px");
  if (cfg.msgSpacing) root.style.setProperty("--msg-gap", cfg.msgSpacing + "px");
  if (cfg.fontFamily) body.style.fontFamily = cfg.fontFamily;
  if (cfg.fontSize) root.style.setProperty("--msg-fs", cfg.fontSize + "px");
  if (cfg.glowIntensity != null) root.style.setProperty("--glow", cfg.glowIntensity);
  if (cfg.animationSpeed) root.style.setProperty("--anim", cfg.animationSpeed);

  // Menu (three-dot) position
  const moreBtn = $("#moreBtn");
  const moreMenu = $("#moreMenu");
  const top = $(".chat-top");
  if (moreBtn && top && cfg.menuPosition) {
    moreBtn.style.position = "";
    moreBtn.classList.remove("pos-br","pos-bl","pos-tl","pos-tr");
    const pos = cfg.menuPosition;
    if (pos === "top-left") {
      moreBtn.style.order = "-1";
    } else if (pos === "bottom-right" || pos === "bottom-left") {
      moreBtn.style.position = "fixed";
      moreBtn.style.bottom = "90px";
      moreBtn.style.zIndex = "40";
      moreBtn.style.right = pos === "bottom-right" ? "12px" : "auto";
      moreBtn.style.left = pos === "bottom-left" ? "12px" : "auto";
    } else {
      moreBtn.style.order = "";
      moreBtn.style.position = "";
      moreBtn.style.bottom = "";
      moreBtn.style.right = "";
      moreBtn.style.left = "";
    }
  }

  // Sidebar side
  const drawer = $("#drawer");
  if (drawer && cfg.sidebarSide === "right") {
    drawer.classList.add("drawer-right");
  } else if (drawer) {
    drawer.classList.remove("drawer-right");
  }

  // Welcome text
  if (cfg.welcomeTitle && $("#welcomeCard h1")) $("#welcomeCard h1").textContent = cfg.welcomeTitle;
  if (cfg.welcomeSub && $("#welcomeCard p")) $("#welcomeCard p").textContent = cfg.welcomeSub;
  if (cfg.customTitle) {
    const brand = document.querySelector(".brand");
    if (brand) brand.innerHTML = `<span class="spark">✦</span><span>${cfg.customTitle}</span>`;
    document.title = cfg.customTitle;
  }
  if (cfg.responseStyle) lsSet("style", cfg.responseStyle);
  if (cfg.emojiLevel) lsSet("emoji", cfg.emojiLevel);
  if (cfg.theme) {
    lsSet("theme", cfg.theme);
    applyTheme();
  }
}

function fillDevForm(cfg, css) {
  const map = {
    devAccent: "accentColor", devBg: "bgColor", devUserBubble: "userBubbleColor",
    devAiBubble: "aiBubbleColor", devHeader: "headerColor", devComposer: "composerColor",
    devSphere: "sphereColor"
  };
  Object.entries(map).forEach(([id, key]) => {
    if (cfg[key] && $("#" + id)) $("#" + id).value = cfg[key];
  });
  if (cfg.sphereSize && $("#devSphereSize")) $("#devSphereSize").value = String(cfg.sphereSize);
  if (cfg.glowIntensity != null && $("#devGlow")) $("#devGlow").value = String(cfg.glowIntensity);
  if (cfg.menuPosition && $("#devMenuPos")) $("#devMenuPos").value = cfg.menuPosition;
  if (cfg.sidebarSide && $("#devSidebar")) $("#devSidebar").value = cfg.sidebarSide;
  if (cfg.borderRadius != null && $("#devRadius")) $("#devRadius").value = String(cfg.borderRadius);
  if (cfg.msgSpacing != null && $("#devSpacing")) $("#devSpacing").value = String(cfg.msgSpacing);
  if (cfg.fontFamily && $("#devFont")) $("#devFont").value = cfg.fontFamily;
  if (cfg.animationSpeed && $("#devAnim")) $("#devAnim").value = String(cfg.animationSpeed);
  if (cfg.welcomeTitle && $("#devWelcomeTitle")) $("#devWelcomeTitle").value = cfg.welcomeTitle;
  if (cfg.welcomeSub && $("#devWelcomeSub")) $("#devWelcomeSub").value = cfg.welcomeSub;
  if (cfg.customTitle && $("#devCustomTitle")) $("#devCustomTitle").value = cfg.customTitle;
  if (cfg.responseStyle && $("#devRespStyle")) $("#devRespStyle").value = cfg.responseStyle;
  if (cfg.photoGenEnabled && $("#devPhotoGen")) $("#devPhotoGen").value = cfg.photoGenEnabled;
  if (cfg.photoGenBaseUrl && $("#devPhotoUrl")) $("#devPhotoUrl").value = cfg.photoGenBaseUrl;
  if (cfg.photoGenModel && $("#devPhotoModel")) $("#devPhotoModel").value = cfg.photoGenModel;
  if ($("#devCode") && css) $("#devCode").value = css;
}

function collectDevConfigFromForm() {
  const cfg = {};
  const get = (id) => { const el = $("#" + id); return el ? el.value : ""; };
  const setIf = (key, val) => { if (val !== "" && val != null) cfg[key] = val; };
  setIf("accentColor", get("devAccent"));
  setIf("bgColor", get("devBg"));
  setIf("userBubbleColor", get("devUserBubble"));
  setIf("aiBubbleColor", get("devAiBubble"));
  setIf("headerColor", get("devHeader"));
  setIf("composerColor", get("devComposer"));
  setIf("sphereColor", get("devSphere"));
  setIf("sphereSize", get("devSphereSize") ? parseInt(get("devSphereSize"), 10) : "");
  setIf("glowIntensity", get("devGlow") ? parseFloat(get("devGlow")) : "");
  setIf("menuPosition", get("devMenuPos"));
  setIf("sidebarSide", get("devSidebar"));
  setIf("borderRadius", get("devRadius") ? parseInt(get("devRadius"), 10) : "");
  setIf("msgSpacing", get("devSpacing") ? parseInt(get("devSpacing"), 10) : "");
  setIf("fontFamily", get("devFont"));
  setIf("animationSpeed", get("devAnim") ? parseFloat(get("devAnim")) : "");
  setIf("welcomeTitle", get("devWelcomeTitle"));
  setIf("welcomeSub", get("devWelcomeSub"));
  setIf("customTitle", get("devCustomTitle"));
  setIf("responseStyle", get("devRespStyle"));
  setIf("photoGenEnabled", get("devPhotoGen"));
  setIf("photoGenBaseUrl", get("devPhotoUrl"));
  setIf("photoGenModel", get("devPhotoModel"));
  return cfg;
}

function showCodeError(lines) {
  const pre = $("#devCodeError");
  if (!pre) return;
  if (!lines || !lines.length) {
    pre.classList.add("hidden");
    pre.textContent = "";
    return;
  }
  pre.classList.remove("hidden");
  pre.textContent = Array.isArray(lines) ? lines.join("\\n") : String(lines);
}

$("#connectCodeBtn")?.addEventListener("click", async () => {
  const status = $("#devCodeStatus");
  const btn = $("#connectCodeBtn");
  const code = ($("#devCode")?.value || "").trim();
  const formCfg = collectDevConfigFromForm();
  showCodeError([]);
  if (status) status.textContent = "Connecting…";
  setBusy(btn, true, "Connecting…");
  try {
    // Custom code is stored by this AI slug in the database only; never writes to GitHub.
    // When code is present, let the server parse that exact code instead of overwriting its config with form defaults.
    const body = code ? { code: code } : { custom_config: formCfg, custom_css: "" };
    // If pure JSON in box, backend parses; if CSS+CONFIG, backend splits
    const result = await jsonFetch("/api/custom/" + slug, {
      method: "POST",
      body: JSON.stringify(body)
    });
    if (status) status.textContent = result.message || "Connected";
    toast("Code connected — सिर्फ इस AI पर");
    // Reload applied state
    const info = await jsonFetch("/api/ai/" + slug);
    window.__gyanCustom = { css: info.custom_css || "", cfg: info.custom_config || {} };
    applyCustomConfig(window.__gyanCustom.cfg);
    injectCustomCss(window.__gyanCustom.css);
  } catch (e) {
    const details = e.details || e.data?.details || [e.message];
    showCodeError(details);
    if (status) status.textContent = "Error — नीचे देखें";
  } finally {
    setBusy(btn, false);
  }
});

$("#applyDevColorsBtn")?.addEventListener("click", async () => {
  const cfg = collectDevConfigFromForm();
  applyCustomConfig(cfg);
  try {
    await jsonFetch("/api/custom/" + slug, {
      method: "POST",
      body: JSON.stringify({ custom_config: cfg, custom_css: ($("#devCode")?.value || "").trim() })
    });
    toast("Colors applied");
  } catch (e) {
    showCodeError([e.message]);
  }
});

$("#resetDevBtn")?.addEventListener("click", async () => {
  if (!(await customConfirm("इस AI का custom design reset करें?"))) return;
  try {
    await jsonFetch("/api/custom/" + slug, {
      method: "POST",
      body: JSON.stringify({ custom_css: "", custom_config: {} })
    });
    injectCustomCss("");
    applyCustomConfig({});
    if ($("#devCode")) $("#devCode").value = "";
    showCodeError([]);
    toast("Reset done");
  } catch (e) {
    toast(e.message);
  }
});




/* ========== Landing: Google, Login, History ========== */



/* History + Auth UI — persistent login + Google redirect (mobile-safe) */
(function landHistory() {
  if (!$("#landMoreBtn")) return;
  $("#landMoreBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#profileMenu")?.classList.add("hidden");
    $("#landMoreMenu")?.classList.toggle("hidden");
  });
  document.addEventListener("click", () => {
    $("#landMoreMenu")?.classList.add("hidden");
    $("#profileMenu")?.classList.add("hidden");
  });

  async function renderLinkHistory() {
    const list = $("#linkHistoryList");
    if (!list) return;
    const email = localStorage.getItem("gyan_user_email") || "";
    let links = [];
    try {
      const r = await jsonFetch("/api/my-links?email=" + encodeURIComponent(email));
      links = r.links || [];
    } catch {}
    try {
      const local = JSON.parse(localStorage.getItem("gyan_my_links") || "[]");
      if (Array.isArray(local)) {
        const seen = new Set(links.map(x => x.slug || x.full_url));
        local.forEach(l => {
          const k = l.slug || l.full_url;
          if (k && !seen.has(k)) { links.push(l); seen.add(k); }
        });
      }
    } catch {}
    if (!links.length) {
      list.innerHTML = "<p class='hint-tiny'>No saved AI links yet. Create your AI — link will appear here.</p>";
      return;
    }
    list.innerHTML = "";
    links.forEach((l) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const url = l.full_url || ("/ai/" + l.slug);
      row.innerHTML = `<a class="history-open" href="${url}" target="_blank" rel="noopener"><strong>${l.name || l.slug || "AI"}</strong><br><span class="hint-tiny">${url}</span></a>`;
      list.appendChild(row);
    });
  }

  function openHistory() {
    $("#landMoreMenu")?.classList.add("hidden");
    $("#profileMenu")?.classList.add("hidden");
    $("#linkHistoryPanel")?.classList.remove("hidden");
    renderLinkHistory();
  }
  $("#landHistoryBtn")?.addEventListener("click", openHistory);
  $("#profileHistoryBtn")?.addEventListener("click", openHistory);
  $("#closeLinkHistory")?.addEventListener("click", () => {
    $("#linkHistoryPanel")?.classList.add("hidden");
  });
})();



/* AI link opening: white splash with centered Gyan AI logo, then reveal the existing chat. */
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.querySelector("#jarvisOverlay");
  if (!overlay) return;
  const circle = document.querySelector("#jarvisCircle");
  const label = document.querySelector("#jarvisLabel");
  if (circle) circle.textContent = "G";
  if (label) label.classList.add("show");
  window.setTimeout(() => overlay.classList.add("hidden"), 1400);
});

/* Login-free startup: show brand briefly, then the existing personal-details page. */
document.addEventListener("DOMContentLoaded", () => {
  showStep("step1");
  window.setTimeout(() => {
    showStep("step2");
    const field = document.querySelector("#detailUsername");
    if (field) field.focus({ preventScroll: true });
  }, 1400);
});
