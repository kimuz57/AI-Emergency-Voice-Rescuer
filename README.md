# AI Emergency Voice Detection System

AI Emergency Voice Detection System is an IoT-based emergency voice alert system for elderly care and distress monitoring.

The current repository is focused on the core demo path:

1. audio arrives as WAV or raw PCM
2. MQTT sends audio to the Go backend
3. Go wraps raw audio into WAV and calls Python
4. Python transcribes speech and maps keywords to alert levels
5. the backend can forward the result to future dashboard, database, and mobile flows

## Current Stack

- Hardware: ESP32 + INMP441
- Broker: Mosquitto MQTT on port 1883
- Backend: Go + Fiber + MQTT client
- AI: Python + faster-whisper + keyword rules
- Frontend: web dashboard work in progress
- Mobile: Flutter planned for later integration

## Current Repository Layout

```text
main_smartvoice/
|-- backend_ai/
|   |-- detect.py
|   |-- requirements.txt
|   |-- samples/
|   `-- uploads/
|-- backend_ai_legacy/
|-- esp32/
|-- frontend/
|-- go_backend/
|-- my-awesome-app/
|-- static/
|-- PROJECT_SPEC.md
`-- README.md
```

## What Works Today

- `backend_ai/detect.py` accepts a WAV file and returns the agreed JSON shape.
- `backend_ai/detect.py` now uses local `faster-whisper` on CPU for transcription.
- `go_backend/services/ai_runner.go` can call the Python detector and parse the JSON response.
- `GET /test-ai` in the Go backend can exercise the Python detection path.
- local Mosquitto publish to `voice/audio/#` has been validated end-to-end.
- incoming MQTT audio is saved as WAV under `go_backend/uploads/audio/` before AI analysis.

## Current Limitations

- PostgreSQL is not part of the active local demo flow yet.
- alert persistence and dashboard updates are still pending.
- keyword detection is rule-based after transcription, not a trained alert classifier yet.
- real-world accuracy still needs validation with recorded speech samples.

- `backend_ai_legacy/` contains older LOTUSDIS experiments and is not the active path.

## Quick Start

### 1. Python Setup

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend_ai\requirements.txt
```

### 2. Test AI from CLI

```powershell
python backend_ai\detect.py backend_ai\samples\help.wav
```

Expected response shape:

```json
{
  "success": true,
  "isAlert": 1,
  "keyword": "help",
  "level": 3,
  "confidence": 0.85,
  "transcribedText": "help",
  "processingTime": 234
}
```

Use a real recorded WAV file for meaningful STT validation.

### 3. Start Mosquitto Broker

If Mosquitto is installed in `C:\Program Files\Mosquitto`:

```powershell
$env:Path += ";C:\Program Files\Mosquitto"
mosquitto.exe -v
```

### 4. Start Go Backend

Open a second terminal:

```powershell
Set-Location .\go_backend
go run .
```

If the broker is already running, the backend should log that MQTT connected successfully and that it subscribed to `voice/audio/#`.

### 5. Publish Test Audio Over MQTT

Open a third terminal:

```powershell
$env:Path += ";C:\Program Files\Mosquitto"
mosquitto_pub.exe -h localhost -p 1883 -t voice/audio/help -f backend_ai\samples\help.raw
```

The Go backend should log:

- the topic and payload size
- saved WAV path
- AI result JSON summary
- mapped alert level

## Active Data Flow

```text
ESP32 or local publisher
    |
    | MQTT publish to voice/audio/#
    v
Mosquitto broker
    |
    v
Go backend
    |
    | save payload as WAV
    | call backend_ai/detect.py
    v
Python detection
    |
    | transcribe audio
    | detect emergency keyword
    v
JSON result
```

## AI Response Contract

The Go backend currently expects this JSON shape from Python:

```json
{
  "success": true,
  "isAlert": 1,
  "keyword": "help",
  "level": 3,
  "confidence": 0.85,
  "transcribedText": "help me please",
  "processingTime": 234,
  "error": ""
}
```

`error` is omitted on success.

## Current Status

- Done: local MQTT -> Go -> Python integration
- Done: WAV validation and JSON contract in Python
- Done: faster-whisper baseline transcription in `backend_ai/detect.py`
- Next: validate with real recorded emergency and normal speech clips
- Next: re-enable persistence and connect results to dashboard/mobile flows
- Next: move from keyword baseline to stronger detection logic if needed

## Notes

- Start Mosquitto before starting the Go backend. The current MQTT setup connects once during startup.
- `backend_ai/samples/help.raw` is useful for transport testing, not for meaningful speech recognition.
- For real STT validation, record a spoken WAV file such as `backend_ai/samples/help_real.wav` and run it through `backend_ai/detect.py` first.

## Reference Files

- `PROJECT_SPEC.md`: full system architecture and target API shape
- `backend_ai/detect.py`: active Python detection entry point
- `go_backend/services/mqtt_service.go`: MQTT ingestion and WAV wrapping
- `go_backend/services/ai_runner.go`: Go to Python bridge

Last updated: 8 May 2026
Status: active prototype
