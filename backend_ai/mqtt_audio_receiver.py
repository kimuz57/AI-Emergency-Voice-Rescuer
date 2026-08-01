import array
import io
import os
import sys
import time
import wave
import ssl # 🌟 1. เพิ่ม import ssl เข้ามาสำหรับ WSS
import threading # 🌟 เพิ่ม
import queue

import paho.mqtt.client as mqtt
import requests
from dotenv import load_dotenv
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv()
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

SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", 16000))  
SECONDS_PER_WINDOW = 2            
TOPIC_SUBSCRIBE = "voice/audio/#"   
STATUS_TOPIC = "device/status/#"    
CHANNELS = 1          
SAMPLE_WIDTH = 2      
VOLUME_GAIN = 3.0

_BYTES_PER_WINDOW = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH * SECONDS_PER_WINDOW
_device_states = {}
_device_activation_cache = {}

_device_last_seen = {}      # เก็บเวลาล่าสุดที่บอร์ดส่งข้อมูลมา { "mac": timestamp }
_device_is_online = {}      # เก็บสถานะว่าตอนนี้บอร์ดออนไลน์อยู่ไหม ป้องกันการยิง API ซ้ำ { "mac": True/False }

_ai_inference_function = None
audio_data_queue = queue.Queue(maxsize=20)

def _send_status_to_go_async(payload, is_local):
    go_status_url = f"{GO_SERVER_URL}/api/device/status" # เดี๋ยวเราจะไปสร้าง Route นี้ใน Go
    try:
        headers = {"X-Tunnel-Skip-AntiPhishing-Page": "true"}
        requests.post(
            go_status_url,
            json=payload,
            headers=headers,
            timeout=5,
            verify=not is_local
        )
    except Exception as exc:
        print(f"⚠️ [GO Backend] แจ้งสถานะ Offline ไม่สำเร็จ: {exc}")

# 🌟 [เพิ่มใหม่] Thread สำหรับตรวจสอบอุปกรณ์ที่หายไปเกิน 10 วินาที
def device_monitor_worker():
    TIMEOUT_SECONDS = 10
    is_local = (app_env == "development")
    
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
                    args=(payload, is_local), 
                    daemon=True
                ).start()

def is_device_activated(device_mac: str) -> bool:
    """ตรวจสอบสถานะจาก RAM ก่อน ถ้าไม่มีค่อยถาม Go Backend"""
    now = time.time()
    
    # 1. เช็คใน Cache ก่อน
    if device_mac in _device_activation_cache:
        cache_entry = _device_activation_cache[device_mac]
        if cache_entry["is_active"]:
            return True  # ผ่านตลอดกาล
        elif (now - cache_entry["check_time"]) < 10:
            return False # โดนบล็อกอยู่ (รอจนกว่าจะครบ 10 วิ)
            
    # 🌟 [จุดแก้สำคัญที่ 1] บันทึกเวลาลง Cache ดักไว้ก่อนเลย! 
    # เพื่อป้องกันไม่ให้ข้อความ MQTT ที่ไหลมาวินาทีละ 8 รอบ สแปมยิง API พร้อมๆ กัน
    _device_activation_cache[device_mac] = {
        "is_active": False,
        "check_time": time.time()
    }
            
    check_url = f"{GO_SERVER_URL}/api/device/check-activation"
    is_local = (app_env == "development")
    
    try:
        # 🌟 [จุดแก้สำคัญที่ 2] ใส่ Header ทะลวง Dev Tunnels ให้ Python
        headers = {"X-Tunnel-Skip-AntiPhishing-Page": "true"}
        
        # ยิงถาม Go Backend
        response = requests.get(
            check_url, 
            params={"mac": device_mac}, 
            headers=headers, # แนบ Header เข้าไปตรงนี้
            timeout=5, 
            verify=not is_local
        )
        
        if response.status_code == 200:
            # ใช้ .get() แบบปลอดภัย เผื่อ JSON พัง
            data = response.json()
            is_active = data.get("is_active", False)
        else:
            is_active = False 
            
        # 🌟 อัปเดตผลลัพธ์ที่ถูกต้องลง Cache อีกรอบ
        _device_activation_cache[device_mac]["is_active"] = is_active
        _device_activation_cache[device_mac]["check_time"] = time.time()
        
        if is_active:
            print(f"🔓 [AUTH] อนุมัติ! บอร์ด [{device_mac}] ยืนยันตัวตนผ่านแล้ว")
        else:
            print(f"🔒 [AUTH] ปฏิเสธ! บอร์ด [{device_mac}] ยังไม่ถูก Activate (รอเช็คใหม่ใน 10 วิ)")
            
        return is_active
        
    except Exception as e:
        print(f"⚠️ [AUTH] ติดต่อ Go Backend ไม่ได้ (หรือข้อมูลผิดพลาด): {e}")
        # ถึงจะ Error ก็มีการบันทึกเวลาดักไว้แล้วด้านบน ระบบจะได้พัก 10 วิ ไม่รวน
        return False

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

def _send_to_go_async(url, wav_bytes, filename, payload, is_local):
    """ฟังก์ชันทำงานเบื้องหลังสำหรับยิง API โดยไม่บล็อกระบบหลัก"""
    try:
        requests.post(
            url,
            files={"audio": (filename, io.BytesIO(wav_bytes), "audio/wav")},
            data=payload,
            timeout=5,
            verify=not is_local
        )
    except Exception as exc:
        print(f"⚠️ [GO Backend] ยิง API ไม่สำเร็จ: {exc}")

def _process_and_forward(pcm_bytes: bytes, device_mac: str) -> None:
    wav_bytes = _build_wav_in_memory(pcm_bytes)
    
    if _ai_inference_function is None:
        print("❌ [MQTT] Error: AI Inference Function is not set! (app2.py did not send it)")
        return

    try:
        ai_result = _ai_inference_function(wav_bytes)
        detected = ai_result.get("detected", "no")
        probability = ai_result.get("probability", 0.0)
        
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
                f"{go_base_url}/emergency", wav_bytes, "emergency.wav", payload_data, is_local
            ), daemon=True).start()

        else:
            if is_local:
                print(f"✅ [AI] normal (prob={probability:.4f}) -> โยนงานยิง API เบื้องหลัง")
                
            threading.Thread(target=_send_to_go_async, args=(
                f"{go_base_url}/negative", wav_bytes, "negative.wav", payload_data, is_local
            ), daemon=True).start()

    except Exception as exc:
        print(f"[ERROR] ✗ Processing or Go Routing failed: {exc}")

def _flush_buffer(device_mac: str) -> None:
    # print(_device_states )
    if device_mac not in _device_states or not _device_states[device_mac]["buffer"]:
        return
        
    pcm_data = b"".join(_device_states[device_mac]["buffer"])
    pcm_data = amplify_audio(pcm_data, VOLUME_GAIN)
    
    if app_env == "development":
        total_sec = len(pcm_data) / (SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH)
        print(f"[SEND] {device_mac} : {len(pcm_data) / 1024:.1f} KB ({total_sec:.1f}s) → Core AI")
    
    _process_and_forward(pcm_data, device_mac)
    
    _device_states[device_mac]["buffer"] = []
    _device_states[device_mac]["chunks"] = 0
    _device_states[device_mac]["start_time"] = time.time()

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

        _device_last_seen[device_mac] = time.time()
        _device_is_online[device_mac] = True

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
        
        if device_mac not in _device_states:
            _device_states[device_mac] = {"buffer": [], "chunks": 0, "start_time": time.time()}

        state = _device_states[device_mac]
        state["buffer"].append(data)
        state["chunks"] += 1

        buffered_bytes = sum(len(b) for b in state["buffer"])

        # ถ้าข้อมูลครบ 1 Window ให้ประมวลผล
        if buffered_bytes >= _BYTES_PER_WINDOW:
            _flush_buffer(device_mac)
            
        audio_data_queue.task_done()

# 🌟 สตาร์ท Worker Thread นี้ตอนเริ่มทำงาน
threading.Thread(target=ai_worker, daemon=True).start()
threading.Thread(target=device_monitor_worker, daemon=True).start()
def on_disconnect(client, userdata, flags, rc, properties=None):
    print(f"[MQTT] Disconnected (rc={rc})")

# ==========================================
# 🌟 ส่วนที่อัปเกรดให้รองรับ WSS (WebSockets + SSL)
# ==========================================
def start_receiver(inference_callback=None):
    global _ai_inference_function
    if inference_callback:
        _ai_inference_function = inference_callback
        print("✅ [MQTT] Linked AI Inference Core Successfully.")

    print("=" * 60)
    print("  SmartVoice MQTT Background Thread (Auto WS/WSS/TCP)")
    print("=" * 60)
    
    # 🌟 1. ตรวจสอบ Transport อัตโนมัติ (ถ้าพอร์ต 1883 หรือ 8883 ให้ใช้ tcp นอกนั้นถือว่าเป็น websockets)
    transport_protocol = "tcp" if BROKER_PORT in [1883, 8883] else "websockets"
    
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="smartvoice_ai_forwarder", transport=transport_protocol)
    
    if MQTT_USER and MQTT_PASSWORD:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

    is_local = (app_env == "development")
    
    # ==========================================
    # 🌟 2. ระบบเปิด/ปิด TLS อัตโนมัติ ตามพอร์ตที่ใช้งาน
    # ==========================================
    # ถ้าพอร์ตเป็นกลุ่มที่ต้องเข้ารหัส (WSS / MQTTS)
    if BROKER_PORT in [443, 8883]:
        if is_local:
            # รัน Local: เปิด WSS แต่ข้ามการตรวจสอบ Certificate (Bypass SSL)
            client.tls_set(cert_reqs=ssl.CERT_NONE)
            client.tls_insecure_set(True)
            print(f"🔒 [Security] TLS/SSL Enabled (Local Mode - Skip Cert Check) on Port {BROKER_PORT}")
        else:
            # รัน Server จริง: เปิด WSS แบบเต็มรูปแบบ (ตรวจสอบ Cert จาก CA สากล)
            client.tls_set()
            print(f"🔒 [Security] TLS/SSL Enabled (Production Mode) on Port {BROKER_PORT}")
            
        protocol_str = "wss" if transport_protocol == "websockets" else "mqtts"
    
    # ถ้าพอร์ตเป็น 9001 (WS) หรือ 1883 (TCP) จะเชื่อมต่อแบบไม่เข้ารหัส (ประหยัดพลังงานใน Local)
    else:
        print(f"🔓 [Security] Plain connection (No TLS) on Port {BROKER_PORT}")
        protocol_str = "ws" if transport_protocol == "websockets" else "mqtt"

    if transport_protocol == "websockets":
        # 🌟 บังคับ Path เป็น "/mqtt" ให้ตรงกับที่ ESP32 ยิงมา
        client.ws_set_options(path="/mqtt")

    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    try:
        url_suffix = "/mqtt" if transport_protocol == "websockets" else ""
        print(f"⏳ [MQTT] กำลังพยายามเชื่อมต่อไปที่ {protocol_str}://{BROKER_HOST}:{BROKER_PORT}{url_suffix} ...")
        
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
        client.loop_start()
    except Exception as exc:
        print(f"[ERROR] MQTT Connection Failed: {exc}")


def shutdown_receiver():
    print("\n[STOP] Shutting down MQTT Forwarder... Flushing buffers.")
    for mac in list(_device_states.keys()):
        _flush_buffer(mac)
