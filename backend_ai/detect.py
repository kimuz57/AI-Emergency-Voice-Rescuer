import json
import re
import sys
import time
import wave
from pathlib import Path

from faster_whisper import WhisperModel

# ─────────────────────────────────────────────────────────────────────────────
# NEW MODEL INTEGRATION
# เมื่อได้รับไฟล์โมเดลจากอาจารย์:
#   1. วางไฟล์โมเดลไว้ที่ backend_ai/models/<ชื่อไฟล์>
#   2. แก้ MODEL_FILE ด้านล่างให้ตรงกับชื่อไฟล์
#   3. ใน _load_classifier() ยกเลิก comment ของ loader ที่ตรงกับ format
#   4. ใน _extract_features() ปรับ feature ให้ตรงกับที่โมเดลต้องการ
#   5. ใน _predict_with_model() ยกเลิก comment ของบรรทัด predict ให้ถูก format
#
# โมเดลปัจจุบัน (อาจารย์): binary classifier, 94.85% overall
#   - Positive (emergency): 93.85%
#   - Negative (normal):    95.85%
# ─────────────────────────────────────────────────────────────────────────────

# วางไฟล์โมเดลไว้ใน backend_ai/models/ แล้วเปลี่ยนชื่อด้านล่าง
# ตัวอย่าง: "emergency_model.h5"  /  "emergency_model.pt"  /  "emergency_model.pkl"
MODEL_FILE = Path(__file__).parent / "models" / "emergency_model.pkl"

EMERGENCY_THRESHOLD = 0.35  # ถ้า confidence >= นี้ → emergency

_classifier = None


def _load_classifier():
    """
    โหลดโมเดล binary classifier จากไฟล์
    คืน None ถ้าไฟล์ยังไม่มี → ระบบจะ fallback ไปใช้ Whisper+keyword แทน
    """
    global _classifier
    if _classifier is not None:
        return _classifier
    if not MODEL_FILE.exists():
        return None  # ยังไม่มีโมเดล — ใช้ Whisper fallback

    # ── TODO: ยกเลิก comment บรรทัดที่ตรงกับ format โมเดลที่รับมา ──────────

    # Keras / TensorFlow (.h5)
    # import tensorflow as tf
    # _classifier = tf.keras.models.load_model(MODEL_FILE)

    # PyTorch (.pt / .pth)
    # import torch
    # _classifier = torch.load(MODEL_FILE, map_location="cpu")
    # _classifier.eval()

    # scikit-learn (.pkl)
    # import joblib
    # _classifier = joblib.load(MODEL_FILE)

    # ONNX Runtime (.onnx)
    # import onnxruntime as ort
    # _classifier = ort.InferenceSession(str(MODEL_FILE))

    raise NotImplementedError(
        f"Model file found at {MODEL_FILE} but no loader is configured. "
        "Edit _load_classifier() in detect.py to match the model format."
    )


def _extract_features(audio_path: Path):
    """
    แปลง WAV → feature vector สำหรับโมเดล
    TODO: เปลี่ยนตาม input ที่โมเดลของอาจารย์ต้องการ (MFCC / mel-spectrogram / ฯลฯ)
    ค่า default ด้านล่างใช้ MFCC 40 bands เป็น baseline
    """
    import numpy as np  # noqa: PLC0415

    try:
        import librosa  # noqa: PLC0415
    except ImportError as exc:
        raise ImportError("pip install librosa") from exc

    y, sr = librosa.load(str(audio_path), sr=16000, mono=True)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
    return mfcc.mean(axis=1).reshape(1, -1)  # shape (1, 40) — ปรับถ้าโมเดลต้องการ shape อื่น


def _predict_with_model(audio_path: Path) -> tuple[str, float]:
    """
    คืน (label, confidence)
      label: "emergency" หรือ "normal"
      confidence: 0.0–1.0 (probability ของ emergency)
    ถ้ายังไม่มีโมเดล raise FileNotFoundError → analyze_audio() จะ fallback ไป Whisper
    """
    clf = _load_classifier()
    if clf is None:
        raise FileNotFoundError("Model file not found")

    features = _extract_features(audio_path)

    # TODO: ยกเลิก comment ตาม format ที่โมเดลของอาจารย์คืนมา ────────────────

    # scikit-learn (predict_proba คืน [[prob_normal, prob_emergency]])
    # proba = clf.predict_proba(features)[0]
    # confidence = float(proba[1])

    # Keras (output layer sigmoid → single probability)
    # confidence = float(clf.predict(features, verbose=0)[0][0])

    # PyTorch
    # import torch
    # with torch.no_grad():
    #     out = clf(torch.tensor(features, dtype=torch.float32))
    #     confidence = float(torch.sigmoid(out).item())

    # ONNX Runtime
    # input_name = clf.get_inputs()[0].name
    # confidence = float(clf.run(None, {input_name: features.astype("float32")})[0][0][1])

    raise NotImplementedError("Predictor not configured — see _predict_with_model()")

    label = "emergency" if confidence >= EMERGENCY_THRESHOLD else "normal"  # noqa: F821
    return label, confidence  # noqa: F821


# ─────────────────────────────────────────────────────────────────────────────
# WHISPER FALLBACK (ใช้เมื่อยังไม่มีไฟล์โมเดล)
# ─────────────────────────────────────────────────────────────────────────────

KEYWORDS_BY_LEVEL = {
    4: ["หายใจ", "หมดสติ", "ไฟไหม้", "เลือด", "breathing", "unconscious", "fire", "blood"],
    3: [
        "ช่วยด้วย", "ช่วย", "เจ็บ", "ปวด", "ล้ม", "ฉุกเฉิน",
        "โรงพยาบาล", "รถพยาบาล", "help", "hurt", "pain",
        "fall", "emergency", "hospital", "ambulance",
    ],
    2: ["ไม่สบาย", "ยา", "หมอ", "sick", "medicine", "doctor"],
}

CONFIDENCE_BY_LEVEL = {
    4: 0.95,
    3: 0.85,
    2: 0.70,
    1: 0.30,
}

MODEL_SIZE = "base"
_model = None


def normalize_text(text: str) -> str:
    text = text.replace("_", " ").replace("-", " ")
    text = re.sub(r"\s+", " ", text.strip().lower())
    return text


def make_error(error_message: str) -> dict:
    return {
        "success": False,
        "isAlert": 0,
        "keyword": "",
        "level": 0,
        "confidence": 0.0,
        "transcribedText": "",
        "error": error_message,
    }


def read_wav_info(audio_path: Path) -> dict:
    with wave.open(str(audio_path), "rb") as wav_file:
        frames = wav_file.getnframes()
        sample_rate = wav_file.getframerate()
        channels = wav_file.getnchannels()
        duration = frames / float(sample_rate) if sample_rate else 0.0

    return {
        "frames": frames,
        "sampleRate": sample_rate,
        "channels": channels,
        "duration": duration,
    }


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            MODEL_SIZE,
            device="cpu",
            compute_type="int8",
        )
    return _model


def transcribe_audio(audio_path: Path) -> str:
    model = get_model()
    segments, _ = model.transcribe(
        str(audio_path),
        beam_size=1,
        vad_filter=True,
    )
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
    return normalize_text(text)


def detect_keyword_and_level(text: str) -> tuple[str, int]:
    for level in sorted(KEYWORDS_BY_LEVEL.keys(), reverse=True):
        for keyword in KEYWORDS_BY_LEVEL[level]:
            if keyword in text:
                return keyword, level
    return "normal", 1


def build_success_result(transcribed_text: str, keyword: str, level: int) -> dict:
    return {
        "success": True,
        "isAlert": 1 if level >= 3 else 0,
        "keyword": keyword,
        "level": level,
        "confidence": CONFIDENCE_BY_LEVEL.get(level, 0.30),
        "transcribedText": transcribed_text,
    }


def _build_model_result(label: str, confidence: float) -> dict:
    """แปลง output ของโมเดลใหม่ → response format เดิม (เพื่อ backward compat)"""
    is_emergency = label == "emergency"
    return {
        "success": True,
        "isAlert": 1 if is_emergency else 0,
        "keyword": "emergency" if is_emergency else "normal",
        "level": 3 if is_emergency else 1,
        "confidence": confidence,
        "transcribedText": "",
        "detectionMethod": "model",
    }


def analyze_audio(audio_path: Path) -> dict:
    if not audio_path.exists():
        return make_error("File not found")

    if not audio_path.is_file():
        return make_error("Input path is not a file")

    if audio_path.suffix.lower() != ".wav":
        return make_error("Only .wav files are supported in milestone 1")

    try:
        wav_info = read_wav_info(audio_path)
    except wave.Error:
        return make_error("Unreadable or unsupported WAV file")
    except Exception as exc:
        return make_error(f"Failed to read audio: {exc}")

    if wav_info["duration"] < 0.05:
        return make_error("Audio is too short")

    # ── ลองใช้โมเดลใหม่ก่อน ────────────────────────────────────────────────
    try:
        label, confidence = _predict_with_model(audio_path)
        return _build_model_result(label, confidence)
    except (FileNotFoundError, NotImplementedError):
        pass  # โมเดลยังไม่มี / ยังไม่ได้ตั้งค่า → ใช้ Whisper fallback
    except Exception as exc:
        return make_error(f"Model inference failed: {exc}")

    # ── Whisper + keyword fallback ───────────────────────────────────────────
    try:
        transcribed_text = transcribe_audio(audio_path)
    except Exception as exc:
        return make_error(f"Transcription failed: {exc}")

    if not transcribed_text:
        transcribed_text = "normal"

    keyword, level = detect_keyword_and_level(transcribed_text)
    result = build_success_result(transcribed_text, keyword, level)
    result["detectionMethod"] = "whisper"
    return result


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    start_time = time.perf_counter()

    if len(sys.argv) != 2:
        result = make_error("Usage: python backend_ai/detect.py <audio.wav>")
        result["processingTime"] = int((time.perf_counter() - start_time) * 1000)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    audio_path = Path(sys.argv[1])
    result = analyze_audio(audio_path)
    result["processingTime"] = int((time.perf_counter() - start_time) * 1000)

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())