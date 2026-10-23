"""ดูระดับเสียงแต่ละไมค์ และบันทึกเสียงดิบ 2 ช่องจากบอร์ดจริงผ่าน MQTT (ใช้ทดสอบกับบอร์ดจริง ดู api/README.md)

ใช้การตั้งค่า broker เดียวกับ receiver (api/.env: MQTT_BROKER_HOST, MQTT_BROKER_PORT, MQTT_USER, ...)
subscribe แค่ voice/audio/<MAC> ของบอร์ดเดียว ด้วย client_id ของตัวเอง จึงรันพร้อม uvicorn ได้

    cd api
    uv run python tools/mqtt_record.py --mac AA:BB:CC:DD:EE:FF                  # ระดับเสียง L/R ทุก 1 วิ
    uv run python tools/mqtt_record.py --mac AA:BB:CC:DD:EE:FF --seconds 10 --out data/raw/help_1m_01.wav

ไฟล์ที่บันทึกเป็น WAV 2 ช่อง 8 kHz 16 บิต (ช่อง 0 = L, ช่อง 1 = R) ใช้กับ eval_offline.py ได้ทุกโหมด
"""

from __future__ import annotations

import argparse
import math
import sys
import threading
import time
import uuid
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

FRAME_BYTES = 4  # L + R, int16 ละ 2 byte


def channel_levels_dbfs(pcm: bytes) -> tuple[float, float]:
    """RMS ของแต่ละช่อง (dBFS, 0 = เต็มสเกล) จาก PCM int16 LE สลับ L,R"""
    frames = np.frombuffer(pcm[: len(pcm) - len(pcm) % FRAME_BYTES], dtype="<i2").reshape(-1, 2)
    if not len(frames):
        return -math.inf, -math.inf
    rms = np.sqrt(np.mean((frames.astype(np.float64) / 32768.0) ** 2, axis=0))
    return tuple(20 * math.log10(r) if r > 0 else -math.inf for r in rms)


def level_line(left_db: float, right_db: float, width: int = 30) -> str:
    """ข้อความ 1 บรรทัด: ค่า dBFS + แถบระดับของ L และ R + ส่วนต่าง"""
    def bar(db: float) -> str:
        filled = 0 if db == -math.inf else max(0, min(width, round((db + 90) / 90 * width)))
        return "#" * filled + "." * (width - filled)

    diff = "" if -math.inf in (left_db, right_db) else f"  L-R {left_db - right_db:+5.1f} dB"
    return f"L {left_db:6.1f} dBFS [{bar(left_db)}]  R {right_db:6.1f} dBFS [{bar(right_db)}]{diff}"


def write_stereo_wav(path: Path, pcm: bytes, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm[: len(pcm) - len(pcm) % FRAME_BYTES])


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--mac", required=True, help="MAC ของบอร์ด รูปแบบ AA:BB:CC:DD:EE:FF")
    parser.add_argument("--seconds", type=float, help="บันทึกนานกี่วินาทีแล้วจบ (ไม่ใส่ = ดูระดับเสียงจนกด Ctrl+C)")
    parser.add_argument("--out", type=Path, help="ไฟล์ WAV 2 ช่องที่จะบันทึก")
    args = parser.parse_args(argv)

    import paho.mqtt.client as mqtt
    import ssl

    import mqtt_audio_receiver as rx  # ใช้ค่าการเชื่อมต่อชุดเดียวกับ receiver (อ่าน api/.env)

    mac = args.mac.strip().upper()
    if not rx._MAC_RE.match(mac):
        print(f"MAC ไม่ถูกรูปแบบ: {args.mac}")
        return 2
    topic = f"voice/audio/{mac}"

    lock = threading.Lock()
    recorded = bytearray()
    second = bytearray()
    state = {"messages": 0, "bad": 0, "started": None}

    def on_connect(client, userdata, flags, rc, properties=None):
        if rc == 0:
            client.subscribe(topic, qos=0)
            print(f"เชื่อม broker แล้ว รอเสียงจาก {topic} ...")
        else:
            print(f"เชื่อม broker ไม่สำเร็จ rc={rc}")

    def on_message(client, userdata, msg):
        data = msg.payload
        with lock:
            if len(data) % FRAME_BYTES:
                state["bad"] += 1
                return
            state["messages"] += 1
            if state["started"] is None:
                state["started"] = time.monotonic()
            second.extend(data)
            if args.out:
                recorded.extend(data)

    transport = "tcp" if rx.BROKER_PORT in (1883, 8883) else "websockets"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"evr_mqtt_record_{uuid.uuid4().hex[:8]}",
                         transport=transport)
    if rx.MQTT_USER and rx.MQTT_PASSWORD:
        client.username_pw_set(rx.MQTT_USER, rx.MQTT_PASSWORD)
    if rx.MQTT_USE_TLS:
        if rx.TLS_INSECURE_SKIP_VERIFY:
            client.tls_set(cert_reqs=ssl.CERT_NONE)
            client.tls_insecure_set(True)
        else:
            client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
    if transport == "websockets":
        client.ws_set_options(path="/mqtt")
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(rx.BROKER_HOST, rx.BROKER_PORT, keepalive=60)
    client.loop_start()

    bytes_per_second = rx.SAMPLE_RATE * FRAME_BYTES
    try:
        while True:
            time.sleep(1.0)
            with lock:
                chunk = bytes(second)
                second.clear()
                started = state["started"]
                total = len(recorded)
            if chunk:
                print(level_line(*channel_levels_dbfs(chunk)))
            elif started is None:
                print("ยังไม่มีเสียง (บอร์ดต่อ MQTT แล้วหรือยัง / MAC ถูกไหม)")
            if args.seconds and args.out and total >= args.seconds * bytes_per_second:
                break
            if args.seconds and not args.out and started and time.monotonic() - started >= args.seconds:
                break
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()

    if state["bad"]:
        print(f"ทิ้ง payload ที่ไม่ลงตัว 4 byte {state['bad']} ก้อน (firmware ยังเป็นรุ่น mono หรือไม่?)")
    if args.out:
        pcm = bytes(recorded)
        if args.seconds:
            pcm = pcm[: int(args.seconds * bytes_per_second)]
        write_stereo_wav(args.out, pcm, rx.SAMPLE_RATE)
        print(f"บันทึก {len(pcm) / bytes_per_second:.2f} วิ ลง {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
