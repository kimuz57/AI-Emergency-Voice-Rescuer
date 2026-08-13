# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Emergency Voice Detection System** — ระบบตรวจจับเสียงฉุกเฉินด้วย AI สำหรับผู้ดูแลผู้สูงอายุและผู้ป่วย

This is a full-stack IoT + AI system that detects emergency voice patterns in real-time using ESP32 hardware, Python AI server, Go backend, and Next.js frontend.

**Team:**
- นนท์ (Product Lead / Frontend)
- กิต (Backend Lead / Go+Redis+DevOps)
- อัง (Hardware & AI - ESP32+INMP441 x4, DSP Pipeline, BCResNet)

---

## System Architecture

```
ESP32 + INMP441 Mic (16kHz I2S)
    ↓ WiFi MQTT (voice/audio/{deviceId})
Mosquitto MQTT Broker (Port 1883)
    ↓
MQTT Audio Receiver (Python)
    ↓ HTTP POST /need-help
Python AI Server (FastAPI Port 8000)
    ├─ BCResNet binary classifier (best_sens_model.pth)
    └─ Fallback: Whisper + keyword detection
    ↓ JSON result
Go Backend (Fiber Port 8080)
    ├─ PostgreSQL (GORM)
    ├─ REST API
    ├─ SSE (Server-Sent Events) for real-time updates
    └─ LINE Bot / Telegram notifications
    ↓ SSE Stream
Next.js Frontend (Port 3000)
    └─ Real-time dashboard with alert monitoring
```

**Key Ports:**
- MQTT: 1883 (TCP), 9001 (WebSocket), 8083 (WSS)
- Python AI: 8000
- Go Backend: 8080
- Next.js: 3000

---

## Common Commands

### Starting All Services (Windows)

```powershell
# One-click launcher (opens 3 separate terminal windows)
start_guardian.bat
```

This batch script will:
1. Start Mosquitto MQTT via Docker
2. Start Python MQTT Audio Receiver
3. Start Go Backend (Port 8080)
4. Start Next.js Frontend (Port 3000)

### Manual Service Startup

**MQTT Broker:**
```powershell
docker-compose up -d
```

**Python AI Server:**
```powershell
cd backend_ai
# Activate virtual environment first
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

**Go Backend:**
```powershell
cd go_backend
go run .
# Or: go run main.go
```

**Next.js Frontend:**
```powershell
cd frontend
npm install  # first time only
npm run dev  # starts on http://localhost:3000
```

### Development Commands

**Frontend (Next.js):**
```powershell
cd frontend
npm run dev      # Development server with hot reload (binds to 0.0.0.0)
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint check
```

**Go Backend:**
```powershell
cd go_backend
go run .            # Run with hot reload
go build            # Compile binary
go mod tidy         # Clean up dependencies
go test ./...       # Run all tests
```

**ESP32 Firmware:**
```powershell
cd esp32
idf.py build        # Build firmware
idf.py flash        # Flash to device
idf.py monitor      # View serial output
idf.py flash monitor  # Flash and monitor combined
```

### Testing AI Server

```powershell
# Test emergency detection endpoint
python -c "
import requests
r = requests.post('http://localhost:8000/need-help',
    files={'sound': ('help.wav', open('backend_ai/samples/help.wav','rb'), 'audio/wav')})
print(r.json())
"
```

Expected response: `{"detected": "yes", "probability": 0.9998}`

---

## Code Architecture

### 1. Frontend (Next.js + React)

**Tech Stack:** Next.js 16.2.3, React 19.2.4, TypeScript, Tailwind CSS 4

**Key Pages:**
- `/app/dashboard/page.tsx` — Real-time alert monitoring with SSE (Server-Sent Events)
- `/app/device/page.tsx` — Device management and status monitoring (online/offline)
- `/app/patients/page.tsx` — Patient registry and management
- `/app/history/page.tsx` — Alert history and audio playback

**Real-time Data Flow:**
- Uses **SSE (Server-Sent Events)** for real-time updates, NOT WebSockets
- SSE endpoints: `/api/alerts/stream`, `/api/patients/stream`, `/api/device/stream`
- Authentication: Passes `email` and `token` in URL query params
- Pattern: `EventSource` connection → `onmessage` handler → React state update

**Important Components:**
- `CustomAudioPlayer.tsx` — Audio player for 16kHz emergency recordings
- `AlertBanner.tsx` — Red blinking alert notifications
- `Navbar.tsx` — Navigation with dark mode toggle

**Authentication:**
- Uses `next-auth` for session management
- Token stored in `localStorage.getItem("token")` and cookie `token_public`
- User email stored in `localStorage.getItem("userEmail")`

### 2. Go Backend (Fiber)

**Tech Stack:** Go 1.26.2, Fiber v2.52.12, GORM, PostgreSQL

**Key Files:**
- `main.go` — Application entry point
- `mqtt_service.go` — MQTT subscriber for device status and audio
- Database models: User, Device, Alert, UserLineMapping, UserTelegramMapping

**API Patterns:**
- REST endpoints for CRUD operations
- SSE (Server-Sent Events) for real-time frontend updates
- JWT authentication with Auth0 OAuth2 support
- MQTT integration for device communication

**Critical Routes:**
- `POST /api/audio/emergency` — Receive emergency audio from AI server
- `POST /api/audio/negative` — Receive normal audio (quota: 10 latest)
- `GET /api/alerts/stream` — SSE stream for real-time alerts (requires `?email=...&token=...`)
- `GET /api/patients/stream` — SSE stream for patient list
- `GET /api/device/stream` — SSE stream for device status

### 3. Python AI Server (FastAPI)

**Tech Stack:** Python 3.12+, FastAPI, PyTorch 2.0+, torchaudio

**Key Components:**
- `app.py` — FastAPI server with `/need-help` endpoint
- `detect.py` — BCResNet model inference
- `mqtt_audio_receiver.py` — MQTT subscriber that forwards audio to AI server
- `models/best_sens_model.pth` — Pre-trained BCResNet model (REQUIRED)

**Audio Processing:**
- Input: 16kHz, mono, 16-bit PCM WAV
- MelSpectrogram extraction using nnAudio
- Binary classification: emergency vs. normal
- Fallback: Whisper ASR + keyword matching

### 4. ESP32 Firmware

**Hardware:**
- ESP32 DevKit V1
- INMP441 MEMS Microphone (I2S interface)

**Pin Configuration:**
- I2S SCK: GPIO 26
- I2S WS: GPIO 25
- I2S DIN: GPIO 22
- Status LED (Red): GPIO 2
- Record LED (Green): GPIO 4
- SoftAP LED (Yellow): GPIO 14

**Audio Specs:**
- 16kHz sampling rate
- Mono channel
- 16-bit PCM (reads 32-bit I2S, right-shifts to 16-bit)

**Network:**
- Creates Soft-AP: `SmartVoice_AP`
- ESP32 IP: `192.168.4.1`
- MQTT Broker: `192.168.4.2:1883`

---

## Future Architecture (Phase 3 - In Progress)

The system is migrating to a new architecture with:
- **4 microphones** for spatial audio detection
- **DSP Pipeline** for advanced signal processing
- **Redis** for high-performance message queue (replacing MQTT for some flows)

**Phase 3 Tasks (Frontend - นนท์):**
1. Update Dashboard for real-time Alert status with **red blinking lights** and **patient coordinates**
2. Build **Waveform Audio Player** for 16kHz evidence playback with visual waveform
3. Improve UX for:
   - Patients Registry page (add/edit/delete patients)
   - Device Telemetry page (online/offline status visualization)

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code (all components) |
| `python-ai-server` | Python AI + Go backend + ESP32 + mobile (separate) |
| `golangBackend` | Legacy Go backend |
| `dev` | Development branch |

---

## Important Notes

### Frontend Development
- Next.js 16 uses App Router (NOT Pages Router)
- Always check `node_modules/next/dist/docs/` for breaking changes
- SSE pattern is preferred over WebSockets for real-time updates
- Dark mode uses `next-themes` library
- Tailwind CSS 4 is used (check syntax if migrating from v3)

### Backend Development
- Go uses Fiber framework (NOT Gin or Echo)
- Database ORM is GORM
- MQTT client: `github.com/eclipse/paho.mqtt.golang`
- SSE implementation: Custom handlers, NOT third-party libraries

### Audio Handling
- All audio MUST be 16kHz, mono, 16-bit PCM
- WAV format is preferred for frontend playback
- Python AI expects `multipart/form-data` with field name `sound`

### ESP32 Development
- Build system: ESP-IDF v4.4+ (NOT Arduino framework)
- MQTT topic pattern: `voice/audio/{deviceId}` for audio, `device/status/{deviceId}` for telemetry
- LED patterns: Red (WiFi connected), Green (recording), Yellow (SoftAP mode)

---

## Common Issues

**Frontend SSE not connecting:**
- Verify `userEmail` is in localStorage
- Check token validity (`getAuthToken()` helper)
- Ensure backend SSE endpoint includes `?email=...&token=...`

**Go Backend MQTT connection failed:**
- Verify Mosquitto Docker is running: `docker ps`
- Check MQTT broker URL in `.env` file
- Test with MQTT Explorer tool

**ESP32 not recording:**
- Check I2S pin configuration (GPIO 26, 25, 22)
- Verify INMP441 wiring (3.3V power, GND, L/R pin)
- Monitor serial output: `idf.py monitor`

**AI Server model not found:**
- Ensure `best_sens_model.pth` exists in `backend_ai/models/`
- Check Python dependencies: `pip install -r requirements.txt`

---

## File Locations

- **AI Model:** `backend_ai/models/best_sens_model.pth` (NOT in git, must download separately)
- **Environment Variables:** `go_backend/.env` (contains DB credentials, MQTT config, LINE tokens)
- **Audio Samples:** `backend_ai/samples/` (test WAV files)
- **Device Status Storage:** PostgreSQL `devices` table
- **Alert History:** PostgreSQL `alerts` table
