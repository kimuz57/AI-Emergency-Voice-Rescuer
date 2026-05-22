import os
from dotenv import load_dotenv

# 🟢 โหลดไฟล์ .env เข้าสู่ระบบ
load_dotenv()

# ฟังก์ชันเซฟตี้: เช็คว่าลืมใส่ค่าตัวแปรใน .env ไหม ถ้าลืมให้แจ้ง Error ทันที
def get_env_required(key: str) -> str:
    value = os.getenv(key)
    if value is None or value.strip() == "":
        raise ValueError(f"🚨 CRITICAL ERROR: Environment variable '{key}' is not set in .env file!")
    return value

# ==========================================
# 1. การตั้งค่า Audio (ดึงจาก .env ถ้าไม่มีให้ใช้ค่า Default 16000 และ 3)
# ==========================================
SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", 16000))
DURATION_SEC = int(os.getenv("DURATION_SEC", 2))

# ==========================================
# 2. การตั้งค่า MQTT (ดึงจาก .env)
# ==========================================
MQTT_BROKER_HOST = get_env_required("MQTT_BROKER_HOST")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))

# ==========================================
# 3. การตั้งค่า AI Server URL (ดึงจาก .env)
# ==========================================
AI_SERVER_URL = get_env_required("AI_SERVER_URL")

# ==========================================
# 4. การตั้งค่า MelSpectrogram (ย้ายมาจาก app.py)
# ==========================================
# รวมการตั้งค่าตัวแปรของ librosa หรือโมเดลมาไว้ที่นี่ที่เดียว
MEL_SPECTROGRAM_CONFIG = {
    "sr": SAMPLE_RATE,
    "n_fft": 512,
    "win_length": 400,
    "hop_length": 160,
    "n_mels": 128
}
# ==========================================
# 5. การตั้งค่าระบบสำรอง (detect.py / Whisper)
# ==========================================
EMERGENCY_THRESHOLD = float(os.getenv("EMERGENCY_THRESHOLD", 0.35))
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")

print("✅ Configuration loaded successfully.")