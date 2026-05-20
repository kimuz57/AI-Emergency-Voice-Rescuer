# Guardian AI — Emergency Voice Detection System

ระบบตรวจจับเสียงฉุกเฉินด้วย AI สำหรับผู้ดูแลผู้สูงอายุและผู้ป่วย  
ESP32 บันทึกเสียง → MQTT → Go Backend → Python AI Server → แจ้งเตือนแบบ Real-time

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
│  Go Backend  (Fiber)            │
│  Port 3001                      │
│  ├─ MQTT Subscriber             │
│  ├─ Auth (Auth0 OAuth2)         │
│  ├─ REST API                    │
│  └─ calls Python AI via exec    │
└────────────┬────────────────────┘
             │ exec detect.py / POST /need-help
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
│  Next.js Web Dashboard          │
│  Port 3000                      │
│  Dashboard / History / Devices  │
└─────────────────────────────────┘
```

---

## โครงสร้างโปรเจค (Repository Layout)

```
main_smartvoice/
├── backend_ai/                  # Python AI Server
│   ├── app.py                   #   FastAPI entry-point (BCResNet inference)
│   ├── models.py                #   BCResNet architecture definition
│   ├── detect.py                #   Whisper fallback + ML classifier bridge
│   ├── best_sens_model.pth      #   Pre-trained weights (ไม่ commit — แชร์ผ่าน kws.zip)
│   ├── requirements.txt         #   Python dependencies
│   └── samples/                 #   ตัวอย่างไฟล์เสียงสำหรับทดสอบ
│
├── go_backend/                  # Go REST Backend
│   ├── main.go                  #   Fiber app entry-point (port 3001)
│   ├── routes/routes.go         #   Route definitions
│   ├── controllers/             #   Auth0 login/callback/profile
│   ├── services/
│   │   ├── mqtt_service.go      #   MQTT subscriber + WAV builder
│   │   └── ai_runner.go         #   exec detect.py / forward to AI server
│   ├── models/user.go           #   User model (PostgreSQL)
│   ├── database/database.go     #   DB connection
│   └── go.mod
│
├── frontend/                    # Next.js Web Dashboard
│   ├── app/
│   │   ├── dashboard/           #   หน้าหลัก — รายชื่อผู้ป่วย + สถานะ
│   │   ├── history/             #   ประวัติการแจ้งเตือน
│   │   ├── devices/             #   จัดการอุปกรณ์ ESP32
│   │   ├── login/ register/     #   Authentication
│   │   └── event-details/       #   รายละเอียดเหตุการณ์ฉุกเฉิน
│   ├── components/              #   AlertBanner, WaveformAnimation, GlassCard ...
│   ├── hooks/
│   │   ├── useAuth.ts           #   Auth state management
│   │   └── useWebSocket.ts      #   Real-time alert subscription
│   └── package.json
│
├── mobile/                      # Flutter Mobile App (แยกพัฒนา — ยังไม่ได้เชื่อมต่อระบบ)
│
├── esp32/                       # ESP32 Firmware (ESP-IDF)
│   └── main/voice_recorder.c   #   I2S capture + MQTT publish + Soft-AP
│
├── mosquitto/                   # MQTT Broker config
├── docker-compose.yml           # Mosquitto Docker container
├── mqtt_audio_receiver.py       # Legacy forwarder (ใช้ตอนทดสอบโดยไม่มี Go backend)
└── README.md
```

---

## Tech Stack

| Component | Technology | Port |
|---|---|---|
| Hardware | ESP32 DevKit V1 + INMP441 (I2S 16kHz mono) | — |
| Message Broker | Eclipse Mosquitto MQTT 2 (Docker) | 1883 / 9001 |
| AI Server | Python FastAPI + BCResNet + Whisper fallback | 8000 |
| Backend | Go 1.21 + Fiber v2 + Auth0 + PostgreSQL | 3001 |
| Web Frontend | Next.js 15 + TypeScript + Tailwind CSS | 3000 |
| Mobile App | Flutter 3 (Dart) — iOS & Android | — | *(แยกพัฒนา ยังไม่เชื่อมต่อ)* |

---

## AI Model: BCResNet Binary Classifier

| ข้อมูล | รายละเอียด |
|---|---|
| Architecture | BCResNet (Broadcasted Residual Network) |
| Input | Log-Mel Spectrogram (16kHz, 2 วินาที, 128 mel bands, nnAudio) |
| Output | Binary: `yes` (emergency) / `no` (normal) |
| Parameters | ~52,000 |
| Accuracy | **94.85%** overall |
| Precision (emergency) | 93.85% |
| Precision (normal) | 95.85% |
| Threshold | 0.35 (tuned for high recall on emergency) |
| Weights file | `backend_ai/best_sens_model.pth` |

**Fallback Pipeline** (เมื่อยังไม่มี `.pth`):  
`detect.py` ใช้ [faster-whisper](https://github.com/SYSTRAN/faster-whisper) ถอดเสียงเป็นข้อความ → ค้นหา emergency keyword (ช่วย, เจ็บ, หมดสติ ฯลฯ)

---

## Data Flow (รายละเอียด)

```
1. ESP32 บันทึกเสียง I2S 16kHz
   └── publish binary PCM ทุก 3-5 วินาที
       MQTT topic: voice/audio/{deviceId}

2. Mosquitto MQTT Broker รับ message

3. Go Backend (mqtt_service.go)
   ├── subscribe voice/audio/#
   ├── ประกอบ WAV header + PCM data
   └── บันทึกไฟล์ชั่วคราว → เรียก detect.py หรือ POST /need-help

4. Python AI Server (app.py / detect.py)
   ├── โหลด audio → resample → MelSpectrogram
   ├── BCResNet inference → probability score
   └── return JSON: {"detected": "yes"|"no", "probability": 0.9998}

5. Go Backend ส่งผลลัพธ์
   ├── บันทึกลง PostgreSQL
   ├── ส่ง WebSocket event ไปยัง Next.js frontend
   └── (TODO) LINE Notify / push notification
```

---

## Quick Start

### Prerequisites
- Python 3.11+, Go 1.21+, Node.js 20+, Flutter 3.10+
- Docker (สำหรับ Mosquitto)
- `best_sens_model.pth` วางไว้ที่ `backend_ai/`

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
# Listening on :3001
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
{"detected": "yes", "probability": 0.9998}
```

---

## API Reference

### Python AI Server (`POST /need-help`)

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `http://localhost:8000/need-help` |
| Content-Type | `multipart/form-data` |
| Form field | `sound` — WAV file (16kHz, mono, 16-bit PCM) |

**Response:**
```json
{"detected": "yes", "probability": 0.9998}
```

### Go Backend

| Route | Method | Description |
|---|---|---|
| `/login` | GET | เริ่มต้น Auth0 OAuth2 flow |
| `/callback` | GET | Auth0 callback — แลก code เป็น JWT |
| `/logout` | GET | ลบ session |
| `/profile` | GET | ดึงข้อมูล user (ต้องมี JWT) |
| `/test-ai` | GET | ทดสอบเรียก AI ด้วย `samples/help.wav` |

---

## ESP32 Firmware

**Hardware:**
- ESP32 DevKit V1
- INMP441 MEMS Microphone (I2S)

**Pin Configuration:**

| Pin | GPIO | หน้าที่ |
|---|---|---|
| SCK (Serial Clock) | 26 | I2S Clock |
| WS (Word Select) | 25 | L/R Channel |
| DIN (Data In) | 22 | Audio data จาก INMP441 |
| Status LED | 2 | Blue LED — WiFi connected |
| Record LED | 4 | Red LED — กำลังบันทึก |

**Network:** ESP32 สร้าง Soft-AP (`SmartVoice_AP`) → PC เชื่อมต่อ → ESP32 ได้ IP `192.168.4.1`  
**MQTT Broker:** `192.168.4.2:1883`  
**Audio Specs:** 16kHz, mono, 16-bit PCM (อ่าน 32-bit I2S แล้ว shift เป็น 16-bit)

---

## Branch Strategy

| Branch | เนื้อหา |
|---|---|
| `main` | Production-ready code รวมทุกส่วน |
| `python-ai-server` | Python AI server + Go backend + ESP32 + mobile (แยก) |
| `golangBackend` | Go backend เก่า |
| `dev` | Development branch |

---

## Team

| คน | ส่วนรับผิดชอบ |
|---|---|
| Kittiwat | Go Backend, Database, API |
| ปุถินนท์ | Python AI/ML, ESP32, Data Pipeline |
| Ball | Flutter Mobile App (แยกพัฒนา), ESP32 Firmware |

**Deadline:** 29 พฤษภาคม 2026

---

*Last updated: 20 May 2026*
