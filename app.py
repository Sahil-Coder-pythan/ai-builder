import os
import re
import json
import sqlite3
import secrets
import hashlib
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
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
                address TEXT DEFAULT '',
                purpose TEXT DEFAULT '',
                base_url TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                encrypted_api_key TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)
        # Safe migration for databases created by earlier versions.
        columns = {row["name"] for row in con.execute("PRAGMA table_info(ais)").fetchall()}
        if "address" not in columns:
            con.execute("ALTER TABLE ais ADD COLUMN address TEXT DEFAULT ''")
        if "phone" not in columns:
            con.execute("ALTER TABLE ais ADD COLUMN phone TEXT DEFAULT ''")
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
    raw = (raw or "").strip()
    if not raw:
        return ""
    # Common mistakes: user pastes full chat endpoint
    for suffix in ("/chat/completions", "/chat/completion", "/chat", "/completions"):
        if raw.lower().endswith(suffix):
            raw = raw[: -len(suffix)]
    raw = raw.rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme not in ("https", "http") or not parsed.netloc:
        raise ValueError("Base URL में https:// या http:// और सही host होना चाहिए। उदाहरण: https://api.groq.com/openai/v1")
    if parsed.username or parsed.password:
        raise ValueError("URL के अंदर username/password न डालें।")
    return raw


def chat_endpoint(base_url):
    base = (base_url or "").rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def encrypt_key(api_key):
    f = get_fernet()
    if not f:
        # Development fallback – still works but less secure
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
    phone = re.sub(r"[^0-9+() -]", "", (data.get("phone") or "").strip())[:30]
    creator_name = (data.get("username") or "").strip()[:80]
    address = (data.get("address") or "").strip()[:240]

    # Prototype mode: format validation only, not proof of mailbox ownership.
    if not email or "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return jsonify(error="ईमेल का फॉर्मेट सही डालें (अभी ईमेल सत्यापन चालू नहीं है)।"), 400
    if len(phone) < 7:
        return jsonify(error="सही मोबाइल नंबर डालें।"), 400
    if not creator_name:
        return jsonify(error="अपना यूज़रनेम डालें।"), 400
    if not address:
        return jsonify(error="अपना एड्रेस डालें।"), 400

    slug = secrets.token_urlsafe(10).replace("-", "").replace("_", "")[:14]
    owner_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(owner_token.encode()).hexdigest()
    created = now()

    try:
        with db() as con:
            con.execute("""
                INSERT INTO ais
                (slug, owner_token_hash, creator_name, email, phone, address, purpose, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (slug, token_hash, creator_name, email, phone, address, "Personal AI Assistant", created))
            ai_id = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()["id"]
            con.execute(
                "INSERT INTO chats (ai_id, chat_title, created_at) VALUES (?, ?, ?)",
                (ai_id, "नई चैट", created)
            )
    except sqlite3.IntegrityError:
        return jsonify(error="AI बनाते समय समस्या हुई। फिर से कोशिश करें।"), 409

    session["owner_token"] = owner_token
    session["owner_slug"] = slug

    return jsonify(
        ai_url=f"/ai/{slug}",
        full_url=request.host_url.rstrip("/") + f"/ai/{slug}",
        creator_name=creator_name,
        created_at=created,
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
            "SELECT id, slug, creator_name, email, phone, address, purpose, model, base_url, created_at FROM ais WHERE slug=?",
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
        email=ai["email"],
        phone=ai["phone"] or "",
        address=ai["address"] or "",
        created_at=ai["created_at"],
        purpose=ai["purpose"],
        model=ai["model"] or "",
        has_api=bool(ai["base_url"] and ai["model"]),
        is_owner=is_owner
    )


@app.post("/api/settings/<slug>")
def update_settings(slug):
    """Anyone with the AI link can set API (so shared users can connect their own key)."""
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        if not owner_ok(ai):
            return jsonify(error="API सेटिंग्स केवल AI बनाने वाला यूज़र बदल सकता है।"), 403

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
            (base_url, model, encrypted, slug)
        )
    return jsonify(message="Settings सेव हो गईं। अब चैट कर सकते हो।", base_url=base_url, model=model)


@app.post("/api/test/<slug>")
def test_connection(slug):
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404
    if not owner_ok(ai):
        return jsonify(error="API कनेक्शन केवल AI बनाने वाला यूज़र टेस्ट कर सकता है।"), 403

    try:
        base_url = safe_base_url(data.get("base_url") or ai["base_url"])
    except ValueError as e:
        return jsonify(error=str(e)), 400

    model = (data.get("model") or ai["model"] or "").strip()
    api_key = (data.get("api_key") or "").strip() or decrypt_key(ai["encrypted_api_key"])

    if not base_url or not model or not api_key:
        return jsonify(error="URL, Model और API Key सभी चाहिए।"), 400

    endpoint = chat_endpoint(base_url)
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
            timeout=20
        )
        if resp.ok:
            return jsonify(message="कनेक्शन सफल! API ने जवाब दिया।")
        return jsonify(error=f"Provider ने {resp.status_code} दिया: {resp.text[:350]}"), 400
    except requests.RequestException as exc:
        return jsonify(error="कनेक्शन नहीं हो पाया: " + str(exc)[:220]), 400


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

    if not message or len(message) > 6000:
        return jsonify(error="मैसेज खाली है या बहुत लंबा है।"), 400

    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404

        if not ai["base_url"] or not ai["model"] or not ai["encrypted_api_key"]:
            return jsonify(error="पहले API Key connect करें। Left मेन्यू से URL, Model और API Key डालें।"), 400

        chat_row = con.execute(
            "SELECT id FROM chats WHERE id=? AND ai_id=?", (chat_id, ai["id"])
        ).fetchone()
        if not chat_row:
            return jsonify(error="पहले नई चैट बनाएं।"), 400

        con.execute(
            "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, 'user', ?, ?)",
            (chat_id, message, now())
        )

        # Update title if first message
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

    created_date = "तारीख उपलब्ध नहीं"
    try:
        created_dt = datetime.strptime(ai["created_at"], "%Y-%m-%d %H:%M:%S UTC").replace(tzinfo=timezone.utc)
        created_date = created_dt.astimezone(ZoneInfo("Asia/Kolkata")).strftime("%d %B %Y")
    except (ValueError, TypeError):
        created_date = (ai["created_at"] or "").split(" ")[0] or "तारीख उपलब्ध नहीं"
    creator_name = ai["creator_name"] or "अज्ञात निर्माता"
    creator_address = ai["address"] or "उपलब्ध नहीं"
    system = f"""
You are Subsook, a warm, witty, useful, accurate AI assistant created through the AI Builder tool.
PERSONAL AI IDENTITY (treat these as facts):
- This specific AI was created by the user named: {creator_name}
- Creation date: {created_date}
- Tool used: AI Builder
- The creator-provided address/location: {creator_address}
- The AI Builder tool was created by Sahil.
- If asked who Sahil is, say: "Sahil is the creator of this AI Builder project and is associated with the StratisSoft project. He lives in Uttarakhand, India."
- If asked who created THIS AI, answer with the user's creator name, creation date, AI Builder tool, and the creator-provided address. Do not confuse this user with Sahil.
- If asked who created AI Builder, say Sahil created the AI Builder project.
- Do not claim the email or phone number has been verified. Email is currently format-only, without Google verification.
STYLE:
- Be friendly, clever, lightly funny when suitable, and respectful. Do not force jokes into serious, sensitive, or urgent topics.
- Match the user's language (Hindi/Hinglish/English).
- Use short, meaningful headings and well-organized paragraphs for explanations. Use emojis naturally but sparingly.
- Never use Markdown asterisk characters for bold or bullets. Use headings with plain text or numbered lists where useful.
- Answer accurately and explain uncertainty instead of inventing facts. Be concise but complete, like a polished assistant.
- Avoid repeatedly calling the user "bro" unless they use that tone first.
"""

    messages = [{"role": "system", "content": system}]
    messages += [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

    endpoint = chat_endpoint(ai["base_url"])
    try:
        resp = requests.post(
            endpoint,
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json"
            },
            json={
                "model": ai["model"],
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2048
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


# Initialize DB on startup
init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
