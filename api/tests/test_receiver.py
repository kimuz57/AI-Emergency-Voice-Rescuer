"""หน้าต่างเลื่อน การตัดสินใจจากค่าเฉลี่ย และการตรวจขนาด payload ใน mqtt_audio_receiver.py (ไม่ต่อ broker จริง)"""

import importlib
import io
import wave

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
    for key in ("WINDOW_HOP_SECONDS", "DECISION_WINDOWS", "DECISION_THRESHOLD", "ALERT_COOLDOWN_SECONDS"):
        monkeypatch.delenv(key, raising=False)
    import mqtt_audio_receiver
    return importlib.reload(mqtt_audio_receiver)


def _speech_window(seed=1, samples=16000):
    rng = np.random.default_rng(seed)
    t = np.arange(samples) / 8000
    speech = np.zeros(samples)
    speech[4000:12000] = 0.3 * np.sin(2 * np.pi * 440 * t[4000:12000]) + 0.05 * rng.standard_normal(8000)
    frames = np.stack([speech, speech], axis=1) + 0.01 * rng.standard_normal((samples, 2))
    return (frames * 32767).astype("<i2").tobytes()


# ---------------------------------------------------------------------------
# หน้าต่าง
# ---------------------------------------------------------------------------

def test_defaults(receiver):
    assert receiver.CHANNELS == 2
    assert receiver._SAMPLES_PER_WINDOW == 16000
    assert receiver._BYTES_PER_WINDOW == 16000 * 2 * 2
    assert receiver._HOP_SAMPLES == 4000          # 0.5 วิ
    assert (receiver.DECISION_WINDOWS, receiver.DECISION_THRESHOLD) == (3, 0.5)
    assert receiver._NEGATIVE_EVERY_WINDOWS == 4
    assert receiver.ALERT_COOLDOWN_SECONDS == 30


def test_windows_slide_by_half_a_second(receiver):
    buffer = bytearray()
    windows = []
    frames = np.arange(4 * 8000, dtype=np.int64)  # 4 วิ, ค่าของ frame = ลำดับ frame
    pcm = np.stack([frames % 32768, frames % 32768], axis=1).astype("<i2").tobytes()
    for start in range(0, len(pcm), 4096):        # ทยอยมาทีละ message ของ firmware
        buffer += pcm[start:start + 4096]
        windows += receiver._take_windows(buffer)

    assert len(windows) == 5                      # เริ่มที่ 0, 0.5, 1.0, 1.5, 2.0 วิ
    starts = [np.frombuffer(w, "<i2")[0] for w in windows]
    assert starts == [0, 4000, 8000, 12000, 16000]
    assert all(len(w) == receiver._BYTES_PER_WINDOW for w in windows)
    assert len(buffer) % 4 == 0 and len(buffer) < receiver._BYTES_PER_WINDOW


@pytest.mark.parametrize("raw, ok", [("0.25", True), ("2", True), ("0", False), ("3", False), ("abc", False)])
def test_hop_env_is_validated(monkeypatch, receiver, raw, ok):
    monkeypatch.setenv("WINDOW_HOP_SECONDS", raw)
    if ok:
        assert importlib.reload(receiver)._HOP_SAMPLES == round(float(raw) * 8000)
    else:
        with pytest.raises(ValueError):
            importlib.reload(receiver)


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


# ---------------------------------------------------------------------------
# การตัดสินใจ
# ---------------------------------------------------------------------------

def test_decision_needs_n_windows_and_strictly_above_threshold(receiver):
    smoother = receiver.DecisionSmoother(n=3, threshold=0.5)
    assert not smoother.push(0.99).alert          # ยังไม่ครบ 3 หน้าต่าง
    assert not smoother.push(0.99).alert
    decision = smoother.push(0.99)
    assert decision.alert and decision.average == pytest.approx(0.99) and decision.windows == 3

    smoother = receiver.DecisionSmoother(n=3, threshold=0.5)
    for p in (0.5, 0.5, 0.5):
        decision = smoother.push(p)
    assert not decision.alert                     # เท่ากับเกณฑ์ ไม่ใช่เกิน


def test_decision_replaces_single_window_rule(receiver):
    """หน้าต่างเดียวที่ prob_yes > prob_no ไม่พอแจ้งเหตุ ถ้าค่าเฉลี่ย 3 หน้าต่างไม่เกินเกณฑ์"""
    smoother = receiver.DecisionSmoother(n=3, threshold=0.5)
    decisions = [smoother.push(p) for p in (0.1, 0.9, 0.2, 0.3)]
    assert not any(d.alert for d in decisions)


def test_decision_resets_after_alert(receiver):
    smoother = receiver.DecisionSmoother(n=3, threshold=0.5)
    alerts = [smoother.push(0.9).alert for _ in range(9)]  # ร้องต่อเนื่อง 9 หน้าต่าง (4.5 วิ)
    assert alerts == [False, False, True] * 3              # ไม่ยิงซ้ำทุก 0.5 วิ ต้องสะสมใหม่ 3 หน้าต่าง


def test_decision_returns_audio_of_most_confident_window(receiver):
    smoother = receiver.DecisionSmoother(n=3, threshold=0.5)
    smoother.push(0.6, b"a")
    smoother.push(0.95, b"b")
    assert smoother.push(0.0, None).audio == b"b"  # หน้าต่างสุดท้ายเงียบ แต่ค่าเฉลี่ยยังเกิน


# ---------------------------------------------------------------------------
# หน้าต่าง -> DSP -> โมเดล -> Go
# ---------------------------------------------------------------------------

@pytest.fixture
def sent(receiver, monkeypatch):
    """เก็บ request ที่จะยิงไป Go แทนการสร้าง thread จริง"""
    calls = []

    class FakeThread:
        def __init__(self, target, args, daemon):
            self.args = args

        def start(self):
            calls.append(self.args)

    monkeypatch.setattr(receiver.threading, "Thread", FakeThread)
    return calls


def _fake_model(receiver, monkeypatch, probs):
    seen = []

    def infer(wav_bytes):
        with wave.open(io.BytesIO(wav_bytes)) as wf:
            seen.append((wf.getnchannels(), wf.getframerate(), wf.getnframes()))
        p = probs[min(len(seen) - 1, len(probs) - 1)]
        return {"detected": "yes" if p > 0.5 else "no", "probability": max(p, 1 - p), "prob_yes": p}

    monkeypatch.setattr(receiver, "_ai_inference_function", infer)
    return seen


def test_window_goes_through_dsp_to_inference_as_mono_wav(receiver, monkeypatch, sent):
    seen = _fake_model(receiver, monkeypatch, [0.1])
    receiver._process_window(_speech_window(), "AA:BB:CC:DD:EE:FF", receiver._new_device_state())
    assert seen == [(1, 8000, 16000)]
    assert [url.rsplit("/", 1)[-1] for url, *_ in sent] == ["negative"]


def test_alert_after_three_windows_then_reset(receiver, monkeypatch, sent):
    monkeypatch.setattr(receiver, "ALERT_COOLDOWN_SECONDS", 0)   # ดูแค่การล้างค่าเฉลี่ย ไม่มีช่วงพัก
    _fake_model(receiver, monkeypatch, [0.8])
    state = receiver._new_device_state()
    for _ in range(6):
        receiver._process_window(_speech_window(), "AA:BB:CC:DD:EE:FF", state)
    emergencies = [args for args in sent if args[0].endswith("/emergency")]
    assert len(emergencies) == 2                               # หน้าต่างที่ 3 และ 6
    assert emergencies[0][3]["confidence"] == pytest.approx(0.8)
    assert emergencies[0][3]["event_type"] == "needs_help"


def test_negative_is_throttled_to_once_per_window_length(receiver, monkeypatch, sent):
    _fake_model(receiver, monkeypatch, [0.1])
    state = receiver._new_device_state()
    for _ in range(8):                                          # 8 หน้าต่าง x 0.5 วิ = 4 วิ
        receiver._process_window(_speech_window(), "AA:BB:CC:DD:EE:FF", state)
    assert len([a for a in sent if a[0].endswith("/negative")]) == 2


def test_silent_window_skips_model_and_counts_as_zero(receiver, monkeypatch, sent):
    seen = _fake_model(receiver, monkeypatch, [0.9])
    state = receiver._new_device_state()
    silence = (0.001 * np.random.default_rng(3).standard_normal((16000, 2)) * 32767).astype("<i2").tobytes()
    receiver._process_window(silence, "AA:BB:CC:DD:EE:FF", state)
    assert seen == [] and sent == []
    receiver._process_window(_speech_window(), "AA:BB:CC:DD:EE:FF", state)
    receiver._process_window(_speech_window(), "AA:BB:CC:DD:EE:FF", state)
    # ค่าเฉลี่ย (0 + 0.9 + 0.9) / 3 = 0.6 > 0.5 -> แจ้งเหตุ ด้วยเสียงของหน้าต่างที่มีเสียงพูด
    emergencies = [a for a in sent if a[0].endswith("/emergency")]
    assert len(emergencies) == 1 and emergencies[0][1] is not None
    assert emergencies[0][3]["confidence"] == pytest.approx(0.6)


# ---------------------------------------------------------------------------
# ช่วงพักหลังแจ้งเหตุ (ALERT_COOLDOWN_SECONDS)
# ---------------------------------------------------------------------------

class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_cooldown_blocks_repeat_alert_but_logs_it(receiver, monkeypatch, sent, capsys):
    clock = FakeClock()
    monkeypatch.setattr(receiver.time, "monotonic", clock)
    _fake_model(receiver, monkeypatch, [0.9])
    state = receiver._new_device_state()
    for _ in range(9):                      # ร้องต่อเนื่อง 4.5 วิ: ค่าเฉลี่ยเกินเกณฑ์ที่หน้าต่าง 3, 6, 9
        receiver._process_window(_speech_window(), "AA:BB:CC:DD:EE:FF", state)
        clock.now += 0.5
    emergencies = [a for a in sent if a[0].endswith("/emergency")]
    assert len(emergencies) == 1             # ส่งครั้งแรกครั้งเดียว
    out = capsys.readouterr().out
    assert out.count("ระหว่างพัก") == 2      # อีก 2 ครั้งถูก log แต่ไม่ส่ง


def test_alert_is_sent_again_after_cooldown(receiver, monkeypatch, sent):
    clock = FakeClock()
    monkeypatch.setattr(receiver.time, "monotonic", clock)
    _fake_model(receiver, monkeypatch, [0.9])
    state = receiver._new_device_state()
    for _ in range(3):
        receiver._process_window(_speech_window(), "AA:BB:CC:DD:EE:FF", state)
    clock.now += receiver.ALERT_COOLDOWN_SECONDS + 0.1
    for _ in range(3):
        receiver._process_window(_speech_window(), "AA:BB:CC:DD:EE:FF", state)
    assert len([a for a in sent if a[0].endswith("/emergency")]) == 2


def test_cooldown_is_per_device(receiver, monkeypatch, sent):
    monkeypatch.setattr(receiver.time, "monotonic", FakeClock())
    _fake_model(receiver, monkeypatch, [0.9])
    for mac in ("AA:BB:CC:DD:EE:01", "AA:BB:CC:DD:EE:02"):
        state = receiver._new_device_state()
        for _ in range(3):
            receiver._process_window(_speech_window(), mac, state)
    macs = [a[3]["device_mac"] for a in sent if a[0].endswith("/emergency")]
    assert macs == ["AA:BB:CC:DD:EE:01", "AA:BB:CC:DD:EE:02"]


@pytest.mark.parametrize("raw, ok", [("0", True), ("12.5", True), ("-1", False), ("soon", False)])
def test_cooldown_env_is_validated(monkeypatch, receiver, raw, ok):
    monkeypatch.setenv("ALERT_COOLDOWN_SECONDS", raw)
    if ok:
        assert importlib.reload(receiver).ALERT_COOLDOWN_SECONDS == float(raw)
    else:
        with pytest.raises(ValueError):
            importlib.reload(receiver)
