import json
import re
import sys
import time
import wave
from pathlib import Path

from faster_whisper import WhisperModel


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

    try:
        transcribed_text = transcribe_audio(audio_path)
    except Exception as exc:
        return make_error(f"Transcription failed: {exc}")

    if not transcribed_text:
        transcribed_text = "normal"

    keyword, level = detect_keyword_and_level(transcribed_text)
    return build_success_result(transcribed_text, keyword, level)


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