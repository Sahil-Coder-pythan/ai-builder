# AI Builder (v3) — Clean + Fast Connect + Grok-like Voice

## Deploy (GitHub → Render)

1. Extract ZIP.
2. Upload **exactly** these to repo **root**:
   - `app.py`
   - `requirements.txt`
   - `render.yaml`
   - `README.md`
   - **`public/`** folder (with all files inside it)

3. Render → New Web Service → connect this repo.
4. Environment variables:
   - `FLASK_SECRET_KEY` = any long random string
   - `MASTER_ENCRYPTION_KEY` = run this locally and paste:
     ```
     python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
     ```

5. Build: `pip install -r requirements.txt`  
   Start: `gunicorn app:app`

## How to use

1. Open site → enter username + email → Generate AI → get link.
2. Open AI link → left ☰ → **API Settings**
3. Fill:
   - Base URL: `https://api.groq.com/openai/v1`
   - Model: `openai/gpt-oss-20b`  (or `llama-3.3-70b-versatile`)
   - API Key: your Groq key
4. **सेव / कनेक्ट** → should say **कनेक्शन सफल! ✅ Fast & Ready**
5. Type message OR press **Speak** (Grok-style) → talk → AI answers in text + voice.

## Test models (Groq)

| Model | Notes |
|-------|--------|
| `openai/gpt-oss-20b` | Fast, good default |
| `openai/gpt-oss-120b` | Stronger |
| `llama-3.3-70b-versatile` | If still available on your plan |
| `llama-3.1-8b-instant` | Very fast |

## Notes

- API key stays on the device (localStorage). History is per-device.
- Render free tier wipes SQLite on redeploy — create AI again if link dies.
- Voice uses browser Web Speech API (best on Chrome/Edge). Exact Grok neural voice is not possible from a website.
