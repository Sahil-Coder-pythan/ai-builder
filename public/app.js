const $ = (s) => document.querySelector(s);
const pathParts = location.pathname.split("/").filter(Boolean);
const slug = pathParts[0] === "ai" ? pathParts[1] : "";

// Per-device id — history never mixes across phones
function deviceId() {
  let id = localStorage.getItem("aib_device_id");
  if (!id) {
    id = "d_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("aib_device_id", id);
  }
  return id;
}

function storageKey(suffix) {
  return `aib_${slug}_${deviceId()}_${suffix}`;
}

function loadLocal(key, fallback) {
  try {
    const v = localStorage.getItem(storageKey(key));
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function saveLocal(key, val) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(val));
  } catch (e) {
    console.warn("local save failed", e);
  }
}

let ALL_URLS = [];
let ALL_MODELS = [];
let currentChatId = null;
let chats = []; // local only
let aiInfo = null;
let aiSettings = null;
let apiConfig = null; // {url, model, key} local
let voices = [];

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "कुछ गलत हुआ।");
  return data;
}

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    btn.dataset.old = btn.textContent;
    btn.textContent = label || "…";
  } else if (btn.dataset.old) btn.textContent = btn.dataset.old;
}

/* ---------- Landing ---------- */
const goGenerate = $("#goGenerate");
if (goGenerate) {
  goGenerate.onclick = () => {
    $("#step1").classList.add("hidden");
    $("#step2").classList.remove("hidden");
  };
}

const createForm = $("#createForm");
if (createForm) {
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#createBtn");
    const status = $("#formStatus");
    const payload = {
      username: $("#username").value.trim(),
      email: $("#email").value.trim(),
      phone: $("#phone").value.trim(),
      address: $("#address").value.trim(),
    };
    setBusy(btn, true, "AI बन रहा है…");
    status.className = "status";
    status.textContent = "";
    try {
      const result = await jsonFetch("/api/create", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      $("#step2").classList.add("hidden");
      $("#step3").classList.remove("hidden");
      const full = result.full_url || location.origin + result.ai_url;
      $("#aiLink").href = result.ai_url;
      $("#aiLink").textContent = full;
      $("#openBtn").href = result.ai_url;
      $("#copyBtn").onclick = async () => {
        try {
          await navigator.clipboard.writeText(full);
          toast("लिंक कॉपी!");
        } catch {
          prompt("Copy:", full);
        }
      };
    } catch (err) {
      status.className = "status error";
      status.textContent = err.message;
    } finally {
      setBusy(btn, false);
    }
  });
}

/* ---------- Markdown-ish render for assistant ---------- */
function renderAssistantHtml(text) {
  // Escape HTML then apply simple **bold** and headings
  let s = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // **bold**
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // lines that are short and end without period as heading-ish if start with emoji or all caps words
  const lines = s.split("\n");
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t) return "<br>";
    // Treat **already bold full line** or lines like "## Title"
    if (/^#{1,3}\s+/.test(t)) {
      return `<span class="md-h">${t.replace(/^#{1,3}\s+/, "")}</span>`;
    }
    // If line is only a bold segment
    if (/^<strong>.+<\/strong>$/.test(t) && t.length < 80) {
      return `<span class="md-h">${t}</span>`;
    }
    return `<p>${t}</p>`;
  });
  return out.join("");
}

function addMessage(role, content, save = true) {
  const wrap = document.createElement("div");
  wrap.className = "message " + role;
  if (role === "assistant") {
    wrap.innerHTML = renderAssistantHtml(content);
  } else {
    wrap.textContent = content;
  }
  $("#messages").appendChild(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });

  if (save && currentChatId) {
    const chat = chats.find((c) => c.id === currentChatId);
    if (chat) {
      chat.messages.push({ role, content, t: Date.now() });
      chat.updated = Date.now();
      if (chat.title === "नई चैट" && role === "user") {
        chat.title = content.slice(0, 36) + (content.length > 36 ? "…" : "");
      }
      persistChats();
      renderHistoryList();
    }
  }
}

function persistChats() {
  if (aiSettings && aiSettings.saveHistory === false) return;
  saveLocal("chats", chats);
  // Also offer implicit "database" blob
  saveLocal("database", {
    version: 1,
    device: deviceId(),
    slug,
    exportedAt: new Date().toISOString(),
    chats,
  });
}

function renderHistoryList() {
  const list = $("#historyList");
  if (!list) return;
  list.replaceChildren();
  const sorted = [...chats].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  sorted.forEach((c) => {
    const row = document.createElement("div");
    row.className = "history-row";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "history-open";
    open.textContent = c.title || "चैट";
    open.onclick = () => openChat(c.id);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "history-delete";
    del.textContent = "×";
    del.onclick = () => {
      if (!confirm("इस चैट को इस डिवाइस से मिटाएँ?")) return;
      chats = chats.filter((x) => x.id !== c.id);
      if (currentChatId === c.id) startNewChat();
      persistChats();
      renderHistoryList();
    };
    row.append(open, del);
    list.appendChild(row);
  });
}

function openChat(id) {
  currentChatId = id;
  const chat = chats.find((c) => c.id === id);
  $("#messages").replaceChildren();
  if (!chat || !chat.messages.length) {
    $("#welcomeCard").classList.remove("hidden");
  } else {
    $("#welcomeCard").classList.add("hidden");
    chat.messages.forEach((m) => addMessage(m.role, m.content, false));
  }
  closeDrawer();
}

function startNewChat() {
  const id = "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const chat = { id, title: "नई चैट", messages: [], updated: Date.now() };
  chats.unshift(chat);
  currentChatId = id;
  $("#messages").replaceChildren();
  $("#welcomeCard").classList.remove("hidden");
  persistChats();
  renderHistoryList();
  closeDrawer();
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

function setupSuggest(inputSel, listSel, items) {
  const input = $(inputSel);
  const list = $(listSel);
  if (!input || !list) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      list.classList.remove("active");
      return;
    }
    const matches = items.filter((m) => String(m).toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) {
      list.classList.remove("active");
      return;
    }
    list.innerHTML = matches
      .map((m) => `<div class="suggest-item" data-val="${m}">${m}</div>`)
      .join("");
    list.classList.add("active");
    list.querySelectorAll(".suggest-item").forEach((el) => {
      el.onclick = () => {
        input.value = el.dataset.val;
        list.classList.remove("active");
      };
    });
  });
  input.addEventListener("blur", () => setTimeout(() => list.classList.remove("active"), 180));
}

/* Voice */
function loadVoices() {
  voices = speechSynthesis.getVoices() || [];
  const sel = $("#optVoice");
  if (!sel) return;
  // Prefer Microsoft / Google / high quality
  const ranked = [...voices].sort((a, b) => {
    const score = (v) => {
      let s = 0;
      const n = (v.name || "").toLowerCase();
      if (n.includes("microsoft")) s += 5;
      if (n.includes("google")) s += 3;
      if (n.includes("natural") || n.includes("neural")) s += 4;
      if (v.lang && v.lang.startsWith("hi")) s += 2;
      if (v.lang && v.lang.startsWith("en")) s += 1;
      return s;
    };
    return score(b) - score(a);
  });
  sel.innerHTML = ranked
    .map(
      (v, i) =>
        `<option value="${i}" data-name="${v.name}" data-lang="${v.lang}">${v.name} (${v.lang})</option>`
    )
    .join("");
  if (aiSettings && aiSettings.voiceName) {
    const idx = ranked.findIndex((v) => v.name === aiSettings.voiceName);
    if (idx >= 0) sel.selectedIndex = idx;
  }
  voices = ranked;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, " ").slice(0, 500));
  if (voices.length && $("#optVoice")) {
    const v = voices[$("#optVoice").selectedIndex];
    if (v) u.voice = v;
  } else if (aiSettings && aiSettings.voiceName) {
    const v = voices.find((x) => x.name === aiSettings.voiceName);
    if (v) u.voice = v;
  }
  u.rate = 1;
  speechSynthesis.speak(u);
}

function applyTheme() {
  const body = $("#chatBody") || document.body;
  body.classList.remove("theme-dark", "theme-blue", "theme-purple", "theme-green");
  body.classList.remove("font-sm", "font-lg", "compact");
  const t = (aiSettings && aiSettings.theme) || "light";
  if (t !== "light") body.classList.add("theme-" + t);
  const f = (aiSettings && aiSettings.font) || "md";
  if (f === "sm") body.classList.add("font-sm");
  if (f === "lg") body.classList.add("font-lg");
  if (aiSettings && aiSettings.compact) body.classList.add("compact");
  if (aiSettings && aiSettings.showCreatorBadge === false) {
    $(".creator-line")?.classList.add("hidden");
  } else {
    $(".creator-line")?.classList.remove("hidden");
  }
}

function defaultSettings() {
  return {
    theme: "light",
    voiceName: "",
    shareCreatorDetails: true,
    showCreatorBadge: true,
    autoSpeak: false,
    enterSend: true,
    timestamps: false,
    compact: false,
    style: "fun",
    font: "md",
    lang: "auto",
    sendSound: false,
    recvSound: false,
    saveHistory: true,
  };
}

/* ---------- Chat page init ---------- */
if ($("#chatForm") && slug) {
  aiSettings = loadLocal("settings", defaultSettings());
  apiConfig = loadLocal("api", { url: "", model: "", key: "" });
  chats = loadLocal("chats", []);

  // Prefill API fields
  if (apiConfig.url) $("#setUrl").value = apiConfig.url;
  if (apiConfig.model) $("#setModel").value = apiConfig.model;

  applyTheme();

  // Catalog for fast connect
  (async () => {
    try {
      const cat = await jsonFetch("/api/catalog");
      ALL_URLS = cat.urls || [];
      ALL_MODELS = cat.models || [];
    } catch {
      ALL_URLS = ["https://api.groq.com/openai/v1", "https://api.openai.com/v1", "https://api.x.ai/v1"];
      ALL_MODELS = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "gpt-4o-mini"];
    }
    setupSuggest("#setUrl", "#urlSuggest", ALL_URLS);
    setupSuggest("#setModel", "#modelSuggest", ALL_MODELS);
  })();

  (async () => {
    try {
      aiInfo = await jsonFetch("/api/ai/" + slug);
      $("#creatorName").textContent = aiInfo.username || "—";
      $("#brandName").textContent = (aiInfo.username || "AI") + " AI";
      document.title = (aiInfo.username || "AI") + " · Chat";
    } catch (e) {
      toast(e.message);
    }
    if (!chats.length) startNewChat();
    else {
      renderHistoryList();
      openChat(chats[0].id);
    }
  })();

  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  $("#openDrawer").onclick = openDrawer;
  $("#closeDrawer").onclick = closeDrawer;
  $("#shade").onclick = closeDrawer;
  $("#newChatBtn").onclick = startNewChat;

  $("#moreBtn").onclick = () => $("#moreMenu").classList.toggle("hidden");
  $("#shareBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("लिंक कॉपी!");
    } catch {
      prompt("Copy:", location.href);
    }
    $("#moreMenu").classList.add("hidden");
  };
  $("#clearLocalHistoryBtn").onclick = () => {
    if (!confirm("इस डिवाइस की सारी history मिटेगी। पक्का?")) return;
    chats = [];
    persistChats();
    startNewChat();
    $("#moreMenu").classList.add("hidden");
    toast("History मिट गई (सिर्फ इस फोन से)");
  };
  $("#exportHistoryBtn").onclick = () => {
    const blob = new Blob(
      [JSON.stringify({ version: 1, device: deviceId(), slug, chats, exportedAt: new Date().toISOString() }, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "database.json";
    a.click();
    $("#moreMenu").classList.add("hidden");
    toast("database.json डाउनलोड");
  };

  // AI Settings modal
  $("#aiSettingsBtn").onclick = () => {
    $("#moreMenu").classList.add("hidden");
    const s = aiSettings || defaultSettings();
    $("#optTheme").value = s.theme || "light";
    $("#optShareCreator").checked = s.shareCreatorDetails !== false;
    $("#optShowCreatorBadge").checked = s.showCreatorBadge !== false;
    $("#optAutoSpeak").checked = !!s.autoSpeak;
    $("#optEnterSend").checked = s.enterSend !== false;
    $("#optTimestamps").checked = !!s.timestamps;
    $("#optCompact").checked = !!s.compact;
    $("#optStyle").value = s.style || "fun";
    $("#optFont").value = s.font || "md";
    $("#optLang").value = s.lang || "auto";
    $("#optSendSound").checked = !!s.sendSound;
    $("#optRecvSound").checked = !!s.recvSound;
    $("#optSaveHistory").checked = s.saveHistory !== false;
    loadVoices();
    $("#aiSettingsModal").classList.remove("hidden");
  };
  $("#closeAiSettings").onclick = () => $("#aiSettingsModal").classList.add("hidden");
  $("#saveAiSettingsBtn").onclick = () => {
    const voiceSel = $("#optVoice");
    const voiceName = voiceSel && voices[voiceSel.selectedIndex] ? voices[voiceSel.selectedIndex].name : "";
    aiSettings = {
      theme: $("#optTheme").value,
      voiceName,
      shareCreatorDetails: $("#optShareCreator").checked,
      showCreatorBadge: $("#optShowCreatorBadge").checked,
      autoSpeak: $("#optAutoSpeak").checked,
      enterSend: $("#optEnterSend").checked,
      timestamps: $("#optTimestamps").checked,
      compact: $("#optCompact").checked,
      style: $("#optStyle").value,
      font: $("#optFont").value,
      lang: $("#optLang").value,
      sendSound: $("#optSendSound").checked,
      recvSound: $("#optRecvSound").checked,
      saveHistory: $("#optSaveHistory").checked,
    };
    saveLocal("settings", aiSettings);
    applyTheme();
    $("#aiSettingsModal").classList.add("hidden");
    toast("AI Settings सेव!");
  };
  $("#previewVoiceBtn").onclick = () => speak("नमस्ते! यह voice preview है। Hello, this is a voice preview.");
  $("#downloadDbBtn").onclick = () => {
    const blob = new Blob(
      [JSON.stringify(loadLocal("database", { chats }), null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "database.json";
    a.click();
  };

  // API save / test — local first for privacy + speed
  $("#saveApiBtn").onclick = async () => {
    const url = $("#setUrl").value.trim();
    const model = $("#setModel").value.trim();
    const key = $("#setKey").value.trim();
    const status = $("#apiStatus");
    if (!url || !model || !key) {
      status.className = "status small error";
      status.textContent = "URL, Model और Key सभी भरें।";
      return;
    }
    // Fuzzy match known lists (fast path)
    const urlOk = ALL_URLS.some((u) => url.includes(u.replace(/\/v1$/, "")) || u.includes(url.replace(/\/+$", "")));
    const modelOk = ALL_MODELS.some(
      (m) => m.toLowerCase() === model.toLowerCase() || m.toLowerCase().includes(model.toLowerCase()) || model.toLowerCase().includes(m.toLowerCase())
    );

    setBusy($("#saveApiBtn"), true, "सेव…");
    status.className = "status small";
    status.textContent = urlOk || modelOk ? "मैच मिला — कनेक्ट टेस्ट…" : "टेस्ट हो रहा है…";
    try {
      // Quick test
      await jsonFetch("/api/test/" + slug, {
        method: "POST",
        body: JSON.stringify({ base_url: url, model, api_key: key }),
      });
      apiConfig = { url, model, key };
      saveLocal("api", apiConfig);
      // Also try server save (optional)
      try {
        await jsonFetch("/api/settings/" + slug, {
          method: "POST",
          body: JSON.stringify({ base_url: url, model, api_key: key }),
        });
      } catch (_) {}
      status.className = "status small success";
      status.textContent = "कनेक्ट सफल! सेव हो गया।";
      $("#setKey").value = "";
      toast("API कनेक्ट ✅");
    } catch (e) {
      status.className = "status small error";
      status.textContent = e.message;
    } finally {
      setBusy($("#saveApiBtn"), false);
    }
  };

  $("#testBtn").onclick = async () => {
    const status = $("#apiStatus");
    setBusy($("#testBtn"), true, "टेस्ट…");
    try {
      const r = await jsonFetch("/api/test/" + slug, {
        method: "POST",
        body: JSON.stringify({
          base_url: $("#setUrl").value.trim() || apiConfig?.url,
          model: $("#setModel").value.trim() || apiConfig?.model,
          api_key: $("#setKey").value.trim() || apiConfig?.key,
        }),
      });
      status.className = "status small success";
      status.textContent = r.message;
    } catch (e) {
      status.className = "status small error";
      status.textContent = e.message;
    } finally {
      setBusy($("#testBtn"), false);
    }
  };

  // ===== Grok-like Voice Mode =====
  let recognizing = false;
  let recognition = null;
  let voiceModeActive = false;

  function playSoftBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 420;
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.start(); o.stop(ctx.currentTime + 0.2);
    } catch (_) {}
  }

  function setVoiceUI(state) {
    // state: idle | connecting | listening | stop
    const btn = $("#speakBtn");
    const status = $("#voiceStatus");
    if (!btn) return;
    btn.classList.remove("listening", "active");
    if (status) {
      status.classList.add("hidden");
      status.classList.remove("listening", "connecting");
    }
    if (state === "connecting") {
      btn.innerHTML = '<span class="speak-icon">···</span> Stop';
      btn.classList.add("active");
      if (status) {
        status.textContent = "Connecting...";
        status.classList.add("connecting");
        status.classList.remove("hidden");
      }
    } else if (state === "listening") {
      btn.innerHTML = '<span class="speak-icon">||</span> Stop';
      btn.classList.add("listening");
      if (status) {
        status.textContent = "Go ahead — बोलो";
        status.classList.add("listening");
        status.classList.remove("hidden");
      }
    } else {
      btn.innerHTML = '<span class="speak-icon">||</span> Speak';
      if (status) status.classList.add("hidden");
    }
  }

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = "hi-IN";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      recognizing = true;
      setVoiceUI("listening");
      playSoftBeep();
    };
    recognition.onresult = (ev) => {
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
      }
      if (finalText) {
        $("#messageInput").value = finalText.trim();
        // auto-send after short pause feel
        setTimeout(() => {
          if ($("#messageInput").value.trim()) sendCurrent();
        }, 350);
      }
    };
    recognition.onerror = (e) => {
      recognizing = false;
      voiceModeActive = false;
      setVoiceUI("idle");
      if (e.error !== "aborted" && e.error !== "no-speech") {
        toast("Mic error: " + e.error);
      }
    };
    recognition.onend = () => {
      recognizing = false;
      if (voiceModeActive) {
        // brief pause then ready again like Grok continuous feel
        setTimeout(() => {
          if (voiceModeActive && recognition) {
            try { recognition.start(); } catch (_) { voiceModeActive = false; setVoiceUI("idle"); }
          }
        }, 400);
      } else {
        setVoiceUI("idle");
      }
    };
  }

  function startVoiceMode() {
    if (!recognition) {
      toast("इस ब्राउज़र में Voice उपलब्ध नहीं (Chrome/Edge use करें)");
      return;
    }
    if (!apiConfig || !apiConfig.key) {
      toast("पहले API Key connect करो (☰ मेन्यू → API Settings)");
      openDrawer();
      return;
    }
    voiceModeActive = true;
    setVoiceUI("connecting");
    playSoftBeep();
    setTimeout(() => {
      try {
        recognition.lang = (aiSettings?.lang === "en") ? "en-IN" : "hi-IN";
        recognition.start();
      } catch (e) {
        voiceModeActive = false;
        setVoiceUI("idle");
        toast("Mic start नहीं हुआ");
      }
    }, 450);
  }

  function stopVoiceMode() {
    voiceModeActive = false;
    try { recognition && recognition.stop(); } catch (_) {}
    setVoiceUI("idle");
  }

  $("#speakBtn") && ($("#speakBtn").onclick = () => {
    if (voiceModeActive || recognizing) stopVoiceMode();
    else startVoiceMode();
  });

  $("#micIconBtn") && ($("#micIconBtn").onclick = () => {
    if (voiceModeActive || recognizing) stopVoiceMode();
    else startVoiceMode();
  });

  // Send message
  async function sendCurrent() {
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
    waiting.textContent = "जवाब आ रहा है…";
    $("#messages").appendChild(waiting);
    waiting.scrollIntoView({ behavior: "smooth" });

    const chat = chats.find((c) => c.id === currentChatId);
    const history = (chat?.messages || [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -1) // current user msg already pushed
      .slice(-16);

    try {
      const data = await jsonFetch("/api/chat/" + slug, {
        method: "POST",
        body: JSON.stringify({
          message,
          history,
          base_url: apiConfig?.url || "",
          model: apiConfig?.model || "",
          api_key: apiConfig?.key || "",
          settings: {
            share_creator_details: aiSettings?.shareCreatorDetails !== false,
            style: aiSettings?.style || "fun",
            lang: aiSettings?.lang || "auto",
          },
        }),
      });
      waiting.remove();
      addMessage("assistant", data.answer);
      if (aiSettings?.autoSpeak || voiceModeActive) speak(data.answer);
    } catch (err) {
      waiting.remove();
      addMessage("assistant", "⚠ " + err.message);
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }

  $("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    sendCurrent();
  });

  const ta = $("#messageInput");
  ta?.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  });
  ta?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && aiSettings?.enterSend !== false) {
      e.preventDefault();
      sendCurrent();
    }
  });
}
