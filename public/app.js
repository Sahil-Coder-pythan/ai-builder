const $ = (s) => document.querySelector(s);
const pathParts = location.pathname.split("/").filter(Boolean);
const slug = (pathParts[0] === "ai") ? pathParts[1] : "";
let currentChatId = null;
let isOwner = false;

// Store form data across steps
const formData = {
  email: "",
  phone: "",
  username: "",
  address: "",
  purpose: ""
};

// ========== 48 Real AI Templates ==========
const TEMPLATES = [
  // Business
  { id: "sales", cat: "business", icon: "📈", title: "Sales Closer AI", desc: "Converts leads into customers with smart replies" },
  { id: "support", cat: "support", icon: "🎧", title: "Customer Support Bot", desc: "24/7 support that solves common queries" },
  { id: "hr", cat: "business", icon: "👥", title: "HR Assistant", desc: "Answers employee policy & leave questions" },
  { id: "finance", cat: "business", icon: "💰", title: "Finance Advisor", desc: "Budgeting, GST, tax & money tips" },
  { id: "marketing", cat: "business", icon: "📢", title: "Marketing Strategist", desc: "Content ideas, ads & growth plans" },
  { id: "realestate", cat: "business", icon: "🏠", title: "Real Estate Agent", desc: "Property queries & lead qualification" },
  { id: "legal", cat: "business", icon: "⚖️", title: "Legal Helper", desc: "Basic legal info & document guidance" },
  { id: "startup", cat: "business", icon: "🚀", title: "Startup Mentor", desc: "Idea validation, pitch & growth advice" },

  // Education
  { id: "tutor", cat: "education", icon: "📚", title: "Personal Tutor", desc: "Explains any subject in simple language" },
  { id: "exam", cat: "education", icon: "📝", title: "Exam Prep Coach", desc: "Practice questions & revision plans" },
  { id: "english", cat: "education", icon: "🗣️", title: "English Speaking Partner", desc: "Practice conversation & grammar" },
  { id: "math", cat: "education", icon: "🔢", title: "Math Solver", desc: "Step-by-step solutions for any problem" },
  { id: "science", cat: "education", icon: "🔬", title: "Science Explainer", desc: "Physics, Chemistry, Biology made easy" },
  { id: "history", cat: "education", icon: "🏛️", title: "History Guide", desc: "Stories & facts from world history" },
  { id: "career", cat: "education", icon: "🎯", title: "Career Counsellor", desc: "Career paths, skills & college advice" },
  { id: "language", cat: "education", icon: "🌍", title: "Language Teacher", desc: "Learn Hindi, English, Spanish & more" },

  // Coding
  { id: "coder", cat: "coding", icon: "💻", title: "Coding Assistant", desc: "Write, debug & explain code" },
  { id: "python", cat: "coding", icon: "🐍", title: "Python Expert", desc: "Python scripts, Django, data science" },
  { id: "webdev", cat: "coding", icon: "🌐", title: "Web Developer", desc: "HTML, CSS, JS, React help" },
  { id: "debug", cat: "coding", icon: "🐛", title: "Bug Finder", desc: "Finds and fixes code errors fast" },
  { id: "sql", cat: "coding", icon: "🗄️", title: "SQL Helper", desc: "Queries, joins & database design" },
  { id: "devops", cat: "coding", icon: "⚙️", title: "DevOps Guide", desc: "Docker, CI/CD, cloud basics" },
  { id: "interview", cat: "coding", icon: "🎤", title: "Tech Interview Coach", desc: "Practice DSA & system design" },
  { id: "api", cat: "coding", icon: "🔌", title: "API Builder", desc: "Design & document REST APIs" },

  // Personal
  { id: "friend", cat: "personal", icon: "🤝", title: "Friendly Companion", desc: "Chat about anything, anytime" },
  { id: "diary", cat: "personal", icon: "📔", title: "Daily Journal AI", desc: "Reflect, plan & track mood" },
  { id: "habit", cat: "personal", icon: "✅", title: "Habit Coach", desc: "Build better daily routines" },
  { id: "motivation", cat: "personal", icon: "🔥", title: "Motivation Coach", desc: "Pushes you when you feel low" },
  { id: "travel", cat: "personal", icon: "✈️", title: "Travel Planner", desc: "Itineraries, budgets & tips" },
  { id: "recipe", cat: "personal", icon: "🍳", title: "Recipe Chef", desc: "Cook anything with what you have" },
  { id: "fitness", cat: "personal", icon: "💪", title: "Fitness Trainer", desc: "Workouts & diet suggestions" },
  { id: "parenting", cat: "personal", icon: "👶", title: "Parenting Helper", desc: "Tips for raising kids" },

  // Health
  { id: "health", cat: "health", icon: "🏥", title: "Health Advisor", desc: "General wellness & symptom info" },
  { id: "mental", cat: "health", icon: "🧠", title: "Mental Wellness", desc: "Stress, anxiety & calm techniques" },
  { id: "nutrition", cat: "health", icon: "🥗", title: "Nutrition Guide", desc: "Healthy eating & meal plans" },
  { id: "yoga", cat: "health", icon: "🧘", title: "Yoga Instructor", desc: "Asanas & breathing exercises" },
  { id: "sleep", cat: "health", icon: "😴", title: "Sleep Coach", desc: "Better sleep habits & routines" },
  { id: "firstaid", cat: "health", icon: "🩹", title: "First Aid Guide", desc: "What to do in emergencies" },

  // Creative
  { id: "writer", cat: "creative", icon: "✍️", title: "Content Writer", desc: "Blogs, captions & stories" },
  { id: "poet", cat: "creative", icon: "🎭", title: "Poet & Storyteller", desc: "Poems, shayari & short stories" },
  { id: "script", cat: "creative", icon: "🎬", title: "Script Writer", desc: "YouTube & short video scripts" },
  { id: "design", cat: "creative", icon: "🎨", title: "Design Ideator", desc: "Creative ideas for posts & ads" },
  { id: "name", cat: "creative", icon: "💡", title: "Name Generator", desc: "Brand, product & baby names" },
  { id: "song", cat: "creative", icon: "🎵", title: "Song Lyricist", desc: "Write lyrics in any style" },
  { id: "joke", cat: "creative", icon: "😂", title: "Joke Master", desc: "Clean jokes & funny replies" },
  { id: "story", cat: "creative", icon: "📖", title: "Story Generator", desc: "Create original stories on demand" },

  // Support / Extra
  { id: "shop", cat: "support", icon: "🛒", title: "Shopping Assistant", desc: "Product comparisons & recommendations" },
  { id: "bank", cat: "support", icon: "🏦", title: "Banking Helper", desc: "Account, UPI & loan basics" },
  { id: "govt", cat: "support", icon: "🏛️", title: "Govt Scheme Guide", desc: "Indian schemes & eligibility" },
  { id: "job", cat: "support", icon: "💼", title: "Job Search Coach", desc: "Resume tips & interview prep" }
];

// Popular OpenAI-compatible URLs & Models
const ALL_URLS = [
  "https://api.groq.com/openai/v1",
  "https://api.openai.com/v1",
  "https://api.x.ai/v1",
  "https://api.together.xyz/v1",
  "https://openrouter.ai/api/v1",
  "https://api.deepseek.com/v1",
  "https://api.mistral.ai/v1",
  "https://api.fireworks.ai/inference/v1",
  "http://localhost:11434/v1",
  "http://localhost:1234/v1"
];

const ALL_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "grok-2",
  "grok-2-latest",
  "grok-beta",
  "deepseek-chat",
  "deepseek-reasoner",
  "mistral-large-latest",
  "mistral-small-latest",
  "claude-3-5-sonnet-latest",
  "gemini-2.0-flash",
  "gemini-1.5-pro"
];

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
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
    btn.textContent = label || "रुकें…";
  } else if (btn.dataset.old) {
    btn.textContent = btn.dataset.old;
  }
}

function customConfirm(text) {
  return new Promise((resolve) => {
    const modal = $("#confirmModal");
    const txt = $("#confirmText");
    const ok = $("#confirmOk");
    const cancel = $("#confirmCancel");
    if (!modal) { resolve(window.confirm(text)); return; }
    txt.textContent = text;
    modal.classList.remove("hidden");
    const cleanup = (val) => {
      modal.classList.add("hidden");
      ok.onclick = null;
      cancel.onclick = null;
      resolve(val);
    };
    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}

function setupSuggest(inputSel, listSel, items) {
  const input = $(inputSel);
  const list = $(listSel);
  if (!input || !list) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { list.classList.remove("active"); list.innerHTML = ""; return; }
    const matches = items.filter(m => m.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { list.classList.remove("active"); return; }
    list.innerHTML = matches.map(m =>
      `<div class="suggest-item" data-val="${m}">${m}</div>`
    ).join("");
    list.classList.add("active");
    list.querySelectorAll(".suggest-item").forEach(el => {
      el.onclick = () => {
        input.value = el.dataset.val;
        list.classList.remove("active");
      };
    });
  });
  input.addEventListener("blur", () => setTimeout(() => list.classList.remove("active"), 180));
}

/* ========== LANDING / STUDIO ========== */
function showStep(id) {
  ["step1", "step2", "step3", "step4"].forEach(s => {
    const el = $("#" + s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
  // Body class for studio full-screen
  document.body.classList.toggle("studio-mode", id === "step3");
}

// STEP 1
const emailForm = $("#emailForm");
if (emailForm) {
  emailForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = ($("#emailInput").value || "").trim().toLowerCase();
    const status = $("#emailStatus");
    if (!email || !email.includes("@") || !email.includes(".")) {
      status.className = "status error";
      status.textContent = "सही ईमेल ID डालें।";
      return;
    }
    formData.email = email;
    if ($("#detailEmail")) $("#detailEmail").value = email;
    status.textContent = "";
    showStep("step2");
    setTimeout(() => $("#detailPhone")?.focus(), 100);
  });
}

// STEP 2
const detailsForm = $("#detailsForm");
if (detailsForm) {
  detailsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const status = $("#detailsStatus");
    const email = ($("#detailEmail").value || "").trim().toLowerCase();
    const phone = ($("#detailPhone").value || "").trim();
    const username = ($("#detailUsername").value || "").trim();
    const address = ($("#detailAddress").value || "").trim();

    if (!email || !email.includes("@")) {
      status.className = "status error";
      status.textContent = "सही Gmail ID डालें।";
      return;
    }
    if (!phone || phone.length < 8) {
      status.className = "status error";
      status.textContent = "मोबाइल नंबर डालें।";
      return;
    }
    if (!username) {
      status.className = "status error";
      status.textContent = "Username डालें।";
      return;
    }
    if (!address) {
      status.className = "status error";
      status.textContent = "Address डालें।";
      return;
    }

    formData.email = email;
    formData.phone = phone;
    formData.username = username;
    formData.address = address;
    status.textContent = "";
    showStep("step3");
    renderTemplates("all");
    setTimeout(() => $("#searchInput")?.focus(), 150);
  });
}

// ========== Templates rendering ==========
function renderTemplates(cat) {
  const grid = $("#templateGrid");
  if (!grid) return;
  const list = cat === "all" ? TEMPLATES : TEMPLATES.filter(t => t.cat === cat);
  grid.innerHTML = list.map(t => `
    <button type="button" class="tpl-card" data-id="${t.id}" data-title="${t.title}">
      <span class="tpl-icon">${t.icon}</span>
      <span class="tpl-title">${t.title}</span>
      <span class="tpl-desc">${t.desc}</span>
    </button>
  `).join("");

  grid.querySelectorAll(".tpl-card").forEach(card => {
    card.onclick = () => {
      const title = card.dataset.title;
      formData.purpose = title;
      $("#searchInput").value = title;
      startGeneration(title);
    };
  });
}

// Category chips
const cats = $("#studioCats");
if (cats) {
  cats.addEventListener("click", (e) => {
    const chip = e.target.closest(".cat-chip");
    if (!chip) return;
    cats.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderTemplates(chip.dataset.cat);
  });
}

// Studio more menu
$("#studioMoreBtn")?.addEventListener("click", () => {
  $("#studioMoreMenu")?.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#studioMoreBtn") && !e.target.closest("#studioMoreMenu")) {
    $("#studioMoreMenu")?.classList.add("hidden");
  }
});

// Search / Create
const searchForm = $("#searchForm");
if (searchForm) {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = ($("#searchInput").value || "").trim();
    if (q.length < 2) {
      const status = $("#searchStatus");
      status.className = "status error";
      status.textContent = "Please describe your AI or pick a template.";
      return;
    }
    formData.purpose = q;
    startGeneration(q);
  });
}

async function startGeneration(purpose) {
  const thinking = $("#thinkingBox");
  const status = $("#searchStatus");
  if (status) status.textContent = "";

  // Show overlay
  if (thinking) thinking.classList.remove("hidden");
  $("#genTitle").textContent = `Building "${purpose}"…`;
  $("#genSub").textContent = "Training personality & knowledge base";

  // Animate steps
  const steps = [
    { t: 400, text: "Initializing workspace" },
    { t: 900, text: "Loading knowledge base" },
    { t: 1500, text: "Configuring personality" },
    { t: 2200, text: "Optimizing responses" },
    { t: 2900, text: "Finalizing model" }
  ];

  const fill = $("#genFill");
  const stepEls = document.querySelectorAll(".gen-step");
  stepEls.forEach((el, i) => {
    el.textContent = (i === 0 ? "✓ " : "○ ") + steps[i].text;
    el.classList.toggle("done", i === 0);
  });
  if (fill) fill.style.width = "12%";

  for (let i = 1; i < steps.length; i++) {
    await new Promise(r => setTimeout(r, steps[i].t - (steps[i-1]?.t || 0)));
    stepEls.forEach((el, idx) => {
      if (idx <= i) {
        el.textContent = "✓ " + steps[idx].text;
        el.classList.add("done");
      }
    });
    if (fill) fill.style.width = ((i + 1) / steps.length * 100) + "%";
  }

  await new Promise(r => setTimeout(r, 600));

  try {
    const result = await jsonFetch("/api/create", {
      method: "POST",
      body: JSON.stringify({
        email: formData.email,
        phone: formData.phone,
        username: formData.username,
        address: formData.address,
        purpose: formData.purpose || purpose
      })
    });

    const full = result.full_url || (location.origin + result.ai_url);
    const linkEl = $("#aiLink");
    if (linkEl) {
      linkEl.href = result.ai_url;
      linkEl.textContent = full;
    }
    const openBtn = $("#openBtn");
    if (openBtn) openBtn.href = result.ai_url;

    if ($("#successPurpose")) {
      $("#successPurpose").textContent = `"${purpose}" is ready to use.`;
    }

    $("#copyBtn").onclick = async () => {
      try {
        await navigator.clipboard.writeText(full);
        toast("Link copied!");
      } catch {
        prompt("Copy link:", full);
      }
    };

    if (thinking) thinking.classList.add("hidden");
    showStep("step4");
  } catch (err) {
    if (thinking) thinking.classList.add("hidden");
    if (status) {
      status.className = "status error";
      status.textContent = err.message || "Something went wrong. Try again.";
    }
  }
}

// Init templates if already on step3 (rare)
if ($("#templateGrid") && !$("#step3")?.classList.contains("hidden")) {
  renderTemplates("all");
}

/* ========== CHAT (unchanged) ========== */
function addMessage(role, content) {
  const wrap = document.createElement("div");
  wrap.className = "message " + role;
  wrap.textContent = content;
  $("#messages").appendChild(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });
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
      del.title = "डिलीट";
      del.onclick = async () => {
        const ok = await customConfirm("यह चैट डिलीट करें?");
        if (!ok) return;
        try {
          await jsonFetch(`/api/history/${slug}/${chat.id}`, { method: "DELETE" });
          await loadHistory();
          if (currentChatId === chat.id) await createNewChat();
        } catch (e) { toast(e.message); }
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
    const hasMsgs = data.messages.length > 0;
    $("#welcomeCard").classList.toggle("hidden", hasMsgs);
    data.messages.forEach((m) => addMessage(m.role, m.content));
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

if ($("#chatForm")) {
  setupSuggest("#setUrl", "#urlSuggest", ALL_URLS);
  setupSuggest("#setModel", "#modelSuggest", ALL_MODELS);

  (async () => {
    try {
      const info = await jsonFetch("/api/ai/" + slug);
      $("#creatorName").textContent = info.creator_name || "—";
      document.title = (info.creator_name || "GyanAI") + " · AI";
      isOwner = !!info.is_owner;
      if (isOwner) $("#ownerSettings")?.classList.remove("hidden");

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
  $("#shareBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("AI लिंक कॉपी हो गया।");
    } catch {
      prompt("लिंक कॉपी करें:", location.href);
    }
    $("#moreMenu").classList.add("hidden");
  };
  $("#historyMenuBtn").onclick = () => {
    openDrawer();
    $("#moreMenu").classList.add("hidden");
  };

  $("#saveSettingsBtn")?.addEventListener("click", async () => {
    const status = $("#settingsStatus");
    const btn = $("#saveSettingsBtn");
    let url = $("#setUrl").value.trim().replace(/\/chat\/?$/, "").replace(/\/chat\/completions\/?$/, "");
    const model = $("#setModel").value.trim();
    const key = $("#setKey").value.trim();

    if (!url || !model) {
      status.className = "status small error";
      status.textContent = "URL और Model दोनों भरें।";
      return;
    }
    if (!key) {
      status.className = "status small error";
      status.textContent = "API Key डालें।";
      return;
    }

    setBusy(btn, true, "सेव…");
    status.className = "status small";
    status.textContent = "";
    try {
      const result = await jsonFetch("/api/settings/" + slug, {
        method: "POST",
        body: JSON.stringify({ base_url: url, model, api_key: key })
      });
      status.className = "status small success";
      status.textContent = result.message;
      $("#setKey").value = "";
      toast("Settings सेव हो गईं!");
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
    setBusy(btn, true, "टेस्ट…");
    status.className = "status small";
    status.textContent = "";
    try {
      let url = $("#setUrl").value.trim().replace(/\/chat\/?$/, "").replace(/\/chat\/completions\/?$/, "");
      const result = await jsonFetch("/api/test/" + slug, {
        method: "POST",
        body: JSON.stringify({
          base_url: url,
          model: $("#setModel").value.trim(),
          api_key: $("#setKey").value.trim()
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
    waiting.textContent = "जवाब आ रहा है…";
    $("#messages").appendChild(waiting);
    waiting.scrollIntoView({ behavior: "smooth" });

    try {
      const data = await jsonFetch("/api/chat/" + slug, {
        method: "POST",
        body: JSON.stringify({ message, chat_id: currentChatId })
      });
      waiting.remove();
      addMessage("assistant", data.answer);
      await loadHistory();
    } catch (err) {
      waiting.remove();
      let msg = err.message || "";
      if (msg.includes("API") || msg.includes("Key") || msg.includes("सेट") || msg.includes("settings") || msg.includes("connect")) {
        msg = "⚠ पहले API Key connect करें।\n\nLeft मेन्यू (☰) खोलो → Base URL, Model और API Key डालो → सेव करें।";
      } else {
        msg = "⚠ " + msg;
      }
      addMessage("assistant", msg);
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
