"""tools/mqtt_record.py: ระดับเสียงแต่ละช่องและไฟล์ WAV 2 ช่อง (ไม่ต่อ broker)"""

import importlib.util
import math
import wave
from pathlib import Path

import numpy as np
import pytest

_spec = importlib.util.spec_from_file_location("mqtt_record", Path(__file__).resolve().parent.parent / "tools" / "mqtt_record.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)


def _pcm(left, right):
    return np.stack([left, right], axis=1).astype("<i2").tobytes()


def test_levels_tell_which_channel_is_louder():
    t = np.arange(8000) / 8000
    loud = 16384 * np.sin(2 * np.pi * 440 * t)       # -9 dBFS (ไซน์ครึ่งสเกล)
    quiet = loud / 100                                 # -40 dB จากตัวดัง
    left_db, right_db = rec.channel_levels_dbfs(_pcm(loud, quiet))
    assert left_db == pytest.approx(-9.03, abs=0.1)
    assert left_db - right_db == pytest.approx(40, abs=0.5)
    assert "L-R +40" in rec.level_line(left_db, right_db)


def test_silent_channel_is_minus_infinity():
    left_db, right_db = rec.channel_levels_dbfs(_pcm(np.full(100, 1000), np.zeros(100)))
    assert math.isfinite(left_db) and right_db == -math.inf
    assert "L-R" not in rec.level_line(left_db, right_db)


def test_partial_frame_is_ignored():
    pcm = _pcm(np.full(10, 1000), np.full(10, 1000)) + b"\x01\x02"
    assert all(math.isfinite(v) for v in rec.channel_levels_dbfs(pcm))


def test_writes_stereo_wav_in_lr_order(tmp_path):
    left = np.arange(16, dtype=np.int16)
    right = -left
    path = tmp_path / "raw" / "take.wav"
    rec.write_stereo_wav(path, _pcm(left, right), 8000)
    with wave.open(str(path)) as wf:
        assert (wf.getnchannels(), wf.getframerate(), wf.getsampwidth(), wf.getnframes()) == (2, 8000, 2, 16)
        frames = np.frombuffer(wf.readframes(16), "<i2").reshape(-1, 2)
    np.testing.assert_array_equal(frames[:, 0], left)
    np.testing.assert_array_equal(frames[:, 1], right)
