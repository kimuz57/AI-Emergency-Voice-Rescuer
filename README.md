# Emergency Voice Rescuer — ระบบตรวจจับเสียงขอความช่วยเหลือด้วย AI

ระบบเฝ้าระวังผู้สูงอายุและผู้ป่วย: บอร์ด ESP32 ไมค์ 2 ตัวฟังเสียงในห้องตลอดเวลา เซิร์ฟเวอร์ AI ตรวจจับเสียงร้องขอความช่วยเหลือ
แล้วแจ้งผู้ดูแลทันทีผ่านแดชบอร์ดเว็บ (เรียลไทม์), LINE และ Telegram พร้อมไฟล์เสียงให้ฟังย้อนหลัง

โปรเจคจบ มหาวิทยาลัยพะเยา

| ทีม | หน้าที่ |
|---|---|
| นนท์ | Product Lead / Frontend |
| กิต | Backend Lead / Go + Redis + DevOps |
| อัง | Hardware & AI — ESP32 + INMP441, DSP, BCResNet |

---

## ระบบทำงานอย่างไร

```
ESP32 (firmwareV2) + INMP441 x2 บน I2S เดียว (stereo L/R, 8 kHz, 16 บิต)
    ส่งเสียงดิบ 2 ช่องทุก ~128 ms ไม่มี DSP บนบอร์ด
    │  MQTT  voice/audio/{MAC}    PCM int16 สลับ L,R ก้อนละ 4096 byte
    │        device/status/{MAC}  online / offline (LWT)
    │  HTTPS GET /api/device/checkin  (ตอนได้ IP)
    ▼
MQTT broker (Mosquitto ในเครื่อง dev / EMQX บน production)
    ▼
Python AI  api/  (uvicorn :8000 โปรเซสเดียว)
    ├─ mqtt_audio_receiver.py  หน้าต่าง 2 วิ เลื่อนทีละ 0.5 วิ ต่อบอร์ด
    ├─ dsp.py                  HPF → AGC → VAD → GCC-PHAT → DAS+post-filter / MVDR → เสียงช่องเดียว
    ├─ app.py                  log-Mel → BCResNet → P(ร้องขอความช่วยเหลือ)
    └─ ตัดสินจากค่าเฉลี่ย 3 หน้าต่าง > 0.5 แล้วพัก 30 วิ ต่อบอร์ด
    │  HTTP POST (X-Internal-Key)  /api/audio/emergency  พร้อมไฟล์ WAV + ระดับไมค์ L/R
    ▼
Go backend  backend/  (Fiber :8080) — PostgreSQL + Redis
    ├─ บันทึกเหตุลง detection_logs + ไฟล์เสียง
    ├─ แจ้ง LINE / Telegram (ไม่เกิน 1 ครั้งต่อนาทีต่อบอร์ด) พร้อมลิงก์หน้า /alert
    └─ REST API + SSE
    ▼
Next.js frontend  frontend/  (:3000) — แดชบอร์ด, ประวัติ, ปฏิทิน, จัดการผู้ป่วย/อุปกรณ์, หน้าแอดมิน
```

รายละเอียดทุก endpoint, ตาราง, topic, env และข้อจำกัดที่รู้ อยู่ใน [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
และสรุปสำหรับนักพัฒนาใน [`CLAUDE.md`](CLAUDE.md)

## โครงสร้าง repo

| โฟลเดอร์ | คืออะไร | เอกสาร |
|---|---|---|
| `frontend/` | Next.js 16 (App Router) + Tailwind 4 | [`frontend/README.md`](frontend/README.md) |
| `backend/` | Go + Fiber + GORM, ข้อมูลตัวอย่าง `cmd/seed` | [`backend/README.md`](backend/README.md) |
| `api/` | Python FastAPI: ตัวรับ MQTT + DSP 2 ไมค์ + โมเดล + เครื่องมือทดสอบ | [`api/README.md`](api/README.md) |
| `firmwareV2/` | firmware ESP32 ไมค์ 2 ตัว (ตัวที่ใช้งาน) | [`firmwareV2/README.md`](firmwareV2/README.md) |
| `firmwareV1/` | firmware ไมค์เดียวรุ่นแรก เก็บไว้อ้างอิง | [`firmwareV1/README.md`](firmwareV1/README.md) |
| `mosquitto/` | config MQTT broker สำหรับ Docker | [`mosquitto/README.md`](mosquitto/README.md) |
| `tests/api/` | เทสต์ API แบบ black-box (Jest + Supertest) TC-01–TC-57 | [`tests/api/README.md`](tests/api/README.md) |
| `design/` | mockup HTML ทุกหน้าสำหรับนำเข้า Figma | [`design/figma-mockups/README.md`](design/figma-mockups/README.md) |
| `docs/` | `ARCHITECTURE.md` เอกสารสถาปัตยกรรมที่ตรวจกับโค้ดแล้ว | |

## สถานะ

**เสร็จแล้ว**
- firmware ส่งเสียงไมค์ 2 ตัวแยกช่อง, DSP 2 ไมค์ฝั่งเซิร์ฟเวอร์ (DAS+post-filter / MVDR), ตัดสินจากหลายหน้าต่าง + ช่วงพัก
- ระบบแจ้งเตือนครบเส้นทาง: แดชบอร์ด SSE, LINE, Telegram, หน้า `/alert` รับทราบเหตุจากลิงก์
- ล็อกอินอีเมล/รหัสผ่าน + Google, ตรวจสิทธิ์ทุก route, admin กับผู้ดูแลแยกสิทธิ์
- ระดับสัญญาณไมค์ซ้าย/ขวาของทุกเหตุ ดูได้ที่ `/admin/audio-diagnostics`
- ผู้ดูแลผูกบอร์ดได้เฉพาะบอร์ดที่กำลังส่งเสียงเข้าระบบ (กันการผูกบอร์ดคนอื่นจาก MAC)
- หน้าเว็บทุกหน้าใช้ดีไซน์ Tabler รองรับมือถือและโหมดมืด
- ทดสอบทั้งระบบโดยไม่มีบอร์ดได้ด้วย `api/tools/mqtt_simulate.py`

**ยังค้าง**
- ตรวจลำดับไมค์ L/R และทดลองระยะ 1–5 เมตรกับบอร์ดจริง (อัง)
- แฟลชบอร์ดบน production เป็น firmwareV2 แล้วสลับ receiver เป็นรุ่น 2 ไมค์ (ดูหัวข้อ production)
- รหัสยืนยันตอนผูกบอร์ดที่ firmware แสดง (ต้องแก้ firmware)
- Redis เป็นคิวแทน MQTT บางเส้นทาง (แผน)

---

## รันบนเครื่อง (Windows)

### ต้องมี

- Docker Desktop (เปิดไว้), Go 1.26+, Node.js 20+, Python 3.12+ กับ [uv](https://docs.astral.sh/uv/)
- ESP-IDF 5.5.2 เฉพาะถ้าจะ build firmware

### ตั้งค่าครั้งแรก

1. ก๊อปไฟล์ env แล้วใส่ค่า (แต่ละไฟล์อธิบายทุกตัวแปรไว้แล้ว)
   - `backend/.env.example` → `backend/.env` — `JWT_SECRET` ต้องยาว ≥ 32 ตัว
   - `api/.env.example` → `api/.env` — `INTERNAL_API_KEY` ต้องตรงกับใน `backend/.env`
   - `frontend/.env.example` → `frontend/.env.local`
2. สร้างไฟล์รหัสผ่านและ cert ของ Mosquitto ตาม [`mosquitto/README.md`](mosquitto/README.md)
   (บน Windows ต้อง `chown 1883` ตามขั้นที่เขียนไว้ ไม่งั้น broker restart วน)
3. ติดตั้ง dependency

```powershell
uv sync --directory api --group dev
```

```powershell
npm --prefix frontend install
```

### เปิดทั้งระบบ

```powershell
.\start_guardian.bat
```

สคริปต์ตรวจของที่ต้องมี เปิด Postgres (127.0.0.1:5433), Redis, Mosquitto ใน Docker แล้วเปิดหน้าต่าง Python, Go และ Next.js
หรือเปิดทีละตัว (รันจากโฟลเดอร์ราก คนละหน้าต่าง):

```powershell
docker compose --env-file backend/.env up -d
```

```powershell
uv run --directory api uvicorn app:app --host 0.0.0.0 --port 8000
```

```powershell
go -C backend run .
```

```powershell
npm --prefix frontend run dev
```

เปิด http://localhost:3000 — บัญชี admin แรกถูกสร้างจาก `ADMIN_EMAIL` / `ADMIN_PASSWORD` ใน `backend/.env` (ไม่มีรหัสตั้งต้นในโค้ด)

### ข้อมูลตัวอย่างและการจำลองบอร์ด

ใส่ผู้ใช้ ผู้ป่วย 4 คน อุปกรณ์ 4 ตัว และประวัติ 30 วัน (รหัสผ่านจาก `SEED_*` ใน `backend/.env`):

```powershell
go -C backend run ./cmd/seed
```

ส่งเสียงจากไฟล์ WAV เข้า MQTT ในนามบอร์ด — ถ้าเป็นเสียงขอความช่วยเหลือ การ์ดแจ้งเตือนจะขึ้นในแดชบอร์ดภายในไม่กี่วินาที:

```powershell
uv run --directory api python tools/mqtt_simulate.py --mac 02:5E:ED:00:00:01 --wav path\to\help.wav --repeat 2
```

### ทดสอบ

| ส่วน | คำสั่ง | หมายเหตุ |
|---|---|---|
| Python | `uv run --directory api --group dev pytest` | สัญญาณสังเคราะห์ ไม่ต้องต่อ broker |
| Go | `go -C backend test ./...` | บางเทสต์ใช้ sqlite ต้องมี cgo (gcc) — ถ้าไม่มีให้รันใน container `golang:1.26` |
| API ทั้งระบบ | `npm --prefix tests/api test` | ต้องเปิด backend + DB จริง ตั้ง `tests/api/.env.test` ก่อน |
| Frontend | `npm run lint` และ `npx tsc --noEmit` ในโฟลเดอร์ `frontend/` | |

ทดสอบโมเดลตรง ๆ: ส่งไฟล์ WAV ไปที่ `POST http://localhost:8000/need-help` (field `sound`) ได้ผล `{"detected": "yes", "probability": 0.99}`

---

## Production

โดเมน: หน้าเว็บ `https://kws.wattanapong.com`, backend `https://kwsb.wattanapong.com` ไม่มี CI/CD ต้อง deploy เอง

```bash
git pull origin main
```

```bash
go -C backend build -o main .
```

```bash
npm --prefix frontend ci && npm --prefix frontend run build
```

ข้อควรรู้ก่อน deploy
- **firmware กับ receiver (`api/`) ต้องรุ่นเดียวกัน** receiver ใน `main` ต้องการเสียง 2 ช่องจาก firmwareV2 ถ้าบอร์ดยังเป็นรุ่นไมค์เดียว ให้รัน receiver จาก tag `v1.0-mono` (ดูหัวข้อถัดไป)
- **backend ต้องมี `INTERNAL_API_KEY` และ receiver ต้องส่งค่าเดียวกัน** ไม่งั้นเส้นทางแจ้งเหตุตอบ 503/401 และไม่มีการแจ้งเตือน
- Go อ่านเฉพาะ `backend/.env` (ไม่อ่าน `.env.production`) — ตั้ง `APP_ENV=production`, `FRONTEND_URL`, `JWT_SECRET` ≥ 32 ตัว, `ADMIN_EMAIL`/`ADMIN_PASSWORD`
- `next build` อ่าน `frontend/.env.production` และฝังค่า `NEXT_PUBLIC_*` ตอน build — เปลี่ยนค่าแล้วต้อง build ใหม่
- backend เพิ่มคอลัมน์ใหม่ให้เองตอนเริ่ม (GORM AutoMigrate) ไม่ต้อง migrate มือ
- ห้าม commit `.env`, `firmware*/main/secrets.h`, `mosquitto/config/passwd`, `mosquitto/certs/`

---

## ESP32 firmware

ESP32 DevKit V1 + INMP441 2 ตัวบนบัส I2S เดียวกัน (ตัวหนึ่ง L/R ต่อ GND อีกตัวต่อ 3.3V) — 8 kHz, 16 บิต

| ขา | GPIO | หน้าที่ |
|---|---|---|
| SCK | 26 | I2S clock (ใช้ร่วมกัน 2 ไมค์) |
| WS | 25 | เลือกช่อง L/R |
| DIN | 22 | ข้อมูลเสียง |
| Status LED | 2 | ไฟแดง — ต่อ Wi-Fi แล้ว |
| Record LED | 4 | ไฟเขียว — กำลังส่งเสียง |
| SoftAP LED | 16 | โหมดตั้งค่า Wi-Fi |
| STATUS_BORD_PIN | 14 | ตั้งเป็น high ตอนบูต |

ตั้งค่า Wi-Fi: บอร์ดเปิด Soft-AP ชื่อ `Smartvoice-XXXXXX` (6 ตัวท้ายของ MAC) หน้าตั้งค่าที่ `192.168.4.1`
พอต่อ Wi-Fi สำเร็จจะแสดงลิงก์หน้า `/register-patient?mac=...` ให้ผูกบอร์ดกับผู้ป่วย

```powershell
cd firmwareV2
copy main\secrets.h.example main\secrets.h   # ใส่ user/รหัส MQTT ครั้งแรก
idf.py build flash monitor
```

เลือก broker/backend ปลายทางด้วย `DEPLOY_ENV` ใน `main/main.c` (`ENV_LOCAL` / `ENV_SERVER` / `ENV_LAB`)

---

## ย้อนกลับไปเวอร์ชันไมค์ช่องเดียว (`v1.0-mono`)

| Tag | Commit | เนื้อหา |
|---|---|---|
| `v1.0-mono` | `d203485` | ไมค์ช่องเดียว (firmware mixdown เป็น mono) ที่ใช้งานได้ |
| `v2.0-2mic-untested` | `b7977b7` | ระบบ 2 ไมค์ครบชุด ยังไม่ได้ทดสอบกับบอร์ดจริง |

**firmware และ receiver (`api/`) ต้องย้อนพร้อมกัน** — receiver รุ่น 2 ไมค์ตีความเสียง mono ผิด และรุ่นเดิมก็ตีความเสียง 2 ช่องผิด
ส่วน Go backend และ frontend ใช้ของ `main` ต่อได้ (รับ WAV mono 16 บิตจาก receiver รุ่นเดิมได้)

```powershell
git fetch --tags
git worktree add ..\kws-v1.0 v1.0-mono          # ไม่แตะ branch main

# 1) หยุด uvicorn รุ่น 2 ไมค์ก่อน

# 2) firmware: sdkconfig ใน tag เดิมตั้ง partition 1 MB ซึ่งแอปล้น (build ไม่ผ่าน) ให้ใช้ sdkconfig ของ v2 (4MB + large partition)
cd ..\kws-v1.0\firmwareV2
git show v2.0-2mic-untested:firmwareV2/sdkconfig | Out-File -Encoding ascii sdkconfig
copy ..\..\kws\firmwareV2\main\secrets.h main\secrets.h
idf.py -p COM3 flash monitor                      # ไม่ต้อง erase-flash ตำแหน่ง NVS เดิม ค่า Wi-Fi ยังอยู่ — แฟลชทุกบอร์ด

# 3) receiver รุ่นเดิม ใช้ api/.env เดิมได้ (ตัวแปรของรุ่น 2 ไมค์ถูกข้าม) ต้องมี SAMPLE_RATE=8000
cd ..\api
copy ..\..\kws\api\.env .env
uv sync
uv run uvicorn app:app --host 0.0.0.0 --port 8000
```

กลับมาใช้ 2 ไมค์: หยุด uvicorn ของ `..\kws-v1.0`, แฟลช firmware จาก `main`, รัน receiver จาก `main` แล้ว `git worktree remove ..\kws-v1.0`

---

## Branch

| Branch | เนื้อหา |
|---|---|
| `main` | โค้ดล่าสุดที่ใช้ deploy รวมทุกส่วน |
| `python-ai-server` | Python AI + Go backend + ESP32 + mobile (แยก, เก่า) |
| `golangBackend` | Go backend เก่า |
| `dev` | Development branch |

Tag `v1.0-mono` และ `v2.0-2mic-untested` ใช้ย้อนเวอร์ชันตามหัวข้อด้านบน
