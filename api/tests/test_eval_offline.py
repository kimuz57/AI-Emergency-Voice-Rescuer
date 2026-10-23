"""eval_offline.py: metric คำนวณถูก และรันครบทั้ง 3 โหมดกับโมเดลจริง (ข้ามถ้าไม่มี torch)"""

import io
import json
import sys
import wave

import numpy as np
import pytest

import eval_offline as ev


def _result(label, predicted, mode="mono"):
    return ev.FileResult(mode, "x.wav", label, predicted, predicted, 0.0, 3, 3, [1.0], [10.0], [11.0])


def test_metrics():
    results = ([_result(1, 1)] * 6 + [_result(1, 0)] * 2      # TP 6, FN 2
               + [_result(0, 1)] * 1 + [_result(0, 0)] * 11)  # FP 1, TN 11
    s = ev.summarize("mono", results, skipped=0)
    assert (s["tp"], s["fn"], s["fp"], s["tn"]) == (6, 2, 1, 11)
    assert s["accuracy"] == pytest.approx(17 / 20)
    assert s["precision"] == pytest.approx(6 / 7)
    assert s["recall"] == pytest.approx(6 / 8)
    assert s["f1"] == pytest.approx(2 * (6 / 7) * (6 / 8) / (6 / 7 + 6 / 8))
    assert s["window_ms"]["mean"] == pytest.approx(11.0)


def test_metrics_without_positive_predictions():
    s = ev.summarize("mono", [_result(1, 0), _result(0, 0)], skipped=0)
    assert (s["precision"], s["recall"], s["f1"]) == (0.0, 0.0, 0.0)


def test_labels_from_folders(tmp_path):
    for folder in ("help", "normal", "misc"):
        (tmp_path / folder).mkdir()
        (tmp_path / folder / "a.wav").write_bytes(b"")
    found = {p.parent.name: label for p, label in ev.find_files(tmp_path, None)}
    assert found == {"help": 1, "normal": 0}


def _write_wav(path, frames, rate=8000):
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(frames.shape[1])
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(frames.astype("<i2").tobytes())


def test_read_wav_resamples_to_8k(tmp_path):
    path = tmp_path / "a.wav"
    _write_wav(path, np.zeros((16000, 2)), rate=16000)
    assert ev.read_wav(path).shape == (8000, 2)


def test_runs_all_modes_with_real_model(tmp_path, monkeypatch, capsys):
    torch = pytest.importorskip("torch")
    pytest.importorskip("torchaudio")
    pytest.importorskip("nnAudio")

    rng = np.random.default_rng(0)
    t = np.arange(24000) / 8000
    for folder, n in (("help", 2), ("normal", 2)):
        (tmp_path / folder).mkdir()
        for i in range(n):
            tone = 0.3 * np.sin(2 * np.pi * (300 + 200 * i) * t) * (t > 0.5) * (t < 2.0)
            left = tone + 0.01 * rng.standard_normal(len(t))
            stereo = np.stack([left, np.roll(left, 2)], axis=1)
            _write_wav(tmp_path / folder / f"{i}.wav", stereo * 32767)
    _write_wav(tmp_path / "normal" / "mono.wav", (0.01 * rng.standard_normal((4000, 1))) * 32767)

    for module in ("app", "mqtt_audio_receiver"):
        sys.modules.pop(module, None)
    # configure_env เขียน os.environ ตรง ๆ: ให้ monkeypatch จำค่าเดิมไว้คืนหลังจบ test
    for key in ("MODEL_PATH", "MODEL_ARCH", "DECISION_WINDOWS", "DECISION_THRESHOLD", "WINDOW_HOP_SECONDS",
                "SAMPLE_RATE", "DSP_LOG_TIMING", "DSP_MODE", "MQTT_BROKER_HOST", "GO_SERVER_URL", "INTERNAL_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    ev.configure_env(ev.parse_args([str(tmp_path)]))
    import app

    # torchaudio.load ใช้ torchcodec ซึ่งต้องมี FFmpeg แบบ shared library — ใน test อ่าน WAV เองแทน
    def load_wav(fileobj):
        with wave.open(fileobj) as wf:
            data = np.frombuffer(wf.readframes(wf.getnframes()), "<i2").reshape(-1, wf.getnchannels())
            return torch.from_numpy(data.T.astype(np.float32) / 32768), wf.getframerate()

    monkeypatch.setattr(app.torchaudio, "load", load_wav)

    out_json = tmp_path / "summary.json"
    out_csv = tmp_path / "files.csv"
    assert ev.main([str(tmp_path), "--json", str(out_json), "--csv", str(out_csv)]) == 0

    summary = json.loads(out_json.read_text(encoding="utf-8"))
    by_mode = {r["mode"]: r for r in summary["results"]}
    assert set(by_mode) == {"mono", "das_pf", "mvdr"}
    assert by_mode["mono"]["files"] == 5 and by_mode["mono"]["skipped_files"] == 0
    assert by_mode["das_pf"]["files"] == 4 and by_mode["das_pf"]["skipped_files"] == 1  # ไฟล์ช่องเดียว
    for r in by_mode.values():
        assert r["tp"] + r["tn"] + r["fp"] + r["fn"] == r["files"]
        assert r["speech_windows"] > 0 and r["infer_ms"]["mean"] > 0
    assert len(out_csv.read_text(encoding="utf-8").splitlines()) == 1 + 5 + 4 + 4
    assert "Acc" in capsys.readouterr().out
