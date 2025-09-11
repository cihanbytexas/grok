from fastapi import FastAPI
from pydantic import BaseModel
import requests
import os

app = FastAPI()

# Vercel env variable: GROQ_API_KEY
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Kullanıcı bazlı hafıza
user_memory = {}

class Message(BaseModel):
    user_name: str
    message: str
    personality: str = ""  # opsiyonel

@app.post("/")
def chat(msg: Message):
    history = user_memory.get(msg.user_name, [])

    # Sistem prompt
    system_prompt = msg.personality or f"""
    Sen EnForce Discord botusun. Kullanıcı adı: {msg.user_name}.
    Dostane, yardımsever ve gerektiğinde hafif sarkastik ol.
    Komutlar ve hata çözümü hakkında bilgi ver.
    """

    history.append({"role": "user", "content": msg.message})

    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "system", "content": system_prompt}] + history
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    response = requests.post(GROQ_URL, headers=headers, json=payload)

    if response.status_code == 200:
        try:
            reply = response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            return {"error": f"AI yanıtı işlenemedi: {str(e)}"}
        
        history.append({"role": "assistant", "content": reply})
        user_memory[msg.user_name] = history[-15:]  # son 15 mesaj
        return {"reply": reply}
    else:
        return {"error": f"Groq API hatası: {response.status_code} - {response.text}"}
