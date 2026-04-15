# AI Emergency Voice Detection System

**Project Deadline:** 29 May 2026 (50 days remaining)

##  Overview

Guardian AI is an **IoT-based emergency voice detection system** that monitors elderly patients or people in distress using:
- **Hardware:** ESP32 + INMP441 microphone
- **Backend:** Go + Fiber + PostgreSQL
- **AI:** Python ML model for emergency keyword detection
- **Mobile:** Flutter application for monitoring
- **Real-time Alerts:** LINE Notify integration

---

##  Team & Responsibilities

| Member | Component | Technology Stack |
|--------|-----------|------------------|
| **Kit** | Backend | Go, Fiber, PostgreSQL, MQTT, Gorm |
| **Nont** | AI/ML | Python, scikit-learn, librosa, Flask |
| **Ball** | Mobile + Hardware | Flutter, ESP32 (C/IDF), MQTT |

---

##  Project Structure

```
main_smartvoice/
├── backend_ai/              ← AI Training & Inference (YOUR PART)
│   ├── datasets/
│   │   ├── emergency/
│   │   ├── normal/
│   │   └── custom/
│   ├── models/
│   ├── train.py            ← Training script
│   ├── inference.py        ← Inference API server
│   ├── utils.py            ← Helper functions
│   ├── requirements.txt    ← Python dependencies
│   └── README_AI.md
│
├── esp32/                   ← Firmware (Ball's responsibility)
│   └── main/
│       └── voice_recorder.c
│
├── PROJECT_SPEC.md         ← Complete API & Architecture Spec
└── README.md               ← This file
```

---

##  Getting Started

### AI Module Setup (Your Part)

```bash
cd backend_ai

# Install dependencies
pip install -r requirements.txt

# Prepare dataset
# Add emergency audio to: datasets/emergency/
# Add normal audio to: datasets/normal/

# Train model
python train.py

# Run inference server
python inference.py --server 3000
```

### Backend Setup (Kittiwat's Part)

```bash
# Kittiwat will set up in separate Go project
# Backend will call your AI API at: http://localhost:3000/api/v1/audio/analyze
```

### Mobile Setup (Ball's Part)

```bash
# Flutter project
flutter pub get
flutter run
```

---

##  Data Flow

```
ESP32 (Microphone)
    │ MQTT (WiFi)
    ▼
MQTT Broker (1883)
    │ voice/audio/device001
    ▼
Backend API (Kittiwat)
    │ POST /api/v1/audio/analyze
    ▼
AI Service (You) ← Processing happens here
    │ Response: {isAlert, keyword, level, confidence}
    ▼
Backend stores in PostgreSQL
    │
    ├──→ Update Dashboard (Ball's Mobile App)
    │
    └──→ Send LINE Notify Alert
```

---

##  API Contract (CRITICAL - DO NOT CHANGE)

### AI Analysis Endpoint

**Request:**
```
POST /api/v1/audio/analyze
Content-Type: application/json

{
    "audioBuffer": "base64_encoded_wav",
    "deviceId": "device001",
    "sampleRate": 16000,
    "duration": 3.5
}
```

**Response:**
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

**This response format is the contract between your AI module and Kittiwat's backend.**

---

##  AI Module Milestones

### Week 1-2: Preparation
- [x] Install Python dependencies
- [x] Collect/prepare training dataset (LOTUSDIS + emergency samples)
- [x] Understand dataset structure
- [x] Setup and test feature extraction

### Week 3-4: Model Development
- [ ] Implement feature extraction pipeline
- [ ] Train baseline model
- [ ] Achieve >80% accuracy on test set
- [ ] Optimize hyperparameters

### Week 5-6: API & Integration
- [ ] Implement Flask inference server
- [ ] Test API endpoints
- [ ] Integration testing with backend
- [ ] Performance optimization

### Week 7-8: Final Polish
- [ ] Add error handling and logging
- [ ] Document code and API
- [ ] Final accuracy improvements
- [ ] Prepare for deployment

---

##  Current Progress

- Dataset download: completed with LOTUSDIS train/dev/test and annotation archive
- Dataset combination: completed into `backend_ai/datasets/combined_dataset.csv`
- Data quality check: completed with no missing values and no duplicate rows
- Prepared train/dev/test split files are available in `backend_ai/datasets`
- Next step: select and prepare 20 emergency keywords and normal speech set for model refinement

---

##  Documentation Files

- **`PROJECT_SPEC.md`** - Complete system specification (read this first!)
- **`README_AI.md`** - Detailed AI module documentation
- **`esp32/README.md`** (Ball) - Firmware documentation
- Code comments and docstrings throughout

---

**Last Updated:** 10 April 2026  
**Status:** 🟢 Active Development Phase