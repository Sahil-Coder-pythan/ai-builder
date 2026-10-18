# AI Builder — शुरुआती MVP

## GitHub/Render पर लगाना
1. ZIP extract करें।
2. `app.py`, `requirements.txt`, `render.yaml`, `README.md` और `public` folder को एक ही GitHub repository के root में upload करें।
3. Render में New + Web Service से repository connect करें। `render.yaml` की settings इस्तेमाल करें।
4. Render → Environment में `MASTER_ENCRYPTION_KEY` नाम का secret जोड़ें। इसकी value नीचे दिए गए command से बनाएँ। इसे किसी से साझा न करें:
   `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
5. Deploy करें। पहले AI बनाने के लिए सभी details और API key भरें।

## जरूरी सीमाएँ
- यह शुरुआती MVP है, production-ready multi-tenant SaaS नहीं।
- SQLite को स्थायी रखने के लिए Render पर persistent disk configure करना जरूरी है; इस starter में disk mount स्वचालित रूप से नहीं जोड़ा गया है।
- फोन नंबर unique है, लेकिन SMS OTP verification नहीं है।
- सार्वजनिक AI link रखने वाला व्यक्ति चैट कर सकता है। सार्वजनिक लिंक पर rate limits / abuse controls जोड़ने से पहले इसे बड़े स्तर पर लॉन्च न करें।
- API keys server-side encrypted रखी जाती हैं। `MASTER_ENCRYPTION_KEY` खोने पर पहले से सेव keys decrypt नहीं होंगी; इसका सुरक्षित backup रखें।
- API provider का Base URL OpenAI-compatible `/chat/completions` endpoint होना चाहिए। हर provider का हर मॉडल समर्थित नहीं होता।
- API key को कभी GitHub में न डालें। केवल HTTPS पर इस्तेमाल करें।
