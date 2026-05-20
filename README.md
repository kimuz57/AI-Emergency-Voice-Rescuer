# KWS - ระบบตรวจจับเสียงขอความช่วยเหลือด้วย AI

## 📋 ภาพรวมโปรเจ็กต์

KWS เป็นระบบตรวจจับเสียงขอความช่วยเหลือแบบ Real-time โดยใช้ AI (Keyword Spotting) ที่ทำงานบน Microcontroller (ESP32) และโครงสร้างแบบ Distributed System ประกอบด้วยส่วนต่างๆ:

- **Backend Go (API Server)**: เซิร์ฟเวอร์หลักที่จัดการ API, Authentication, Database, และ MQTT Communication
- **Backend AI (Python)**: เซิร์ฟเวอร์สำหรับ AI Model (BCResNet) สำหรับ Keyword Spotting
- **Frontend (Next.js)**: เว็บแอปพลิเคชันสำหรับการจัดการอุปกรณ์และดูประวัติการแจ้งเตือน
- **ESP32 Firmware**: Microcontroller firmware สำหรับจับเสียงและส่งข้อมูลผ่าน WiFi/MQTT
- **MQTT Broker (Mosquitto)**: Message Broker สำหรับ Real-time Communication
- **MQTT Audio Receiver**: Python Service สำหรับรับเสียงจาก ESP32 และส่งไปยัง AI Backend

---

## 📁 โครงสร้างโปรเจ็กต์

```
backend_golang/
├── go_backend/                 # Go API Server (Port 8080)
│   ├── main.go                # Entry point
│   ├── controllers/           # API handlers
│   ├── routes/               # API routes
│   ├── models/               # Data models
│   ├── database/             # Database connection & migrations
│   ├── middleware/           # Authentication, CORS, etc.
│   └── services/             # Business logic & MQTT service
│
├── backend_ai/                # Python AI Server (Port 8000)
│   ├── app.py               # FastAPI application
│   ├── models.py            # BCResNet model definition
│   ├── detect.py            # Fallback detection logic
│   ├── requirements.txt      # Python dependencies
│   └── models/              # Trained model files
│
├── frontend/                 # Next.js Frontend (Port 3000)
│   ├── app/                 # App routes & pages
│   ├── components/          # React components
│   ├── hooks/              # Custom React hooks
│   └── package.json        # Dependencies
│
├── esp32/                   # ESP32 Firmware
│   ├── main/               # Main firmware code
│   ├── CMakeLists.txt      # Build configuration
│   └── sdkconfig           # IDF configuration
│
├── mqtt_audio_receiver.py   # Python MQTT listener & AI forwarder
├── docker-compose.yml       # Docker configuration for MQTT Broker
└── requirements.txt         # Root level Python dependencies
```

---

## 🔧 ความต้องการเบื้องต้น (Prerequisites)

### ระดับทั้งระบบ

- **Windows 10/11** หรือ **Linux**
- **Docker & Docker Compose** (สำหรับ MQTT Broker)
- **Git**

### Go Backend

- **Go 1.26.2+**
- **PostgreSQL 12+**
- `.env` file (สำหรับ Database connection string)

### Python Components

- **Python 3.8+**
- **pip** หรือ **conda**
- **Virtual Environment** (venv)

### Frontend

- **Node.js 18+**
- **npm** หรือ **yarn**

### ESP32 Firmware

- **ESP-IDF v4.4+**
- **Python 3.7+** (สำหรับ IDF tools)
- **Hardware**: ESP32 DevKit V1 + INMP441 Microphone Module

---

## 🚀 วิธีการติดตั้ง

### ขั้นตอนที่ 1: Clone Repository และตั้งค่าโฟลเดอร์

```bash
cd d:\backend_golang
```

### ขั้นตอนที่ 2: ตั้งค่า Go Backend

#### 2.1 ติดตั้ง Go Dependencies

```bash
cd go_backend
go mod download
```

#### 2.2 สร้าง `.env` file

สร้างไฟล์ `.env` ในโฟลเดอร์ `go_backend/` :

```env
# Database Configuration
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

# JWT Secret (ใช้สำหรับ Authentication)
JWT_SECRET=

# MQTT Configuration
MQTT_BROKER=
MQTT_PORT=

# Server Configuration
SERVER_PORT=
ENVIRONMENT=
```

#### 2.3 ตั้งค่า PostgreSQL Database

```bash
# สร้าง Database
createdb smartvoice

# รัน migrations (ถ้ามี)
# psql smartvoice < migrations/schema.sql
```

### ขั้นตอนที่ 3: ตั้งค่า Python AI Backend

#### 3.1 สร้าง Virtual Environment

```bash
cd backend_ai
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

#### 3.2 ติดตั้ง Python Dependencies

```bash
pip install -r requirements.txt
```

### ขั้นตอนที่ 4: ตั้งค่า Python MQTT Audio Receiver

```bash
# ไฟล์นี้อยู่ที่ root directory
# ตรวจสอบ AI_SERVER_URL ใน mqtt_audio_receiver.py
# ปกติตั้งค่า: AI_SERVER_URL = "http://localhost:8000/need-help"
```

### ขั้นตอนที่ 5: ตั้งค่า Frontend

#### 5.1 ติดตั้ง Node Dependencies

```bash
cd frontend
npm install
# หรือ
yarn install
```

#### 5.2 สร้าง `.env.local` file (ถ้าจำเป็น)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_MQTT_BROKER=ws://localhost:9001
```

### ขั้นตอนที่ 6: ตั้งค่า MQTT Broker (Mosquitto)

#### 6.1 เตรียม Mosquitto Configuration

สร้างโฟลเดอร์ `mosquitto/config/` และไฟล์ `mosquitto.conf`:

```bash
mkdir -p mosquitto/config mosquitto/data mosquitto/log
```

สร้างไฟล์ `mosquitto/config/mosquitto.conf`:

```
listener 1883 0.0.0.0
protocol mqtt

listener 9001 0.0.0.0
protocol websockets

persistence true
persistence_location /mosquitto/data/
```

#### 6.2 เรียกใช้ MQTT Broker ด้วย Docker

```bash
docker-compose up -d
```

### ขั้นตอนที่ 7: ตั้งค่า ESP32 Firmware

```bash
cd esp32

# ตั้งค่า ESP-IDF
export IDF_PATH=/path/to/esp-idf
. $IDF_PATH/export.sh

# สำหรับ Windows (PowerShell)
$env:IDF_PATH = "C:\path\to\esp-idf"
. $env:IDF_PATH\tools\idf.ps1

# Configure WiFi & MQTT settings
idf.py menuconfig
# ค้นหา "WiFi Configuration" และ "MQTT Configuration" เพื่อตั้งค่า
```

---

## ▶️ วิธีการรันเซิร์ฟเวอร์

### เริ่มต้นระบบ - วิธีที่แนะนำ (ตามลำดับ)

#### 1️⃣ เริ่มต้น MQTT Broker

```bash
# จากโฟลเดอร์ root
docker-compose up -d

# ตรวจสอบสถานะ
docker-compose ps

# ดูเลย์
docker-compose logs -f mosquitto
```

#### 2️⃣ เริ่มต้น Go Backend Server

```bash
cd go_backend
go run main.go

# หรือบิลด์แล้วรัน
go build
./main  # Windows: main.exe

# ผลลัพธ์ที่คาดหวัง
# 🚀 Server is running on port 8080
```

#### 3️⃣ เริ่มต้น Python AI Server

ในหน้าต่างคำสั่ง Terminal ใหม่:

```bash
cd backend_ai

# Activate virtual environment
python -m venv venv
venv\Scripts\activate  # Windows

# รัน FastAPI server
uvicorn app:app --reload --host 0.0.0.0 --port 8000

# ผลลัพธ์ที่คาดหวัง
# Uvicorn running on http://0.0.0.0:8000
# API Docs: http://localhost:8000/docs
```

#### 4️⃣ เริ่มต้น MQTT Audio Receiver

ในหน้าต่าง Terminal ใหม่:

```bash
# Activate Python venv (root level หรือ backend_ai)
cd d:\backend_golang
python mqtt_audio_receiver.py

# ผลลัพธ์ที่คาดหวัง
# Connected to MQTT Broker on 127.0.0.1:1883
# Subscribed to voice/audio/ESP32_DEVICE_001
```

#### 5️⃣ เริ่มต้น Next.js Frontend

ในหน้าต่าง Terminal ใหม่:

```bash
cd frontend

# Development mode
npm run dev
# หรือ
yarn dev

# ผลลัพธ์ที่คาดหวัง
# ready - started server on 0.0.0.0:3000
# เปิดเบราว์เซอร์: http://localhost:3000
```

### Quick Start Script (Windows PowerShell)

สร้างไฟล์ `start_all.ps1`:

```powershell
# Start MQTT Broker
Write-Host "Starting MQTT Broker..." -ForegroundColor Green
docker-compose up -d

# Wait a moment for MQTT to start
Start-Sleep -Seconds 2

# Start Go Backend
Write-Host "Starting Go Backend on port 8080..." -ForegroundColor Green
Start-Process -FilePath "pwsh" -ArgumentList "-NoExit", "-Command", "cd go_backend; go run main.go"

# Wait for backend to start
Start-Sleep -Seconds 3

# Start AI Backend
Write-Host "Starting AI Backend on port 8000..." -ForegroundColor Green
Start-Process -FilePath "pwsh" -ArgumentList "-NoExit", "-Command", "cd backend_ai; python -m venv venv; .\venv\Scripts\activate; uvicorn app:app --reload --host 0.0.0.0 --port 8000"

# Wait for AI backend to start
Start-Sleep -Seconds 3

# Start MQTT Audio Receiver
Write-Host "Starting MQTT Audio Receiver..." -ForegroundColor Green
Start-Process -FilePath "pwsh" -ArgumentList "-NoExit", "-Command", "python mqtt_audio_receiver.py"

# Start Frontend
Write-Host "Starting Frontend on port 3000..." -ForegroundColor Green
Start-Process -FilePath "pwsh" -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "`nAll services started!" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Go API: http://localhost:8080" -ForegroundColor Yellow
Write-Host "AI API: http://localhost:8000" -ForegroundColor Yellow
Write-Host "MQTT Broker: 127.0.0.1:1883" -ForegroundColor Yellow
```

รัน:

```bash
.\start_all.ps1
```

---

## 📡 Architecture & Communication Flow

```
┌──────────────────┐
│    ESP32         │
│  (Microphone)    │
└────────┬─────────┘
         │ WiFi + I2S Audio
         │
┌────────▼──────────────────┐
│   MQTT Broker             │
│   (Mosquitto)             │
│   Port: 1883              │
└────────┬──────────────────┘
         │
         ├─────────────────────────────────┐
         │                                 │
    ┌────▼────────────┐         ┌─────────▼──────┐
    │  MQTT Audio     │         │  Go Backend    │
    │  Receiver       │         │  (API Server)  │
    │  (Python)       │         │  Port: 8080    │
    │  Port: N/A      │         └────────────────┘
    └────┬────────────┘              │
         │ HTTP POST                 │
         │ PCM Audio WAV             ├──► PostgreSQL
         │                           │
    ┌────▼────────────┐             ├──► MQTT Topics
    │  AI Backend     │             │
    │  BCResNet KWS   │         ┌────▼──────────┐
    │  (FastAPI)      │         │   Frontend    │
    │  Port: 8000     │         │   (Next.js)   │
    └─────────────────┘         │   Port: 3000  │
                                └───────────────┘
```

---

## 🐛 Troubleshooting

### 1. PostgreSQL Connection Error

```
Error: failed to connect to database
```

**วิธีแก้**:

- ตรวจสอบว่า PostgreSQL เปิดใช้งาน: `psql -U postgres`
- ตรวจสอบ `.env` connection string
- ตรวจสอบ port 5432 ไม่ถูกบล็อก

### 2. MQTT Broker Connection Failed

```
Error: MQTT connection refused on 127.0.0.1:1883
```

**วิธีแก้**:

```bash
# ตรวจสอบ Docker
docker-compose ps

# เรียกใช้ใหม่
docker-compose restart mosquitto

# ดูเลย์
docker-compose logs mosquitto
```

### 3. AI Model Loading Error

```
Error: Model file not found
```

**วิธีแก้**:

- ตรวจสอบว่าโมเดล .pt อยู่ใน `backend_ai/models/`
- ดาวน์โหลดโมเดล (ถ้ายังไม่มี)

### 4. Port Already in Use

```
Error: Address already in use :::8080
```

**วิธีแก้**:

```bash
# หา process ที่ใช้ port
netstat -ano | findstr :8080  # Windows
lsof -i :8080                 # Linux/Mac

# Kill process
taskkill /PID <PID> /F  # Windows
kill -9 <PID>          # Linux/Mac
```

### 5. Frontend Can't Connect to API

```
CORS Error: Access to XMLHttpRequest has been blocked
```

**วิธีแก้**:

- ตรวจสอบว่า Go Backend กำลังทำงาน (port 8080)
- ตรวจสอบ CORS configuration ใน `go_backend/main.go`
- ใน browser console ดู Network tab

### 6. No Audio Received from ESP32

```
MQTT: No messages received
```

**วิธีแก้**:

- ตรวจสอบว่า ESP32 เชื่อมต่อ WiFi
- ตรวจสอบ ESP32 firmware flash
- ตรวจสอบ MQTT_BROKER ใน ESP32 config ตรงกับ IP ที่ถูกต้อง

---

## 📄 License

[เพิ่มข้อมูล License ตามต้องการ]

---

**Last Updated**: May 2026
**Version**: 1.0.1
