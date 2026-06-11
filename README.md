# AI — Emergency Voice Detection System

ระบบตรวจจับเสียงฉุกเฉินด้วย AI สำหรับผู้ดูแลผู้สูงอายุและผู้ป่วย  
ESP32 บันทึกเสียง → MQTT → MQTT Audio Receiver → Python AI Server → Go Backend → Next.js Frontend

---

## สถาปัตยกรรมระบบ (System Architecture)

```
┌─────────────────────────────────┐
│  ESP32 + INMP441 Microphone     │
│  (I2S 16kHz, mono, 16-bit PCM) │
└────────────┬────────────────────┘
             │ WiFi · MQTT topic: voice/audio/{deviceId}
             ▼
┌─────────────────────────────────┐
│  Mosquitto MQTT Broker          │
│  Port 1883 (TCP) / 9001 (WS)   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  MQTT Audio Receiver (Python)   │
│  (Receives audio from MQTT)     │
│  Forwards to AI Server          │
└────────────┬────────────────────┘
             │ HTTP POST /need-help
             ▼
┌─────────────────────────────────┐
│  Python AI Server  (FastAPI)    │
│  Port 8000                      │
│  ├─ BCResNet binary classifier  │
│  │   (best_sens_model.pth)      │
│  └─ Fallback: Whisper + keyword │
└────────────┬────────────────────┘
             │ JSON result
             ▼
┌─────────────────────────────────┐
│  Go Backend  (Fiber)            │
│  Port 8080                      │
│  ├─ Auth (Auth0 OAuth2)         │
│  ├─ REST API                    │
│  └─ WebSocket for Frontend      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Next.js Web Dashboard          │
│  Port 3000                      │
│  Dashboard / History / Devices  │
└─────────────────────────────────┘
```

---

## Data Flow (รายละเอียด)

```
1. ESP32 บันทึกเสียง I2S 16kHz
   └── publish binary PCM ทุก 2 วินาที
       MQTT topic: voice/audio/{deviceId}

2. Mosquitto MQTT Broker รับ message

3. MQTT Audio Receiver (mqtt_audio_receiver.py)
   ├── subscribe voice/audio/#
   ├── รับ binary PCM data
   └── ส่ง HTTP POST ไปยัง AI Server (/need-help)

4. Python AI Server (app.py / detect.py)
   ├── โหลด audio → resample → MelSpectrogram
   ├── BCResNet inference → probability score
   └── return JSON: {"detected": "yes"|"no", "probability": 0.9998}

5. Go Backend (mqtt_service.go)
   ├── รับ JSON จาก AI Server
   ├── บันทึกลง PostgreSQL
   ├── ส่ง WebSocket event ไปยัง Next.js frontend
   └── (TODO) LINE Notify / push notification

6. Next.js Frontend
   └── แสดงผลข้อมูลแบบ Real-time บน Dashboard
```

---

## 🚀 Getting Started (สำหรับนักพัฒนา)

### Prerequisites

- **Go** 1.21+
- **Python** 3.11+ (แนะนำให้ใช้ Virtual Environment)
- **Node.js** 20+
- **Docker Desktop** (สำหรับ Mosquitto และ PostgreSQL)
- **Flutter** 3.22+ (สำหรับ Mobile App)

### 1. การตั้งค่าโครงสร้างพื้นฐาน (Infrastructure)

รันฐานข้อมูลและ MQTT Broker ด้วย Docker:

```powershell
docker-compose up -d
```

### 2. การตั้งค่า Backend (Go)

```powershell
cd go_backend
# คัดลอก .env.example และตั้งค่าให้ถูกต้อง
go run main.go
```

**การรัน Unit Test:**
```powershell
go test ./...
```

### 3. การตั้งค่า AI Server (Python)

```powershell
cd backend_ai
# แนะนำให้ใช้ venv
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python mqtt_audio_receiver.py
```

### 4. การตั้งค่า Frontend (Next.js)

```powershell
cd frontend
npm install
npm run dev
```

### 5. การตั้งค่า Mobile App (Flutter)

```powershell
cd mobile
flutter pub get
flutter run
```

---

## 🧪 Testing Strategy

ระบบมีแผนการทำสอบแบ่งเป็น 3 ส่วน:
1. **Backend Unit Tests:** ตรวจสอบ Logic ของ API และการคำนวณต่างๆ
2. **AI Model Validation:** ทดสอบความแม่นยำของ BCResNet ด้วยไฟล์เสียงตัวอย่างในโฟลเดอร์ `negative`
3. **Integration Test:** ทดสอบการไหลของข้อมูลตั้งแต่ ESP32 -> MQTT -> AI -> Go -> Frontend

---

## API Reference

### Python AI Server (`POST /need-help`)

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| Method       | `POST`                                       |
| URL          | `http://localhost:8000/need-help`            |
| Content-Type | `multipart/form-data`                        |
| Form field   | `sound` — WAV file (16kHz, mono, 16-bit PCM) |

**Response:**

```json
{ "detected": "yes", "probability": 0.9998 }
```

### Go Backend

| Route | Method | Description |
| :--- | :---: | :--- |
| **[Authentication]** | | |
| `/api/auth/login` | `POST` | เข้าสู่ระบบด้วย Email / Password (ระบบของตัวเอง) |
| `/api/auth/google` | `POST` | เข้าสู่ระบบด้วย Google Sign-In (ส่ง ID Token มาทวนสอบ) |
| `/api/auth/logout` | `POST` | ออกจากระบบ (ล้าง Token / Session) |
| `/api/user/profile` | `GET`  | ดึงข้อมูลโปรไฟล์ผู้ใช้งาน (ต้องแนบ JWT Token) |
| | | |
| **[Audio Management]** | | |
| `/api/audio/emergency` | `POST` | รับไฟล์เสียงฉุกเฉินจาก Python AI มาบันทึก และส่งแจ้งเตือน |
| `/api/audio/negative` | `POST` | รับไฟล์เสียงปกติจาก Python AI มาบันทึก (คุมโควตา 10 ไฟล์ล่าสุดอัตโนมัติ) |
| `/api/audio` | `GET`  | ดึงรายชื่อไฟล์เสียง .wav ทั้งหมดเพื่อไปแสดงบนหน้าเว็บ |
| `/api/audio/:filename` | `GET`  | สตรีมมิ่ง/กดเล่นไฟล์เสียงจากหน้าเว็บ Dashboard |
| `/api/audio/:filename` | `DELETE`| ลบไฟล์เสียงออกจากระบบผ่านหน้าเว็บ |
---

## ESP32 Firmware

**Hardware:**

- ESP32 DevKit V1
- INMP441 MEMS Microphone (I2S)

**Pin Configuration:**

| Pin                | GPIO | หน้าที่                   |
| ------------------ | ---- | ------------------------- |
| SCK (Serial Clock) | 26   | I2S Clock                 |
| WS (Word Select)   | 25   | L/R Channel               |
| DIN (Data In)      | 22   | Audio data จาก INMP441    |
| Status LED         | 2    | RED LED — WiFi connected  |
| Record LED         | 4    | GREEN LED — กำลังบันทึก     |
| SoftAP LED         | 14   | YELLOW LED — SoftAP Mode  |

**Network:** ESP32 สร้าง Soft-AP (`SmartVoice_AP`) → PC เชื่อมต่อ → ESP32 ได้ IP `192.168.4.1`  
**MQTT Broker:** `192.168.4.2:1883`  
**Audio Specs:** 16kHz, mono, 16-bit PCM (อ่าน 32-bit I2S แล้ว shift เป็น 16-bit)

---

## Branch Strategy

| Branch             | เนื้อหา                                              |
| ------------------ | ---------------------------------------------------- |
| `main`             | Production-ready code รวมทุกส่วน                     |
| `python-ai-server` | Python AI server + Go backend + ESP32 + mobile (แยก) |
| `golangBackend`    | Go backend เก่า                                      |
| `dev`              | Development branch                                   |

---
