import os
import re
import json
import sqlite3
import secrets
import hashlib
from datetime import datetime
from urllib.parse import urlparse

import requests
from flask import Flask, request, jsonify, session, abort, send_from_directory
from cryptography.fernet import Fernet, InvalidToken

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "ai_builder.db")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path="/public")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

# Tool identity (public — never share Sahil personal location/date beyond this)
TOOL_NAME = "AI Builder"
TOOL_CREATOR = "Sahil"
TOOL_COMPANY = "Stratis Soft"


def get_fernet():
    key = os.environ.get("MASTER_ENCRYPTION_KEY", "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception:
        return None


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS ais (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                owner_token_hash TEXT NOT NULL,
                username TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                base_url TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                encrypted_api_key TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                created_date TEXT NOT NULL DEFAULT ''
            )
        """)
        # Server history kept only as optional backup — primary history is local per device
        con.execute("""
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ai_id INTEGER NOT NULL,
                device_id TEXT NOT NULL DEFAULT '',
                chat_title TEXT NOT NULL DEFAULT 'नई चैट',
                created_at TEXT NOT NULL,
                FOREIGN KEY(ai_id) REFERENCES ais(id)
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(chat_id) REFERENCES chats(id)
            )
        """)


def now():
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")


def today_date():
    return datetime.utcnow().strftime("%Y-%m-%d")


def safe_base_url(raw):
    raw = (raw or "").strip()
    if not raw:
        return ""
    for suffix in ("/chat/completions", "/chat/completion", "/chat", "/completions"):
        if raw.lower().endswith(suffix):
            raw = raw[: -len(suffix)]
    raw = raw.rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme not in ("https", "http") or not parsed.netloc:
        raise ValueError("Base URL गलत है। उदाहरण: https://api.groq.com/openai/v1")
    if parsed.username or parsed.password:
        raise ValueError("URL में username/password न डालें।")
    return raw


def chat_endpoint(base_url):
    base = (base_url or "").rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def encrypt_key(api_key):
    f = get_fernet()
    if not f:
        return "plain:" + api_key
    return f.encrypt(api_key.encode()).decode()


def decrypt_key(encrypted):
    if not encrypted:
        return ""
    if encrypted.startswith("plain:"):
        return encrypted[6:]
    f = get_fernet()
    if not f:
        return ""
    try:
        return f.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        return ""


def owner_ok(ai):
    token = session.get("owner_token", "")
    if not token:
        return False
    return secrets.compare_digest(
        hashlib.sha256(token.encode()).hexdigest(),
        ai["owner_token_hash"],
    )


def build_system_prompt(ai, user_settings=None):
    """Public creator info only — never phone/email. Tool founder limited info."""
    user_settings = user_settings or {}
    share_creator = user_settings.get("share_creator_details", True)
    username = ai["username"] or "Creator"
    address = ai["address"] or ""
    created_date = ai["created_date"] or ai["created_at"][:10]

    lines = [
        "You are a warm, witty, friendly AI assistant.",
        "Reply in the same language the user uses (Hindi or English).",
        "Style rules (very important):",
        "- Use short **bold headings** for sections (like ChatGPT).",
        "- Use emojis naturally (not stars * for decoration).",
        "- Be playful and helpful — make the user smile.",
        "- Never use markdown star bullets that look like *text* for emphasis; use **bold** and emojis.",
        "- Structure answers with clear headings then details under them.",
        "",
        f"This AI was generated using the tool named **{TOOL_NAME}**.",
        f"The {TOOL_NAME} tool was created by **{TOOL_CREATOR}** (company: **{TOOL_COMPANY}**).",
        f"If asked who made the TOOL / AI Builder / who is Sahil beyond company name: "
        f"say only that {TOOL_CREATOR} created {TOOL_NAME} and their company is {TOOL_COMPANY}. "
        f"For any other personal question about Sahil (city, address, age, phone, when tool was made, etc.) "
        f"politely refuse: 'ये personal details हैं, मैं share नहीं कर सकता।'",
    ]

    if share_creator:
        lines += [
            "",
            f"This specific AI instance was created by the user **{username}**.",
            f"Creation date of this AI: **{created_date}**.",
        ]
        if address:
            lines.append(f"Creator address (as they entered): **{address}**.")
        lines += [
            f"If asked 'तुम्हें किसने बनाया', 'who created you', 'निर्माता कौन है': "
            f"say you were created by **{username}** on **{created_date}** "
            f"using the {TOOL_NAME} tool"
            + (f", from **{address}**" if address else "")
            + f". Also mention the tool was built by {TOOL_CREATOR} ({TOOL_COMPANY}).",
        ]
    else:
        lines += [
            "",
            "The AI creator has turned OFF sharing of their personal details.",
            "If asked who created this AI, say: creator details are private as per settings. "
            f"You can still say you were made with the {TOOL_NAME} tool by {TOOL_CREATOR} ({TOOL_COMPANY}).",
        ]

    lines += [
        "",
        "NEVER reveal phone numbers or email addresses of anyone.",
        "NEVER invent personal details about Sahil or the creator.",
    ]
    return "\n".join(lines)


@app.get("/")
def home():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.post("/api/create")
def create_ai():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or data.get("name") or "").strip()[:80]
    email = (data.get("email") or "").strip().lower()[:160]
    phone = re.sub(r"\s+", "", (data.get("phone") or "").strip())[:25]
    address = (data.get("address") or "").strip()[:200]

    if not username:
        return jsonify(error="Username जरूरी है।"), 400
    if not email or "@" not in email:
        return jsonify(error="Gmail / ईमेल डालें।"), 400
    if not phone:
        return jsonify(error="मोबाइल नंबर डालें।"), 400
    if not address:
        return jsonify(error="Address डालें।"), 400

    slug = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
    owner_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(owner_token.encode()).hexdigest()
    created = now()
    created_date = today_date()

    try:
        with db() as con:
            con.execute(
                """INSERT INTO ais
                (slug, owner_token_hash, username, email, phone, address, created_at, created_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (slug, token_hash, username, email, phone, address, created, created_date),
            )
    except sqlite3.IntegrityError:
        return jsonify(error="कुछ गलत हो गया। फिर कोशिश करें।"), 409

    session["owner_token"] = owner_token
    session["owner_slug"] = slug

    return jsonify(
        ai_url=f"/ai/{slug}",
        full_url=request.host_url.rstrip("/") + f"/ai/{slug}",
        message="आपका AI तैयार है!",
        username=username,
        created_date=created_date,
    )


@app.get("/ai/<slug>")
def ai_page(slug):
    with db() as con:
        ai = con.execute("SELECT slug FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        abort(404)
    return send_from_directory(PUBLIC_DIR, "chat.html")


@app.get("/api/ai/<slug>")
def ai_info(slug):
    """Public info only — never email/phone."""
    with db() as con:
        ai = con.execute(
            "SELECT slug, username, address, created_date, created_at, model, base_url FROM ais WHERE slug=?",
            (slug,),
        ).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404

    is_owner = False
    with db() as con:
        full = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if full:
            is_owner = owner_ok(full)

    return jsonify(
        slug=ai["slug"],
        username=ai["username"],
        address=ai["address"],
        created_date=ai["created_date"] or (ai["created_at"] or "")[:10],
        model=ai["model"] or "",
        has_server_api=bool(ai["base_url"] and ai["model"]),
        is_owner=is_owner,
        tool_name=TOOL_NAME,
        tool_creator=TOOL_CREATOR,
        tool_company=TOOL_COMPANY,
    )


@app.post("/api/settings/<slug>")
def update_settings(slug):
    """Save API on server (optional). Anyone with link can set for this AI instance."""
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        try:
            base_url = safe_base_url(data.get("base_url"))
        except ValueError as e:
            return jsonify(error=str(e)), 400
        model = (data.get("model") or "").strip()[:160]
        api_key = (data.get("api_key") or "").strip()
        if not base_url or not model:
            return jsonify(error="Base URL और Model दोनों जरूरी हैं।"), 400
        if not api_key and not ai["encrypted_api_key"]:
            return jsonify(error="API Key डालें।"), 400
        encrypted = encrypt_key(api_key) if api_key else ai["encrypted_api_key"]
        con.execute(
            "UPDATE ais SET base_url=?, model=?, encrypted_api_key=? WHERE slug=?",
            (base_url, model, encrypted, slug),
        )
    return jsonify(message="API सेव हो गई। अब चैट कर सकते हो।", base_url=base_url, model=model)


@app.post("/api/test/<slug>")
def test_connection(slug):
    """Fast connect. Works even if AI row missing (Render free DB wipe) when full credentials are sent."""
    data = request.get_json(silent=True) or {}
    ai = None
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()

    try:
        base_url = safe_base_url(data.get("base_url") or (ai["base_url"] if ai else ""))
    except ValueError as e:
        return jsonify(error=str(e)), 400

    model = (data.get("model") or (ai["model"] if ai else "") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    if not api_key and ai:
        api_key = decrypt_key(ai["encrypted_api_key"])

    if not base_url or not model or not api_key:
        return jsonify(error="URL, Model और API Key सभी चाहिए।"), 400

    endpoint = chat_endpoint(base_url)
    try:
        resp = requests.post(
            endpoint,
            headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": "Reply only with: OK"}],
                "max_tokens": 8,
            },
            timeout=12,
        )
        if resp.ok:
            if ai:
                try:
                    encrypted = encrypt_key(api_key)
                    with db() as con:
                        con.execute(
                            "UPDATE ais SET base_url=?, model=?, encrypted_api_key=? WHERE slug=?",
                            (base_url, model, encrypted, slug),
                        )
                except Exception:
                    pass
            return jsonify(message="कनेक्शन सफल! ✅ Fast & Ready")
        return jsonify(error=f"Provider {resp.status_code}: {resp.text[:280]}"), 400
    except requests.RequestException as exc:
        return jsonify(error="कनेक्शन नहीं हुआ: " + str(exc)[:200]), 400


@app.post("/api/chat/<slug>")
def chat(slug):
    """
    Chat uses API from request body (preferred — per device) or server-saved API.
    History is NOT returned across devices from here when client uses local mode.
    """
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []  # client sends recent messages
    user_settings = data.get("settings") or {}

    if not message or len(message) > 8000:
        return jsonify(error="मैसेज खाली है या बहुत लंबा है।"), 400

    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404

    # Prefer client-provided API (so each device can use own key)
    base_url = (data.get("base_url") or "").strip()
    model = (data.get("model") or "").strip()
    api_key = (data.get("api_key") or "").strip()

    if not base_url or not model or not api_key:
        base_url = ai["base_url"]
        model = ai["model"]
        api_key = decrypt_key(ai["encrypted_api_key"])

    try:
        base_url = safe_base_url(base_url)
    except ValueError as e:
        return jsonify(error=str(e)), 400

    if not base_url or not model or not api_key:
        return jsonify(
            error="पहले API connect करें। ☰ मेन्यू → API Settings में URL, Model, Key डालें।"
        ), 400

    system = build_system_prompt(ai, user_settings)
    messages = [{"role": "system", "content": system}]

    # Only last messages from client history (device-local)
    for m in history[-18:]:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    endpoint = chat_endpoint(base_url)
    try:
        resp = requests.post(
            endpoint,
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.75,
                "max_tokens": 2048,
            },
            timeout=50,
        )
        if not resp.ok:
            return jsonify(error=f"API Error {resp.status_code}: {resp.text[:300]}"), 400
        data_json = resp.json()
        answer = (
            data_json.get("choices", [{}])[0]
            .get("message", {})
            .get("content")
            or data_json.get("choices", [{}])[0].get("text")
            or "कोई जवाब नहीं मिला।"
        ).strip()
        return jsonify(answer=answer)
    except requests.RequestException as exc:
        return jsonify(error="कनेक्शन फेल: " + str(exc)[:200]), 400


@app.get("/api/catalog")
def catalog():
    """Known URLs and models for fast connect suggestions."""
    urls_path = os.path.join(PUBLIC_DIR, "known_urls.json")
    models_path = os.path.join(PUBLIC_DIR, "known_models.json")
    urls, models = [], []
    try:
        with open(urls_path, "r", encoding="utf-8") as f:
            urls = json.load(f)
    except Exception:
        pass
    try:
        with open(models_path, "r", encoding="utf-8") as f:
            models = json.load(f)
    except Exception:
        pass
    return jsonify(urls=urls, models=models)


@app.get("/health")
def health():
    return jsonify(status="ok")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
