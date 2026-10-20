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
# Persistent login until user logs out (cookie ~30 days)
from datetime import timedelta
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "1") != "0"
app.config["SESSION_REFRESH_EACH_REQUEST"] = True


def env_clean(key, default=""):
    """Read env and strip quotes/whitespace (common Render paste mistakes)."""
    v = os.environ.get(key, default)
    if v is None:
        return default
    v = str(v).strip().strip('"').strip("'").strip()
    return v


def google_client_id():
    cid = env_clean("GOOGLE_CLIENT_ID")
    # Must look like a Web client id
    if cid and not cid.endswith(".apps.googleusercontent.com"):
        # still return it — but log-ish via response later
        pass
    return cid


app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024

# Default + popular OpenAI-compatible presets (Groq + xAI)
DEFAULT_BASE = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "llama-3.3-70b-versatile"

# Auto-try list: (base_url, model) — used when user leaves model/url blank or for smart connect
PROVIDER_PRESETS = [
    # Groq (most common free/fast)
    ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    ("https://api.groq.com/openai/v1", "llama-3.1-8b-instant"),
    ("https://api.groq.com/openai/v1", "llama-3.1-70b-versatile"),
    ("https://api.groq.com/openai/v1", "mixtral-8x7b-32768"),
    ("https://api.groq.com/openai/v1", "gemma2-9b-it"),
    ("https://api.groq.com/openai/v1", "openai/gpt-oss-20b"),
    ("https://api.groq.com/openai/v1", "openai/gpt-oss-120b"),
    # xAI Grok
    ("https://api.x.ai/v1", "grok-2-1212"),
    ("https://api.x.ai/v1", "grok-2"),
    ("https://api.x.ai/v1", "grok-3"),
    ("https://api.x.ai/v1", "grok-4"),
    ("https://api.x.ai/v1", "grok-4.7"),
    ("https://api.x.ai/v1", "grok-beta"),
]

# Keep old names for compatibility
GROK_BASE = "https://api.x.ai/v1"
GROK_MODELS = [m for _, m in PROVIDER_PRESETS if "x.ai" in _]


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
        try:
            con.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ais_phone ON ais(phone) WHERE phone != ''")
        except Exception:
            pass
        # Per-AI developer customization (never touches global code)
        for col, typ in [
            ("custom_css", "TEXT DEFAULT ''"),
            ("custom_config", "TEXT DEFAULT '{}'"),
            ("encrypted_eleven_key", "TEXT DEFAULT ''"),
            ("password_hash", "TEXT DEFAULT ''"),
            ("google_sub", "TEXT DEFAULT ''"),
        ]:
            try:
                con.execute(f"ALTER TABLE ais ADD COLUMN {col} {typ}")
            except Exception:
                pass
        con.execute("""
            CREATE TABLE IF NOT EXISTS link_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                phone TEXT DEFAULT '',
                slug TEXT NOT NULL,
                full_url TEXT NOT NULL,
                creator_name TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(email, slug)
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS verify_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                code TEXT NOT NULL,
                purpose TEXT NOT NULL DEFAULT 'reset',
                expires_at TEXT NOT NULL,
                used INTEGER DEFAULT 0
            )
        """)


def now():
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

def _mail_from():
    return (
        os.environ.get("MAIL_FROM", "").strip()
        or os.environ.get("SMTP_FROM", "").strip()
        or "Gyan AI <noreply@straticsoft.com>"
    )


def send_email(to_email, subject, text_body, html_body=None):
    """Send email via Brevo API (preferred) or SMTP fallback.
    Returns (ok: bool, status: str). Never exposes secrets.
    """
    to_email = (to_email or "").strip().lower()
    if not to_email or "@" not in to_email:
        return False, "invalid_email"

    brevo_key = os.environ.get("BREVO_API_KEY", "").strip()
    sender = _mail_from()

    # --- Brevo (Sendinblue) transactional API ---
    if brevo_key:
        try:
            import requests
            # sender can be "Name <email@x.com>" or plain email
            if "<" in sender and ">" in sender:
                name = sender.split("<")[0].strip().strip('"')
                email_addr = sender.split("<")[1].split(">")[0].strip()
            else:
                name = "Gyan AI"
                email_addr = sender
            payload = {
                "sender": {"name": name or "Gyan AI", "email": email_addr},
                "to": [{"email": to_email}],
                "subject": subject,
                "textContent": text_body,
            }
            if html_body:
                payload["htmlContent"] = html_body
            r = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key": brevo_key,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                json=payload,
                timeout=20,
            )
            if r.status_code in (200, 201, 202):
                return True, "brevo_sent"
            return False, f"brevo_{r.status_code}:{r.text[:120]}"
        except Exception as e:
            return False, f"brevo_error:{str(e)[:120]}"

    # --- SMTP fallback ---
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587") or 587)
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASS", "").strip()
    if not host or not user or not password:
        return False, "email_not_configured"
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to_email
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        if html_body:
            msg.attach(MIMEText(html_body, "html", "utf-8"))
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls()
            s.login(user, password)
            s.sendmail(user if "@" in user else sender, [to_email], msg.as_string())
        return True, "smtp_sent"
    except Exception as e:
        return False, str(e)[:200]


def try_send_ai_link(email, full_url, creator_name):
    """Send AI link to user email. Uses Brevo or SMTP."""
    body = (
        f"Namaste {creator_name},\n\n"
        f"Aapka GyanAI ready hai.\n\n"
        f"Open your AI:\n{full_url}\n\n"
        f"Is link ko safe rakhein. Sirf aap is AI ko control kar sakte ho.\n\n"
        f"— Gyan AI · Stratic Soft"
    )
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;text-align:center;line-height:40px">G</div>
      <h2 style="margin:16px 0 8px">Aapka Gyan AI ready hai</h2>
      <p>Namaste {creator_name},</p>
      <p><a href="{full_url}" style="display:inline-block;padding:12px 20px;background:#7c3aed;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Open your AI</a></p>
      <p style="color:#64748b;font-size:13px">{full_url}</p>
      <p style="color:#94a3b8;font-size:12px">— Gyan AI · Stratic Soft</p>
    </div>
    """
    return send_email(email, "Aapka GyanAI link ready hai", body, html)


def send_verification_code(email, code):
    """Real password-reset code email only — never returned to client."""
    body = (
        f"Reset your password - Gyan AI (Stratic Soft)\n\n"
        f"Use this code to reset your password:\n\n"
        f"{code}\n\n"
        f"This code expires in 15 minutes. If you did not request it, you can safely ignore this email.\n\n"
        f"— Stratic Soft"
    )
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;text-align:center;line-height:40px">G</div>
      <h2 style="margin:16px 0 8px">Reset your password</h2>
      <p style="color:#64748b">Gyan AI · Stratic Soft</p>
      <p>Use this code to reset your password:</p>
      <div style="font-size:28px;font-weight:800;letter-spacing:6px;padding:16px;background:#f8fafc;border-radius:12px;text-align:center;margin:16px 0">{code}</div>
      <p style="color:#64748b;font-size:13px">This code expires in 15 minutes. If you did not request it, ignore this email.</p>
    </div>
    """
    return send_email(email, "Reset your password - Stratic Soft", body, html)


PROTECTED_CONFIG_KEYS = {
    "theme", "fontSize", "bubble", "density", "sphereColor", "sphereSize",
    "menuPosition", "accentColor", "bgColor", "userBubbleColor", "aiBubbleColor",
    "headerColor", "composerColor", "responseStyle", "emojiLevel", "signature",
    "showTimestamps", "enterToSend", "welcomeTitle", "welcomeSub",
    "extraFeatures", "customTitle", "borderRadius", "msgSpacing",
    "sidebarSide", "fontFamily", "glowIntensity", "animationSpeed",
    "fileReceive", "videoReceive", "composerPosition", "settingsPosition",
}

# Keys / patterns developers are FORBIDDEN to add or enable
FORBIDDEN_CONFIG_KEYS = {
    "photoGenEnabled", "photoGenBaseUrl", "photoGenModel", "photoGenerate",
    "geminiKey", "googleGemini", "openaiKey", "claudeKey", "extraApiKey",
    "addApiBox", "thirdApiBox", "hideApiBox", "hideVoiceBox",
    "removeGrok", "removeEleven", "replaceGrok", "replaceEleven",
}
FORBIDDEN_CSS_PATTERNS = [
    r"gemini", r"google.?ai", r"openai.?key", r"claude",
    r"photo.?gen", r"image.?gen", r"dall.?e", r"stable.?diffusion",
]





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
    raw_phone = (data.get("phone") or "").strip()
    # Normalize phone to digits only (last 10 for India-style) — never leak this to others
    digits = "".join(ch for ch in raw_phone if ch.isdigit())
    phone = digits[-10:] if len(digits) >= 10 else digits
    username = (data.get("username") or data.get("name") or "").strip()[:80]
    address = (data.get("address") or "").strip()[:200]

    if not email or "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return jsonify(error="सही ईमेल ID डालें।"), 400
    if not phone or len(phone) < 8:
        return jsonify(error="सही मोबाइल नंबर डालें।"), 400
    if not username:
        return jsonify(error="Username डालें।"), 400

    creator_name = username[:80]
    purpose = address or "General AI Assistant"
    password = (data.get("password") or "").strip()
    if password and len(password) < 6:
        return jsonify(error="Password कम से कम 6 अक्षर का हो।"), 400
    password_hash = hashlib.sha256(password.encode()).hexdigest() if password else ""

    slug = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
    owner_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(owner_token.encode()).hexdigest()

    try:
        with db() as con:
            # One mobile = one AI only — cannot be bypassed by custom code
            exists = con.execute(
                "SELECT slug FROM ais WHERE phone=? LIMIT 1", (phone,)
            ).fetchone()
            if exists:
                return jsonify(
                    error="इस मोबाइल नंबर से AI पहले बन चुका है। एक नंबर से सिर्फ एक AI बन सकता है।"
                ), 409

            con.execute("""
                INSERT INTO ais
                (slug, owner_token_hash, creator_name, email, phone, purpose, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (slug, token_hash, creator_name, email, phone, purpose, password_hash, now()))
            ai_id = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()["id"]
            con.execute(
                "INSERT INTO chats (ai_id, chat_title, created_at) VALUES (?, ?, ?)",
                (ai_id, "नई चैट", now())
            )
            full_url = request.host_url.rstrip("/") + f"/ai/{slug}"
            # Permanent link history — never auto-deleted
            con.execute("""
                INSERT OR IGNORE INTO link_history
                (email, phone, slug, full_url, creator_name, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (email, phone, slug, full_url, creator_name, now()))
    except sqlite3.IntegrityError:
        return jsonify(error="इस मोबाइल नंबर से AI पहले बन चुका है।"), 409

    session.permanent = True
    session["owner_token"] = owner_token
    session["owner_slug"] = slug
    session["user_email"] = email

    full_url = request.host_url.rstrip("/") + f"/ai/{slug}"
    email_sent, email_status = try_send_ai_link(email, full_url, creator_name)

    return jsonify(
        message="आपका AI तैयार है! Link नीचे और History में save है।",
        ai_url=f"/ai/{slug}",
        full_url=full_url,
        owner_token=owner_token,
        slug=slug,
        email_sent=bool(email_sent),
        email_notice=("AI लिंक आपके ईमेल पर भेज दिया गया।" if email_sent else
                      "AI बन गया, लेकिन ईमेल नहीं भेजा जा सका। Render में Brevo/SMTP sender सेटिंग जाँचें।"),
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
            "SELECT id, slug, creator_name, purpose, model, base_url, custom_css, custom_config FROM ais WHERE slug=?",
            (slug,)
        ).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404

    is_owner = False
    with db() as con:
        full = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        is_owner = owner_ok(full) if full else False

    cfg = {}
    try:
        cfg = json.loads(ai["custom_config"] or "{}")
    except Exception:
        cfg = {}
    return jsonify(
        slug=ai["slug"],
        creator_name=ai["creator_name"],
        purpose=ai["purpose"],
        model=ai["model"] or "",
        has_api=bool(ai["base_url"] and ai["model"]),
        is_owner=is_owner,
        custom_css=ai["custom_css"] or "",
        custom_config=cfg,
    )


def _try_chat(base_url, model, api_key, timeout=8):
    """Quick probe — returns (ok: bool, error_msg: str)"""
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
            timeout=timeout
        )
        if resp.ok:
            return True, ""
        return False, f"{resp.status_code}: {resp.text[:200]}"
    except requests.RequestException as exc:
        return False, str(exc)[:160]


@app.post("/api/settings/<slug>")
def update_settings(slug):
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404

        api_key = (data.get("api_key") or "").strip()
        if not api_key and not ai["encrypted_api_key"]:
            return jsonify(error="API Key डालें।"), 400
        if not api_key:
            api_key = decrypt_key(ai["encrypted_api_key"])

        raw_url = (data.get("base_url") or "").strip()
        raw_model = (data.get("model") or "").strip()[:160]

        # If user gave both URL + model → use them directly
        if raw_url and raw_model:
            try:
                base_url = safe_base_url(raw_url)
            except ValueError as e:
                return jsonify(error=str(e)), 400
            model = raw_model
            ok, err = _try_chat(base_url, model, api_key, timeout=10)
            if not ok:
                return jsonify(error=f"Connect fail: {err}"), 400
        else:
            # Smart auto-connect: try presets + user partial inputs fast
            candidates = []
            if raw_url and raw_model:
                candidates.append((raw_url, raw_model))
            if raw_url:
                for u, m in PROVIDER_PRESETS:
                    if u.rstrip("/") == raw_url.rstrip("/") or raw_url in u:
                        candidates.append((u, m))
            if raw_model:
                for u, m in PROVIDER_PRESETS:
                    if m == raw_model:
                        candidates.append((u, m))
            # Always add full preset list as fallback
            candidates.extend(PROVIDER_PRESETS)

            # Deduplicate while preserving order
            seen = set()
            uniq = []
            for u, m in candidates:
                key = (u.rstrip("/"), m)
                if key not in seen:
                    seen.add(key)
                    uniq.append((u, m))

            base_url = model = None
            last_err = "कोई model काम नहीं किया"
            for u, m in uniq[:12]:  # max 12 quick tries
                try:
                    bu = safe_base_url(u)
                except ValueError:
                    continue
                ok, err = _try_chat(bu, m, api_key, timeout=6)
                if ok:
                    base_url, model = bu, m
                    break
                last_err = err
            if not base_url:
                return jsonify(error=f"Auto-connect fail: {last_err}"), 400

        encrypted = encrypt_key(api_key)
        con.execute(
            "UPDATE ais SET base_url=?, model=?, encrypted_api_key=? WHERE slug=?",
            (base_url, model, encrypted, slug)
        )
    return jsonify(
        message=f"Connected! Model: {model}",
        base_url=base_url,
        model=model
    )


@app.get("/api/custom/<slug>")
def get_custom(slug):
    with db() as con:
        ai = con.execute(
            "SELECT custom_css, custom_config FROM ais WHERE slug=?", (slug,)
        ).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404
    cfg = {}
    try:
        cfg = json.loads(ai["custom_config"] or "{}")
    except Exception:
        cfg = {}
    return jsonify(custom_css=ai["custom_css"] or "", custom_config=cfg)


@app.post("/api/custom/<slug>")
def save_custom(slug):
    """Developer Connect Code — only applies to THIS AI instance.
    Cannot remove Grok API or ElevenLabs boxes. Errors returned clearly.
    """
    data = request.get_json(silent=True) or {}
    raw_css = data.get("custom_css")
    raw_cfg = data.get("custom_config")
    raw_code = (data.get("code") or "").strip()  # optional unified code block

    errors = []
    css = ""
    cfg = {}

    # Parse unified code block if provided:
    # /* CSS */ ... /* CONFIG */ {json} or pure CSS / pure JSON
    if raw_code:
        try:
            if raw_code.lstrip().startswith("{"):
                cfg = json.loads(raw_code)
            elif "/*CONFIG*/" in raw_code or "/* CONFIG */" in raw_code:
                parts = re.split(r"/\*\s*CONFIG\s*\*/", raw_code, maxsplit=1, flags=re.I)
                css = parts[0].replace("/*CSS*/", "").replace("/* CSS */", "").strip()
                cfg = json.loads(parts[1].strip()) if len(parts) > 1 else {}
            else:
                css = raw_code
        except json.JSONDecodeError as e:
            errors.append(f"JSON error: {e.msg} (line {e.lineno}, col {e.colno})")
        except Exception as e:
            errors.append(f"Code parse error: {str(e)[:200]}")

    if raw_css is not None:
        css = str(raw_css)[:80000]
    if raw_cfg is not None:
        if isinstance(raw_cfg, dict):
            cfg = raw_cfg
        else:
            try:
                cfg = json.loads(str(raw_cfg))
            except json.JSONDecodeError as e:
                errors.append(f"Config JSON error: {e.msg} (line {e.lineno})")

    if errors:
        return jsonify(error="Code error", details=errors, ok=False), 400

    # Sanitize CSS: strip script/expression/url(javascript)
    css = re.sub(r"<script[\s\S]*?>[\s\S]*?</script>", "", css, flags=re.I)
    css = re.sub(r"expression\s*\(", "/*blocked*/(", css, flags=re.I)
    css = re.sub(r"url\s*\(\s*['\"]?\s*javascript:", "url(/*blocked*/", css, flags=re.I)
    # Force protected settings sections always visible
    protected_css = """
/* PROTECTED — cannot hide API / ElevenLabs */
#settingsPanel .set-section.protected-api,
#settingsPanel .set-section.protected-voice {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  height: auto !important;
  max-height: none !important;
  pointer-events: auto !important;
}
#setBaseUrl, #setModel, #setKey, #setElevenKey {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
"""
    css = protected_css + "\n" + css

    # Whitelist config keys only
    clean_cfg = {}
    if isinstance(cfg, dict):
        for k, v in cfg.items():
            if k in PROTECTED_CONFIG_KEYS:
                clean_cfg[k] = v
            # silently drop unknown / dangerous keys

    # Forbidden: remove protected boxes / add extra API boxes / photo generate
    blocked = []
    if isinstance(cfg, dict):
        for k in list(cfg.keys()):
            if k in FORBIDDEN_CONFIG_KEYS or k.lower() in FORBIDDEN_CONFIG_KEYS:
                blocked.append(
                    f"'{k}' add/change नहीं कर सकते — ये हमारे system में locked है "
                    f"(Grok API + ElevenLabs boxes fixed; extra API boxes / photo-generate नहीं)."
                )
    css_l = css.lower()
    for pat in FORBIDDEN_CSS_PATTERNS:
        if re.search(pat, css_l, re.I):
            blocked.append(
                f"Code में '{pat}' related feature add नहीं कर सकते। "
                f"Photo generate / Gemini / extra API boxes system द्वारा block हैं।"
            )
            break
    # Detect attempts to inject extra API key inputs
    if re.search(r"setGemini|geminiKey|extraApi|third.?api|#set.*Key", css + json.dumps(cfg), re.I):
        if re.search(r"gemini|claude|openai|extra.?api|third.?api", css + json.dumps(cfg), re.I):
            blocked.append(
                "Extra API key box (Gemini/Claude/OpenAI आदि) add नहीं कर सकते। "
                "सिर्फ Grok API Key + ElevenLabs API Key boxes allowed हैं।"
            )
    if blocked:
        return jsonify(
            error="ये आप add/change नहीं कर सकते — ये हमारे system में है।",
            details=blocked,
            ok=False,
        ), 400

    clean_cfg.pop("hideApiBox", None)
    clean_cfg.pop("hideVoiceBox", None)
    clean_cfg.pop("removeGrok", None)
    clean_cfg.pop("removeEleven", None)
    for fk in FORBIDDEN_CONFIG_KEYS:
        clean_cfg.pop(fk, None)

    with db() as con:
        ai = con.execute("SELECT id FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        con.execute(
            "UPDATE ais SET custom_css=?, custom_config=? WHERE slug=?",
            (css, json.dumps(clean_cfg, ensure_ascii=False), slug)
        )

    return jsonify(
        ok=True,
        message="Code connected! सिर्फ इस AI पर लागू हुआ। Core boxes locked रहते हैं।",
        applied_keys=list(clean_cfg.keys()),
        css_bytes=len(css),
    )


@app.post("/api/test/<slug>")
def test_connection(slug):
    data = request.get_json(silent=True) or {}
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
    if not ai:
        return jsonify(error="AI नहीं मिला।"), 404

    api_key = (data.get("api_key") or "").strip() or decrypt_key(ai["encrypted_api_key"])
    raw_url = (data.get("base_url") or ai["base_url"] or DEFAULT_BASE).strip()
    raw_model = (data.get("model") or ai["model"] or DEFAULT_MODEL).strip()

    if not api_key:
        return jsonify(error="API Key डालें।"), 400

    try:
        base_url = safe_base_url(raw_url)
    except ValueError as e:
        return jsonify(error=str(e)), 400

    ok, err = _try_chat(base_url, raw_model, api_key, timeout=10)
    if ok:
        return jsonify(message=f"कनेक्शन सफल! ({raw_model})")
    return jsonify(error=f"Fail: {err}"), 400


@app.get("/api/history/<slug>")
def history(slug):
    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        if not owner_ok(ai):
            return jsonify(error="यह History केवल AI बनाने वाले के लिए निजी है।"), 403
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
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404
        if not owner_ok(ai):
            return jsonify(error="यह History केवल AI बनाने वाला ही डिलीट कर सकता है।"), 403
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
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
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

    image_data_early = (data.get("image") or "").strip()
    if (not message and not image_data_early.startswith("data:image")) or len(message) > 6000:
        return jsonify(error="मैसेज खाली है या बहुत लंबा है।"), 400
    if not message and image_data_early:
        message = "इस फोटो में क्या है? विस्तार से बताओ।"

    with db() as con:
        ai = con.execute("SELECT * FROM ais WHERE slug=?", (slug,)).fetchone()
        if not ai:
            return jsonify(error="AI नहीं मिला।"), 404

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

    # Deterministic identity/privacy answers: phone and email are never exposed,
    # and the model is not called for these identity-policy questions.
    q = message.casefold()
    q_compact = re.sub(r"[^a-z0-9\\u0900-\\u097f]+", " ", q).strip()
    asks_private = any(term in q for term in (
        "phone number", "mobile number", "your phone", "email address",
        "your email", "फोन नंबर", "मोबाइल नंबर", "ईमेल आईडी", "ईमेल पता",
        "निजी जानकारी", "personal details", "contact details", "contact number"
    ))
    asks_builder = any(term in q for term in (
        "ai builder", "एआई बिल्डर", "एआई बिल्डर टूल", "builder tool",
        "who made ai builder", "who created ai builder", "किसने बनाया ai builder",
        "किसने बनाया एआई बिल्डर", "stratic soft", "स्ट्रेटिक सॉफ्ट"
    ))
    asks_creator = any(term in q for term in (
        "who created you", "who made you", "who built you", "who is your creator",
        "तुम्हें किसने बनाया", "तुमको किसने बनाया", "आपको किसने बनाया",
        "तुम्हारा निर्माता", "तुम्हें किसके द्वारा बनाया", "किसने बनाया है"
    ))

    if asks_private:
        answer = "माफ़ कीजिए, मैं फोन नंबर, ईमेल आईडी या अन्य निजी संपर्क जानकारी साझा नहीं कर सकता।"
    elif asks_builder:
        answer = "मुझे AI Builder टूल के द्वारा बनाया गया है। AI Builder टूल Sahil ने बनाया है और कंपनी का नाम Stratic Soft है। इससे अधिक जानकारी मैं साझा नहीं कर सकता।"
    elif asks_creator:
        creator_public = (ai["creator_name"] or "AI creator").strip()
        address_public = (ai["purpose"] or "").strip()
        address_line = f" पता: {address_public}." if address_public else ""
        answer = f"मुझे {creator_public} ने बनाया है।{address_line} मुझे AI Builder टूल के द्वारा बनाया गया है।"
    else:
        answer = None

    if answer is not None:
        with db() as con:
            con.execute(
                "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)",
                (chat_id, answer, now())
            )
        return jsonify(answer=answer)

    if not ai["base_url"] or not ai["model"] or not ai["encrypted_api_key"]:
        return jsonify(error="पहले API Key connect करें। Settings से Groq API Key डालें।"), 400

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

    # Creator revealed ONLY when asked — natural clear Hindi/English
    creator = (ai["creator_name"] or "Sahil").strip()
    system = (
        f"You are GyanAI, a helpful AI assistant with a distinctive professional style. "
        f"{lang_line} {style_line} {emoji_line} "
        f"Structure answers like ChatGPT/Grok: use short ## headings when helpful, "
        f"mix **bold** for key terms, and keep paragraphs readable. "
        f"Do NOT volunteer who created you. "
        f"If asked who created you, identify the creator as {creator} and use the creator address only if asked who the creator is / where the creator is based. "
        f"Never reveal or guess a phone number, email address, or any private contact details; politely refuse. "
        f"If asked about the AI Builder tool or for more details about it, say only that you were created through the AI Builder tool, Sahil created AI Builder, and the company name is Stratic Soft; politely refuse to provide further internal details. "
        f"Never invent other creator names. Stay helpful and on-topic. "
        f"If the user sends an image, carefully describe what you see and answer their question about it."
    )

    messages = [{"role": "system", "content": system}]
    hist = list(reversed(rows))
    # Build history; last user message may include vision content
    image_data = (data.get("image") or "").strip()
    for i, r in enumerate(hist):
        role, content = r["role"], r["content"]
        is_last_user = (i == len(hist) - 1 and role == "user" and image_data.startswith("data:image"))
        if is_last_user:
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": content or "इस फोटो में क्या है? बताओ।"},
                    {"type": "image_url", "image_url": {"url": image_data}}
                ]
            })
        else:
            messages.append({"role": role, "content": content})

    endpoint = (ai["base_url"] or DEFAULT_BASE).rstrip("/") + "/chat/completions"
    model = ai["model"] or DEFAULT_MODEL

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


@app.get("/api/config")
def public_config():
    """Public client config — Google Client ID for real login button."""
    cid = google_client_id()
    # Never send secret. Send suffix so user can verify correct ID is loaded.
    suffix = ("…" + cid[-20:]) if len(cid) > 24 else cid
    return jsonify(
        google_client_id=cid,
        google_enabled=bool(cid),
        google_client_id_suffix=suffix,
        origin_hint="Add this exact URL in Google Console → Authorized JavaScript origins",
    )


@app.post("/api/auth/google")
def auth_google():
    """Verify Google ID token (credential) and start session."""
    data = request.get_json(silent=True) or {}
    credential = (data.get("credential") or "").strip()
    expected_nonce = (data.get("nonce") or "").strip()
    client_id = google_client_id()
    if not client_id:
        return jsonify(error="GOOGLE_CLIENT_ID Render environment में set करें।"), 400
    if not credential:
        return jsonify(error="Google credential missing"), 400

    email = ""
    sub = ""
    name = ""
    try:
        # Prefer official verify
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as grequests
        info = google_id_token.verify_oauth2_token(
            credential, grequests.Request(), client_id
        )
        if not expected_nonce or not secrets.compare_digest(
            str(info.get("nonce") or ""), expected_nonce
        ):
            return jsonify(error="Google login nonce verify नहीं हुआ। दोबारा login करें।"), 401
        email = (info.get("email") or "").lower()
        sub = info.get("sub") or ""
        name = info.get("name") or ""
    except Exception as e:
        # Never accept an unsigned/unverified token. Real Google signature,
        # audience, issuer and expiry validation is mandatory.
        app.logger.warning("Google ID token verification failed: %s", str(e)[:160])
        return jsonify(error="Google token verify नहीं हुआ। Google Cloud Client ID और login setup जाँचें।"), 401

    if not email or "@" not in email:
        return jsonify(error="Google email नहीं मिला"), 400

    session.permanent = True
    session["user_email"] = email
    session["google_sub"] = sub
    session["google_name"] = name
    with db() as con:
        profile = con.execute(
            "SELECT slug, creator_name, purpose, phone FROM ais WHERE email=? ORDER BY id DESC LIMIT 1",
            (email,)
        ).fetchone()
    return jsonify(
        ok=True, email=email, name=name, message="Google login successful",
        username=(profile["creator_name"] if profile else name),
        address=(profile["purpose"] if profile else ""),
        phone=(profile["phone"] if profile else ""),
        ai_url=(f"/ai/{profile['slug']}" if profile else "")
    )


@app.post("/api/auth/login")
def auth_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not email or not password:
        return jsonify(error="Email और password डालें"), 400
    ph = hashlib.sha256(password.encode()).hexdigest()
    with db() as con:
        row = con.execute(
            "SELECT slug, owner_token_hash, password_hash, creator_name, purpose, phone FROM ais WHERE email=? AND password_hash=? ORDER BY id DESC LIMIT 1",
            (email, ph),
        ).fetchone()
    if not row or not row["password_hash"]:
        return jsonify(error="गलत email या password"), 401
    session.permanent = True
    session["user_email"] = email
    session["owner_slug"] = row["slug"]
    return jsonify(
        ok=True, email=email, slug=row["slug"],
        username=row["creator_name"], address=row["purpose"], phone=row["phone"] or "",
        ai_url=f"/ai/{row['slug']}"
    )


@app.post("/api/auth/forgot")
def auth_forgot():
    """Send real 6-digit code to email via Brevo/SMTP. Code is NEVER returned in JSON."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return jsonify(error="सही email डालें"), 400
    code = f"{secrets.randbelow(1000000):06d}"
    from datetime import timedelta
    exp = (datetime.utcnow() + timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M:%S UTC")
    with db() as con:
        con.execute(
            "INSERT INTO verify_codes (email, code, purpose, expires_at) VALUES (?, ?, 'reset', ?)",
            (email, code, exp),
        )
    sent, status = send_verification_code(email, code)
    if not sent:
        # Do not leak code. Tell user to configure email.
        return jsonify(
            error="Email भेजने में समस्या। Render Environment में BREVO_API_KEY और MAIL_FROM सही set करें।",
            detail=status,
        ), 503
    return jsonify(
        ok=True,
        message=f"We sent a 6-digit code to {email}. It expires in 15 minutes.",
    )


@app.post("/api/auth/reset")
def auth_reset():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    new_pass = (data.get("password") or "").strip()
    if not email or not code or len(new_pass) < 6:
        return jsonify(error="Email, code और नया password (6+) डालें"), 400
    with db() as con:
        row = con.execute(
            """SELECT id FROM verify_codes
               WHERE email=? AND code=? AND purpose='reset' AND used=0
               ORDER BY id DESC LIMIT 1""",
            (email, code),
        ).fetchone()
        if not row:
            return jsonify(error="गलत या expired code"), 400
        ph = hashlib.sha256(new_pass.encode()).hexdigest()
        con.execute(
            "UPDATE ais SET password_hash=? WHERE email=?",
            (ph, email),
        )
        con.execute("UPDATE verify_codes SET used=1 WHERE id=?", (row["id"],))
    return jsonify(ok=True, message="Password update हो गया। अब नए password से login करें।")



@app.get("/api/auth/me")
def auth_me():
    """Current logged-in user — used to skip login screen."""
    email = (session.get("user_email") or "").strip().lower()
    if not email:
        return jsonify(ok=False, logged_in=False)
    name = session.get("google_name") or email.split("@")[0]
    with db() as con:
        profile = con.execute(
            "SELECT slug, creator_name, purpose, phone FROM ais WHERE email=? ORDER BY id DESC LIMIT 1",
            (email,)
        ).fetchone()
    return jsonify(
        ok=True, logged_in=True, email=email, name=name,
        slug=(profile["slug"] if profile else session.get("owner_slug") or ""),
        username=(profile["creator_name"] if profile else name),
        address=(profile["purpose"] if profile else ""),
        phone=(profile["phone"] if profile else ""),
        ai_url=(f"/ai/{profile['slug']}" if profile else ""),
        letter=(email[0] if email else "G").upper(),
    )


@app.post("/api/auth/logout")
def auth_logout():
    session.clear()
    return jsonify(ok=True, message="Logged out")


@app.get("/api/my-links")
def my_links():
    """Permanent AI links for this user — never deleted by the app."""
    email = (request.args.get("email") or session.get("user_email") or "").strip().lower()
    if not email:
        return jsonify(links=[])
    with db() as con:
        rows = con.execute(
            """SELECT slug, full_url, creator_name, created_at
               FROM link_history WHERE email=? ORDER BY id DESC""",
            (email,),
        ).fetchall()
    return jsonify(
        links=[
            {
                "slug": r["slug"],
                "full_url": r["full_url"],
                "name": r["creator_name"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    )



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
