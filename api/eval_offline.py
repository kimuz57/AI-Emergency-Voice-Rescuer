"""ทดลองแบบ offline (รายงานหัวข้อ 3.7.3): ไฟล์ WAV ที่มี label -> pipeline เดียวกับ receiver
(หน้าต่าง 2 วิ เลื่อนทีละ WINDOW_HOP_SECONDS, dsp.py, โมเดลใน app.py, เฉลี่ย DECISION_WINDOWS หน้าต่าง)
แล้วคำนวณ Accuracy, Precision, Recall, F1, FP, FN และเวลาต่อหน้าต่าง แยกตาม DSP_MODE

โครงสร้างข้อมูล (ชื่อโฟลเดอร์ชั้นแรกคือ label):

    data/
      help/    *.wav   กลุ่มร้องขอความช่วยเหลือ (help, yes, emergency, positive, 1)
      normal/  *.wav   กลุ่มอื่น (normal, no, negative, noise, other, 0)

หรือ --labels labels.csv ที่มีคอลัมน์ path,label (path สัมพัทธ์กับโฟลเดอร์ข้อมูล)

WAV ต้องเป็น PCM 16-bit, 1 หรือ 2 ช่อง (ช่อง 0 = ไมค์ซ้าย, ช่อง 1 = ไมค์ขวา) sample rate อื่นจะถูก resample เป็น 8 kHz
ไฟล์ช่องเดียวใช้ได้กับ mono เท่านั้น (das_pf / mvdr ต้องมี 2 ไมค์) — โหมดอื่นจะข้ามและนับไว้ในผล

1 ไฟล์ = 1 เหตุการณ์: ทายว่า "ร้องขอความช่วยเหลือ" ถ้ามีการแจ้งเหตุอย่างน้อย 1 ครั้งระหว่างไฟล์
ไฟล์ที่สั้นกว่า 2 วิ + (N-1) hop จะถูกเติมท้ายด้วย noise ระดับ ~-90 dBFS (ใกล้ noise ของไมค์ INMP441)
ให้ได้อย่างน้อย N หน้าต่าง ไม่งั้นการเฉลี่ย N หน้าต่างจะตัดสินไม่ได้เลย

ตัวอย่าง:

    cd api
    uv run python eval_offline.py data/ --modes mono,das_pf,mvdr --csv results.csv
    uv run python eval_offline.py data/ --model-path models/other.pth --model-arch BCResNet_Tiny --threshold 0.6
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import wave
import zlib
from dataclasses import dataclass, field, replace
from math import gcd
from pathlib import Path

import numpy as np
from scipy.signal import resample_poly

POSITIVE_LABELS = {"help", "yes", "emergency", "positive", "1"}
NEGATIVE_LABELS = {"normal", "no", "negative", "noise", "other", "0"}
SAMPLE_RATE = 8000


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("data_dir", type=Path, help="โฟลเดอร์ข้อมูล (โฟลเดอร์ย่อยตาม label หรือใช้ --labels)")
    parser.add_argument("--labels", type=Path, help="CSV คอลัมน์ path,label แทนการอ่าน label จากชื่อโฟลเดอร์")
    parser.add_argument("--modes", default="mono,das_pf,mvdr", help="DSP_MODE ที่จะทดลอง คั่นด้วย , (default ทั้ง 3)")
    parser.add_argument("--model-path", help="ไฟล์ weight (แทน env MODEL_PATH)")
    parser.add_argument("--model-arch", help="BCResNet_M / BCResNet1 / BCResNet_Tiny (แทน env MODEL_ARCH)")
    parser.add_argument("--windows", type=int, help="จำนวนหน้าต่างที่เฉลี่ย (แทน env DECISION_WINDOWS)")
    parser.add_argument("--threshold", type=float, help="เกณฑ์ค่าเฉลี่ย (แทน env DECISION_THRESHOLD)")
    parser.add_argument("--hop", type=float, help="ระยะเลื่อนหน้าต่าง วินาที (แทน env WINDOW_HOP_SECONDS)")
    parser.add_argument("--csv", type=Path, help="บันทึกผลรายไฟล์")
    parser.add_argument("--json", type=Path, help="บันทึกสรุปผลแต่ละโหมด")
    return parser.parse_args(argv)


def configure_env(args: argparse.Namespace) -> None:
    """ตั้ง env ก่อน import app / receiver (ทั้งคู่อ่านค่าตอน import)"""
    overrides = {
        "MODEL_PATH": args.model_path,
        "MODEL_ARCH": args.model_arch,
        "DECISION_WINDOWS": None if args.windows is None else str(args.windows),
        "DECISION_THRESHOLD": None if args.threshold is None else str(args.threshold),
        "WINDOW_HOP_SECONDS": None if args.hop is None else str(args.hop),
    }
    for key, value in overrides.items():
        if value is not None:
            os.environ[key] = value
    os.environ["SAMPLE_RATE"] = str(SAMPLE_RATE)
    os.environ["DSP_LOG_TIMING"] = "false"  # ไม่พิมพ์ log ต่อหน้าต่างระหว่างทดลอง
    # receiver บังคับ 3 ค่านี้ตอน import แต่ offline ไม่ได้ต่อ broker หรือ Go จริง
    os.environ.setdefault("MQTT_BROKER_HOST", "offline-eval")
    os.environ.setdefault("GO_SERVER_URL", "http://localhost:8080")
    os.environ.setdefault("INTERNAL_API_KEY", "offline-eval")


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

@dataclass
class Clip:
    path: Path
    label: int            # 1 = ร้องขอความช่วยเหลือ
    audio: np.ndarray     # int16 (frames, channels) ที่ 8 kHz


def label_value(raw: str) -> int | None:
    value = raw.strip().lower()
    if value in POSITIVE_LABELS:
        return 1
    if value in NEGATIVE_LABELS:
        return 0
    return None


def find_files(data_dir: Path, labels_csv: Path | None) -> list[tuple[Path, int]]:
    items = []
    if labels_csv:
        with open(labels_csv, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                label = label_value(row["label"])
                if label is None:
                    print(f"⚠️ ข้าม {row['path']}: ไม่รู้จัก label {row['label']!r}")
                    continue
                items.append((data_dir / row["path"], label))
        return items
    for path in sorted(data_dir.rglob("*.wav")):
        top = path.relative_to(data_dir).parts[0]
        label = label_value(top)
        if label is None:
            print(f"⚠️ ข้าม {path}: โฟลเดอร์ {top!r} ไม่ใช่ label ที่รู้จัก")
            continue
        items.append((path, label))
    return items


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wf:
        if wf.getsampwidth() != 2:
            raise ValueError(f"ต้องเป็น PCM 16-bit (ไฟล์นี้ {8 * wf.getsampwidth()}-bit)")
        channels, rate = wf.getnchannels(), wf.getframerate()
        audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype="<i2").reshape(-1, channels)[:, :2]
    if rate != SAMPLE_RATE:
        g = gcd(SAMPLE_RATE, rate)
        audio = np.clip(resample_poly(audio.astype(np.float64), SAMPLE_RATE // g, rate // g, axis=0),
                        -32768, 32767).astype(np.int16)
    return audio


def stereo_pcm(clip: Clip, min_frames: int) -> bytes:
    """PCM สลับช่อง L,R แบบที่ firmware ส่ง (ไฟล์ช่องเดียวใช้ช่องเดิมทั้งสองข้าง ใช้ได้กับ mono เท่านั้น)"""
    audio = clip.audio if clip.audio.shape[1] == 2 else np.repeat(clip.audio, 2, axis=1)
    if len(audio) < min_frames:
        rng = np.random.default_rng(zlib.crc32(str(clip.path).encode()))
        pad = np.round(rng.standard_normal((min_frames - len(audio), 2))).astype(np.int16)  # ±1 LSB ≈ -90 dBFS
        audio = np.concatenate([audio, pad])
    return np.ascontiguousarray(audio, dtype="<i2").tobytes()


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

@dataclass
class FileResult:
    mode: str
    path: str
    label: int
    predicted: int
    alerts: int
    max_average: float
    windows: int
    speech_windows: int
    dsp_ms: list[float] = field(default_factory=list)
    infer_ms: list[float] = field(default_factory=list)
    window_ms: list[float] = field(default_factory=list)


def evaluate_clip(clip: Clip, mode: str, app, receiver, dsp) -> FileResult:
    processor = dsp.DSPProcessor(replace(receiver.DSP_CONFIG, mode=mode))
    state = dsp.DSPState()
    smoother = receiver.DecisionSmoother()
    min_frames = receiver._SAMPLES_PER_WINDOW + (receiver.DECISION_WINDOWS - 1) * receiver._HOP_SAMPLES
    windows = receiver._take_windows(bytearray(stereo_pcm(clip, min_frames)))

    result = FileResult(mode, str(clip.path), clip.label, 0, 0, 0.0, len(windows), 0)
    for window in windows:
        started = time.perf_counter()
        left, right = dsp.split_stereo_pcm(window)
        out = processor.process(left, right, state, advance=receiver._HOP_SAMPLES)
        result.dsp_ms.append(out.timings_ms["dsp_total"])
        prob_yes = 0.0
        if out.has_speech:
            result.speech_windows += 1
            wav = receiver._build_wav_in_memory(dsp.to_pcm16(out.audio))
            t0 = time.perf_counter()
            prob_yes = app.run_kws_inference(wav)["prob_yes"]
            result.infer_ms.append((time.perf_counter() - t0) * 1000)
            if prob_yes is None:
                print(f"⚠️ {clip.path}: inference error -> ข้ามหน้าต่างนี้")
                continue
        result.window_ms.append((time.perf_counter() - started) * 1000)
        decision = smoother.push(prob_yes)
        result.max_average = max(result.max_average, decision.average if decision.windows == smoother.n else 0.0)
        if decision.alert:
            result.alerts += 1
    result.predicted = int(result.alerts > 0)
    return result


def summarize(mode: str, results: list[FileResult], skipped: int) -> dict:
    tp = sum(r.label == 1 and r.predicted == 1 for r in results)
    tn = sum(r.label == 0 and r.predicted == 0 for r in results)
    fp = sum(r.label == 0 and r.predicted == 1 for r in results)
    fn = sum(r.label == 1 and r.predicted == 0 for r in results)
    n = len(results)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    def stats(values: list[float]) -> dict:
        if not values:
            return {"mean": None, "median": None, "p95": None}
        arr = np.asarray(values)
        return {"mean": float(arr.mean()), "median": float(np.median(arr)), "p95": float(np.percentile(arr, 95))}

    windows = sum(r.windows for r in results)
    return {
        "mode": mode,
        "files": n,
        "skipped_files": skipped,
        "tp": tp, "tn": tn, "fp": fp, "fn": fn,
        "accuracy": (tp + tn) / n if n else 0.0,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "windows": windows,
        "speech_windows": sum(r.speech_windows for r in results),
        "dsp_ms": stats([v for r in results for v in r.dsp_ms]),
        "infer_ms": stats([v for r in results for v in r.infer_ms]),
        "window_ms": stats([v for r in results for v in r.window_ms]),
    }


def print_summary(summaries: list[dict], n_windows: int, threshold: float, hop: float) -> None:
    print(f"\nตัดสินใจ: เฉลี่ย P(yes) {n_windows} หน้าต่าง > {threshold}, หน้าต่าง 2 วิ เลื่อน {hop:g} วิ")
    header = f"{'mode':<8}{'files':>6}{'skip':>6}{'Acc':>8}{'Prec':>8}{'Rec':>8}{'F1':>8}{'TP':>5}{'TN':>5}{'FP':>5}{'FN':>5}"
    print(header)
    print("-" * len(header))
    for s in summaries:
        print(f"{s['mode']:<8}{s['files']:>6}{s['skipped_files']:>6}{s['accuracy']:>8.3f}{s['precision']:>8.3f}"
              f"{s['recall']:>8.3f}{s['f1']:>8.3f}{s['tp']:>5}{s['tn']:>5}{s['fp']:>5}{s['fn']:>5}")

    fmt = lambda st: "-" if st["mean"] is None else f"{st['mean']:.2f} / {st['median']:.2f} / {st['p95']:.2f}"
    print("\nเวลาต่อหน้าต่าง (ms, mean / median / p95)")
    print(f"{'mode':<8}{'windows':>9}{'speech':>8}  {'DSP':<24}{'inference':<24}{'รวมต่อหน้าต่าง':<24}")
    for s in summaries:
        print(f"{s['mode']:<8}{s['windows']:>9}{s['speech_windows']:>8}  {fmt(s['dsp_ms']):<24}"
              f"{fmt(s['infer_ms']):<24}{fmt(s['window_ms']):<24}")


def main(argv=None) -> int:
    args = parse_args(argv)
    modes = [m.strip() for m in args.modes.split(",") if m.strip()]
    configure_env(args)

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import dsp
    unknown = [m for m in modes if m not in dsp.MODES]
    if unknown:
        print(f"❌ ไม่รู้จักโหมด {unknown} (มี {', '.join(dsp.MODES)})")
        return 2
    import app            # โหลดโมเดลตาม MODEL_PATH / MODEL_ARCH
    import mqtt_audio_receiver as receiver

    clips = []
    for path, label in find_files(args.data_dir, args.labels):
        try:
            clips.append(Clip(path, label, read_wav(path)))
        except (OSError, ValueError, wave.Error) as exc:
            print(f"⚠️ ข้าม {path}: {exc}")
    if not clips:
        print("❌ ไม่พบไฟล์ WAV ที่มี label")
        return 2
    positives = sum(c.label for c in clips)
    print(f"ข้อมูล {len(clips)} ไฟล์ (ร้องขอความช่วยเหลือ {positives}, อื่น ๆ {len(clips) - positives}) "
          f"โมเดล {app.MODEL_ARCH} จาก {app.MODEL_PATH}")

    summaries, rows = [], []
    for mode in modes:
        usable = [c for c in clips if mode == "mono" or c.audio.shape[1] == 2]
        skipped = len(clips) - len(usable)
        if skipped:
            print(f"⚠️ {mode}: ข้ามไฟล์ช่องเดียว {skipped} ไฟล์ (ต้องมี 2 ไมค์)")
        results = [evaluate_clip(c, mode, app, receiver, dsp) for c in usable]
        rows += results
        summaries.append(summarize(mode, results, skipped))

    print_summary(summaries, receiver.DECISION_WINDOWS, receiver.DECISION_THRESHOLD, receiver.WINDOW_HOP_SECONDS)

    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["mode", "path", "label", "predicted", "alerts", "max_average", "windows",
                             "speech_windows", "mean_dsp_ms", "mean_infer_ms", "mean_window_ms"])
            mean = lambda v: f"{np.mean(v):.3f}" if v else ""
            for r in rows:
                writer.writerow([r.mode, r.path, r.label, r.predicted, r.alerts, f"{r.max_average:.4f}", r.windows,
                                 r.speech_windows, mean(r.dsp_ms), mean(r.infer_ms), mean(r.window_ms)])
        print(f"\nบันทึกผลรายไฟล์ที่ {args.csv}")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps({
            "model_arch": app.MODEL_ARCH, "model_path": app.MODEL_PATH,
            "decision_windows": receiver.DECISION_WINDOWS, "decision_threshold": receiver.DECISION_THRESHOLD,
            "hop_seconds": receiver.WINDOW_HOP_SECONDS, "results": summaries,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"บันทึกสรุปที่ {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
