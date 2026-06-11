import array
import io
import os
import sys
import time
import wave
import paho.mqtt.client as mqtt
import requests
from dotenv import load_dotenv
import threading
import socket
import logging

logger = logging.getLogger(__name__)

load_dotenv()
app_env = os.getenv("APP_ENV", "development")

def get_env_required(key: str) -> str:
    value = os.getenv(key)
    if not value or value.strip() == "":
        raise ValueError(f"🚨 CRITICAL: Environment variable '{key}' is not set in .env!")
    return value

BROKER_HOST = get_env_required("MQTT_BROKER_HOST")
BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))
GO_SERVER_URL = get_env_required("GO_SERVER_URL")
mqtt_user = get_env_required("MQTT_USER")
mqtt_pass = get_env_required("MQTT_PASSWORD")
# (ลบ AI_SERVER_URL ออกไปแล้ว เพราะเราทำงานจบใน Memory เลย)

SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", 16000))  
SECONDS_PER_WINDOW = 2            
TOPIC_SUBSCRIBE = "voice/audio/#"   
STATUS_TOPIC = "device/status/#"    
CHANNELS = 1          
SAMPLE_WIDTH = 2      
VOLUME_GAIN = 3.0

_BYTES_PER_WINDOW = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH * SECONDS_PER_WINDOW
_device_states = {}

# 🌟 ตัวแปรสำหรับรับฟังก์ชัน AI จาก app2.py
_ai_inference_function = None
_mqtt_client = None
_mqtt_connected = threading.Event()

def amplify_audio(pcm_data: bytes, volume_gain: float) -> bytes:
    if volume_gain == 1.0: 
        return pcm_data
    samples = array.array('h', pcm_data)
    for i in range(len(samples)):
        val = int(samples[i] * volume_gain)
        if val > 32767: val = 32767
        elif val < -32768: val = -32768
        samples[i] = val
    return samples.tobytes()

def _build_wav_in_memory(pcm_data: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_data)
    return buf.getvalue()

def _process_and_forward(pcm_bytes: bytes, device_mac: str) -> None:
    """ส่งเสียงเข้า AI Core ทันที -> แล้วส่งผลลัพธ์ให้ Go Backend"""
    wav_bytes = _build_wav_in_memory(pcm_bytes)
    
    # 1. เช็คว่ามีฟังก์ชัน AI ส่งมาหรือยัง
    if _ai_inference_function is None:
        print("❌ [MQTT] Error: AI Inference Function is not set! (app2.py did not send it)")
        return

    # 2. ประมวลผลด้วย AI ภายในแรม (เร็วมาก)
    try:
        ai_result = _ai_inference_function(wav_bytes)
        detected = ai_result.get("detected", "no")
        probability = ai_result.get("probability", 0.0)
        
        # 3. เตรียมข้อมูลส่งต่อให้ Go Backend
        go_base_url = f"{GO_SERVER_URL}/api/audio"
        payload_data = {
            'device_mac': device_mac,
            'event_type': 'needs_help' if detected == "yes" else 'normal',
            'confidence': probability
        }
        
        if detected == "yes":
            if app_env == "development":
                print(f"🚨 [AI] EMERGENCY (prob={probability:.4f}) from [{device_mac}] -> ยิงไปที่ Go Backend")
            requests.post(
                f"{go_base_url}/emergency",
                files={"audio": ("emergency.wav", io.BytesIO(wav_bytes), "audio/wav")},
                data=payload_data,
                timeout=5
            )
        else:
            if app_env == "development":
                print(f"✅ [AI] normal (prob={probability:.4f}) from [{device_mac}] -> ยิงไปที่ Go Backend")
            requests.post(
                f"{go_base_url}/negative",
                files={"audio": ("negative.wav", io.BytesIO(wav_bytes), "audio/wav")},
                data=payload_data,
                timeout=5
            )

    except Exception as exc:
        print(f"[ERROR] ✗ Processing or Go Routing failed: {exc}")

def _flush_buffer(device_mac: str) -> None:
    if device_mac not in _device_states or not _device_states[device_mac]["buffer"]:
        return
        
    pcm_data = b"".join(_device_states[device_mac]["buffer"])
    pcm_data = amplify_audio(pcm_data, VOLUME_GAIN)
    
    if app_env == "development":
        total_sec = len(pcm_data) / (SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH)
        print(f"[SEND] {device_mac} : {len(pcm_data) / 1024:.1f} KB ({total_sec:.1f}s) → Core AI")
    
    # โยนเข้าฟังก์ชันประมวลผล
    _process_and_forward(pcm_data, device_mac)
    
    # เคลียร์ถัง
    _device_states[device_mac]["buffer"] = []
    _device_states[device_mac]["chunks"] = 0
    _device_states[device_mac]["start_time"] = time.time()

# def on_connect(client, userdata, flags, rc, properties=None):
#     if rc == 0:
#         print(f"[MQTT] Connected to {BROKER_HOST}:{BROKER_PORT}")
#         client.subscribe(TOPIC_SUBSCRIBE, qos=0)
#         client.subscribe(STATUS_TOPIC, qos=0)
#     else:
#         print(f"[MQTT] Connection failed, rc={rc}")

def on_connect(client, userdata, flags, reason_code, properties):
    print("🔥 on_connect CALLED", flush=True)
    print(f"reason_code={reason_code}", flush=True)
    print(f"type={type(reason_code)}", flush=True)

    if getattr(reason_code, "is_failure", False):
        print(f"❌ MQTT connect failed: {reason_code}", flush=True)
        return

    _mqtt_connected.set()
    print("✅ MQTT connected successfully", flush=True)

    client.subscribe(TOPIC_SUBSCRIBE, qos=0)
    client.subscribe(STATUS_TOPIC, qos=0)

    print(f"✅ Subscribed to: {TOPIC_SUBSCRIBE}", flush=True)
    print(f"✅ Subscribed to: {STATUS_TOPIC}", flush=True)
    

def on_message(client, userdata, msg):
    topic = msg.topic
    if topic.startswith("device/status/"):
        return

    if topic.startswith("voice/audio/"):
        topic_parts = topic.split('/')
        device_mac = topic_parts[-1] if len(topic_parts) > 0 else "UNKNOWN_MAC"
        
        data = msg.payload
        if not data: return

        if device_mac not in _device_states:
            _device_states[device_mac] = {"buffer": [], "chunks": 0, "start_time": time.time()}

        state = _device_states[device_mac]
        state["buffer"].append(data)
        state["chunks"] += 1

        buffered_bytes = sum(len(b) for b in state["buffer"])

        if state["chunks"] % 50 == 0:
            elapsed = time.time() - state["start_time"]
            print(f"[AUDIO] [{device_mac}] chunk={state['chunks']:5d}  buffer={buffered_bytes / 1024:.1f} KB")

        if buffered_bytes >= _BYTES_PER_WINDOW:
            _flush_buffer(device_mac)

# def on_disconnect(client, userdata, flags, rc, properties=None):
#     print(f"[MQTT] Disconnected (rc={rc})")

def on_disconnect(client, userdata, disconnect_flags, reason_code, properties):
    print("🔥 on_disconnect CALLED", flush=True)
    print(f"disconnect_flags={disconnect_flags}", flush=True)
    print(f"reason_code={reason_code}", flush=True)
    _mqtt_connected.clear()
    
def start_receiver(inference_callback=None):
    global _mqtt_client, _ai_inference_function

    logger.info("🔥 [MQTT] start_receiver() ENTERED")

    if inference_callback:
        _ai_inference_function = inference_callback
        logger.info("✅ [MQTT] Linked AI Inference Core Successfully.")

    logger.info(f"[MQTT] BROKER_HOST={BROKER_HOST}")
    logger.info(f"[MQTT] BROKER_PORT={BROKER_PORT}")
    logger.info(f"[MQTT] USER={mqtt_user}")
    logger.info("[MQTT] Protocol=MQTTv5 over WebSockets")
    logger.info("[MQTT] WebSocket path=/mqtt")

    try:
        with socket.create_connection((BROKER_HOST, BROKER_PORT), timeout=5):
            logger.info(f"✅ [MQTT] TCP reachable: {BROKER_HOST}:{BROKER_PORT}")
    except Exception as exc:
        logger.exception(f"❌ [MQTT] TCP failed: {BROKER_HOST}:{BROKER_PORT}")
        raise

    _mqtt_client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="smartvoice_ai_forwarder",
        protocol=mqtt.MQTTv5,
        transport="tcp",
    )

    _mqtt_client.enable_logger()

    _mqtt_client.username_pw_set(
        username=mqtt_user,
        password=mqtt_pass,
    )

    _mqtt_client.ws_set_options(path="/mqtt")

    _mqtt_client.on_connect = on_connect
    _mqtt_client.on_message = on_message
    _mqtt_client.on_disconnect = on_disconnect

    logger.info("[MQTT] Calling connect()...")

    try:
        _mqtt_client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    except Exception:
        logger.exception("❌ [MQTT] connect() failed")
        raise

    logger.info("[MQTT] Starting loop...")
    _mqtt_client.loop_start()

    logger.info("[MQTT] Waiting for on_connect()...")

    if not _mqtt_connected.wait(timeout=3):
        raise TimeoutError(
            "MQTT TCP reached broker, but MQTT/WebSocket connection did not complete. "
            "Check WebSocket path, listener config, username/password, and MQTT v5 support."
        )

    logger.info("✅ [MQTT] Receiver fully started")


def shutdown_receiver():
    global _mqtt_client
    print("\n[STOP] Shutting down MQTT Forwarder... Flushing buffers.")
    for mac in list(_device_states.keys()):
        _flush_buffer(mac)
    
    if _mqtt_client is not None:
        print("🛑 [MQTT] Stopping MQTT receiver...")
        try:
            _mqtt_client.loop_stop()
            _mqtt_client.disconnect()
        except Exception as exc:
            print(f"⚠️ [MQTT] Shutdown error: {exc}")
        finally:
            _mqtt_client = None
            _mqtt_connected.clear()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    
    # ดึงฟังก์ชัน AI จาก app.py (สมมติว่าถ้าไม่มีให้ mock ไว้ก่อนสำหรับทดสอบ)
    try:
        from app import run_kws_inference
        ai_func = run_kws_inference
    except ImportError:
        logger.warning("Could not import AI function from app.py. Using mock AI.")
        def mock_ai(wav_bytes):
            return {"detected": "no", "probability": 0.0}
        ai_func = mock_ai

    try:
        start_receiver(ai_func)
        print("📡 MQTT Audio Receiver is running. Press Ctrl+C to stop.")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown_receiver()


