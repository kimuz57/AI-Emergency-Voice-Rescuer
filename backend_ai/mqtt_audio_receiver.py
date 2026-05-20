"""
SmartVoice MQTT → AI Forwarder
Subscribe to voice/audio/# → accumulate PCM chunks → POST WAV in-memory to AI webserver

ใช้งานร่วมกับ FastAPI (app.py) จะถูกเรียกให้รันแบบ Background Thread อัตโนมัติ
"""

import io
import signal
import sys
import time
import wave

import paho.mqtt.client as mqtt
import requests

# 🟢 นำเข้าไฟล์ config ที่เราสร้างไว้ (ตัวแปรจะถูกดึงจาก .env มาให้เลย)
import config

# ─── Config (ดึงจากไฟล์ config.py) ───────────────────────────────────────────
BROKER_HOST = config.MQTT_BROKER_HOST
BROKER_PORT = config.MQTT_BROKER_PORT
AI_SERVER_URL = config.AI_SERVER_URL

SAMPLE_RATE = config.SAMPLE_RATE  # Hz — ต้องตรงกับ I2S ใน ESP32
SECONDS_PER_WINDOW = config.DURATION_SEC  # ส่งไปวิเคราะห์ทุกกี่วินาที

# ─── Config (ตั้งค่าเฉพาะภายในไฟล์นี้) ──────────────────────────────────────────
TOPIC = "voice/audio/ESP32_DEVICE_001"
STATUS_TOPIC = "device/status/#"
CHANNELS = 1          # Mono
SAMPLE_WIDTH = 2      # 16-bit PCM = 2 bytes
AI_REQUEST_TIMEOUT = 10  # วินาที

# ─── Derived constants ────────────────────────────────────────────────────────
_BYTES_PER_WINDOW = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH * SECONDS_PER_WINDOW

# ─── State ───────────────────────────────────────────────────────────────────
_pcm_buffer: list[bytes] = []
_total_chunks = 0
_session_start: float | None = None


def _build_wav_in_memory(pcm_data: bytes) -> bytes:
    """ห่อ raw PCM ด้วย WAV header — ไม่แตะ disk เลย"""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_data)
    return buf.getvalue()


def _send_to_ai_server(pcm_bytes: bytes, device_id: str = "ESP32_DEVICE_001") -> None:
    """ส่ง PCM → WAV in-memory → POST ไปยัง Cloud AI → รับผล → ส่งต่อให้ Go Backend"""
    wav_bytes = _build_wav_in_memory(pcm_bytes)
    
    # 🌟 1. ยิงไฟล์ขึ้นไปให้ Cloud AI ตรวจสอบ
    cloud_ai_url = "https://kwsapi.wattanapong.com/need-help"
    
    try:
        # ใช้ io.BytesIO ใหม่ทุกครั้งที่ส่ง เพื่อไม่ให้ buffer โดนอ่านซ้ำจนหมด
        resp = requests.post(
            cloud_ai_url,
            files={"sound": ("audio.wav", io.BytesIO(wav_bytes), "audio/wav")},
            timeout=AI_REQUEST_TIMEOUT,
        )
        
        if resp.ok:
            result = resp.json()
            detected = result.get("detected", "no")
            probability = result.get("probability", 0.0)
            
            # 🌟 2. ตัดสินใจและส่งต่อให้ Go Backend
            go_base_url = "http://localhost:8080/api/audio"
            
            if detected == "yes":
                print(f"EMERGENCY (prob={probability:.4f}) -> กำลังส่งให้ Go (บันทึกแจ้งเตือน)")
                try:
                    requests.post(
                        f"{go_base_url}/emergency",
                        files={"sound": ("emergency.wav", io.BytesIO(wav_bytes), "audio/wav")},
                        timeout=5
                    )
                except Exception as e:
                    print(f"❌ [GO] ส่งไฟล์ฉุกเฉินไม่สำเร็จ: {e}")
                    
            else:
                print(f"normal (prob={probability:.4f}) -> กำลังส่งให้ Go (บันทึกลง neg แล้วเคลียร์ของเก่า)")
                try:
                    requests.post(
                        f"{go_base_url}/negative",
                        files={"sound": ("negative.wav", io.BytesIO(wav_bytes), "audio/wav")},
                        timeout=5
                    )
                except Exception as e:
                    print(f"❌ [GO] ส่งไฟล์ปกติไม่สำเร็จ: {e}")

        else:
            print(f"[AI CLOUD] ✗ Server returned {resp.status_code}: {resp.text[:100]}")
            
    except requests.exceptions.ConnectionError:
        print(f"[AI CLOUD] ✗ Cannot connect to {cloud_ai_url}")
    except requests.exceptions.Timeout:
        print(f"[AI CLOUD] ✗ Timed out after {AI_REQUEST_TIMEOUT}s")
    except Exception as exc:
        print(f"[ERROR] ✗ {exc}")

def _flush_buffer() -> None:
    """ส่ง audio ที่สะสมอยู่ไปยัง AI server แล้ว reset buffer"""
    global _pcm_buffer
    if not _pcm_buffer:
        return
    pcm_data = b"".join(_pcm_buffer)
    total_sec = len(pcm_data) / (SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH)
    print(f"[SEND] {len(pcm_data) / 1024:.1f} KB ({total_sec:.1f}s) → {AI_SERVER_URL}")
    _send_to_ai_server(pcm_data)
    _pcm_buffer = []


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Connected to {BROKER_HOST}:{BROKER_PORT}")
        client.subscribe(TOPIC, qos=0)
        client.subscribe(STATUS_TOPIC, qos=0)
        print(f"[MQTT] Subscribed to: {TOPIC}")
    else:
        print(f"[MQTT] Connection failed, rc={rc}")


def on_message(client, userdata, msg):
    global _total_chunks, _session_start, _pcm_buffer

    if msg.topic.startswith("device/status"):
        print(f"[STATUS] {msg.topic}: {msg.payload.decode('utf-8', errors='replace')}")
        return

    if msg.topic != TOPIC:
        return

    data = msg.payload
    if not data:
        return

    if _session_start is None:
        _session_start = time.time()
        print("[RECORD] Audio stream started")

    _pcm_buffer.append(data)
    _total_chunks += 1

    # Progress log every 50 chunks (~3.2s of audio)
    if _total_chunks % 50 == 0:
        elapsed = time.time() - _session_start
        buffered = sum(len(b) for b in _pcm_buffer)
        print(f"[AUDIO] chunk={_total_chunks:5d}  buffer={buffered / 1024:.1f} KB  "
              f"elapsed={elapsed:.1f}s")

    # ส่งเมื่อ buffer เต็ม window
    buffered_bytes = sum(len(b) for b in _pcm_buffer)
    if buffered_bytes >= _BYTES_PER_WINDOW:
        _flush_buffer()


# 🟢 แก้ไขตรงนี้เพิ่มตัวแปร flags เข้าไปเป็น 5 พารามิเตอร์เพื่อให้แมตช์กับ VERSION2 เรียบร้อยครับ
def on_disconnect(client, userdata, flags, rc, properties=None):
    print(f"[MQTT] Disconnected (rc={rc})")


def start_receiver():
    """ฟังก์ชันสำหรับถูกเรียกใช้งานจาก app.py ให้รันแบบ Background"""
    print("=" * 60)
    print("  SmartVoice MQTT → AI Forwarder (Background Thread)")
    print(f"  Broker    : {BROKER_HOST}:{BROKER_PORT}")
    print(f"  Topic     : {TOPIC}")
    print("=" * 60)

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id="smartvoice_ai_forwarder",
    )
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    try:
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
        # 🟢 จุดสำคัญ: ใช้ loop_start() แทน loop_forever() เพื่อให้มันรันซ้อนกับ AI ได้
        client.loop_start()
    except Exception as exc:
        print(f"[ERROR] MQTT Connection Failed: {exc}")


# เผื่อกรณีที่ผู้กองอยากจะกดรันไฟล์นี้แยกเดี่ยวๆ ก็ยังรันได้ปกติครับ
if __name__ == "__main__":
    start_receiver()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[STOP] Shutting down...")
        _flush_buffer()
        sys.exit(0)