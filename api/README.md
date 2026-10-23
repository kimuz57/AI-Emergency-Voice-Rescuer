# api — MQTT receiver + DSP + โมเดล

โปรเซสเดียว (`uvicorn app:app`, port 8000) รวม

| ไฟล์ | หน้าที่ |
|---|---|
| `mqtt_audio_receiver.py` | รับ PCM 2 ช่องจาก `voice/audio/{MAC}`, ตัดหน้าต่าง 2 วิ เลื่อน 0.5 วิ, เรียก DSP + โมเดล, เฉลี่ย 3 หน้าต่าง, ส่งเหตุไป Go |
| `dsp.py` | HPF → AGC → VAD → GCC-PHAT → `DSP_MODE` (`mono` / `das_pf` / `mvdr`) ได้เสียงช่องเดียว 8 kHz |
| `app.py` | โหลดโมเดล (`MODEL_ARCH`, `MODEL_PATH`), log-Mel, `run_kws_inference()`, `POST /need-help` |
| `eval_offline.py` | ทดลองแบบ offline กับโฟลเดอร์ WAV ที่มี label (Accuracy, Precision, Recall, F1, FP, FN, เวลาต่อหน้าต่าง) |
| `tools/mqtt_record.py` | ดูระดับเสียงแต่ละไมค์ และบันทึกเสียงดิบ 2 ช่องจากบอร์ดจริง |

รายละเอียดเชิงลึกอยู่ใน `docs/ARCHITECTURE.md` หัวข้อ 4 ค่าตั้งทั้งหมดอยู่ใน `.env.example`

```powershell
cd api
copy .env.example .env          # ครั้งแรก แล้วใส่ค่าจริง
uv sync --group dev
uv run uvicorn app:app --host 0.0.0.0 --port 8000
uv run pytest                   # unit test (สัญญาณสังเคราะห์ ไม่ต้องต่อ broker)
```

> `torchaudio.load` ใช้ torchcodec ซึ่งต้องมี FFmpeg แบบ shared library — บน Windows ถ้าลง FFmpeg แบบ static
> ทุกหน้าต่างจะได้ `detected="error"` (log `[AI] Inference failed`)

## วิธีทดสอบกับบอร์ดจริง

### 0. เตรียม

1. แฟลช firmware รุ่น 2 ช่อง (`firmwareV2`, ดู `firmwareV2/README.md`) — รุ่นเก่าส่ง mono 2048 byte ที่ receiver แยกไม่ออก
2. บอร์ดต้องลงทะเบียนและเปิดใช้งานแล้ว (ผูกกับผู้ป่วยผ่านหน้า `/register-patient`) ไม่งั้น receiver ทิ้งเสียงทั้งหมด
3. วัดระยะห่างระหว่างไมค์จริง ถ้าไม่ใช่ประมาณ 10 ซม. ให้ตั้ง `DSP_GCC_MAX_LAG = ceil(ระยะ_ม. / 343 × 8000)` ใน `.env`
   (เช่น 15 ซม. → 4)
4. ใน `.env` ตั้ง `APP_ENV=development` และ `DSP_LOG_TIMING=true` แล้วรัน `uv run uvicorn app:app --port 8000`
   เก็บ log ไว้เป็นไฟล์ด้วย:

   ```powershell
   $env:PYTHONIOENCODING = "utf-8"; uv run uvicorn app:app --port 8000 2>&1 | Tee-Object -FilePath run.log
   ```

### 1. ตรวจลำดับช่อง L/R

firmware ถือว่าไมค์ที่ต่อขา L/R ลง **GND** คือช่อง L (`pcm[2i]`) ถ้าสายต่อสลับกัน การหาทิศทางและ beamforming จะกลับด้าน

1. เปิดดูระดับเสียงแยกช่อง (รันพร้อม uvicorn ได้):

   ```powershell
   uv run python tools/mqtt_record.py --mac AA:BB:CC:DD:EE:FF
   ```

   จะได้บรรทัดละ 1 วินาที เช่น `L  -48.2 dBFS [#####.....]  R  -47.9 dBFS [#####.....]  L-R  -0.3 dB`
2. ห้องเงียบ ทั้งสองช่องควรต่างกันไม่เกิน ~3 dB (ถ้าช่องใดเป็น `-inf` หรือต่ำกว่าอีกช่องมาก แปลว่าไมค์ตัวนั้นไม่ส่งข้อมูล — ตรวจสาย SD/L/R)
3. **ปิดไมค์ทีละตัว**: ใช้นิ้วอุดรูไมค์หรือเทปปิดไมค์ตัวที่ต่อ L/R ลง GND แล้วพูดหรือเคาะโต๊ะเบา ๆ ต่อเนื่อง
   - ถูกต้อง: ค่า **L ลดลง** ชัดเจน (`L-R` ติดลบหลาย dB) ส่วน R ไม่เปลี่ยน
   - ถ้า **R ลดลง** แทน: ลำดับสลับ → แก้ใน `firmwareV2/main/main.c` → `audio_record_task()` ให้สลับ `raw_buf[2 * i]` กับ `raw_buf[2 * i + 1]` แล้วแฟลชใหม่
4. ทำซ้ำกับไมค์อีกตัว (ที่ต่อ L/R เข้า 3.3V) ต้องได้ผลกลับกัน
5. (ไม่บังคับ) ยืนด้านข้างฝั่งไมค์ L แล้วพูด ใน log ของ uvicorn `delay=` ควรเป็น**บวก** (เสียงถึงไมค์ซ้ายก่อน) ฝั่งขวาเป็นลบ และตรงหน้าใกล้ 0

### 2. อ่าน log ของ receiver: `gcc_peak` และเวลา

ทุกหน้าต่าง (0.5 วิ) มี 1 บรรทัด เช่น

```text
[DSP] AA:BB:CC:DD:EE:FF mode=das_pf speech=yes ratio=0.52 gain=1.84 delay=+1.94 gcc_peak=0.61 | ms hpf=0.41 agc=0.52 vad=0.14 gcc_phat=0.86 beamform=4.51 dsp_total=6.60 infer=18.30 | p_yes=0.912 avg3/3=0.744 -> ALERT
```

| ค่า | ดูอะไร |
|---|---|
| `speech` / `ratio` | ห้องเงียบควรเป็น `speech=no` เกือบทุกบรรทัด ถ้าเป็น `yes` บ่อยทั้งที่เงียบ ให้เพิ่ม `DSP_VAD_THRESHOLD_DB` |
| `delay` | ความหน่วงระหว่างไมค์ (ค่าตัวอย่าง, ±3) ผู้พูดอยู่นิ่งควรได้ค่าใกล้เดิมทุกหน้าต่าง ถ้าติดขอบ ±3 บ่อย ระยะไมค์อาจมากกว่าที่ตั้งไว้ |
| `gcc_peak` | ความชัดของ GCC-PHAT (0–1) เสียงพูดชัดในห้องเงียบมักสูงกว่า ~0.3 ถ้าต่ำกว่า ~0.15 ตลอด (เสียงก้อง เสียงรบกวนมาก หรือไมค์ตัวหนึ่งเสีย) `delay` จะเชื่อถือไม่ได้ และ `das_pf`/`mvdr` อาจแย่กว่า `mono` |
| `rn` | (`mvdr`) `window` = ได้ noise covariance จากหน้าต่างนี้, `memory` = ใช้ของเดิม, `all_frames` = ยังไม่เคยเจอช่วงเงียบ (ช่วงแรกหลังเปิด) |
| `dsp_total`, `infer` | เวลาต่อหน้าต่าง (ms) ผลรวมต้อง**น้อยกว่า 500 ms** (หนึ่ง hop) ไม่งั้นงานค้างจนขึ้น `Queue เต็ม` — สำหรับ AR-04 ให้เก็บค่าเฉลี่ยและ p95 |
| `p_yes`, `avg3/3`, `-> ALERT` | ความน่าจะเป็นของหน้าต่างนี้ ค่าเฉลี่ย 3 หน้าต่าง และจุดที่แจ้งเหตุ; `⏳ … ระหว่างพัก` = ตรวจพบแต่อยู่ใน `ALERT_COOLDOWN_SECONDS` |

สรุปเวลาจาก log ที่เก็บไว้:

```powershell
uv run python -c "import re,statistics as s;v=[float(m) for m in re.findall(r'dsp_total=([\d.]+)', open('run.log',encoding='utf-8').read())];print(len(v),'windows mean',round(s.mean(v),2),'p95',round(sorted(v)[int(len(v)*.95)-1],2),'ms')"
```

### 3. พูด "ช่วยด้วย" ที่ระยะ 1–5 เมตร

ตามแผนในรายงานหัวข้อ 3.7.3 (ห้องเงียบ 1, 2, 3, 4, 5 ม. และห้องมีเสียงรบกวน 2, 3, 4 ม.)

1. วางบอร์ดที่ความสูงใช้งานจริง วัดระยะด้วยตลับเมตรจากกึ่งกลางระหว่างไมค์ ผู้พูดหันหน้าเข้าหาบอร์ด
2. ที่แต่ละระยะ **บันทึกเสียงดิบ 2 ช่องทุกครั้ง** (ไฟล์ละ 1 ครั้งที่พูด) ด้วย

   ```powershell
   uv run python tools/mqtt_record.py --mac AA:BB:CC:DD:EE:FF --seconds 4 --out data/quiet_1m/help/01.wav
   uv run python tools/mqtt_record.py --mac AA:BB:CC:DD:EE:FF --seconds 4 --out data/quiet_1m/normal/01.wav
   ```

   คำสำคัญ ("ช่วยด้วย") 20 ครั้งใส่ `help/` และคำอื่น 20 ครั้งใส่ `normal/` พูดหลังเริ่มบันทึกราว 1 วินาที
3. ระหว่างบันทึก ดู log ของ uvicorn ไปด้วย: ครั้งที่พูด "ช่วยด้วย" ควรมี `-> ALERT` ภายใน 1–2 วินาทีหลังพูดจบ และไม่ควรมีตอนพูดคำอื่น
   (ระยะใกล้ ๆ กันอาจติดช่วงพัก 30 วิ — ตั้ง `ALERT_COOLDOWN_SECONDS=0` ระหว่างทดลอง แล้วคืนค่าหลังทดลอง)
4. เปรียบเทียบ 3 รูปแบบจากเสียงชุดเดียวกัน (ตามตาราง 3.23: A = `mono`, B = `das_pf`, C = `mvdr`)

   ```powershell
   uv run python eval_offline.py data/quiet_1m --modes mono,das_pf,mvdr --csv results/quiet_1m.csv --json results/quiet_1m.json
   ```

   ทำทุกระยะ/สภาพห้อง แล้วนำ Accuracy, FN, FP ของแต่ละโหมดไปทำกราฟเทียบระยะ
5. เวลาแจ้งเตือนถึงโทรศัพท์ (หัวข้อ 3.7.5): จับเวลาจากพูดจบจนข้อความ LINE ขึ้น — Go ส่ง LINE/Telegram ไม่เกิน 1 ครั้งต่อ 60 วิต่ออุปกรณ์ จึงต้องเว้นระหว่างครั้งอย่างน้อย 60 วิ
