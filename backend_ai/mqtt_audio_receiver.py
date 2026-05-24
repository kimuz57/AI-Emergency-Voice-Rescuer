"""
SmartVoice MQTT → AI Forwarder
Subscribe to voice/audio/# → accumulate PCM chunks → POST WAV in-memory to AI webserver
.
ใช้งานร่วมกับ FastAPI (app.py) จะถูกเรียกให้รันแบบ Background Thread อัตโนมัติ
"""

import io
import os
import signal
import sys
import time
import wave

import paho.mqtt.client as mqtt
import requests

from dotenv import load_dotenv
load_dotenv()  # โหลด .env เพื่อให้แน่ใจว่าอ่านค่าได้ครบถ้วน
app_env = os.getenv("APP_ENV", "development")

# 🟢 สร้างฟังก์ชันดัก Error ไว้ในไฟล์นี้เลย จบปัญหาไม่ต้องพึ่งไฟล์อื่น
def get_env_required(key: str) -> str:
    value = os.getenv(key)
    if not value or value.strip() == "":
        raise ValueError(f"🚨 CRITICAL ERROR: Environment variable '{key}' is not set in .env file!")
    return value

# ─── Config (ดึงจาก .env โดยตรง) ───────────────────────────────────────────
BROKER_HOST = get_env_required("MQTT_BROKER_HOST")
BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))
AI_SERVER_URL = get_env_required("AI_SERVER_URL")
GO_SERVER_URL = get_env_required("GO_SERVER_URL")

SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", 16000))  # Hz — ต้องตรงกับ I2S ใน ESP32
SECONDS_PER_WINDOW = 2            # 🟢 ปรับเป็น 2 วินาที

# ─── Config (ตั้งค่าเฉพาะภายในไฟล์นี้) ──────────────────────────────────────────
TOPIC_SUBSCRIBE = "voice/audio/#"   # 🟢 ใช้ # เพื่อรับฟังเสียงจากทุก MAC Address
STATUS_TOPIC = "device/status/#"    # 🟢 รับสถานะจากทุกเครื่องเช่นกัน
CHANNELS = 1          # Mono
SAMPLE_WIDTH = 2      # 16-bit PCM = 2 bytes
AI_REQUEST_TIMEOUT = 10  # วินาที

# ─── Derived constants ────────────────────────────────────────────────────────
_BYTES_PER_WINDOW = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH * SECONDS_PER_WINDOW

# ─── State (ปรับใหม่เพื่อรองรับหลายบอร์ดพร้อมกัน) ──────────────────────────────────
# โครงสร้าง: { "MAC_ADDRESS": { "buffer": [bytes], "chunks": int, "start_time": float } }
_device_states = {}


def _build_wav_in_memory(pcm_data: bytes) -> bytes:
    """ห่อ raw PCM ด้วย WAV header — ไม่แตะ disk เลย"""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_data)
    return buf.getvalue()


def _send_to_ai_server(pcm_bytes: bytes, device_mac: str) -> None:
    """ส่ง PCM → WAV in-memory → POST ไปยัง Cloud AI → รับผล → ส่งต่อให้ Go Backend พร้อม MAC"""
    wav_bytes = _build_wav_in_memory(pcm_bytes)
    
    # 🌟 1. ยิงไฟล์ขึ้นไปให้ Cloud AI ตรวจสอบ
    cloud_ai_url = f"{AI_SERVER_URL}/need-help"
    
    
    try:
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
            go_base_url = f"{GO_SERVER_URL}/api/audio"
            
            # 🟢 แนบ device_mac และรายละเอียดเพื่อส่งให้ Go Backend
            payload_data = {
                'device_mac': device_mac,
                'event_type': 'needs_help' if detected == "yes" else 'normal',
                'confidence': probability
            }
            
            if detected == "yes":
                if app_env == "development":
                    print(f"🚨 EMERGENCY (prob={probability:.4f}) from [{device_mac}] -> ส่งให้ Go")
                try:
                    requests.post(
                        f"{go_base_url}/emergency",
                        files={"audio": ("emergency.wav", io.BytesIO(wav_bytes), "audio/wav")},
                        data=payload_data,
                        timeout=5
                    )
                except Exception as e:
                    print(f"❌ [GO] ส่งไฟล์ฉุกเฉินไม่สำเร็จ: {e}")
                    
            else:
                if app_env == "development":
                    print(f"✅ normal (prob={probability:.4f}) from [{device_mac}] -> ส่งให้ Go (neg)")
                try:
                    requests.post(
                        f"{go_base_url}/negative",
                        files={"audio": ("negative.wav", io.BytesIO(wav_bytes), "audio/wav")},
                        data=payload_data,
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


def _flush_buffer(device_mac: str) -> None:
    """ส่ง audio ที่สะสมอยู่ของ MAC นั้นๆ ไปยัง AI server แล้ว reset buffer"""
    if device_mac not in _device_states or not _device_states[device_mac]["buffer"]:
        return
        
    pcm_data = b"".join(_device_states[device_mac]["buffer"])
    total_sec = len(pcm_data) / (SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH)
    if app_env == "development":
        print(f"[SEND] {device_mac} : {len(pcm_data) / 1024:.1f} KB ({total_sec:.1f}s) → AI Server")
    
    _send_to_ai_server(pcm_data, device_mac)
    
    # เคลียร์ถังของบอร์ดนี้ทิ้ง เพื่อรับรอบถัดไป
    _device_states[device_mac]["buffer"] = []
    _device_states[device_mac]["chunks"] = 0
    _device_states[device_mac]["start_time"] = time.time()


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Connected to {BROKER_HOST}:{BROKER_PORT}")
        client.subscribe(TOPIC_SUBSCRIBE, qos=0)
        client.subscribe(STATUS_TOPIC, qos=0)
        print(f"[MQTT] Subscribed to: {TOPIC_SUBSCRIBE}")
    else:
        print(f"[MQTT] Connection failed, rc={rc}")


def on_message(client, userdata, msg):
    topic = msg.topic
    
    # 🟢 1. ดักสถานะ
    if topic.startswith("device/status/"):
        status_msg = msg.payload.decode('utf-8', errors='replace')
        
        if app_env == "development":
            print(f"[STATUS] {topic}: {status_msg}")
        return

    # 🟢 2. ดักข้อมูลเสียง
    if topic.startswith("voice/audio/"):
        # สกัด MAC Address ออกมาจากท้ายชื่อ Topic
        topic_parts = topic.split('/')
        device_mac = topic_parts[-1] if len(topic_parts) > 0 else "UNKNOWN_MAC"
        
        data = msg.payload
        if not data:
            return

        # ถ้าไม่เคยมีประวัติบอร์ดนี้ ให้สร้างโปรไฟล์ในระบบ
        if device_mac not in _device_states:
            _device_states[device_mac] = {
                "buffer": [],
                "chunks": 0,
                "start_time": time.time()
            }
            print(f"[RECORD] เริ่มรับสตรีมเสียงจาก: {device_mac}")

        state = _device_states[device_mac]
        state["buffer"].append(data)
        state["chunks"] += 1

        # แสดง Log ความคืบหน้า (แสดงทุกๆ 50 chunks ต่อ 1 อุปกรณ์)
        if state["chunks"] % 50 == 0:
            elapsed = time.time() - state["start_time"]
            buffered = sum(len(b) for b in state["buffer"])
            print(f"[AUDIO] [{device_mac}] chunk={state['chunks']:5d}  buffer={buffered / 1024:.1f} KB  elapsed={elapsed:.1f}s")

        # 🟢 3. ส่งเมื่อ buffer เต็ม 2 วินาที
        buffered_bytes = sum(len(b) for b in state["buffer"])
        if buffered_bytes >= _BYTES_PER_WINDOW:
            _flush_buffer(device_mac)


def on_disconnect(client, userdata, flags, rc, properties=None):
    print(f"[MQTT] Disconnected (rc={rc})")


def start_receiver():
    print("=" * 60)
    print("  SmartVoice MQTT → AI Forwarder (Background Thread)")
    print(f"  Broker    : {BROKER_HOST}:{BROKER_PORT}")
    print(f"  Topic     : {TOPIC_SUBSCRIBE} (Wildcard for all MACs)")
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
        client.loop_start()
    except Exception as exc:
        print(f"[ERROR] MQTT Connection Failed: {exc}")


if __name__ == "__main__":
    start_receiver()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[STOP] Shutting down...")
        # เคลียร์ buffer ของทุกบอร์ดที่ค้างอยู่ก่อนปิดโปรแกรม
        for mac in list(_device_states.keys()):
            _flush_buffer(mac)
        sys.exit(0)