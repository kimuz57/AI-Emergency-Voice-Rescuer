"""จำลองบอร์ด firmwareV2: ส่งเสียง 2 ช่องจากไฟล์ WAV เข้า MQTT แบบเดียวกับบอร์ดจริง (ทดสอบทั้งระบบโดยไม่ต้องมีบอร์ด)

ใช้การตั้งค่า broker เดียวกับ receiver (api/.env) ส่งไปที่ voice/audio/<MAC> ก้อนละ 1024 frame (4096 byte)
ทุก ~128 ms ตามเวลาจริง และส่ง device/status/<MAC> = online (retain) ก่อนเริ่ม แบบเดียวกับ firmware

    cd api
    uv run python tools/mqtt_simulate.py --mac 02:5E:ED:00:00:01 --wav help.wav
    uv run python tools/mqtt_simulate.py --mac 02:5E:ED:00:00:01 --wav help.wav --right-gain 0.2   # ไมค์ขวาเบา

ไฟล์ช่องเดียวจะถูกคัดลอกไปเป็นไมค์ขวาโดยเลื่อน --delay ค่าตัวอย่าง (เสียงมาจากด้านข้าง) ไฟล์ที่ไม่ใช่ 8 kHz
ถูก resample ก่อน อุปกรณ์ต้องลงทะเบียนและเปิดใช้งานแล้ว ไม่งั้น receiver จะทิ้งเสียง
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from math import gcd
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

FRAMES_PER_MESSAGE = 1024  # ตรงกับ AUDIO_PAYLOAD_BYTES / 4 ของ firmwareV2


def load_as_stereo(path: Path, sample_rate: int, delay: int, right_gain: float) -> np.ndarray:
    """WAV -> float32 [frames, 2] ช่วง -1..1 ที่ sample_rate"""
    sr, data = wavfile.read(path)
    if np.issubdtype(data.dtype, np.integer):
        data = data.astype(np.float32) / float(np.iinfo(data.dtype).max + 1)
    data = data.astype(np.float32)
    if data.ndim == 1:
        left = data
        right = np.concatenate([np.zeros(delay, np.float32), data[: len(data) - delay]]) if delay else data.copy()
        data = np.stack([left, right], axis=1)
    data = data[:, :2]
    if sr != sample_rate:
        g = gcd(sr, sample_rate)
        data = resample_poly(data, sample_rate // g, sr // g, axis=0).astype(np.float32)
    data[:, 1] *= right_gain
    return data


def to_payloads(stereo: np.ndarray) -> list[bytes]:
    pcm = (np.clip(stereo, -1.0, 32767 / 32768) * 32768).astype("<i2")
    pad = (-len(pcm)) % FRAMES_PER_MESSAGE
    pcm = np.concatenate([pcm, np.zeros((pad, 2), "<i2")])
    return [pcm[i:i + FRAMES_PER_MESSAGE].tobytes() for i in range(0, len(pcm), FRAMES_PER_MESSAGE)]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--mac", required=True, help="MAC ของอุปกรณ์ที่ลงทะเบียนไว้ รูปแบบ AA:BB:CC:DD:EE:FF")
    parser.add_argument("--wav", type=Path, required=True, help="ไฟล์เสียง (ช่องเดียวหรือ 2 ช่อง)")
    parser.add_argument("--repeat", type=int, default=1, help="เล่นไฟล์ซ้ำกี่รอบ (default 1)")
    parser.add_argument("--pad", type=float, default=2.0, help="เสียงพื้นหลังเบา ๆ ก่อน/หลังแต่ละรอบ (วินาที, default 2)")
    parser.add_argument("--delay", type=int, default=1, help="ไมค์ขวาช้ากว่าซ้ายกี่ค่าตัวอย่าง (ไฟล์ช่องเดียว, default 1)")
    parser.add_argument("--right-gain", type=float, default=1.0, help="คูณความดังไมค์ขวา (เช่น 0.2 = ไมค์ขวาเบา)")
    args = parser.parse_args(argv)

    import paho.mqtt.client as mqtt
    import ssl

    import mqtt_audio_receiver as rx  # ใช้ค่าการเชื่อมต่อชุดเดียวกับ receiver (อ่าน api/.env)

    mac = args.mac.strip().upper()
    if not rx._MAC_RE.match(mac):
        print(f"MAC ไม่ถูกรูปแบบ: {args.mac}")
        return 2

    rate = rx.SAMPLE_RATE
    clip = load_as_stereo(args.wav, rate, args.delay, args.right_gain)
    noise = 0.002 * np.random.default_rng(0).standard_normal((int(args.pad * rate), 2)).astype(np.float32)
    stereo = np.concatenate([noise] + [np.concatenate([clip, noise]) for _ in range(max(1, args.repeat))])
    payloads = to_payloads(stereo)

    transport = "tcp" if rx.BROKER_PORT in (1883, 8883) else "websockets"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"evr_mqtt_simulate_{uuid.uuid4().hex[:8]}",
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
    client.will_set(f"device/status/{mac}", "offline", qos=1, retain=True)
    client.connect(rx.BROKER_HOST, rx.BROKER_PORT, keepalive=60)
    client.loop_start()
    client.publish(f"device/status/{mac}", "online", qos=1, retain=True)

    period = FRAMES_PER_MESSAGE / rate
    print(f"ส่ง {len(stereo) / rate:.1f} วิ ({len(payloads)} ก้อน x 4096 byte) ไปที่ voice/audio/{mac} ...")
    started = time.monotonic()
    try:
        for i, payload in enumerate(payloads):
            client.publish(f"voice/audio/{mac}", payload, qos=0)
            time.sleep(max(0.0, started + (i + 1) * period - time.monotonic()))  # ตามเวลาจริงเหมือนบอร์ด
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()
    print("ส่งครบแล้ว (บอร์ดจำลองยังเป็น online จนกว่า receiver จะเห็นว่าเงียบ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
