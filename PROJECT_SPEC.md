# Guardian AI Emergency Voice Detection System
## Project Specification & API Contract

**Project Deadline:** 29 May 2026 (50 days)  
**Team:** Kittiwat (Backend/Go), You (AI/ML), Ball (Flutter Mobile + ESP32)

---

## 📋 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│         ESP32 Device (INMP441 Microphone)               │
└────────────────────┬────────────────────────────────────┘
                     │ WiFi MQTT
                     ▼
        ┌──────────────────────────────┐
        │  Mosquitto MQTT Broker       │
        │  (device.local:1883)         │
        └────────────┬─────────────────┘
                     │
         ┌───────────┴──────────────┐
         │                          │
         ▼                          ▼
    voice/audio/#             device/status/#
         │                          │
         ▼                          ▼
    ┌─────────────────────────────┐
    │  MQTT Audio Receiver        │
    │  (Python Service)           │
    │  http://localhost:8000      │
    └────────────┬────────────────┘
                 │ HTTP POST
                 ▼
    ┌─────────────────────────────┐
    │  AI Server (FastAPI)        │
    │  http://localhost:8000      │
    └────────────┬────────────────┘
                 │ JSON Response
                 ▼
    ┌─────────────────────────────┐
    │  Backend (Go + Fiber)       │
    │  http://localhost:3001      │
    └────────────┬────────────────┘
                 │ WebSocket Event
                 ▼
    ┌─────────────────────────────┐
    │  Next.js Frontend           │
    │  http://localhost:3000      │
    └─────────────────────────────┘

```

---

## 🔄 Data Flow

### 1. Audio Capture → MQTT Broker
**MQTT Topic:** `voice/audio/{deviceId}`  
**Payload:** Binary WAV audio (16 kHz, 16-bit, mono)

### 2. MQTT Broker → MQTT Audio Receiver
- **MQTT Audio Receiver** subscribes to `voice/audio/#` topic
- Receives binary PCM data and forwards it to the AI Server

### 3. MQTT Audio Receiver → AI Server
```json
POST /api/v1/audio/analyze
Content-Type: application/json

{
    "audioBuffer": "base64_encoded_audio",
    "deviceId": "device001",
    "sampleRate": 16000,
    "duration": 3.5
}
```

### 4. AI Server → MQTT Audio Receiver
```json
{
    "success": true,
    "isAlert": 1,
    "keyword": "help",
    "level": 4,
    "confidence": 0.95,
    "transcribedText": "help me please",
    "processingTime": 234
}
```

### 5. MQTT Audio Receiver → Go Backend
- Forwards the AI Server response to the Go Backend
- Backend processes the response, stores it in the database, and sends WebSocket events to the frontend

### 6. Go Backend → Next.js Frontend
- Sends WebSocket events to update the dashboard in real-time

---

## 🧪 Testing & Validation

### Integration Tests
- End-to-end: ESP32 → MQTT → MQTT Audio Receiver → AI Server → Go Backend → Database → Next.js Frontend
- Test with 10+ emergency audio samples

---

**Last Updated:** 21 May 2026  
**Status:** Active Development
