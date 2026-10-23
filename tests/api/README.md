# API tests (Jest + Supertest)

ทดสอบ Go Fiber backend แบบ black-box: ทุกคำขอวิ่งผ่าน URL ของเซิร์ฟเวอร์ที่รันอยู่จริง (`BASE_URL`)
ตามกรณีทดสอบในรายงานหัวข้อ 3.7.5 ตารางที่ 3.24–3.30 (TC-01 ถึง TC-56) และกรณีข้อมูลผิดรูปแบบเพิ่มเติม (VAL-xx)

> ⚠️ test สร้างและลบข้อมูลจริงในฐานข้อมูลของเซิร์ฟเวอร์ที่ชี้ไป ใช้กับเครื่องพัฒนาหรือเครื่องทดสอบเท่านั้น ห้ามชี้ไป production

## เตรียมเครื่อง

1. เปิด PostgreSQL + Redis + backend (ดู `backend/README.md`)

   ```powershell
   docker compose --env-file backend/.env up -d postgres redis
   cd backend
   go run ./cmd/seed     # ไม่บังคับ: ถ้ามีข้อมูล seed test จะใช้อุปกรณ์ seed ใน TC-27/TC-28 และเช็กว่าผู้ป่วย seed ไม่หลุดไปให้ผู้ดูแลคนอื่น
   go run .
   ```

2. ตั้งค่า test

   ```powershell
   cd tests/api
   copy .env.test.example .env.test   # แล้วใส่ค่าจริง (ไฟล์นี้ไม่ถูก commit)
   npm install
   ```

   | ตัวแปร | บังคับ | ใช้ทำอะไร |
   |---|---|---|
   | `BASE_URL` | ✓ | URL ของ backend |
   | `INTERNAL_API_KEY` | ✓ | ค่าเดียวกับ backend — เรียกเส้นทางภายใน (`X-Internal-Key`) |
   | `DATABASE_URL` | ✓ | PostgreSQL เดียวกับ backend — ยืนยันอีเมล/ตั้ง role ของผู้ใช้ทดสอบ ตรวจผลในตาราง และลบข้อมูลที่ test สร้าง |
   | `REDIS_URL` | | ตรวจ key ใน Redis (TC-27, TC-29, TC-33, TC-34) ไม่ตั้ง = ข้ามเฉพาะการตรวจ key |
   | `JWT_SECRET` | | สร้าง alert token แบบในลิงก์ LINE/Telegram (TC-40, TC-41) และ JWT หมดอายุ (TC-49) ไม่ตั้ง = ข้าม TC-40 |
   | `TELEGRAM_WEBHOOK_SECRET` | ถ้า backend ตั้งไว้ | จำลองการกด Start ในบอท (TC-17) |
   | `GOOGLE_ID_TOKEN` | | Google ID token จริง (อายุ 1 ชม.) ไม่ตั้ง = ข้าม TC-08 |
   | `AI_BASE_URL` | | Python AI server ไม่ตั้ง = ข้าม TC-32 |
   | `BACKEND_DIR` | | โฟลเดอร์ที่ backend รัน (เครื่องเดียวกัน) ใช้ลบรูปโปรไฟล์ที่ TC-14 อัปโหลด |

## รัน

```powershell
npm test               # รันทั้งหมด (ทีละไฟล์ --runInBand)
npm test -- alerts     # เฉพาะไฟล์ที่ชื่อมีคำนี้
npm test -- -t TC-42   # เฉพาะกรณีที่ชื่อมีคำนี้
npm run test:report    # รันแล้วเขียน results/summary.md (ตาราง รหัส | ผล | ค่าที่วัดได้ / สาเหตุ) และ results/jest-results.json
```

`results/` ไม่ถูก commit — แนบ `summary.md` เป็นหลักฐานผลการทดสอบในรายงาน

## โครงสร้าง

| ไฟล์ | กรณี |
|---|---|
| `tests/auth.test.js` | TC-01–TC-11, TC-08b (Google token ปลอม), VAL-01 (JSON เสีย), VAL-02 (ฟิลด์บังคับว่าง) |
| `tests/user.test.js` | TC-12–TC-18, TC-52, VAL-03 (อัปโหลดไฟล์ที่ไม่ใช่รูป) |
| `tests/patients.test.js` | TC-19–TC-25, VAL-04 (MAC ผิดรูปแบบ), VAL-05 (JSON เสีย) |
| `tests/devices.test.js` | TC-26–TC-31, TC-53, TC-54, VAL-06/VAL-09 (MAC ผิดรูปแบบ), VAL-07/VAL-08 (ฟิลด์บังคับว่าง/ค่าผิด) |
| `tests/alerts.test.js` | TC-32–TC-42, TC-55, TC-56, VAL-10 (ไฟล์ไม่ใช่ WAV), VAL-11 (ไม่มีไฟล์), VAL-12 (ไม่มี/ผิด X-Internal-Key) |
| `tests/admin.test.js` | TC-43–TC-47 |
| `tests/security.test.js` | TC-48–TC-51 |
| `helpers/` | config, Supertest, PostgreSQL + cleanup, Redis, ข้อมูลตั้งต้น, SSE, alert token / JWT |

## รันซ้ำได้และไม่ทิ้งข้อมูล

- อีเมล ชื่อ และ MAC ของทุกรอบไม่ซ้ำกัน (`apitest.<label>.<run>@example.com`, MAC `02:7E:…`) จึงไม่ชนข้อมูล seed (`02:5E:ED:…`) หรือรอบก่อน
- ผู้ใช้ทดสอบสมัครผ่าน `POST /api/auth/register` จริง แล้วตั้ง `is_verified` / `role` ใน DB; ผู้ป่วยและอุปกรณ์ตั้งต้นใส่ตรงใน DB (ส่วนที่ทดสอบ API นั้น ๆ เรียกผ่าน API)
- จบแต่ละไฟล์ `afterAll` ลบแบบ hard delete ทุกอย่างที่ไฟล์นั้นสร้าง (detection_logs, device_patients, caregiver_patients, mapping LINE/Telegram, patients, devices, users), key ใน Redis และไฟล์เสียงบนเซิร์ฟเวอร์ (ผ่าน `DELETE /api/audio/:filename` ของ admin) — ข้อมูล seed ไม่ถูกแตะ

## กรณีที่ข้าม (ต้องทดสอบด้วยมือ)

| รหัส | เหตุผล |
|---|---|
| TC-08 | ต้องใช้ Google ID token จริง (ตั้ง `GOOGLE_ID_TOKEN` แล้วรันได้) — TC-08b ทดสอบ token ปลอมแทน |
| TC-15 | ต้องใช้ authorization code จาก LINE Login จริง |
| TC-30 | สถานะ offline มาจาก Python receiver เมื่อบอร์ดเงียบ 10 วิ ต้องมีบอร์ด + broker + receiver |
| TC-32 | ต้องมี Python AI server (ตั้ง `AI_BASE_URL` แล้วรันได้) |
| TC-50 | ต้องมี MQTT broker + Python receiver |

## ข้อจำกัดของการตรวจแบบ black-box

- การส่งอีเมล (TC-01, TC-09) และข้อความ LINE/Telegram (TC-33, TC-34) ตรวจจาก API ไม่ได้ — ตรวจหลักฐานแทน: token ใน DB และ throttle key `alert:notify:{MAC}` ใน Redis (ไม่ถูกตั้งใหม่ภายใน 60 วิ = ไม่ส่งซ้ำ)
- SSE (TC-25, TC-42) เชื่อมด้วย JWT ใน header `Authorization`; backend poll DB ทุก 1 วินาที จึงได้ event ภายใน ~1 วินาที เกณฑ์ผ่านคือ ≤ `SSE_TIMEOUT_MS` (3000)
