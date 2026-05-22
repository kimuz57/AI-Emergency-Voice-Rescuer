@echo off
chcp 65001 > nul
TITLE Guardian AI - Master Launcher
CLS
echo =======================================================================
echo               GUARDIAN AI SYSTEM - ONE-CLICK MULTI-LAUNCHER
echo =======================================================================
echo  [Status]: กำลังสั่งเปิดเซิร์ฟเวอร์แยกหน้าต่าง Terminal ให้เห็นกันชัดๆ...
echo =======================================================================
echo.

:: 1. Start MQTT Broker (Docker) - ตัวนี้รันเสร็จแล้วจะปิดไปในตัวหลัก
echo [STEP 1/4] Starting Mosquitto MQTT Broker via Docker...
cd /d "D:\backend_golang"
docker-compose up -d
echo.

:: 2. Start Python AI Forwarder (เปิดหน้าต่างใหม่)
echo [STEP 2/4] Popping up Python MQTT Audio Receiver...
start "Guardian AI - Python Forwarder" cmd /k "cd /d D:\backend_golang\backend_ai && python mqtt_audio_receiver.py"

:: 3. Start Go Backend (เปิดหน้าต่างใหม่)
echo [STEP 3/4] Popping up Go Backend Server...
start "Guardian AI - Go Backend (Port 8080)" cmd /k "cd /d D:\backend_golang\go_backend && go run main.go"

:: 4. Start Next.js Frontend (เปิดหน้าต่างใหม่)
echo [STEP 4/4] Popping up Next.js Frontend Dashboard...
start "Guardian AI - Next.js Frontend (Port 3000)" cmd /k "cd /d D:\backend_golang\frontend && npm run dev"

echo.
echo =======================================================================
echo  🎉 เปิดครบทุกบริการเรียบร้อยแล้วครับผู้กอง!
echo  - หน้าต่างใหม่ 3 หน้าจอจะเด้งขึ้นมาพ่น Log ให้เห็นแยกกันชัดเจน
echo  - หน้าต่างหลักนี้จะปิดตัวเองอัตโนมัติใน 5 วินาทีครับ
echo =======================================================================
timeout /t 5 > nul
exit