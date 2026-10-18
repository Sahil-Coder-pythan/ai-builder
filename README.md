# AI Builder — Subsook AI

## Features
- Generate a unique AI link with username, email-format field, phone number and address.
- Each AI stores its own creator details and creation date.
- The chat assistant can answer who created that AI and identify the AI Builder tool.
- Configure an OpenAI-compatible provider URL, exact model ID and API key in the creator session.
- Chat history is stored in the app's SQLite database, separated by AI.
- API keys are encrypted when `MASTER_ENCRYPTION_KEY` is configured.
- Email is currently format-checked only. Google/Gmail verification is NOT enabled in this prototype.

## Deploy on Render
Upload these files to the root of a GitHub repository:
- `app.py`
- `requirements.txt`
- `render.yaml`
- `README.md`
- `public/` (all files inside)

Create a Render Web Service from the repository. Add these environment variables:
- `FLASK_SECRET_KEY` (Render can generate this)
- `MASTER_ENCRYPTION_KEY` (generate using the command below)

Generate the encryption key locally:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Build command:
```bash
pip install -r requirements.txt
```
Start command:
```bash
gunicorn app:app
```

## Important limitations
- The current email field does not verify that a Gmail inbox exists. Google OAuth login can be added separately later.
- A normal website cannot silently create a file inside the visitor's Android File Manager. Chats are saved in the server-side SQLite database instead.
- Render's default filesystem may be temporary. Add a persistent disk and configure the database path before relying on long-term chat retention.
- A model works only if its provider supports the supplied base URL, API key, exact model ID and request format. This app uses the OpenAI-compatible Chat Completions API; it cannot guarantee every vendor/model supports that interface.
- Anyone with an AI link can use its chat/history endpoints in this prototype. Treat links as shareable access links and do not store sensitive data until proper authentication and access controls are added.
