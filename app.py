import os
import re
import json
import uuid
import sqlite3
import secrets
from datetime import datetime
from urllib.parse import urlparse

import requests
from flask import Flask, request, jsonify, redirect, render_template, session, abort
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
        con.execute("""CREATE TABLE IF NOT EXISTS ais (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            owner_token_hash TEXT NOT NULL,
            creator_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            purpose TEXT NOT NULL,
            base_url TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            encrypted_api_key TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ai_id INTEGER NOT NULL,
            chat_title TEXT NOT NULL DEFAULT 'नई चैट',
            created_at TEXT NOT NULL,
            FOREIGN KEY(ai_id) REFERENCES ais(id)
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(chat_id) REFERENCES chats(id)
        )""")

def now():
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

def safe_base_url(raw):
    raw = (raw or "").strip().rstrip("/")
    if not raw:
        return ""
    parsed = urlparse(raw)
    if parsed.scheme not in ("https", "http") or not parsed.netloc:
        raise ValueError("Base URL में https:// या http:// और सही host होना चाहिए।")
    if parsed.username or parsed.password:
        raise ValueError("URL के अंदर username/password न डालें।")
    return raw

def encrypt_key(api_key):
    f = get_fernet()
    if not f:
        raise ValueError("API Key सुरक्षित रखने के लिए Render में MASTER_ENCRYPTION_KEY सेट करें। README में तरीका दिया है।")
    return f.encrypt(api_key.encode()).decode()

def decrypt_key(encrypted):
    f = get_fernet()
    if not f or not encrypted:
        return ""
    try:
        return f.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        return ""

def owner_ok(ai):
    token = session.get("owner_token", "")
    return bool(token and secrets.compare_digest(
        __import__("hashlib").sha256(token.encode()).hexdigest(),
        ai["owner_token_hash"]
    ))

@app.get("/")
def home():
    return app.send_static_file("index.html")

@app.post("/api/create")
def create_ai():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()[:80]
    email = (data.get("email") or "").strip()[:160]
    phone = re.sub(r"\s+", "", (data.get("phone") or "").strip())[:25]
    purpose = (data.get("purpose") or "").strip()[:1200]
    base_url = safe_base_url(data.get("base_url"))
    model = (data.get("model") or "").strip()[:160]
    api_key = (data.get("api_key") or "").strip()

    if not all([name, email, phone, purpose, base_url, model, api_key]):
        return jsonify(error="सभी फ़ील्ड भरें: नाम, Gmail, फोन, उद्देश्य, Base URL, Model और API Key।"), 400
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return jsonify(error="सही ईमेल पता लिखें।"), 400
    encrypted = encrypt_key(api_key)
    slug = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
    owner_token = secrets.token_urlsafe(32)
    token_hash = __import__("hashlib").sha256(owner_token.encode()).hexdigest()
    try:
        with db() as con:
            con.execute("""INSERT INTO ais
                (slug, owner_token_hash, creator_name, email, phone, purpose, base_url, model, encrypted_api_key, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (slug, token_hash, name, email, phone, purpose, base_url, model, encrypted, now()))
            ai_id = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()["id"]
            con.execute("INSERT INTO chats (ai_id, chat_title, created_at) VALUES (?, ?, ?)", (ai_id, "नई चैट", now()))
    except sqlite3.IntegrityError:
        return jsonify(error="इस फोन नंबर से AI पहले से बना है। उसी AI का लिंक खोलें।"), 409
    session["owner_token"] = owner_token
    session["owner_slug"] = slug
    return jsonify(ai_url=f"/ai/{slug}", owner_url=f"/manage/{slug}", message="आपका AI तैयार है। लिंक सुरक्षित रख लें।")

@app.get("/ai/<slug>")
def ai_page(slug):
    with db() as con:
        ai = con.execute("SELECT slug, creator_name, purpose FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        abort(404)
    return app.send_static_file("chat.html")

@app.get("/api/ai/<slug>")
def ai_info(slug):
    with db() as con:
        ai = con.execute("SELECT id, slug, creator_name, purpose, model FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404
    return jsonify(slug=ai["slug"], creator_name=ai["creator_name"], purpose=ai["purpose"], model=ai["model"])

@app.get("/manage/<slug>")
def manage(slug):
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        abort(404)
    if not owner_ok(ai):
        return """<!doctype html><meta name="viewport" content="width=device-width"><h2>Owner access required</h2><p>यह settings link केवल AI बनाने वाले browser session में खुलेगा। AI बनाते समय इस्तेमाल किए गए browser में इसे खोलें।</p>""", 403
    return app.send_static_file("settings.html")

@app.get("/api/manage/<slug>")
def manage_info(slug):
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404
    if not owner_ok(ai):
        return jsonify(error="Owner access नहीं है।"), 403
    return jsonify(creator_name=ai["creator_name"], email=ai["email"], phone=ai["phone"],
                   purpose=ai["purpose"], base_url=ai["base_url"], model=ai["model"])

@app.post("/api/manage/<slug>")
def manage_update(slug):
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        if not owner_ok(ai):
            return jsonify(error="Owner access नहीं है।"), 403
        base_url = safe_base_url(data.get("base_url"))
        model = (data.get("model") or "").strip()[:160]
        api_key = (data.get("api_key") or "").strip()
        encrypted = encrypt_key(api_key) if api_key else ai["encrypted_api_key"]
        if not base_url or not model:
            return jsonify(error="Base URL और Model जरूरी हैं।"), 400
        con.execute("UPDATE ais SET base_url=?, model=?, encrypted_api_key=? WHERE slug=?",
                    (base_url, model, encrypted, slug))
    return jsonify(message="Settings सेव हो गईं।")

@app.post("/api/test/<slug>")
def test_connection(slug):
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404
    if not owner_ok(ai):
        return jsonify(error="Owner access नहीं है।"), 403
    base_url = safe_base_url(data.get("base_url") or ai["base_url"])
    model = (data.get("model") or ai["model"]).strip()
    api_key = (data.get("api_key") or "").strip() or decrypt_key(ai["encrypted_api_key"])
    if not api_key:
        return jsonify(error="API Key नहीं मिली।"), 400
    try:
        resp = requests.post(base_url + "/chat/completions",
            headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
            json={"model": model, "messages": [{"role": "user", "content": "Reply with OK"}], "max_tokens": 10},
            timeout=20)
        if resp.ok:
            return jsonify(message="कनेक्शन सफल! API ने जवाब दिया।")
        return jsonify(error=f"Provider ने {resp.status_code} दिया: {resp.text[:350]}"), 400
    except requests.RequestException as exc:
        return jsonify(error="कनेक्शन नहीं हो पाया: " + str(exc)[:250]), 400

@app.get("/api/history/<slug>")
def history(slug):
    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        chats = con.execute("SELECT id, chat_title, created_at FROM chats WHERE ai_id=? ORDER BY id DESC", (ai["id"],)).fetchall()
    return jsonify(chats=[dict(id=c["id"], title=c["chat_title"], created_at=c["created_at"]) for c in chats])

@app.post("/api/new-chat/<slug>")
def new_chat(slug):
    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        cur = con.execute("INSERT INTO chats (ai_id, chat_title, created_at) VALUES (?, ?, ?)", (ai["id"], "नई चैट", now()))
        chat_id = cur.lastrowid
    return jsonify(chat_id=chat_id)

@app.get("/api/messages/<slug>/<int:chat_id>")
def get_messages(slug, chat_id):
    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        chat = con.execute("SELECT id FROM chats WHERE id=? AND ai_id=?", (chat_id, ai["id"])).fetchone()
        if not chat:
            return jsonify(error="चैट नहीं मिली।"), 404
        rows = con.execute("SELECT role, content FROM messages WHERE chat_id=? ORDER BY id", (chat_id,)).fetchall()
    return jsonify(messages=[dict(role=r["role"], content=r["content"]) for r in rows])

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
        chat_row = con.execute("SELECT id FROM chats WHERE id=? AND ai_id=?", (chat_id, ai["id"])).fetchone()
        if not chat_row:
            return jsonify(error="पहले नई चैट बनाएं।"), 400
        con.execute("INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, 'user', ?, ?)", (chat_id, message, now()))
        rows = con.execute("SELECT role, content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 16", (chat_id,)).fetchall()
    api_key = decrypt_key(ai["encrypted_api_key"])
    if not api_key:
        return jsonify(error="API Key उपलब्ध नहीं है। AI बनाने वाले से settings ठीक करवाएँ।"), 400
    messages = [{"role": "system", "content": f"You are a helpful AI assistant. Your creator's name is {ai['creator_name']}. If asked who created you, say you were configured by {ai['creator_name']}. Purpose: {ai['purpose']}"}]
    messages += [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
    try:
        resp = requests.post(ai["base_url"].rstrip("/") + "/chat/completions",
            headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
            json={"model": ai["model"], "messages": messages, "temperature": 0.7},
            timeout=45)
        if not resp.ok:
            return jsonify(error=f"AI provider error ({resp.status_code}): {resp.text[:300]}"), 502
        answer = resp.json()["choices"][0]["message"]["content"]
        with db() as con:
            con.execute("INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)", (chat_id, answer, now()))
            count = con.execute("SELECT COUNT(*) AS n FROM messages WHERE chat_id=?", (chat_id,)).fetchone()["n"]
            if count == 2:
                title = message[:38] + ("…" if len(message) > 38 else "")
                con.execute("UPDATE chats SET chat_title=? WHERE id=?", (title or "नई चैट", chat_id))
        return jsonify(answer=answer)
    except (requests.RequestException, ValueError, KeyError) as exc:
        return jsonify(error="जवाब नहीं मिल पाया: " + str(exc)[:250]), 502

@app.delete("/api/history/<slug>/<int:chat_id>")
def delete_chat(slug, chat_id):
    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        con.execute("DELETE FROM messages WHERE chat_id=? AND chat_id IN (SELECT id FROM chats WHERE ai_id=?)", (chat_id, ai["id"]))
        cur = con.execute("DELETE FROM chats WHERE id=? AND ai_id=?", (chat_id, ai["id"]))
        if not cur.rowcount:
            return jsonify(error="चैट नहीं मिली।"), 404
        remaining = con.execute("SELECT id FROM chats WHERE ai_id=? ORDER BY id DESC LIMIT 1", (ai["id"],)).fetchone()
        if not remaining:
            con.execute("INSERT INTO chats (ai_id, chat_title, created_at) VALUES (?, ?, ?)", (ai["id"], "नई चैट", now()))
    return jsonify(message="चैट डिलीट हो गई।")

@app.errorhandler(404)
def not_found(_):
    return "यह पेज नहीं मिला।", 404

init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
