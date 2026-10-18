const $ = (s) => document.querySelector(s);
const pathParts = location.pathname.split("/").filter(Boolean);
const slug = (pathParts[0] === "ai") ? pathParts[1] : "";
let currentChatId = null;
let isOwner = false;

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
  setTimeout(() => el.classList.remove("show"), 2500);
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

/* ========== LANDING PAGE ========== */
const createForm = $("#createForm");
if (createForm) {
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#createBtn");
    const status = $("#formStatus");
    const email = $("#emailInput").value.trim();

    if (!email) {
      status.className = "status error";
      status.textContent = "ईमेल ID डालें।";
      return;
    }

    setBusy(btn, true, "AI बन रहा है…");
    status.className = "status";
    status.textContent = "";

    try {
      const result = await jsonFetch("/api/create", {
        method: "POST",
        body: JSON.stringify({ email })
      });

      // Switch to success card
      $("#createCard").classList.add("hidden");
      $("#successCard").classList.remove("hidden");

      const full = result.full_url || (location.origin + result.ai_url);
      const linkEl = $("#aiLink");
      linkEl.href = result.ai_url;
      linkEl.textContent = full;

      $("#openBtn").href = result.ai_url;

      $("#copyBtn").onclick = async () => {
        try {
          await navigator.clipboard.writeText(full);
          toast("लिंक कॉपी हो गया!");
        } catch {
          prompt("लिंक कॉपी करें:", full);
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

/* ========== CHAT PAGE ========== */
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
        if (!confirm("यह चैट डिलीट करें?")) return;
        try {
          await jsonFetch(`/api/history/${slug}/${chat.id}`, { method: "DELETE" });
          await loadHistory();
          if (currentChatId === chat.id) await createNewChat();
        } catch (e) {
          toast(e.message);
        }
      };

      row.append(open, del);
      list.appendChild(row);
    });
  } catch (e) {
    toast(e.message);
  }
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
  } catch (e) {
    toast(e.message);
  }
}

async function createNewChat() {
  try {
    const data = await jsonFetch("/api/new-chat/" + slug, {
      method: "POST",
      body: "{}"
    });
    currentChatId = data.chat_id;
    $("#messages")?.replaceChildren();
    $("#welcomeCard")?.classList.remove("hidden");
    await loadHistory();
    closeDrawer();
  } catch (e) {
    toast(e.message);
  }
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
  (async () => {
    try {
      const info = await jsonFetch("/api/ai/" + slug);
      $("#creatorName").textContent = info.creator_name || "—";
      document.title = (info.creator_name || "GyanAI") + " · AI";

      isOwner = !!info.is_owner;
      if (isOwner) {
        $("#ownerSettings")?.classList.remove("hidden");
      }

      if (!info.has_api) {
        $("#apiWarning")?.classList.remove("hidden");
      }

      await loadHistory();
      const hist = await jsonFetch("/api/history/" + slug);
      if (hist.chats.length) {
        await loadChat(hist.chats[0].id);
      } else {
        await createNewChat();
      }
    } catch (e) {
      toast(e.message);
    }
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

  // Settings save / test
  $("#saveSettingsBtn")?.addEventListener("click", async () => {
    const status = $("#settingsStatus");
    const btn = $("#saveSettingsBtn");
    setBusy(btn, true, "सेव…");
    status.className = "status small";
    status.textContent = "";
    try {
      const result = await jsonFetch("/api/settings/" + slug, {
        method: "POST",
        body: JSON.stringify({
          base_url: $("#setUrl").value.trim(),
          model: $("#setModel").value.trim(),
          api_key: $("#setKey").value.trim()
        })
      });
      status.className = "status small success";
      status.textContent = result.message;
      $("#apiWarning")?.classList.add("hidden");
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
      const result = await jsonFetch("/api/test/" + slug, {
        method: "POST",
        body: JSON.stringify({
          base_url: $("#setUrl").value.trim(),
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

  // Chat submit
  $("#chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#messageInput");
    const message = input.value.trim();
    if (!message || !currentChatId) return;

    input.value = "";
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
      addMessage("assistant", "⚠ " + err.message);
    } finally {
      btn.disabled = false;
      input.focus();
    }
  });

  // Auto-resize textarea
  const ta = $("#messageInput");
  ta?.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  });
}
