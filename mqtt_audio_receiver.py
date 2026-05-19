"""
SmartVoice MQTT → AI Forwarder
Subscribe to voice/audio/# → accumulate PCM chunks → POST WAV in-memory to AI webserver

ไม่เขียนไฟล์ลง disk เลย — ส่งตรงไปยัง AI webserver (app.py)

ใช้งาน:
  python mqtt_audio_receiver.py

ทดสอบกับ server อาจารย์:
  แก้ AI_SERVER_URL = "https://kwsapi.wattanapong.com/need-help"

ใช้งานจริง (local app.py รันอยู่):
  AI_SERVER_URL = "http://localhost:5000/need-help"  (default)
"""

import io
import signal
import sys
import time
import wave

import paho.mqtt.client as mqtt
import requests

# ─── Config ───────────────────────────────────────────────────────────────────
BROKER_HOST = "192.168.4.2"   # IP ของ PC บน WiFi SmartVoice-ESP32
BROKER_PORT = 1883
TOPIC = "voice/audio/ESP32_DEVICE_001"
STATUS_TOPIC = "device/status/#"

SAMPLE_RATE = 16000   # Hz — ต้องตรงกับ I2S ใน ESP32
CHANNELS = 1          # Mono
SAMPLE_WIDTH = 2      # 16-bit PCM = 2 bytes

# URL ของ AI webserver
# ทดสอบกับ server อาจารย์ : "https://kwsapi.wattanapong.com/need-help"
# ใช้งานจริง (local)      : "http://localhost:8000/need-help"
AI_SERVER_URL = "http://localhost:8000/need-help"
AI_REQUEST_TIMEOUT = 10  # วินาที

# ส่งไปวิเคราะห์ทุกกี่วินาที
SECONDS_PER_WINDOW = 5

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
    """ส่ง PCM → WAV in-memory → POST multipart/form-data ไปยัง AI webserver"""
    wav_bytes = _build_wav_in_memory(pcm_bytes)
    wav_buf = io.BytesIO(wav_bytes)
    try:
        resp = requests.post(
            AI_SERVER_URL,
            files={"sound": ("audio.wav", wav_buf, "audio/wav")},
            timeout=AI_REQUEST_TIMEOUT,
        )
        if resp.ok:
            result = resp.json()
            detected = result.get("detected", "?")      # "yes" or "no"
            probability = result.get("probability", 0.0)
            flag = "🚨 EMERGENCY" if detected == "yes" else "✅ normal"
            print(f"[AI] {flag}  device={device_id}  prob={probability:.4f}")
        else:
            print(f"[AI] ✗ Server returned {resp.status_code}: {resp.text[:200]}")
    except requests.exceptions.ConnectionError:
        print(f"[AI] ✗ Cannot connect to {AI_SERVER_URL} — is app.py running?")
    except requests.exceptions.Timeout:
        print(f"[AI] ✗ Timed out after {AI_REQUEST_TIMEOUT}s")
    except Exception as exc:
        print(f"[AI] ✗ Error: {exc}")


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


def on_disconnect(client, userdata, rc, properties=None):
    print(f"[MQTT] Disconnected (rc={rc})")


def signal_handler(sig, frame):
    print("\n[STOP] Flushing buffer and shutting down...")
    _flush_buffer()
    print(f"[DONE] Total chunks received: {_total_chunks}")
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("=" * 60)
    print("  SmartVoice MQTT → AI Forwarder")
    print(f"  Broker    : {BROKER_HOST}:{BROKER_PORT}")
    print(f"  Topic     : {TOPIC}")
    print(f"  AI Server : {AI_SERVER_URL}")
    print(f"  Window    : every {SECONDS_PER_WINDOW}s")
    print("  [NO FILES WRITTEN TO DISK]")
    print("  Press Ctrl+C to stop")
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
        client.loop_forever()
    except KeyboardInterrupt:
        signal_handler(None, None)
    except Exception as exc:
        print(f"[ERROR] {exc}")
        _flush_buffer()
