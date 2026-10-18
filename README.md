# AI Builder (Final)

## File map

```
/
├── app.py
├── requirements.txt
├── render.yaml
├── README.md
└── public/
    ├── index.html
    ├── chat.html
    ├── style.css
    ├── app.js
    ├── known_urls.json
    └── known_models.json
```

## What this build does

- Generate AI with Username, Email, Phone, Address
- Phone & Email never sent to public API / never shown to other users
- History is **per device** (localStorage) — another phone opening same link will NOT see your chats
- `database.json` can be downloaded from AI Settings
- API URL/Model/Key saved on device (and optionally server)
- Fast connect via known_urls.json + known_models.json suggestions
- System prompt:
  - Who created this AI → username, address, date, AI Builder tool
  - Tool maker → Sahil / Stratis Soft only
  - Other Sahil personal questions → refused
- AI Settings: theme, voice, privacy toggles, chat options (~20 controls)
- Voice: Web Speech API (Microsoft voices when OS provides them)
- Responses: headings + emojis via system prompt + frontend formatting

## Deploy (Render)

1. Upload all files to GitHub (map above)
2. New Web Service → connect repo
3. Env: `FLASK_SECRET_KEY` (generate), `MASTER_ENCRYPTION_KEY` (Fernet key)
4. Build: `pip install -r requirements.txt`
5. Start: `gunicorn app:app`

## Note

Browsers cannot write into Android File Manager silently. History is stored in the browser (localStorage) and exportable as `database.json`.
