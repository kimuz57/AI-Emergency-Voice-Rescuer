# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Emergency Voice Detection System** — ระบบตรวจจับเสียงฉุกเฉินด้วย AI สำหรับผู้ดูแลผู้สูงอายุและผู้ป่วย

This is a full-stack IoT + AI system that detects emergency voice patterns in real-time using ESP32 hardware, Python AI server, Go backend, and Next.js frontend.

**Team:**
- นนท์ (Product Lead / Frontend)
- กิต (Backend Lead / Go+Redis+DevOps)
- อัง (Hardware & AI - ESP32+INMP441, DSP Pipeline, BCResNet)

---

## Repository Layout

Folders were renamed in commit `b9492a6`. Old names may still exist on disk as
untracked leftovers (build output, `.env`) — do not edit those, they are dead.

| Directory | What it is | Old name |
|---|---|---|
| `frontend/` | Next.js 16 app (App Router) | — |
| `backend/` | Go + Fiber API | `go_backend/` |
| `api/` | Python FastAPI AI server | `backend_ai/` |
| `firmware/` | ESP32 firmware, single mic | `esp32/` |
| `firmwareV2/` | ESP32 firmware, dual mic + TDOA | new |
| `mosquitto/` | MQTT broker config for Docker | — |

---

## System Architecture

```
ESP32 + INMP441 (8kHz I2S)
    ├─ firmware/    : 1 mic, mono
    └─ firmwareV2/  : 2 mics (stereo L/R), computes TDOA on-device,
                      mixes down to mono before publishing
    ↓ WiFi MQTT
      voice/audio/{mac}    audio payload
      voice/angle/{mac}    direction angle in degrees (firmwareV2 only)
      device/status/{mac}  telemetry
Mosquitto MQTT Broker (Port 1883)
    ↓
MQTT Audio Receiver (api/mqtt_audio_receiver.py)
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
start_guardian.bat
```

⚠️ **This script is stale.** It still hardcodes `D:\backend_golang` and the
pre-rename folder names (`backend_ai`, `go_backend`). Start services manually
until someone fixes it.

### Manual Service Startup

**MQTT Broker:**
```powershell
docker-compose up -d
```

**Python AI Server:**
```powershell
cd api
# Activate virtual environment first
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

**Go Backend:**
```powershell
cd backend
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
npx tsc --noEmit # Type check only
```

**Go Backend:**
```powershell
cd backend
go run .            # Run (air config in .air.toml for hot reload)
go build            # Compile binary
go mod tidy         # Clean up dependencies
go test ./...       # Run all tests
```

**ESP32 Firmware:**
```powershell
cd firmwareV2      # or firmware/ for the single-mic build
idf.py build        # Build firmware
idf.py flash        # Flash to device
idf.py monitor      # View serial output
idf.py flash monitor  # Flash and monitor combined
```

### Testing AI Server

```powershell
python -c "
import requests
r = requests.post('http://localhost:8000/need-help',
    files={'sound': ('help.wav', open('help.wav','rb'), 'audio/wav')})
print(r.json())
"
```

Expected response: `{"detected": "yes", "probability": 0.9998}`

---

## Code Architecture

### 1. Frontend (Next.js + React)

**Tech Stack:** Next.js 16.2.3, React 19.2.4, TypeScript, Tailwind CSS 4

**Key Pages:**
- `app/dashboard/page.tsx` — Real-time alert monitoring with SSE
- `app/device/page.tsx` — Device management and status monitoring (online/offline)
- `app/patients/page.tsx` — Patient registry (list, edit, delete)
- `app/register-patient/page.tsx` — Add a patient and bind a device.
  **Cannot be removed or moved**: `firmware/main/web_server.h` hardcodes this URL
  in the ESP32 QR-code flow.
- `app/history/page.tsx` — Alert history and audio playback
- `app/admin/patients|users|register-device` — Admin CRUD screens
- `app/admin/audio-diagnostics/page.tsx` — Per-event mic signal levels (admin only)

**Real-time Data Flow:**
- Uses **SSE (Server-Sent Events)** for real-time updates, NOT WebSockets
- SSE endpoints: `/api/alerts/stream`, `/api/patients/stream`, `/api/device/stream`
- Authentication: passes `email` and `token` in URL query params
- Pattern: `EventSource` connection → `onmessage` handler → React state update

**Important Components:**
- `WaveformAudioPlayer.tsx` — wavesurfer.js player with a load-failure fallback.
  Preferred for new work.
- `CustomAudioPlayer.tsx` — older plain `<audio>` player. Still used by
  `history/` and `register-patient/`; migrate when touching those pages.
- `MicLevelIndicator.tsx` — 4-mic signal bars. `compact` renders mini bars with a
  state-driven hover tooltip; `compact={false}` renders labelled rows and is what
  the admin diagnostics page uses.
- `PatientFormModal.tsx` — shared add/edit form. Only `mode="edit"` has a caller
  today; the `add` branch is wired but unused.
- `BlinkingAlert.tsx`, `DirectionCompass.tsx`, `AlertBanner.tsx`, `Navbar.tsx`

**Authentication & roles:**
- `next-auth` for session management
- Token in `localStorage.getItem("token")` and cookie `token_public`;
  `middleware.ts` reads the `token` cookie
- User email in `localStorage.getItem("userEmail")`
- **`middleware.ts` only checks that a token cookie exists — it does not check
  role.** Any logged-in user can reach `/admin/*` as far as routing is concerned.
- Role enforcement on the frontend is per-page. Use
  **`hooks/useAdminGuard.ts`**, which asks the backend
  (`GET /api/user/profile`) and redirects non-admins. Do **not** trust
  `localStorage.getItem("userRole")` — `app/admin/users/page.tsx` still does and
  that check is forgeable.
- The real security boundary is `middleware.RequireAdmin` in Go, which re-reads
  the role from the database on every `/api/admin/*` call.

### 2. Go Backend (Fiber)

**Tech Stack:** Go 1.26.2, Fiber v2.52.12, GORM, PostgreSQL

**Key Files:**
- `main.go` — Application entry point
- `routes/routes.go` — All route registration; start here
- `services/mqtt_service.go` — MQTT subscriber for device status and audio
- `middleware/auth_middleware.go` — `RequireAuth`, `ExtractToken`
- `middleware/cors.go` — `RequireAdmin` **and** CORS setup (yes, in the same file)
- Database models: User, Device, Patient, Alert, UserLineMapping, UserTelegramMapping

**API Patterns:**
- REST endpoints for CRUD operations
- SSE for real-time frontend updates
- JWT authentication with Auth0 OAuth2 support
- MQTT integration for device communication
- Token resolution order: cookie `token` → `Authorization: Bearer` → `?token=`

**Critical Routes:**
- `POST /api/audio/emergency` — Receive emergency audio from AI server
- `POST /api/audio/negative` — Receive normal audio (quota: 10 latest)
- `GET  /api/alerts/stream` — SSE stream for alerts (requires `?email=...&token=...`)
- `GET  /api/alerts/history` — Past detections (`models.HistoryResponse`)
- `GET  /api/patients/stream` — SSE stream for patient list
- `GET  /api/device/stream` — SSE stream for device status
- `PUT  /api/patients/:id` — Edit a patient. Caregivers may only edit patients
  linked to them via `caregiver_patients`; admins may edit anyone.
  Body: `{ patientName, age, gender, roomNumber, medicalCondition }`
- `GET  /api/user/profile?email=...` — Returns the user record including `role`

### 3. Python AI Server (FastAPI)

**Tech Stack:** Python 3.12+, FastAPI, PyTorch 2.0+, torchaudio

**Key Components:**
- `app.py` — FastAPI server with `/need-help` endpoint
- `model.py`, `bcresnet.py` — BCResNet definition and inference
- `mqtt_audio_receiver.py` — MQTT subscriber that forwards audio to AI server
- `config.py` — env-driven settings
- `models/best_sens_model.pth` — Pre-trained BCResNet model (REQUIRED, gitignored)
- Dependencies live in `pyproject.toml` (there is no `requirements.txt`)

**Audio Processing:**
- MelSpectrogram extraction using nnAudio
- Binary classification: emergency vs. normal
- Fallback: Whisper ASR + keyword matching

### 4. ESP32 Firmware

Two builds exist. `firmwareV2/` is the current direction.

| | `firmware/` | `firmwareV2/` |
|---|---|---|
| Mics | 1 (mono) | 2 (stereo L/R on one I2S bus, sample-synced) |
| Direction finding | none | TDOA via cross-correlation + parabolic interpolation |
| Extra MQTT topic | — | `voice/angle/{mac}` |
| Payload | mono | mixed down to mono, so payload size is unchanged |

**Hardware:** ESP32 DevKit V1 + INMP441 MEMS microphone (I2S)

**Pin Configuration:**
- I2S SCK: GPIO 26 · WS: GPIO 25 · DIN: GPIO 22
- Status LED (Red): GPIO 2 · Record LED (Green): GPIO 4 · SoftAP LED (Yellow): GPIO 14

**Audio Specs:**
- **8kHz** sampling rate (`I2S_SAMPLE_RATE` in both firmwares)
- 16-bit PCM (reads 32-bit I2S, right-shifts to 16-bit)

**TDOA tuning (firmwareV2):**
- `MIC_DISTANCE_M` defaults to `0.10f` — **set this to the real installed spacing**
- `TDOA_MAX_LAG_SAMPLES` must grow if the mics are moved further apart

**Network:**
- Creates Soft-AP: `SmartVoice_AP`
- ESP32 IP: `192.168.4.1`
- MQTT Broker: `192.168.4.2:1883`

---

## Phase 3 Status

**Hardware / AI (อัง):**
- ✅ Dual-mic TDOA direction finding in `firmwareV2`

**Backend (กิต):**
- ✅ `PUT /api/patients/:id` with ownership check
- ⬜ `mic_levels` — **not implemented anywhere in `backend/`**. The frontend
  diagnostics page is built and waiting for it. Needs a
  `MicLevels []float64 \`json:"mic_levels"\`` on the Alert model, populated from
  the DSP pipeline and surfaced on `GET /api/alerts/history`.

**Frontend (นนท์):**
- ✅ Task 1 — Dashboard alert cards with blinking status and patient coordinates
- ✅ Task 2 — `WaveformAudioPlayer` with a load-failure fallback UI
- ✅ Task 3 — Patients registry: working Edit modal, Delete auth fix, device
  column fix
- ✅ Mic levels moved off the caregiver alert card to `/admin/audio-diagnostics`
- ⬜ Device Telemetry page (online/offline visualisation) — not started
- ⬜ Migrate `history/` and `register-patient/` off `CustomAudioPlayer`
- ⬜ Wire `PatientFormModal` `mode="add"` (optional; `/register-patient` covers it)

**Still planned:** Redis as a high-performance queue replacing MQTT for some flows.

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
  (see `frontend/AGENTS.md`)
- SSE pattern is preferred over WebSockets for real-time updates
- Dark mode uses `next-themes`
- Tailwind CSS 4 (check syntax if migrating from v3). Note `app/globals.css`
  declares both `@import "tailwindcss"` and the v3 `@tailwind` directives.
- React 19 lint rules (`react-hooks/purity`, `set-state-in-effect`) flag the
  existing mock-data pattern in `dashboard/page.tsx`. Those errors are
  pre-existing; do not treat them as regressions from your change.

### Backend Development
- Go uses Fiber framework (NOT Gin or Echo)
- Database ORM is GORM
- MQTT client: `github.com/eclipse/paho.mqtt.golang`
- SSE implementation: custom handlers, NOT third-party libraries

### Audio Handling
- The pipeline currently runs at **8kHz**, mono, 16-bit PCM
  (firmware `I2S_SAMPLE_RATE = 8000`, `api/app.py` `SAMPLE_RATE = 8000`)
- ⚠️ Inconsistency to be aware of: `api/config.py` still defaults `SAMPLE_RATE`
  to `16000`, and `app.py` carries a comment saying BCResNet typically wants
  16kHz. Confirm with อัง which rate the shipped model was trained at before
  changing anything.
- WAV format is preferred for frontend playback
- Python AI expects `multipart/form-data` with field name `sound`

### ESP32 Development
- Build system: ESP-IDF v4.4+ (NOT Arduino framework)
- MQTT topics: `voice/audio/{mac}`, `voice/angle/{mac}` (V2), `device/status/{mac}`
- LED patterns: Red (WiFi connected), Green (recording), Yellow (SoftAP mode)

---

## Common Issues

**Frontend SSE not connecting:**
- Verify `userEmail` is in localStorage
- Check token validity (`getAuthToken()` helper)
- Ensure backend SSE endpoint includes `?email=...&token=...`

**Go Backend won't start after the folder rename:**
- `backend/.env` may be missing — the old file is still at `go_backend/.env`
- Same for recorded audio: `go_backend/audio_recordings/`

**Go Backend MQTT connection failed:**
- Verify Mosquitto Docker is running: `docker ps`
- Check MQTT broker URL in `.env`
- Test with MQTT Explorer

**ESP32 not recording:**
- Check I2S pin configuration (GPIO 26, 25, 22)
- Verify INMP441 wiring (3.3V power, GND, L/R pin)
- Monitor serial output: `idf.py monitor`

**AI Server model not found:**
- Ensure `best_sens_model.pth` exists in `api/models/`
- Install dependencies from `api/pyproject.toml`

---

## File Locations

- **AI Model:** `api/models/best_sens_model.pth` (gitignored, obtain separately)
- **Environment Variables:** `backend/.env` (DB credentials, MQTT config, LINE tokens)
- **Recorded Audio:** `backend/audio_recordings/`
- **Device Status Storage:** PostgreSQL `devices` table
- **Alert History:** PostgreSQL `detection_logs` table (joined to `devices` and
  `patients` by `GetHistoryAlerts`)
