"""
Task 2: MQTT Audio Receiver
Subscribe to voice/audio/ESP32_DEVICE_001 and save audio chunks as .wav files.
16kHz / 16-bit / Mono (matches ESP32 I2S config)
"""

import paho.mqtt.client as mqtt
import wave
import struct
import os
import time
import datetime
import signal
import sys

# ─── Config ───────────────────────────────────────────────────────────────────
BROKER_HOST = "127.0.0.1"   # PC IP on SmartVoice-ESP32 WiFi
BROKER_PORT = 1883
TOPIC = "voice/audio/ESP32_DEVICE_001"
STATUS_TOPIC = "device/status/#"

SAMPLE_RATE = 16000      # Hz
CHANNELS = 1             # Mono
SAMPLE_WIDTH = 2         # 16-bit = 2 bytes

SAVE_DIR = os.path.join(os.path.dirname(__file__), "go_backend", "audio_recordings")
# How many seconds of audio per file (0 = one continuous file until stopped)
SECONDS_PER_FILE = 5    # split into 30-second files

# ─── State ───────────────────────────────────────────────────────────────────
wav_file = None
wav_writer = None
current_file_path = None
total_chunks = 0
total_bytes = 0
session_start = None
chunks_in_current_file = 0
CHUNKS_PER_FILE = int(SAMPLE_RATE * SECONDS_PER_FILE / 2048)  # 2048 samples/chunk

os.makedirs(SAVE_DIR, exist_ok=True)


def open_new_wav():
    """Open a new WAV file for writing."""
    global wav_file, wav_writer, current_file_path, chunks_in_current_file
    if wav_writer:
        wav_writer.close()
    if wav_file:
        wav_file.close()
        print(f"[SAVED] {current_file_path}")

    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"audio_{ts}.wav"
    current_file_path = os.path.join(SAVE_DIR, filename)

    wav_file = open(current_file_path, "wb")
    wav_writer = wave.open(wav_file, "wb")
    wav_writer.setnchannels(CHANNELS)
    wav_writer.setsampwidth(SAMPLE_WIDTH)
    wav_writer.setframerate(SAMPLE_RATE)
    chunks_in_current_file = 0
    print(f"[RECORDING] → {current_file_path}")


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Connected to {BROKER_HOST}:{BROKER_PORT}")
        client.subscribe(TOPIC, qos=0)
        client.subscribe(STATUS_TOPIC, qos=0)
        print(f"[MQTT] Subscribed to: {TOPIC}")
    else:
        print(f"[MQTT] Connection failed, rc={rc}")


def on_message(client, userdata, msg):
    global total_chunks, total_bytes, session_start, chunks_in_current_file

    if msg.topic == TOPIC:
        data = msg.payload
        if len(data) == 0:
            return

        if session_start is None:
            session_start = time.time()
            open_new_wav()

        # Write raw PCM samples to wav
        wav_writer.writeframes(data)
        total_chunks += 1
        total_bytes += len(data)
        chunks_in_current_file += 1

        # Progress log every 50 chunks (~3.2 seconds of audio)
        if total_chunks % 50 == 0:
            elapsed = time.time() - session_start
            print(f"[AUDIO] chunk={total_chunks:5d}  total={total_bytes/1024:.1f} KB  "
                  f"elapsed={elapsed:.1f}s  rate={total_bytes/elapsed/1024:.1f} KB/s")

        # Split file every N chunks
        if SECONDS_PER_FILE > 0 and chunks_in_current_file >= CHUNKS_PER_FILE:
            open_new_wav()

    elif msg.topic.startswith("device/status"):
        print(f"[STATUS] {msg.topic}: {msg.payload.decode('utf-8', errors='replace')}")


def on_disconnect(client, userdata, rc, properties=None):
    print(f"[MQTT] Disconnected (rc={rc}), retrying...")


def close_recording():
    """Close current WAV file cleanly."""
    global wav_writer, wav_file
    if wav_writer:
        try:
            wav_writer.close()
        except Exception:
            pass
        wav_writer = None
    if wav_file:
        try:
            wav_file.close()
        except Exception:
            pass
        wav_file = None
    if current_file_path and os.path.exists(current_file_path):
        size = os.path.getsize(current_file_path)
        print(f"[SAVED] {current_file_path} ({size/1024:.1f} KB)")


def signal_handler(sig, frame):
    print("\n[STOP] Shutting down...")
    close_recording()
    print(f"[DONE] Total: {total_chunks} chunks, {total_bytes/1024:.1f} KB")
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("=" * 60)
    print("  SmartVoice MQTT Audio Receiver")
    print(f"  Broker : {BROKER_HOST}:{BROKER_PORT}")
    print(f"  Topic  : {TOPIC}")
    print(f"  Output : {SAVE_DIR}")
    print(f"  Format : {SAMPLE_RATE}Hz / 16-bit / Mono")
    print(f"  Split  : every {SECONDS_PER_FILE}s")
    print("  Press Ctrl+C to stop")
    print("=" * 60)

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="smartvoice_receiver")
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    try:
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
        client.loop_forever()
    except KeyboardInterrupt:
        signal_handler(None, None)
    except Exception as e:
        print(f"[ERROR] {e}")
        close_recording()
