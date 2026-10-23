"""การตัดหน้าต่างและตรวจขนาด payload ใน mqtt_audio_receiver.py (ไม่ต่อ broker จริง)"""

import importlib

import numpy as np
import pytest


@pytest.fixture
def receiver(monkeypatch):
    # receiver อ่าน env ที่จำเป็นตอน import
    monkeypatch.setenv("MQTT_BROKER_HOST", "localhost")
    monkeypatch.setenv("GO_SERVER_URL", "http://localhost:8080")
    monkeypatch.setenv("INTERNAL_API_KEY", "test-key")
    monkeypatch.setenv("SAMPLE_RATE", "8000")
    monkeypatch.setenv("DSP_MODE", "das_pf")
    import mqtt_audio_receiver
    return importlib.reload(mqtt_audio_receiver)


def test_window_is_two_seconds_of_stereo(receiver):
    assert receiver.CHANNELS == 2
    assert receiver._SAMPLES_PER_WINDOW == 16000
    assert receiver._BYTES_PER_WINDOW == 16000 * 2 * 2


def test_take_windows_keeps_remainder_frame_aligned(receiver):
    buffer = bytearray()
    windows = []
    chunk = bytes(4096)  # 1 message ของ firmware = 1024 frames
    for _ in range(32):
        buffer += chunk
        windows += receiver._take_windows(buffer)
    assert len(windows) == 2  # 32 * 4096 = 131072 byte = 2 หน้าต่าง + เศษ 3072
    assert all(len(w) == receiver._BYTES_PER_WINDOW for w in windows)
    assert len(buffer) == 32 * 4096 - 2 * receiver._BYTES_PER_WINDOW
    assert len(buffer) % 4 == 0


def test_misaligned_payload_is_dropped_with_warning(receiver, monkeypatch, capsys):
    queued = []
    monkeypatch.setattr(receiver, "is_device_activated", lambda mac: True)
    monkeypatch.setattr(receiver.audio_data_queue, "put_nowait", lambda item: queued.append(item))

    class Msg:
        topic = "voice/audio/AA:BB:CC:DD:EE:FF"

    for payload in (bytes(4094), bytes(4096)):
        msg = Msg()
        msg.payload = payload
        receiver.on_message(None, None, msg)

    assert [len(data) for data, _ in queued] == [4096]
    assert "4094" in capsys.readouterr().out


def test_window_goes_through_dsp_to_inference_as_mono_wav(receiver, monkeypatch):
    seen = {}

    def fake_inference(wav_bytes):
        import io
        import wave
        with wave.open(io.BytesIO(wav_bytes)) as wf:
            seen["params"] = (wf.getnchannels(), wf.getframerate(), wf.getnframes())
        return {"detected": "no", "probability": 0.9}

    monkeypatch.setattr(receiver, "_ai_inference_function", fake_inference)
    monkeypatch.setattr(receiver.threading, "Thread", lambda *a, **k: type("T", (), {"start": lambda self: None})())

    rng = np.random.default_rng(1)
    t = np.arange(16000) / 8000
    speech = np.zeros(16000)
    speech[4000:12000] = 0.3 * np.sin(2 * np.pi * 440 * t[4000:12000])
    frames = np.stack([speech, speech], axis=1) + 0.01 * rng.standard_normal((16000, 2))
    pcm = (frames * 32767).astype("<i2").tobytes()

    receiver._process_and_forward(pcm, "AA:BB:CC:DD:EE:FF", receiver.dsp.DSPState())
    assert seen["params"] == (1, 8000, 16000)
