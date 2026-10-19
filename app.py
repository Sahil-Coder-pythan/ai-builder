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
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024

# Grok (xAI) defaults
GROK_BASE = "https://api.x.ai/v1"
GROK_MODELS = [
    "grok-2-latest",
    "grok-2",
    "grok-2-1212",
    "grok-beta",
    "grok-vision-beta",
]


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
                creator_name TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL,
                phone TEXT DEFAULT '',
                purpose TEXT DEFAULT '',
                base_url TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                encrypted_api_key TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ai_id INTEGER NOT NULL,
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


def safe_base_url(raw):
    raw = (raw or "").strip().rstrip("/")
    for suffix in ("/chat/completions", "/chat"):
        if raw.lower().endswith(suffix):
            raw = raw[: -len(suffix)].rstrip("/")
    if not raw:
        return ""
    parsed = urlparse(raw)
    if parsed.scheme not in ("https", "http") or not parsed.netloc:
        raise ValueError("Invalid Base URL")
    if parsed.username or parsed.password:
        raise ValueError("Do not put credentials in URL")
    return raw


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
        ai["owner_token_hash"]
    )


@app.get("/")
def home():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.post("/api/create")
def create_ai():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()[:160]
    phone = (data.get("phone") or "").strip()[:20]
    username = (data.get("username") or data.get("name") or "").strip()[:80]
    address = (data.get("address") or "").strip()[:200]

    if not email or "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return jsonify(error="सही ईमेल ID डालें।"), 400
    if not username:
        return jsonify(error="Username डालें।"), 400

    creator_name = username[:80]
    purpose = address or "General AI Assistant"

    slug = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
    owner_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(owner_token.encode()).hexdigest()

    try:
        with db() as con:
            con.execute("""
                INSERT INTO ais
                (slug, owner_token_hash, creator_name, email, phone, purpose, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (slug, token_hash, creator_name, email, phone, purpose, now()))
            ai_id = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()["id"]
            con.execute(
                "INSERT INTO chats (ai_id, chat_title, created_at) VALUES (?, ?, ?)",
                (ai_id, "नई चैट", now())
            )
    except sqlite3.IntegrityError:
        return jsonify(error="कुछ गलत हो गया। फिर से कोशिश करें।"), 409

    session["owner_token"] = owner_token
    session["owner_slug"] = slug

    return jsonify(
        ai_url=f"/ai/{slug}",
        full_url=request.host_url.rstrip("/") + f"/ai/{slug}",
        message="आपका AI तैयार है!"
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
    with db() as con:
        ai = con.execute(
            "SELECT id, slug, creator_name, purpose, model, base_url FROM ais WHERE slug=?",
            (slug,)
        ).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404

    is_owner = False
    with db() as con:
        full = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        is_owner = owner_ok(full) if full else False

    return jsonify(
        slug=ai["slug"],
        creator_name=ai["creator_name"],
        purpose=ai["purpose"],
        model=ai["model"] or "",
        has_api=bool(ai["base_url"] and ai["model"]),
        is_owner=is_owner
    )


@app.post("/api/settings/<slug>")
def update_settings(slug):
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        if not owner_ok(ai):
            return jsonify(error="सिर्फ AI बनाने वाला settings बदल सकता है।"), 403

        try:
            base_url = safe_base_url(data.get("base_url") or GROK_BASE)
        except ValueError as e:
            return jsonify(error=str(e)), 400

        model = (data.get("model") or GROK_MODELS[0]).strip()[:160]
        api_key = (data.get("api_key") or "").strip()

        if not base_url or not model:
            return jsonify(error="Base URL और Model दोनों जरूरी हैं।"), 400

        encrypted = encrypt_key(api_key) if api_key else ai["encrypted_api_key"]
        if not encrypted and not api_key:
            return jsonify(error="API Key डालें।"), 400

        con.execute(
            "UPDATE ais SET base_url=?, model=?, encrypted_api_key=? WHERE slug=?",
            (base_url, model, encrypted, slug)
        )
    return jsonify(message="Connected! अब चैट कर सकते हो।")


@app.post("/api/test/<slug>")
def test_connection(slug):
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404
    if not owner_ok(ai):
        return jsonify(error="Owner access नहीं है।"), 403

    try:
        base_url = safe_base_url(data.get("base_url") or ai["base_url"] or GROK_BASE)
    except ValueError as e:
        return jsonify(error=str(e)), 400

    model = (data.get("model") or ai["model"] or GROK_MODELS[0]).strip()
    api_key = (data.get("api_key") or "").strip() or decrypt_key(ai["encrypted_api_key"])

    if not base_url or not model or not api_key:
        return jsonify(error="URL, Model और API Key सभी चाहिए।"), 400

    endpoint = base_url.rstrip("/") + "/chat/completions"
    try:
        resp = requests.post(
            endpoint,
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": "Reply only with: OK"}],
                "max_tokens": 8
            },
            timeout=15
        )
        if resp.ok:
            return jsonify(message="कनेक्शन सफल!")
        return jsonify(error=f"Provider {resp.status_code}: {resp.text[:280]}"), 400
    except requests.RequestException as exc:
        return jsonify(error="कनेक्शन नहीं हो पाया: " + str(exc)[:180]), 400


@app.get("/api/history/<slug>")
def history(slug):
    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        chats = con.execute(
            "SELECT id, chat_title, created_at FROM chats WHERE ai_id=? ORDER BY id DESC",
            (ai["id"],)
        ).fetchall()
    return jsonify(chats=[
        {"id": c["id"], "title": c["chat_title"], "created_at": c["created_at"]}
        for c in chats
    ])


@app.delete("/api/history/<slug>/<int:chat_id>")
def delete_chat(slug, chat_id):
    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        con.execute("DELETE FROM messages WHERE chat_id=?", (chat_id,))
        con.execute("DELETE FROM chats WHERE id=? AND ai_id=?", (chat_id, ai["id"]))
    return jsonify(message="चैट डिलीट हो गई।")


@app.post("/api/new-chat/<slug>")
def new_chat(slug):
    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        cur = con.execute(
            "INSERT INTO chats (ai_id, chat_title, created_at) VALUES (?, ?, ?)",
            (ai["id"], "नई चैट", now())
        )
        chat_id = cur.lastrowid
    return jsonify(chat_id=chat_id)


@app.get("/api/messages/<slug>/<int:chat_id>")
def get_messages(slug, chat_id):
    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        chat = con.execute(
            "SELECT id FROM chats WHERE id=? AND ai_id=?", (chat_id, ai["id"])
        ).fetchone()
        if not chat:
            return jsonify(error="चैट नहीं मिली।"), 404
        rows = con.execute(
            "SELECT role, content FROM messages WHERE chat_id=? ORDER BY id", (chat_id,)
        ).fetchall()
    return jsonify(messages=[{"role": r["role"], "content": r["content"]} for r in rows])


@app.post("/api/chat/<slug>")
def chat(slug):
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    chat_id = data.get("chat_id")
    lang = (data.get("lang") or "auto").strip()
    style = (data.get("style") or "balanced").strip()
    emoji = (data.get("emoji") or "normal").strip()
    try:
        temperature = float(data.get("temp") or 0.7)
    except (TypeError, ValueError):
        temperature = 0.7
    try:
        max_tokens = int(data.get("max_tokens") or 2048)
    except (TypeError, ValueError):
        max_tokens = 2048
    max_tokens = max(256, min(max_tokens, 4096))

    if not message or len(message) > 6000:
        return jsonify(error="मैसेज खाली है या बहुत लंबा है।"), 400

    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404

        if not ai["base_url"] or not ai["model"] or not ai["encrypted_api_key"]:
            return jsonify(error="पहले API Key connect करें। Settings से Grok API Key डालें।"), 400

        chat_row = con.execute(
            "SELECT id FROM chats WHERE id=? AND ai_id=?", (chat_id, ai["id"])
        ).fetchone()
        if not chat_row:
            return jsonify(error="पहले नई चैट बनाएं।"), 400

        con.execute(
            "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, 'user', ?, ?)",
            (chat_id, message, now())
        )

        msg_count = con.execute(
            "SELECT COUNT(*) as c FROM messages WHERE chat_id=?", (chat_id,)
        ).fetchone()["c"]
        if msg_count <= 1:
            title = message[:40] + ("…" if len(message) > 40 else "")
            con.execute("UPDATE chats SET chat_title=? WHERE id=?", (title, chat_id))

        rows = con.execute(
            "SELECT role, content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 18",
            (chat_id,)
        ).fetchall()

    api_key = decrypt_key(ai["encrypted_api_key"])
    if not api_key:
        return jsonify(error="API Key उपलब्ध नहीं है। Settings में फिर से डालें।"), 400

    # Language
    lang_line = {
        "hi": "Always reply in Hindi (Devanagari script).",
        "en": "Always reply in clear English.",
        "hinglish": "Reply in natural Hinglish (Hindi + English mix).",
        "auto": "Reply in the same language the user is using (Hindi or English).",
    }.get(lang, "Reply in the same language the user is using.")

    style_line = {
        "short": "Keep answers short and crisp.",
        "detailed": "Give detailed, structured answers.",
        "friendly": "Be warm, friendly and encouraging.",
        "professional": "Be professional and precise.",
        "witty": "Be lightly witty when appropriate.",
        "balanced": "Be clear, helpful and balanced.",
    }.get(style, "Be clear and helpful.")

    emoji_line = {
        "high": "Use emojis freely where natural.",
        "low": "Use emojis sparingly.",
        "none": "Do not use emojis.",
        "normal": "Use emojis occasionally when they add clarity.",
    }.get(emoji, "Use emojis occasionally.")

    # Creator revealed ONLY when asked
    system = (
        f"You are GyanAI, a helpful AI assistant. "
        f"{lang_line} {style_line} {emoji_line} "
        f"Do NOT volunteer who created you or any personal creator details. "
        f"Only if the user explicitly asks who created you / 'तुम्हें किसने बनाया' / who made you, "
        f"then say you were created by {ai['creator_name']} using GyanAI Builder. "
        f"Never invent other creator names. Stay helpful and on-topic."
    )

    messages = [{"role": "system", "content": system}]
    messages += [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

    endpoint = (ai["base_url"] or GROK_BASE).rstrip("/") + "/chat/completions"
    model = ai["model"] or GROK_MODELS[0]

    try:
        resp = requests.post(
            endpoint,
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            },
            timeout=50
        )
        if not resp.ok:
            err_text = resp.text[:300]
            return jsonify(error=f"API Error {resp.status_code}: {err_text}"), 400

        data = resp.json()
        answer = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content")
            or data.get("choices", [{}])[0].get("text")
            or "कोई जवाब नहीं मिला।"
        ).strip()

        with db() as con:
            con.execute(
                "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)",
                (chat_id, answer, now())
            )
        return jsonify(answer=answer)
    except requests.RequestException as exc:
        return jsonify(error="कनेक्शन फेल: " + str(exc)[:200]), 400


@app.get("/health")
def health():
    return jsonify(status="ok")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
