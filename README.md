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
1. Sign in with verified Google ID token, or email + password.
2. After login, the profile page shows name, address, email and phone. Existing AI owners are sent to their existing AI link instead of creating a duplicate.
3. New users fill their profile, then select Create your AI.
4. A mobile number can be used for only one AI (enforced by a database uniqueness constraint).
5. When an AI is created, the app attempts to email its link through Brevo/SMTP and reports whether delivery was accepted.
6. Open AI → Settings → Grok/Groq API + ElevenLabs.

## Important email notes
- Google does not guarantee a Gmail security notification for every sign-in. The app cannot force Google's own account-security alerts.
- The app's AI-link email is a separate, real transactional email and requires `BREVO_API_KEY` + a verified `MAIL_FROM`, or working SMTP environment variables.
- Google ID tokens are accepted only after official signature/audience/expiry verification; unsigned-token fallback is disabled.
- Creator identity answers use the public creator name/address provided in the profile. Phone numbers and email addresses are refused and are not included in the AI model prompt.
- Questions about AI Builder receive only this public description: Sahil created AI Builder; company name Stratic Soft; no further internal details.

## Deploy
```
pip install -r requirements.txt
gunicorn app:app
```
