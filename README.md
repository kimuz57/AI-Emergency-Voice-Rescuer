# AI Emergency Voice Detection System

IoT-based emergency voice alert system for elderly care and distress monitoring.  
ESP32 captures audio → MQTT → Python AI server (BCResNet) classifies emergency vs normal.

## Stack

| Layer | Technology |
|---|---|
| Hardware | ESP32 + INMP441 (I2S, 16kHz mono) |
| Connectivity | Mosquitto MQTT — broker on PC at `192.168.4.2:1883` |
| AI Server | Python FastAPI + BCResNet binary classifier — `POST /need-help` on port 8000 |
| MQTT Forwarder | `mqtt_audio_receiver.py` — receives PCM chunks, forwards WAV in-memory to AI server |
| Backend | Go + Fiber (branch `golangBackend`) — REST API for frontend, port 8080 |
| Frontend | Next.js — `my-awesome-app/`, port 3000 |

## Repository Layout

```text
main_smartvoice/
├── backend_ai/
│   ├── app.py              # FastAPI AI webserver (BCResNet inference)
│   ├── models.py           # BCResNet model architecture
│   ├── detect.py           # fallback Whisper keyword detection
│   ├── best_sens_model.pth # pretrained weights (NOT in git — share via kws.zip)
│   └── requirements.txt    # AI server dependencies
├── esp32/
│   └── main/voice_recorder.c  # I2S firmware (IDF v5.5.2)
├── my-awesome-app/         # Next.js frontend
├── static/                 # static HTML prototype pages
├── mqtt_audio_receiver.py  # MQTT → AI server forwarder
├── requirements.txt        # all Python dependencies (root)
└── README.md
```

## Model: BCResNet

- Architecture: BCResNet binary classifier (52,162 parameters)
- Input: Log-Mel Spectrogram (16kHz, 2s, 128 mel bands via nnAudio)
- Output: `yes` (emergency) / `no` (normal)
- Accuracy: 94.85% overall (93.85% positive, 95.85% negative)
- Weights file: `backend_ai/best_sens_model.pth` — excluded from git, share via `kws.zip`

## Data Flow

```text
ESP32 + INMP441
    │  I2S 16kHz mono PCM
    │  MQTT topic: voice/audio/ESP32_DEVICE_001
    ▼
Mosquitto broker (192.168.4.2:1883)
    │
    ▼
mqtt_audio_receiver.py          ← Python forwarder (no disk write)
    │  POST multipart/form-data
    │  field: sound=<wav>
    ▼
backend_ai/app.py  :8000
    │  BCResNet inference
    ▼
{"detected": "yes"|"no", "probability": float}
    │
    ▼
 🚨 EMERGENCY alert  or  ✅ normal
```

> **Note:** When Go backend (`golangBackend`) is ready, it will replace `mqtt_audio_receiver.py` as the MQTT listener and forward audio to `POST /need-help` directly. Do not run both simultaneously.

## Quick Start

### 1. Setup Python environment

```powershell
cd "C:\Project 1\main_smartvoice"
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> Place `best_sens_model.pth` in `backend_ai/` before starting the server.

### 2. Start AI server

```powershell
cd backend_ai
python app.py
# Uvicorn running on http://0.0.0.0:8000
```

### 3. Start MQTT forwarder

Open a second terminal:

```powershell
.\.venv\Scripts\Activate.ps1
python mqtt_audio_receiver.py
```

### 4. Test inference directly

```powershell
# POST a WAV file to the AI server
python -c "
import requests
r = requests.post('http://localhost:8000/need-help',
    files={'sound': ('test.wav', open('backend_ai/samples/help.wav','rb'), 'audio/wav')})
print(r.json())
"
```

Expected response:
```json
{"detected": "yes", "probability": 0.9998}
```

## API Contract

**`POST /need-help`**

| Field | Value |
|---|---|
| Content-Type | `multipart/form-data` |
| Field name | `sound` |
| Format | WAV (16kHz, mono, 16-bit PCM) |

Response:
```json
{"detected": "yes", "probability": 0.9998}
```
- `detected`: `"yes"` = emergency, `"no"` = normal
- `probability`: confidence score (0.0 – 1.0)

## Branch Strategy

| Branch | Purpose | Status |
|---|---|---|
| `main` | stable release | pending merge |
| `python-ai-server` | BCResNet AI server + MQTT forwarder | ✅ active |
| `golangBackend` | Go Fiber REST API + MQTT ingestion | 🔄 in progress |

## Current Status

- ✅ BCResNet model integrated — 100% accuracy on test set (pos/neg samples)
- ✅ FastAPI server running on port 8000
- ✅ `mqtt_audio_receiver.py` forwards audio in-memory (no disk write)
- ✅ Tested against professor's live server (`kwsapi.wattanapong.com`)
- 🔄 Go backend (`golangBackend`) — in progress by team member
- ⏳ ESP32 firmware flash pending (latest I2S fix not yet flashed)
- ⏳ End-to-end test: ESP32 → MQTT → AI server pending

## Notes

- `best_sens_model.pth` is excluded from git (`.gitignore`). Share via `kws.zip`.
- ESP32 connects to Soft AP `SmartVoice-ESP32`; PC IP on that network is `192.168.4.2`.
- Start Mosquitto broker before running `mqtt_audio_receiver.py`.
- If port 8000 is busy: `Get-NetTCPConnection -LocalPort 8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`

## Key Files

| File | Description |
|---|---|
| `backend_ai/app.py` | FastAPI inference server |
| `backend_ai/models.py` | BCResNet architecture |
| `mqtt_audio_receiver.py` | MQTT → AI server forwarder |
| `esp32/main/voice_recorder.c` | ESP32 I2S firmware |
| `requirements.txt` | all Python dependencies |

Last updated: 20 May 2026  
Status: AI server complete — awaiting Go backend merge and ESP32 flash
