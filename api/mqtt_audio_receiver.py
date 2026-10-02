import array
import io
import os
import sys
import time
import wave
import ssl # 🌟 1. เพิ่ม import ssl เข้ามาสำหรับ WSS
import threading # 🌟 เพิ่ม
import queue
import re
from urllib.parse import urlparse

import paho.mqtt.client as mqtt
import requests
from dotenv import load_dotenv
import urllib3
load_dotenv()

# 🌟 ไฟล์นี้ print อีโมจิ/ภาษาไทยตั้งแต่ตอน import (คำเตือน security) ถ้า stdout เป็น cp1252
# (Windows ที่ redirect log ลงไฟล์/pipe) จะ UnicodeEncodeError จน app.py start ไม่ขึ้น -> แทนตัวที่เข้ารหัสไม่ได้แทน
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="backslashreplace")
    except Exception:
        pass

app_env = os.getenv("APP_ENV", "development")

def get_env_required(key: str) -> str:
    value = os.getenv(key)
    if not value or value.strip() == "":
        raise ValueError(f"🚨 CRITICAL: Environment variable '{key}' is not set in .env!")
    return value

BROKER_HOST = get_env_required("MQTT_BROKER_HOST")
BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 8083)) # 🌟 ค่าเริ่มต้นเปลี่ยนเป็น 8083 สำหรับ WSS
MQTT_USER = os.getenv("MQTT_USER")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
GO_SERVER_URL = get_env_required("GO_SERVER_URL")
# 🌟 คีย์สำหรับ route ภายในของ Go (middleware.RequireInternalKey) — ห้าม print ค่านี้เด็ดขาด
INTERNAL_API_KEY = get_env_required("INTERNAL_API_KEY").strip()

def _resolve_tls_insecure() -> bool:
    """ข้ามการตรวจ Certificate เฉพาะเมื่อตั้ง TLS_INSECURE_SKIP_VERIFY=true/1/yes เท่านั้น (ไม่ดู APP_ENV)"""
    raw = os.getenv("TLS_INSECURE_SKIP_VERIFY")
    if raw is None or raw.strip() == "":
        return False
    value = raw.strip().lower()
    if value in ("true", "1", "yes"):
        return True
    if value not in ("false", "0", "no"):
        print(f"⚠️ [Security] TLS_INSECURE_SKIP_VERIFY='{raw}' ไม่รู้จัก -> ใช้ค่าปลอดภัย (ตรวจ Certificate)")
    return False

TLS_INSECURE_SKIP_VERIFY = _resolve_tls_insecure()
# requests: ตรวจ Certificate เสมอ ยกเว้นตั้งโหมด insecure ไว้ชัดเจน
REQUESTS_VERIFY_TLS = not TLS_INSECURE_SKIP_VERIFY

if TLS_INSECURE_SKIP_VERIFY:
    # ปิด warning ของ urllib3 เฉพาะในโหมด insecure เท่านั้น
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    print("⚠️ [Security] TLS_INSECURE_SKIP_VERIFY=true -> ข้ามการตรวจ Certificate ทั้ง HTTP (Go) และ MQTT — เสี่ยง MITM ห้ามใช้ใน production")

def _go_headers() -> dict:
    """Header ที่ต้องแนบทุกครั้งที่ยิงไป Go Backend"""
    return {
        "X-Tunnel-Skip-AntiPhishing-Page": "true",  # 🌟 ทะลวง Dev Tunnels
        "X-Internal-Key": INTERNAL_API_KEY,
    }

def _warn_if_rejected(response, what: str) -> None:
    """Go ตอบ 401/403/503 = คีย์ภายในผิดหรือฝั่ง Go ไม่ได้ตั้ง INTERNAL_API_KEY"""
    if response.status_code in (401, 403, 503):
        print(f"🚨 [GO Backend] {what} ถูกปฏิเสธ (HTTP {response.status_code}) -> ตรวจ INTERNAL_API_KEY ให้ตรงกันทั้ง Python และ Go")
    elif 300 <= response.status_code < 400:
        print(f"🚨 [GO Backend] {what} ได้ redirect (HTTP {response.status_code}) ซึ่งไม่ตามให้ -> ตั้ง GO_SERVER_URL เป็น URL ปลายทางจริง (เช่น https://)")

def _warn_if_plaintext_go_url() -> None:
    """X-Internal-Key วิ่งไปกับทุก request: ถ้า GO_SERVER_URL เป็น http:// ไป host ที่ไม่ใช่เครื่องตัวเอง คีย์จะถูกส่งแบบไม่เข้ารหัส"""
    parsed = urlparse(GO_SERVER_URL)
    host = (parsed.hostname or "").lower()
    if parsed.scheme == "http" and host not in ("localhost", "127.0.0.1", "::1"):
        print(f"⚠️ [Security] GO_SERVER_URL ใช้ http:// ไปที่ '{host}' -> X-Internal-Key ถูกส่งแบบไม่เข้ารหัส ใช้ได้เฉพาะในเครือข่ายภายในที่เชื่อถือได้ (production ควรใช้ https://)")

_warn_if_plaintext_go_url()

# 🌟 MAC ที่ firmware ส่งมาใน topic: "XX:XX:XX:XX:XX:XX" (firmwareV2/)
# topic อื่นทิ้งไป กันไม่ให้ใครก็ได้ที่ publish เข้า broker สร้าง cache/thread/การยิง Go ไม่จำกัด
_MAC_RE = re.compile(r"^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}$")
_rejected_topics_logged = set()
_MAX_REJECTED_TOPICS_LOGGED = 100

# 🌟 พอร์ตที่ broker เปิด TLS ไว้ (8083 = WSS ใน mosquitto/config/mosquitto.conf)
_TLS_PORTS = (443, 8883, 8083)

def _resolve_use_tls() -> bool:
    """ถ้าตั้ง MQTT_USE_TLS ไว้ให้ใช้ค่านั้น ไม่งั้นเลือกจากพอร์ต"""
    raw = os.getenv("MQTT_USE_TLS")
    if raw is None or raw.strip() == "":
        return BROKER_PORT in _TLS_PORTS
    value = raw.strip().lower()
    if value in ("true", "1", "yes"):
        return True
    if value in ("false", "0", "no"):
        return False
    raise ValueError(f"🚨 CRITICAL: MQTT_USE_TLS must be 'true' or 'false' (got '{raw}')")

MQTT_USE_TLS = _resolve_use_tls()

# ต้องตรงกับ I2S_SAMPLE_RATE ของ firmware (8000 Hz)
SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", 8000))
SECONDS_PER_WINDOW = 2            
TOPIC_SUBSCRIBE = "voice/audio/#"   
STATUS_TOPIC = "device/status/#"    
CHANNELS = 1          
SAMPLE_WIDTH = 2      
VOLUME_GAIN = 3.0

_BYTES_PER_WINDOW = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH * SECONDS_PER_WINDOW
_device_states = {}
_device_states_lock = threading.Lock()  # ai_worker กับ shutdown_receiver แตะ _device_states พร้อมกันได้

_device_activation_cache = {}
_device_activation_lock = threading.Lock()
ACTIVE_CACHE_TTL = 60     # บอร์ดที่ active: ถาม Go ใหม่ทุก 60 วิ (ให้การปิด device มีผล)
INACTIVE_CACHE_TTL = 10   # บอร์ดที่ยังไม่ active / ถาม Go ไม่สำเร็จ: ถามใหม่ทุก 10 วิ

_device_last_seen = {}      # เก็บเวลาล่าสุดที่บอร์ดส่งข้อมูลมา { "mac": timestamp }
_device_is_online = {}      # เก็บสถานะว่าตอนนี้บอร์ดออนไลน์อยู่ไหม ป้องกันการยิง API ซ้ำ { "mac": True/False }

_ai_inference_function = None
audio_data_queue = queue.Queue(maxsize=20)

_mqtt_client = None
_workers_started = False

def _send_status_to_go_async(payload):
    go_status_url = f"{GO_SERVER_URL}/api/device/status" # เดี๋ยวเราจะไปสร้าง Route นี้ใน Go
    try:
        response = requests.post(
            go_status_url,
            json=payload,
            headers=_go_headers(),
            timeout=5,
            allow_redirects=False,  # ห้ามตาม redirect: requests จะส่ง X-Internal-Key ต่อไปยัง host ปลายทางด้วย
            verify=REQUESTS_VERIFY_TLS
        )
        _warn_if_rejected(response, "แจ้งสถานะอุปกรณ์")
    except Exception as exc:
        print(f"⚠️ [GO Backend] แจ้งสถานะ Offline ไม่สำเร็จ: {exc}")

# 🌟 [เพิ่มใหม่] Thread สำหรับตรวจสอบอุปกรณ์ที่หายไปเกิน 10 วินาที
def device_monitor_worker():
    TIMEOUT_SECONDS = 10

    while True:
        time.sleep(2) # ตื่นมาเช็คทุกๆ 2 วินาที (ไม่กิน CPU)
        now = time.time()
        
        # ใช้ list() ครอบ .items() ป้องกัน Error Dictionary ถูกแก้ไขขณะวนลูป
        for mac, last_time in list(_device_last_seen.items()):
            # ถ้าสถานะปัจจุบันคือ 'ออนไลน์' และเวลาผ่านไปเกิน 10 วิ
            if _device_is_online.get(mac, False) and (now - last_time) > TIMEOUT_SECONDS:
                print(f"⚠️ [MONITOR] บอร์ด [{mac}] ขาดการติดต่อไปเกิน {TIMEOUT_SECONDS} วินาที -> สั่ง Offline")
                
                # 1. ปรับสถานะใน RAM ตัวเองเป็น False จะได้ไม่ยิง API ซ้ำรัวๆ
                _device_is_online[mac] = False
                
                # 2. โยนงานแจ้ง Go Backend ไปให้ Thread เบื้องหลัง
                payload = {"mac": mac, "status": "offline"}
                threading.Thread(
                    target=_send_status_to_go_async, 
                    args=(payload,), 
                    daemon=True
                ).start()

def is_device_activated(device_mac: str) -> bool:
    """ตอบจาก Cache ทันที (ไม่บล็อก network thread ของ paho)
    ถ้า Cache หมดอายุ/ยังไม่มี จะสั่ง Thread เบื้องหลังไปถาม Go Backend แล้วตอบค่าเดิมไปก่อน"""
    now = time.time()
    with _device_activation_lock:
        cache_entry = _device_activation_cache.get(device_mac)
        if cache_entry is None:
            # ยังไม่เคยถาม: บล็อกไว้ก่อนจนกว่า Go จะตอบ
            cache_entry = {"is_active": False, "expires_at": 0.0, "refreshing": False}
            _device_activation_cache[device_mac] = cache_entry

        is_active = cache_entry["is_active"]
        # 🌟 กันไม่ให้ข้อความ MQTT ที่ไหลมาวินาทีละ 8 รอบ สแปมยิง API พร้อมๆ กัน
        if now >= cache_entry["expires_at"] and not cache_entry["refreshing"]:
            cache_entry["refreshing"] = True
            try:
                threading.Thread(
                    target=_refresh_device_activation,
                    args=(device_mac,),
                    daemon=True
                ).start()
            except RuntimeError as exc:
                # สร้าง Thread ไม่ได้: ปลด flag ไว้ ไม่งั้นบอร์ดนี้จะไม่ถูกเช็คใหม่อีกเลย
                cache_entry["refreshing"] = False
                print(f"⚠️ [AUTH] เริ่มเช็ค activation ของ [{device_mac}] ไม่ได้: {exc}")

    return is_active

def _refresh_device_activation(device_mac: str) -> None:
    """ถาม Go Backend ว่าบอร์ดนี้ถูก Activate หรือยัง แล้วอัปเดต Cache (รันใน Thread เบื้องหลัง)"""
    check_url = f"{GO_SERVER_URL}/api/device/check-activation"

    with _device_activation_lock:
        previous = _device_activation_cache[device_mac]["is_active"]

    # ค่าเริ่มต้นถ้าติดต่อไม่ได้ (ไม่ได้แปลว่าถูกปิด): คงสถานะเดิมไว้แล้วลองใหม่ใน 10 วิ
    is_active = previous
    ttl = INACTIVE_CACHE_TTL

    try:
        # ยิงถาม Go Backend (แนบ Header ทะลวง Dev Tunnels + X-Internal-Key)
        response = requests.get(
            check_url,
            params={"mac": device_mac},
            headers=_go_headers(),
            timeout=5,
            allow_redirects=False,  # ห้ามตาม redirect: requests จะส่ง X-Internal-Key ต่อไปยัง host ปลายทางด้วย
            verify=REQUESTS_VERIFY_TLS
        )
        _warn_if_rejected(response, f"เช็ค activation ของ [{device_mac}]")

        if response.status_code == 200:
            # ใช้ .get() แบบปลอดภัย เผื่อ JSON พัง
            data = response.json()
            fetched_active = bool(data.get("is_active", False))
        else:
            fetched_active = False

        is_active = fetched_active
        ttl = ACTIVE_CACHE_TTL if is_active else INACTIVE_CACHE_TTL

        if is_active and not previous:
            print(f"🔓 [AUTH] อนุมัติ! บอร์ด [{device_mac}] ยืนยันตัวตนผ่านแล้ว")
        elif not is_active and previous:
            print(f"🔒 [AUTH] บอร์ด [{device_mac}] ถูกปิดการใช้งาน (รอเช็คใหม่ใน {INACTIVE_CACHE_TTL} วิ)")
        elif not is_active:
            print(f"🔒 [AUTH] ปฏิเสธ! บอร์ด [{device_mac}] ยังไม่ถูก Activate (รอเช็คใหม่ใน {INACTIVE_CACHE_TTL} วิ)")

    except Exception as e:
        print(f"⚠️ [AUTH] ติดต่อ Go Backend ไม่ได้ (หรือข้อมูลผิดพลาด): {e}")

    finally:
        # 🌟 อัปเดต Cache เสมอ ไม่งั้น "refreshing" จะค้างเป็น True และไม่ถามใหม่อีกเลย
        with _device_activation_lock:
            entry = _device_activation_cache[device_mac]
            entry["is_active"] = is_active
            entry["expires_at"] = time.time() + ttl
            entry["refreshing"] = False

def amplify_audio(pcm_data: bytes, volume_gain: float) -> bytes:
    if volume_gain == 1.0: 
        return pcm_data
    samples = array.array('h', pcm_data)

    if not samples:
        return pcm_data

    peak = max(abs(sample) for sample in samples)
    if peak == 0:
        return pcm_data

    max_safe_gain = 32767 / peak
    effective_gain = min(volume_gain, max_safe_gain)

    for i in range(len(samples)):
        val = int(samples[i] * effective_gain)
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

def _send_to_go_async(url, wav_bytes, filename, payload):
    """ฟังก์ชันทำงานเบื้องหลังสำหรับยิง API โดยไม่บล็อกระบบหลัก"""
    try:
        response = requests.post(
            url,
            files={"audio": (filename, io.BytesIO(wav_bytes), "audio/wav")},
            data=payload,
            headers=_go_headers(),
            timeout=5,
            allow_redirects=False,  # ห้ามตาม redirect: requests จะส่ง X-Internal-Key ต่อไปยัง host ปลายทางด้วย
            verify=REQUESTS_VERIFY_TLS
        )
        _warn_if_rejected(response, f"ส่งเสียง ({filename})")
    except Exception as exc:
        print(f"⚠️ [GO Backend] ยิง API ไม่สำเร็จ: {exc}")

def _process_and_forward(pcm_bytes: bytes, device_mac: str) -> None:
    wav_bytes = _build_wav_in_memory(pcm_bytes)
    
    if _ai_inference_function is None:
        print("❌ [MQTT] Error: AI Inference Function is not set! (app2.py did not send it)")
        return

    try:
        ai_result = _ai_inference_function(wav_bytes)
        detected = ai_result.get("detected", "error")
        probability = ai_result.get("probability", 0.0)

        # 🌟 โมเดลประมวลผลไม่สำเร็จ: ห้ามส่งไปเป็นเสียง 'normal' ทิ้ง window นี้ไป
        if detected not in ("yes", "no"):
            print(f"❌ [AI] Inference failed for {device_mac} (detected={detected!r}) -> ทิ้ง window นี้")
            return

        go_base_url = f"{GO_SERVER_URL}/api/audio"
        payload_data = {
            'device_mac': device_mac,
            'event_type': 'needs_help' if detected == "yes" else 'normal',
            'confidence': probability
        }
        
        is_local = (app_env == "development")
        if detected == "yes":
            if is_local:
                print(f"🚨 [AI] EMERGENCY (prob={probability:.4f}) -> โยนงานยิง API เบื้องหลัง")
            
            threading.Thread(target=_send_to_go_async, args=(
                f"{go_base_url}/emergency", wav_bytes, "emergency.wav", payload_data
            ), daemon=True).start()

        else:
            if is_local:
                print(f"✅ [AI] normal (prob={probability:.4f}) -> โยนงานยิง API เบื้องหลัง")
                
            threading.Thread(target=_send_to_go_async, args=(
                f"{go_base_url}/negative", wav_bytes, "negative.wav", payload_data
            ), daemon=True).start()

    except Exception as exc:
        print(f"[ERROR] ✗ Processing or Go Routing failed: {exc}")

def _flush_buffer(device_mac: str) -> None:
    # print(_device_states )
    # ดึง buffer ออกมาแล้ว reset ภายใต้ lock ส่วน inference ทำนอก lock
    with _device_states_lock:
        state = _device_states.get(device_mac)
        if not state or not state["buffer"]:
            return
        buffered = state["buffer"]
        state["buffer"] = []
        state["chunks"] = 0
        state["start_time"] = time.time()

    pcm_data = b"".join(buffered)
    pcm_data = amplify_audio(pcm_data, VOLUME_GAIN)

    if app_env == "development":
        total_sec = len(pcm_data) / (SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH)
        print(f"[SEND] {device_mac} : {len(pcm_data) / 1024:.1f} KB ({total_sec:.1f}s) → Core AI")
    
    _process_and_forward(pcm_data, device_mac)

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Connected to {BROKER_HOST}:{BROKER_PORT}")
        client.subscribe(TOPIC_SUBSCRIBE, qos=0)
        client.subscribe(STATUS_TOPIC, qos=0)
    else:
        print(f"[MQTT] Connection failed, rc={rc}")

def on_message(client, userdata, msg):
    topic = msg.topic
    if topic.startswith("device/status/"):
        return

    if topic.startswith("voice/audio/"):
        topic_parts = topic.split('/')
        device_mac = topic_parts[-1] if len(topic_parts) > 0 else "UNKNOWN_MAC"

        if len(topic_parts) != 3 or not _MAC_RE.match(device_mac):
            if len(_rejected_topics_logged) < _MAX_REJECTED_TOPICS_LOGGED and topic not in _rejected_topics_logged:
                _rejected_topics_logged.add(topic)
                print(f"⚠️ [MQTT] ทิ้งข้อความจาก topic ที่ไม่ใช่รูปแบบ voice/audio/<MAC>: {topic[:80]!r}")
            return

        _device_last_seen[device_mac] = time.time()
        _device_is_online[device_mac] = True

        # อ่านจาก Cache เท่านั้น การถาม Go ทำใน Thread เบื้องหลัง
        if not is_device_activated(device_mac):
            return

        data = msg.payload
        if not data: return

        # 🌟 โยนเข้าคิวแล้วจบทันที ไม่รอ AI
        try:
            audio_data_queue.put_nowait((data, device_mac)) 
        except queue.Full:
            print(f"⚠️ [WARNING] Queue เต็ม! กำลังทิ้งข้อมูลของ {device_mac}")

def ai_worker():
    """Thread นี้จะคอยหยิบข้อมูลจากคิวมาทำ AI ตลอดเวลา"""
    while True:
        data, device_mac = audio_data_queue.get() # รอข้อมูลในคิว
        try:
            with _device_states_lock:
                if device_mac not in _device_states:
                    _device_states[device_mac] = {"buffer": [], "chunks": 0, "start_time": time.time()}

                state = _device_states[device_mac]
                state["buffer"].append(data)
                state["chunks"] += 1

                buffered_bytes = sum(len(b) for b in state["buffer"])

            # ถ้าข้อมูลครบ 1 Window ให้ประมวลผล
            if buffered_bytes >= _BYTES_PER_WINDOW:
                _flush_buffer(device_mac)
        except Exception as exc:
            print(f"[ERROR] ✗ ai_worker failed for {device_mac}: {exc}")
        finally:
            audio_data_queue.task_done()

def _start_workers() -> None:
    """🌟 สตาร์ท Worker Thread ตอน start_receiver() (ไม่ใช่ตอน import)"""
    global _workers_started
    if _workers_started:
        return
    _workers_started = True
    threading.Thread(target=ai_worker, daemon=True).start()
    threading.Thread(target=device_monitor_worker, daemon=True).start()

def on_disconnect(client, userdata, flags, rc, properties=None):
    print(f"[MQTT] Disconnected (rc={rc})")

# ==========================================
# 🌟 ส่วนที่อัปเกรดให้รองรับ WSS (WebSockets + SSL)
# ==========================================
def start_receiver(inference_callback=None):
    global _ai_inference_function, _mqtt_client
    if inference_callback:
        _ai_inference_function = inference_callback
        print("✅ [MQTT] Linked AI Inference Core Successfully.")

    _start_workers()

    print("=" * 60)
    print("  SmartVoice MQTT Background Thread (Auto WS/WSS/TCP)")
    print("=" * 60)
    
    # 🌟 1. ตรวจสอบ Transport อัตโนมัติ (ถ้าพอร์ต 1883 หรือ 8883 ให้ใช้ tcp นอกนั้นถือว่าเป็น websockets)
    transport_protocol = "tcp" if BROKER_PORT in [1883, 8883] else "websockets"
    
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="smartvoice_ai_forwarder", transport=transport_protocol)
    
    if MQTT_USER and MQTT_PASSWORD:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

    # ==========================================
    # 🌟 2. ระบบเปิด/ปิด TLS อัตโนมัติ ตามพอร์ตที่ใช้งาน (override ได้ด้วย MQTT_USE_TLS)
    # ==========================================
    # ถ้าพอร์ตเป็นกลุ่มที่ต้องเข้ารหัส (WSS / MQTTS: 443, 8883, 8083)
    if MQTT_USE_TLS:
        if TLS_INSECURE_SKIP_VERIFY:
            # ตั้ง TLS_INSECURE_SKIP_VERIFY=true ไว้ชัดเจน: เข้ารหัสแต่ข้ามการตรวจสอบ Certificate (เสี่ยง MITM)
            client.tls_set(cert_reqs=ssl.CERT_NONE)
            client.tls_insecure_set(True)
            print(f"⚠️ [Security] TLS/SSL Enabled but CERTIFICATE NOT VERIFIED (TLS_INSECURE_SKIP_VERIFY=true) on Port {BROKER_PORT}")
        else:
            # ค่าเริ่มต้น: ตรวจสอบ Cert จาก CA ของระบบ + hostname (ไม่ขึ้นกับ APP_ENV)
            client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
            print(f"🔒 [Security] TLS/SSL Enabled (Certificate verified) on Port {BROKER_PORT}")
            
        protocol_str = "wss" if transport_protocol == "websockets" else "mqtts"
    
    # ถ้าพอร์ตเป็น 9001 (WS) หรือ 1883 (TCP) หรือ MQTT_USE_TLS=false จะเชื่อมต่อแบบไม่เข้ารหัส (ประหยัดพลังงานใน Local)
    else:
        print(f"🔓 [Security] Plain connection (No TLS) on Port {BROKER_PORT}")
        protocol_str = "ws" if transport_protocol == "websockets" else "mqtt"

    if transport_protocol == "websockets":
        # 🌟 บังคับ Path เป็น "/mqtt" ให้ตรงกับที่ ESP32 ยิงมา
        client.ws_set_options(path="/mqtt")

    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect
    _mqtt_client = client

    try:
        url_suffix = "/mqtt" if transport_protocol == "websockets" else ""
        print(f"⏳ [MQTT] กำลังพยายามเชื่อมต่อไปที่ {protocol_str}://{BROKER_HOST}:{BROKER_PORT}{url_suffix} ...")
        
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
        client.loop_start()
    except Exception as exc:
        print(f"[ERROR] MQTT Connection Failed: {exc}")


def shutdown_receiver():
    global _mqtt_client
    print("\n[STOP] Shutting down MQTT Forwarder... Flushing buffers.")

    # หยุดรับข้อความใหม่ก่อน แล้วค่อย flush ของที่ค้างอยู่
    client = _mqtt_client
    _mqtt_client = None
    if client is not None:
        try:
            client.disconnect()
            client.loop_stop()
        except Exception as exc:
            print(f"⚠️ [MQTT] Disconnect failed: {exc}")

    with _device_states_lock:
        macs = list(_device_states.keys())
    for mac in macs:
        _flush_buffer(mac)
