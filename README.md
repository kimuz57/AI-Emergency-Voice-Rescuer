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

## Quick Start

### Prerequisites

- Python 3.11+, Go 1.21+, Node.js 20+, Flutter 3.10+
- Docker (สำหรับ Mosquitto)
- `best_sens_model.pth` วางไว้ที่ `backend_ai/models`

### 1. เริ่ม MQTT Broker

```powershell
docker-compose up -d
```

### 2. เริ่ม Python AI Server

```powershell
cd "C:\Project 1\main_smartvoice"
.\.venv\Scripts\Activate.ps1
cd backend_ai
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 3. เริ่ม Go Backend

```powershell
cd go_backend
go run .
# Listening on :8080
```

### 4. เริ่ม Next.js Frontend

```powershell
cd frontend
npm install
npm run dev
# http://localhost:3000
```

### 5. ทดสอบ AI Server โดยตรง

```powershell
python -c "
import requests
r = requests.post('http://localhost:8000/need-help',
    files={'sound': ('help.wav', open('backend_ai/samples/help.wav','rb'), 'audio/wav')})
print(r.json())
"
```

ผลลัพธ์ที่คาดหวัง:

```json
{ "detected": "yes", "probability": 0.9998 }
```

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
| Status LED         | 2    | Blue LED — WiFi connected |
| Record LED         | 4    | Red LED — กำลังบันทึก     |

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
