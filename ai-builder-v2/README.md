# GyanAI Builder (Clean Version)

## नया आसान फ्लो

1. लिंक खोलो → **सिर्फ ईमेल ID** डालो → **Generate AI** दबाओ  
2. बीच में professional लिंक आएगा  
3. लिंक पर क्लिक करो → पूरा AI चैट खुल जाएगा  
4. AI के अंदर **left side ☰** दबाओ → वहाँ API Key, URL, Model डालो (AI बनने के **बाद**)

## Render पर डिप्लॉय

1. ये सारी फाइलें अपने GitHub repo के root में डालो:
   - `app.py`
   - `requirements.txt`
   - `render.yaml`
   - `README.md`
   - `public/` फोल्डर (index.html, chat.html, style.css, app.js)

2. Render.com → **New → Web Service** → अपना GitHub repo कनेक्ट करो

3. Environment में ये secret जोड़ो:
   ```
   MASTER_ENCRYPTION_KEY
   ```
   Value बनाने के लिए:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

4. Deploy करो। लिंक मिल जाएगा।

## लोकल रन

```bash
pip install -r requirements.txt
python app.py
```

फिर http://localhost:5000 खोलो।

## नोट

- API key सर्वर पर encrypt होकर सेव होती है।
- सिर्फ जिस browser से AI बनाया, उसी में settings (API) दिखेंगी।
- SQLite इस्तेमाल हो रहा है। Render पर permanent रखने के लिए Persistent Disk लगाना बेहतर है।
