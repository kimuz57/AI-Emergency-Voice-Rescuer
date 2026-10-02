# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For a full, code-verified walkthrough (every endpoint, table, topic, env var and
known bug, with file/line references) see **`docs/ARCHITECTURE.md`** (Thai).

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
| `api/` | Python FastAPI process: MQTT receiver + BCResNet inference | `backend_ai/` |
| `firmwareV2/` | ESP32 firmware, dual mic + TDOA (the only firmware) | — |
| `mosquitto/` | MQTT broker config for Docker | — |
| `docs/` | `ARCHITECTURE.md` — code-verified architecture reference | — |

The single-mic `firmware/` folder has been **deleted** from the working tree.
Each service ships a `.env.example` (`api/`, `backend/`, `frontend/`) listing
every variable it reads — copy it to `.env` / `.env.local`.

---

## System Architecture

```
ESP32 (firmwareV2) + 2x INMP441 on one I2S bus (stereo L/R, 8 kHz)
    TDOA on-device, (L+R)/2 mixdown, publishes every 1024 frames (~128 ms)
    ↓ MQTT over WSS (TARGET_MQTT_URI by DEPLOY_ENV, user/pass from main/secrets.h)
      voice/audio/{MAC}    raw PCM int16 LE mono, 2048 bytes, no header, QoS 0
      voice/angle/{MAC}    ASCII "%.1f" degrees (-90..90), QoS 0 — NO subscriber
      device/status/{MAC}  "online" (retain) / LWT "offline"
    ↓ HTTPS GET /api/device/checkin?mac=&ip=   (once per IP acquired)
Mosquitto MQTT Broker (1883 TCP, 8083 WS+TLS, 9001 WS; password_file, no anonymous)
    ↓
`uvicorn app:app` (api/, port 8000) — ONE process containing:
    ├─ mqtt_audio_receiver.py  subscribes voice/audio/# + device/status/#,
    │    buffers >= SAMPLE_RATE*4 bytes per device, builds a WAV in memory
    └─ app.py run_kws_inference()  called IN-PROCESS (not over HTTP)
         BCResNet_M(2) loaded from models/best_m.pth, index 0 = yes, argmax
    ↓ HTTP POST multipart (audio, device_mac, event_type, confidence)
      "yes" → /api/audio/emergency    otherwise → /api/audio/negative
Go Backend (Fiber, port 8080)
    ├─ PostgreSQL via GORM (AutoMigrate)      ├─ Redis (required, go-redis)
    ├─ REST API + SSE (DB polling per client) └─ LINE push / Telegram sendMessage
    ↓ SSE (EventSource)
Next.js Frontend (port 3000)
```

`POST /need-help` on port 8000 exists for manual testing only; the live pipeline
does not use it. The Go backend never calls the Python server.

**Key Ports:**
- MQTT: 1883 (TCP), 8083 (WebSocket + TLS), 9001 (WebSocket)
- Python AI: 8000
- Go Backend: 8080 (`PORT`)
- Next.js: 3000
- PostgreSQL: `DB_PORT` default **5433** · Redis: 6379

---

## Common Commands

### Starting All Services (Windows)

```powershell
start_guardian.bat
```

Uses paths relative to the repo. It checks prerequisites (Docker running,
`go`, `npm`, `api\.venv`, model file, `.env` files), runs
`docker compose up -d` (postgres + redis, plus mosquitto only when
`mosquitto/config/passwd` and the certs exist), then opens windows for
`uvicorn app:app` (api), `go run .` (backend) and `npm run dev` (frontend).

### Manual Service Startup

**Infrastructure (Docker):**
```powershell
docker compose up -d   # mosquitto, postgres:16 (127.0.0.1:5433), redis:7 (127.0.0.1:6379)
```
Mosquitto needs `mosquitto/config/passwd` and `mosquitto/certs/` — both are
gitignored; see `mosquitto/README.md`. An ACL template is in
`mosquitto/config/acl.example` (not enabled). Postgres/Redis read credentials
from `backend/.env` when passed with `--env-file`; placeholder defaults
otherwise. The Go backend exits on startup if PostgreSQL or Redis is
unreachable.

**Python AI Server (also starts the MQTT receiver):**
```powershell
cd api
# Activate virtual environment first. Env is read from api/.env (load_dotenv;
# template: api/.env.example). Required: MQTT_BROKER_HOST,
# GO_SERVER_URL (use https://), INTERNAL_API_KEY — import fails with ValueError
# otherwise. Optional: MQTT_BROKER_PORT, MQTT_USER, MQTT_PASSWORD, MQTT_USE_TLS,
# SAMPLE_RATE (default 8000), TLS_INSECURE_SKIP_VERIFY (default false).
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

**Go Backend:**
```powershell
cd backend
go run .
```
Required env: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_TOKEN`, `JWT_SECRET`
(≥ 32 chars; also signs alert links), `DB_HOST`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME` (`log.Fatalf` if missing).
Needed for features (startup only warns): `INTERNAL_API_KEY` (same value as
the Python side; internal routes return 503 without it), `GOOGLE_CLIENT_ID`
(same as NextAuth), `FRONTEND_URL`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` (first-admin
seed), `TELEGRAM_WEBHOOK_SECRET` (also pass it as `secret_token` to Telegram's
`setWebhook`), `TELEGRAM_BOT_USERNAME`.

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
cd firmwareV2
copy main\secrets.h.example main\secrets.h   # first time; fill in MQTT credentials
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

Expected response: `{"detected": "yes", "probability": 0.9998}`.
`detected` can also be `"error"` (returned with HTTP 200) when preprocessing or
inference throws.

---

## Code Architecture

### 1. Frontend (Next.js + React)

**Tech Stack:** Next.js 16.2.3, React 19.2.4, TypeScript, Tailwind CSS 4

**Key Pages:**
- `app/dashboard/page.tsx` — Alert monitoring via SSE. `useMockData` defaults to
  `false`; the mock toggle only renders in development. Mock alerts use negative
  ids and are resolved locally, never via the API.
- `app/device/page.tsx` — Device management with online/offline/inactive stats
  and live status over `/api/device/stream`
- `app/patients/page.tsx` — Patient registry (list, edit, delete)
- `app/register-patient/page.tsx` — Add a patient and bind a device.
  **Cannot be removed or moved**: `firmwareV2/main/web_server.h`
  (`connect_post_handler()`) prints this URL (`?mac=` 12 hex chars, no colons)
  as copyable text after Wi-Fi provisioning. It is not a QR code.
- `app/history/page.tsx` — Alert history and audio playback
- `app/alert/page.tsx` — Public acknowledge page opened from LINE links (`?mac=`)
- `app/admin/patients|users|register-device` — Admin CRUD screens
  (`register-device` renders a Wi-Fi/registration QR)
- `app/admin/audio-diagnostics/page.tsx` — Per-event mic signal levels (admin only)

**Real-time Data Flow:**
- Uses **SSE (Server-Sent Events)** for real-time updates, NOT WebSockets
- SSE endpoints: `/api/alerts/stream`, `/api/patients/stream`, `/api/device/stream`
- Each Go SSE handler polls PostgreSQL on a ticker per client (alerts 1 s,
  patients 1 s, devices 2 s) — there is no broadcast hub
- Frontend passes `email` and `token` in the query string; the Go stream
  handlers return 400 up front when `email` is missing
- Pattern: `EventSource` connection → `onmessage` handler → React state update.
  The dashboard and device pages reconnect with capped backoff (1 s → 30 s)
  when the browser gives up; do not call `source.close()` in `onerror`.

**Important Components:**
- `WaveformAudioPlayer.tsx` — wavesurfer.js player with a load-failure fallback.
  The only audio player. Recordings are not public: it sends the Bearer token
  to `GET /api/audio/:filename` (the fallback `<audio>` uses `?token=`).
- `MicLevelIndicator.tsx` — signal bars, hardcoded to **4** channels although
  firmwareV2 has 2 mics. `compact` renders mini bars with a state-driven hover
  tooltip; `compact={false}` renders labelled rows (admin diagnostics page).
- `PatientFormModal.tsx` — shared add/edit form. Only `mode="edit"` has a caller
  today; the `add` branch is wired but unused.
- `BlinkingAlert.tsx`, `DirectionCompass.tsx`, `Navbar.tsx`, `Sidebar.tsx`
- Hooks: `useAdminGuard.ts` only (the unused components and hooks were removed)

**Authentication & roles:**
- `next-auth` with `GoogleProvider` (the `CredentialsProvider` is never invoked);
  the `signIn` callback sends `account.id_token` to `POST /api/auth/google`
  and refuses sign-in without it. Email/password login goes straight to the
  Go backend.
- Use `lib/auth.ts` (`getAuthToken()`, `authHeaders()`) for every call to an
  authenticated route — send `Authorization: Bearer <token>`; EventSource URLs
  carry `?token=` instead
- `app/alert/page.tsx` forwards the `?token=` from the LINE/Telegram link as
  `X-Alert-Token` and in the acknowledge body
- Login `callbackUrl` only accepts same-origin relative paths; LINE OAuth uses a
  random `state` kept in `sessionStorage` and checked in `/line-callback`
- Token in `localStorage.getItem("token")`, httpOnly cookie `token`, and
  JS-readable cookie `token_public`; `middleware.ts` reads the `token` cookie
- User email in `localStorage.getItem("userEmail")`
- **`middleware.ts` only checks that a token cookie exists — it does not verify it
  or check role.** Any cookie value reaches `/admin/*` as far as routing goes.
- Role enforcement on the frontend is per-page via **`hooks/useAdminGuard.ts`**
  (`GET /api/user/profile`, now authenticated, redirects non-admins).
  `admin/users` uses it; `admin/patients` does its own inline check. Nothing
  reads `userRole` from localStorage any more.
- The real security boundary is `middleware.RequireAdmin` in Go, which re-reads
  the role from the database on every `/api/admin/*` call.

### 2. Go Backend (Fiber)

**Tech Stack:** Go 1.26.2, Fiber v2.52.12, GORM v1.31.1, PostgreSQL, go-redis v9

**Key Files:**
- `main.go` — Entry point: env checks, DB + Redis connect, CORS, static
  `/profile`, LINE `/webhook`. There is **no** static `/api/audio` mount —
  recordings are served by `GetAudioFile`.
- `routes/routes.go` — All route registration; start here
- `middleware/auth_middleware.go` — `ExtractToken`, `RequireAuth`, `OptionalAuth`
- `middleware/identity.go` — `CurrentUser`, `ResolveTargetUser`,
  `IdentityError`, `RequireInternalKey`
- `middleware/cors.go` — `RequireAdmin` only (despite the name; CORS is
  configured in `main.go`)
- `utils/jwt.go` — `GenerateToken`, `ParseJWT` (HS256 pinned, `exp` required)
- `utils/alert_token.go` — `SignAlertToken` / `VerifyAlertToken` for `/alert` links
- `database/database.go` — `ConnectDB()`, AutoMigrate, `SeedAdmin()`
- `database/redis.go`, `database/redis_cache.go` — Redis client + helpers
- `controllers/้history.go` — note the Thai character in the filename
- The Go backend does **not** use MQTT (the old `services/mqtt_service.go` was
  removed); audio arrives via HTTP from the Python receiver.

**Database models (AutoMigrate order):** `User`, `Patient`, `CaregiverPatient`,
`Device`, `Device_patient`, `DetectionLog`, `UserLineMapping`,
`UserTelegramMapping`. (`HistoryResponse` is a DTO; an old
`history_responses` table may still exist in existing databases.)
There is no `Alert` struct — alerts are rows in `detection_logs`
(`models.DetectionLog`). Device↔patient links live in `device_patients`;
`devices` has no `patient_id` column.

**Redis keys in use:** `device:activation:{MAC}` (TTL 1 h active / 10 s inactive;
key built by `deviceActivationKey()` with a normalised MAC),
`alert:notify:{MAC}` (60 s SetNX throttle on LINE/Telegram pushes in
`SaveEmergencyAudio`; fails open if Redis errors),
`alert:throttle:{caregiverID}:{MAC}` (in `CreateAlert`, which nothing calls),
`device:{id}:status` (written, never read). Redis is a hard dependency.

**API Patterns:**
- REST endpoints for CRUD operations
- SSE for real-time frontend updates
- JWT (HS256, 72 h) from `utils/jwt.go`; Google sign-in via NextAuth →
  `POST /api/auth/google`, which verifies the Google ID token against
  `GOOGLE_CLIENT_ID` (tokeninfo endpoint) and uses only the verified email.
  **There is no Auth0.**
- Token resolution order in `RequireAuth`: cookie `token` → `Authorization: Bearer`
  → `?token=`
- Route protection levels (see `routes/routes.go`; `routes/routes_test.go`
  asserts them):
  - **Public:** `/api/health`, `/api/auth/*`, webhooks (Telegram checks
    `X-Telegram-Bot-Api-Secret-Token` when `TELEGRAM_WEBHOOK_SECRET` is set),
    `GET /api/device/checkin` (firmware sends no key), `GET /api/alerts/device`
    and `POST /api/alerts/acknowledge` (require a valid alert token)
  - **Internal** (`RequireInternalKey`, header `X-Internal-Key`): audio
    emergency/negative, device check-activation and status, `POST /api/alerts`
  - **RequireAuth:** `/api/user/*`, `/api/patients/*`, alert reads/stream/resolve,
    `/api/device/stream`, `GET /api/devices`, `GET /api/audio/my-logs`
  - **OptionalAuth + handler check:** `GET /api/audio/:filename` — admin, a
    caregiver linked to that recording's patient, or `?mac=&alert_token=`
    matching the recording's device (the `/alert` page gets this URL from
    `GetAlertDeviceInfo`)
  - **RequireAuth + RequireAdmin:** `/api/admin/*`, `POST /api/devices`,
    audio list and delete
- **Identity rule:** never trust a client-sent email/userId. Handlers call
  `middleware.ResolveTargetUser(c, email)` — own email or empty → the caller;
  someone else's email → admins only. Parse `:id` params with
  `parseIDParam()` (GORM treats non-numeric strings as raw SQL).
- Telegram linking: `POST /api/user/telegram/link-token` → one-time token in
  Redis `telegram:link:{token}` (15 min, GETDEL); the bot's `/start <token>`
  links the chat. The old `/start <userId>` flow is refused, and the old
  `POST /api/user/telegram/connect` (arbitrary chatId) was removed.
- `SeedAdmin` creates the first admin only from `ADMIN_EMAIL`/`ADMIN_PASSWORD`
  and never logs the password.

**Critical Routes:**
- `POST /api/audio/emergency` — Receive emergency audio from the Python receiver;
  saves WAV and inserts `detection_logs` every time, pushes LINE/Telegram at
  most once per 60 s per device
- `POST /api/audio/negative` — Receive normal audio; writes to `./negative`,
  keeps the 10 latest files, **no DB row**
- `GET  /api/alerts/stream` — SSE stream of unresolved alerts (RequireAuth;
  `?email=` resolved through `ResolveTargetUser`)
- `GET  /api/alerts/history` — Past detections (`models.HistoryResponse`),
  filtered by `from`/`to`, and by `?email=` (that user's linked patients only —
  admins included) when given
- `GET  /api/alerts/stats` — `?email=` and `?days=` (default 30, 1–365)
- `POST /api/device/status` — Body `{mac, status}`; looks the device up by
  normalised MAC (sent by the Python receiver when a device goes offline)
- `GET  /api/patients/stream` — SSE stream for patient list (RequireAuth)
- `GET  /api/device/stream` — SSE stream for device status
- `GET  /api/device/check-activation?mac=` — used by the Python receiver
- `GET  /api/device/checkin?mac=&ip=` — called by the ESP32 on boot/IP change
- `PUT  /api/patients/:id` — Edit a patient. Caregivers may only edit patients
  linked to them via `caregiver_patients`; admins may edit anyone.
  Body: `{ patientName, age, gender, roomNumber, medicalCondition }`
- `GET  /api/user/profile?email=...` — Returns the user record including `role`
  (RequireAuth; another user's email only for admins)
- `GET  /api/alerts/device?mac=&token=`, `POST /api/alerts/acknowledge` — public
  `/alert` page; need the signed alert token from the LINE/Telegram link

### 3. Python AI Server (FastAPI)

**Tech Stack:** Python 3.12+, FastAPI, PyTorch, torchaudio, nnAudio, paho-mqtt

**Key Components:**
- `app.py` — FastAPI app; `lifespan()` starts the MQTT receiver with
  `run_kws_inference` as an in-process callback; `POST /need-help` for testing
- `bcresnet.py` — `BCResNet_M` (used), `BCResNet1`, `BCResNet_Tiny` (imported, unused)
- `mqtt_audio_receiver.py` — MQTT subscriber, per-device buffering, WAV
  building, device-activation check, forwarding to Go. Reads required env vars
  **at import time**; worker threads start only in `start_receiver()`.
  The activation check runs in a background thread (never on the paho network
  thread) and caches "active" for 60 s, "inactive" for 10 s. A device's first
  chunks are dropped until Go answers. Inference results other than `yes`/`no`
  are logged and dropped, not forwarded. Every call to Go sends
  `X-Internal-Key` with `allow_redirects=False`; TLS certificates are verified
  unless `TLS_INSECURE_SKIP_VERIFY=true`.
- `models/best_m.pth` — trained `BCResNet_M` weights, tracked in git
  (commit `818413f`). If loading fails, `app.py` raises at import, so the
  server refuses to start.
- Inference is serialised by `_inference_lock`; `/need-help` runs it in a
  threadpool.
- The old unused `config.py`, `model.py`, `models.py`, `main.py` were removed.
- Dependencies live in `pyproject.toml` (there is no `requirements.txt`);
  `pandas` and `numpy` are listed but not imported

**Audio Processing:**
- Resample to 8 kHz → peak-normalise → pad/trim to 2 s (16000 samples)
  → MelSpectrogram via nnAudio (`n_fft=256, win=200, hop=80, n_mels=128`)
  → input tensor `[1, 1, 128, ~201]`
- Binary classification: softmax output index 0 = `yes` (emergency),
  index 1 = `no`; `detected = "yes"` if `prob_yes > prob_no`. There is no
  tunable threshold in the live path. `probability` is the winning class's
  probability, not P(emergency).
- There is **no** Whisper / keyword fallback and **no** beamforming
  (Delay-and-Sum, coherence post-filter, MVDR) anywhere in the code

### 4. ESP32 Firmware (`firmwareV2/`)

Only `main/main.c` is compiled (`main/CMakeLists.txt` → `SRCS "main.c"`,
`EMBED_TXTFILES "wifi.html"`); `main/web_server.h` is `#include`d.
MQTT credentials live in **`main/secrets.h`** (gitignored; copy
`main/secrets.h.example`) — the build stops with `#error` if it is missing.
Never put credentials back into `main.c`.

| | `firmwareV2/` |
|---|---|
| Mics | 2 (stereo L/R on one I2S bus, `I2S_CHANNEL_FMT_RIGHT_LEFT`, sample-synced) |
| Direction finding | TDOA via cross-correlation + parabolic interpolation |
| Extra MQTT topic | `voice/angle/{MAC}` (nothing subscribes to it) |
| Payload | mixed down to mono `(L+R)/2`, 1024 samples = 2048 bytes |

**Hardware:** ESP32 DevKit V1 + 2x INMP441 MEMS microphones (I2S)

**Pin Configuration:**
- I2S SCK: GPIO 26 · WS: GPIO 25 · DIN: GPIO 22 (shared by both mics)
- Status LED: GPIO 2 · Record LED: GPIO 4 · SoftAP LED: GPIO **16**
- GPIO 14 is `STATUS_BORD_PIN`, driven high at boot

**Audio Specs:**
- **8kHz** sampling rate (`I2S_SAMPLE_RATE`)
- 16-bit PCM (reads 32-bit I2S, right-shifts to 16-bit)
- Continuous streaming, no VAD or clip boundaries

**TDOA tuning:**
- `MIC_DISTANCE_M` defaults to `0.10f` — **set this to the real installed spacing**
- `TDOA_MAX_LAG_SAMPLES` is derived at compile time from `MIC_DISTANCE_M`,
  `SPEED_OF_SOUND_MPS` and `I2S_SAMPLE_RATE` (ceil + 1)
- `TDOA_MIN_ENERGY` gates the angle publish: quiet chunks still send audio but
  no `voice/angle` message. Tune it on site.

**Network:**
- Soft-AP SSID `Smartvoice-XXXXXX` (last 3 MAC bytes), password derived from
  the first 3 MAC bytes; captive portal at `192.168.4.1`
- One switch, `DEPLOY_ENV` in `main.c` (`ENV_LOCAL` / `ENV_SERVER` /
  `ENV_LAB`; currently `ENV_SERVER`), sets `TARGET_GO_API`, `TARGET_MQTT_URI`,
  `SERVER_URL` (register-patient link) and which credentials from `secrets.h`
  are used. Defined before `#include "web_server.h"`.
- The broker is fixed at build time; the `/host` page and the NVS `mqtt_uri`
  value are not used, and `/admin` says so.
- Wi-Fi credentials are saved to NVS only after `IP_EVENT_STA_GOT_IP`.
- SNTP, the Go check-in and the MQTT restart run in a short-lived task after
  GOT_IP, not in the event handler. The MQTT client handle is guarded by
  `s_mqtt_mutex`.
- The provisioning web server has no auth and keeps running in STA mode
  (decision pending for อัง).

---

## Phase 3 Status

**Hardware / AI (อัง):**
- ✅ Dual-mic TDOA direction finding in `firmwareV2`
- ⬜ Consume `voice/angle/{MAC}` anywhere downstream (published, never read)

**Backend (กิต):**
- ✅ `PUT /api/patients/:id` with ownership check
- ⬜ `mic_levels` — **not implemented anywhere in `backend/`**, and nothing
  computes per-mic levels (firmware only publishes the mono mix). The frontend
  diagnostics page is built and waiting for it. Needs a
  `MicLevels []float64 \`json:"mic_levels"\`` on `models.DetectionLog`, populated
  upstream and surfaced on `GET /api/alerts/history`.

**Frontend (นนท์):**
- ✅ Task 1 — Dashboard alert cards with blinking status (direction/coordinates
  are still mock data; the backend sends no angle)
- ✅ Task 2 — `WaveformAudioPlayer` with a load-failure fallback UI
- ✅ Task 3 — Patients registry: working Edit modal, Delete auth fix, device
  column fix
- ✅ Mic levels moved off the caregiver alert card to `/admin/audio-diagnostics`
- ✅ Device page with online/offline/inactive status
- ✅ Audio player migration — `CustomAudioPlayer` removed
- ⬜ Wire `PatientFormModal` `mode="add"` (optional; `/register-patient` covers it)

**Still planned:** Redis as a high-performance queue replacing MQTT for some
flows. (Redis is already required as a cache; the queue part does not exist.)

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
- Backend base URL: `NEXT_PUBLIC_API_URL`, falling back to `http://localhost:8080`

### Backend Development
- Go uses Fiber framework (NOT Gin or Echo)
- Database ORM is GORM; tables come from `AutoMigrate`, plus raw SQL joins in
  controllers — check table names (`device_patients`, not `device_patient`)
- SSE implementation: custom handlers, NOT third-party libraries
- `config.GetEnvRequired()` calls `log.Fatalf` — use it only at startup
  (`main.go`, `database.go`), never inside request handlers
- Raw SQL joins on `caregiver_patients` must add `deleted_at IS NULL`
  (it is a soft-delete join model)

### Audio Handling
- The pipeline runs at **8kHz**, mono, 16-bit PCM
  (firmware `I2S_SAMPLE_RATE = 8000`, `api/app.py` `SAMPLE_RATE = 8000`)
- `api/mqtt_audio_receiver.py` `SAMPLE_RATE` (env, default **8000**) is the
  value that matters: it sets the window size (`SAMPLE_RATE*4` bytes ≈ 2 s) and
  the WAV header rate. It must equal the firmware's `I2S_SAMPLE_RATE`; setting
  it to 16000 makes windows ~4 s long and labelled 16 kHz, so the model hears
  audio at 2x speed. Confirm with อัง which rate the shipped model was trained at before changing
  the model side.
- WAV format is preferred for frontend playback
- Python AI expects `multipart/form-data` with field name `sound`
- Python → Go uses field name `audio` plus `device_mac`, `event_type`, `confidence`

### ESP32 Development
- Build system: ESP-IDF **5.5.2** (`sdkconfig`), legacy `driver/i2s.h` API
  (NOT Arduino framework)
- MQTT topics: `voice/audio/{MAC}`, `voice/angle/{MAC}`, `device/status/{MAC}`
  (MAC as `AA:BB:CC:DD:EE:FF`, uppercase)
- LED patterns: Red (WiFi connected), Green (recording), SoftAP LED on GPIO 16

---

## Common Issues

**Frontend SSE not connecting:**
- Verify `userEmail` is in localStorage
- Check token validity (`getAuthToken()` helper)
- Ensure backend SSE endpoint includes `?email=...&token=...`
- The device page's stream does not retry after an HTTP error (401/5xx);
  reload the page

**Admin device QR points at localhost:**
- `admin/register-device` uses `NEXT_PUBLIC_FRONTEND_URL`, falling back to
  `window.location.origin`. Set it (build-time) to the public site URL.

**Go Backend won't start:**
- `backend/.env` may be missing — the old file is still at `go_backend/.env`
- Same for recorded audio: `go_backend/audio_recordings/`
- Redis or PostgreSQL not running — `docker compose up -d postgres redis`;
  PostgreSQL default port is 5433

**Python receiver can't reach the broker:**
- Transport is WebSocket unless `MQTT_BROKER_PORT` is 1883/8883. TLS is on by
  default for ports 443, 8883 and 8083 (the 8083 listener in `mosquitto.conf` is
  TLS); override with `MQTT_USE_TLS=true|false`, e.g. `false` behind a proxy
  that terminates TLS.
- `MQTT_USER` / `MQTT_PASSWORD` are required by the broker (`allow_anonymous false`)
- On a cp1252 Windows console, the Thai/emoji `print()` calls can raise
  `UnicodeEncodeError` — run with `PYTHONIOENCODING=utf-8`

**ESP32 not recording:**
- Check I2S pin configuration (GPIO 26, 25, 22)
- Verify INMP441 wiring (3.3V power, GND, L/R pin — one mic L/R→GND, one →3.3V)
- Monitor serial output: `idf.py monitor`

**AI Server model not found:**
- Ensure `best_m.pth` exists in `api/models/`
- Install dependencies from `api/pyproject.toml`

---

## File Locations

- **AI Model:** `api/models/best_m.pth` (tracked in git)
- **Environment Variables:** `backend/.env` (DB, Redis, LINE, Telegram, SMTP, JWT),
  `frontend/.env.local`, `api/.env` (loaded by `load_dotenv`); templates in
  each `.env.example`. Firmware MQTT credentials: `firmwareV2/main/secrets.h`.
- **Recorded Audio:** `backend/audio_recordings/` (served only through the
  access-checked `GET /api/audio/:filename`);
  negatives in `backend/negative/`; profile images in `backend/profile/`
- **Device Status Storage:** PostgreSQL `devices` table
- **Alert History:** PostgreSQL `detection_logs` table, joined to `patients` via
  `detection_logs.patient_id` by `GetHistoryAlerts`
- **Known issues and security findings:** `docs/ARCHITECTURE.md` §12 — written
  before the `fix/architecture-audit` branch; many items there are now fixed
  (see this file for the current behaviour).
