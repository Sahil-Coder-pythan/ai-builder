# Gyan AI Builder (Stratic Soft)

Professional login + AI creator. Real email verification via **Brevo**.

## Render Environment Variables (required)

Copy from your working tool (ai-router) where possible:

| KEY | VALUE | Notes |
|-----|--------|--------|
| **BREVO_API_KEY** | your Brevo API key | Same as first tool — real verification emails |
| **MAIL_FROM** | `Gyan AI <you@verified-domain.com>` or plain email | Must be a **verified sender** in Brevo |
| **GOOGLE_CLIENT_ID** | `xxxx.apps.googleusercontent.com` | Google Cloud → OAuth Web client |
| **GOOGLE_CLIENT_SECRET** | (optional for GIS) | Same project as Client ID |
| **FLASK_SECRET_KEY** | random long string | Session cookies |
| **MASTER_ENCRYPTION_KEY** | optional Fernet key | Encrypts API keys at rest |

### Optional (SMTP fallback if no Brevo)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

### Google OAuth fix (invalid_client)
1. Google Cloud Console → Credentials → OAuth 2.0 Client (Web)
2. **Authorized JavaScript origins**: `https://YOUR-SERVICE.onrender.com`
3. Paste Client ID into Render `GOOGLE_CLIENT_ID`
4. Manual Deploy after saving env

## Flow
1. Welcome back → Google or Email + Password
2. Forgot password → code **only in Gmail** (never on screen)
3. Create account → Create your AI (~5 min) → permanent link in History
4. Open AI → Settings → Grok/Groq API + ElevenLabs

## Deploy
```
pip install -r requirements.txt
gunicorn app:app
```
