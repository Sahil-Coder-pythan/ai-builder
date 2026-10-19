# GyanAI Builder

## नया फ्लो (UI only — real Google OAuth later)

1. लिंक खोलो → **Google जैसा Sign-in पेज** → Gmail ID डालो → Next
2. फिर 4 फील्ड: **Gmail ID, Mobile Number, Username, Address** → Done
3. फिर सिर्फ **Search box** खुलेगा → वहाँ लिखो **Create Your AI model** → Enter
4. थोड़ा thinking animation → लिंक मिल जाएगा
5. लिंक पर क्लिक → पूरा AI चैट खुल जाएगा (जैसा पहले था)
6. AI के अंदर **left side ☰** → API Key, URL, Model डालो

> Real Google Login / Client ID अभी नहीं जोड़ा गया। शाम को अलग से add कर सकते हो।

## Render पर डिप्लॉय

1. ये सारी फाइलें अपने GitHub repo के root में डालो:
   - app.py
   - requirements.txt
   - render.yaml
   - README.md
   - public/ फोल्डर (index.html, chat.html, style.css, app.js)

2. Render.com → **New → Web Service** → अपना GitHub repo कनेक्ट करो

3. Environment में ये secret जोड़ो:
   - `FLASK_SECRET_KEY` (Render generate कर सकता है)
   - `MASTER_ENCRYPTION_KEY`

   Value बनाने के लिए:
   ```
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

4. Build: `pip install -r requirements.txt`
5. Start: `gunicorn app:app`

## लोकल रन

```
pip install -r requirements.txt
python app.py
```

फिर http://localhost:5000 खोलो।

## नोट

* API key सर्वर पर encrypt होकर सेव होती है।
* Phone / Email public chat में नहीं दिखते।
* Username creator name के रूप में AI में दिखता है।
* Address purpose फील्ड में store होता है।
* SQLite इस्तेमाल हो रहा है। Render पर permanent रखने के लिए Persistent Disk लगाना बेहतर है।
