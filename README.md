# Gyan AI Builder — stable links + Neon database

This build keeps generated AI slugs in a separate PostgreSQL database when `DATABASE_URL` is set. Redeploying the Render web service updates code without recreating the database, so existing `/ai/<slug>` URLs remain the same as long as the Render service hostname and database records are retained.

## One required new Render setting

1. Create a Neon project at https://neon.com/.
2. Copy the PostgreSQL connection string (not an API key). It usually starts with `postgresql://` or `postgres://` and includes its password.
3. In Render → your existing web service → Environment, add `DATABASE_URL` and paste that full connection string. Do not paste it into public code, GitHub, chat, or the browser.
4. Save and deploy. Keep the service's existing environment variables; do not delete `BREVO_API_KEY`, `MAIL_FROM`, SMTP, `FLASK_SECRET_KEY`, `MASTER_ENCRYPTION_KEY`, or Google settings if you already use them.

`render.yaml` marks `DATABASE_URL` as `sync: false`; it will not overwrite your secret.

## Important migration warning

At startup this build attempts a non-destructive, conflict-safe import from `ai_builder.db` if that file is present on the service filesystem. It never deletes the SQLite source file. Render Free filesystems are ephemeral, so this automatic import cannot guarantee recovery of records that are no longer present in the deployed filesystem. **Before deploying to Neon, export/download the current SQLite database if it contains live users' links.** If you cannot access that file, do not assume existing records were migrated. Once records are in Neon, normal code redeploys do not reset them.

## Preserved behavior

- Every new AI receives its own random slug and link.
- One active AI per normalized mobile number.
- After deleting an AI, the same mobile number is blocked from creating another for 24 hours.
- Deleting an AI removes its chats and private AI settings, but retains link history.
- The app continues attempting to email the generated link via its existing Brevo/SMTP configuration. The email is not removed; delivery still depends on a valid sender/provider configuration.
- The AI-link opening overlay is white with centered Gyan AI branding and STRATISSOFT.
- Custom styling/configuration remains scoped to an individual AI; protected API connection controls and deletion checks remain server-side.

## Existing environment variables

Only add `DATABASE_URL` if the other settings already exist and work. Email delivery still needs `BREVO_API_KEY` + verified `MAIL_FROM`, or valid SMTP settings. `MASTER_ENCRYPTION_KEY` must remain the same if encrypted provider keys already exist; changing it can make old encrypted keys unreadable.

---


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


Google login fix: the redirect-return handler reads the saved nonce from `sessionStorage` (`gyan_google_nonce`) before posting the Google ID token to `/api/auth/google`. This fixes the JavaScript `ReferenceError: nonce is not defined` and preserves the server-side nonce verification.
