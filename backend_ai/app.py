import io
import os
from pathlib import Path

import torch
import torch.nn.functional as F
import torchaudio
import requests  # 🟢 นำเข้า requests เพื่อใช้ส่งไฟล์หา Go Backend
from torchaudio import transforms as T
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from nnAudio.features.mel import MelSpectrogram

# นำเข้าไฟล์ config ที่เราสร้างไว้
import config
from models import BCResNet
import mqtt_audio_receiver

# Suppress NNPACK initialization attempts
os.environ["PYTORCH_JIT_USE_NNC"] = "0"
os.environ["PYTORCH_JIT_USE_NVFUSER"] = "0"
torch.backends.nnpack.enabled = False

# Initialize FastAPI app
app = FastAPI(title="BCResNet Keyword Spotting (KWS) Service")

# สั่งให้ AI ปลุก MQTT ให้ตื่นขึ้นมาทำงานพร้อมกันตอนเปิด Server
@app.on_event("startup")
async def startup_event():
    mqtt_audio_receiver.start_receiver()

# -------------------------------------------------------------------------
# 1. Model Configuration & Loading
# -------------------------------------------------------------------------
TARGET_SAMPLES = config.SAMPLE_RATE * config.DURATION_SEC
device = torch.device("cpu")

# Setup MelSpectrogram
mel_transform = MelSpectrogram(
    **config.MEL_SPECTROGRAM_CONFIG
).to(device)

# Load model
MODEL_PATH = Path(__file__).parent / "models" / "best_sens_model.pth"
model = BCResNet(2)

try:
    state_dict = torch.load(MODEL_PATH, map_location=device)
    model.load_state_dict(state_dict)
    model.eval()
    print("✅ Model successfully loaded on CPU.")
except Exception as e:
    print(f"⚠️ Warning: Could not load model weights ({e}). Running with dummy initialization.")
    model.eval()


# -------------------------------------------------------------------------
# 2. Preprocessing Utility
# -------------------------------------------------------------------------
def preprocess_audio(audio_bytes: bytes) -> torch.Tensor:
    try:
        waveform, sr = torchaudio.load(io.BytesIO(audio_bytes))
        waveform = waveform.to(device)
        
        if sr != config.SAMPLE_RATE:
            resampler = T.Resample(orig_freq=sr, new_freq=config.SAMPLE_RATE).to(device)
            waveform = resampler(waveform)

        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)

        if waveform.shape[1] < TARGET_SAMPLES:
            pad_len = TARGET_SAMPLES - waveform.shape[1]
            waveform = F.pad(waveform, (0, pad_len))
        elif waveform.shape[1] > TARGET_SAMPLES:
            waveform = waveform[:, :TARGET_SAMPLES]

        if waveform.abs().max() > 0:
            waveform = waveform / waveform.abs().max()

        with torch.no_grad():
            mel_spec = mel_transform(waveform)
            log_mel = torch.log(mel_spec + 1e-6)

        log_mel = log_mel.unsqueeze(0) 
        return log_mel

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Inference Preprocess Error: {str(e)}")


# -------------------------------------------------------------------------
# 3. Request/Response Schemas & Routes
# -------------------------------------------------------------------------
class KWSResponse(BaseModel):
    detected: str         # "yes" or "no"
    probability: float    # Probability value between 0.0 and 1.0


@app.post("/need-help", response_model=KWSResponse)
async def predict_keyword(sound: UploadFile = File(...)):
    if not sound.filename.lower().endswith(('.wav')):
        raise HTTPException(status_code=400, detail="Only standard WAV files are supported.")

    audio_bytes = await sound.read()
    input_tensor = preprocess_audio(audio_bytes)

    with torch.no_grad():
        logits = model(input_tensor)
        probabilities = torch.softmax(logits, dim=-1).squeeze()
        prob_yes = probabilities[0].item()
        prob_no = probabilities[1].item()

    detected = "yes" if prob_yes > prob_no else "no"
    final_prob = prob_yes if detected == "yes" else prob_no

    if detected == "yes":
        print("🚨 ตรวจพบเหตุฉุกเฉิน! กำลังส่งไฟล์เสียงข้ามไปเซฟที่ Go Backend...")
        try:
            go_url = "http://localhost:8080/api/audio/emergency"
            files = {"sound": ("emergency_audio.wav", io.BytesIO(audio_bytes), "audio/wav")}
            go_response = requests.post(go_url, files=files, timeout=5)
            if go_response.ok:
                print("✅ [AI SERVER] ส่งไฟล์เสียงฉุกเฉินให้ Go Backend เรียบร้อยแล้ว")
            else:
                print(f"❌ [AI SERVER] Go Backend ปฏิเสธไฟล์ฉุกเฉิน: {go_response.status_code}")
        except Exception as e:
            print(f"❌ [AI SERVER] ไม่สามารถติดต่อ Go Backend เพื่อเซฟไฟล์ฉุกเฉินได้: {e}")
            
    else:
        # 🟢 [นี่คือส่วนที่เพิ่มใหม่] ถ้า AI บอกว่าปกติ (no) ส่งไปเข้าโฟลเดอร์ negative สำหรับทดสอบ
        print("⚪ เสียงปกติ (Negative) — กำลังส่งไฟล์ข้ามไปเซฟที่โฟลเดอร์ทดสอบฝั่ง Go...")
        try:
            go_url = "http://localhost:8080/api/audio/negative"
            files = {"sound": ("negative_audio.wav", io.BytesIO(audio_bytes), "audio/wav")}
            go_response = requests.post(go_url, files=files, timeout=5)
            if go_response.ok:
                print("✅ [AI SERVER] ส่งไฟล์เสียงปกติให้ Goโฟลเดอร์ทดสอบ เรียบร้อยแล้ว")
            else:
                print(f"❌ [AI SERVER] Go Backend ปฏิเสธไฟล์ปกติ: {go_response.status_code}")
        except Exception as e:
            print(f"❌ [AI SERVER] ไม่สามารถติดต่อ Go Backend เพื่อเซฟไฟล์ปกติได้: {e}")

    return KWSResponse(
        detected=detected,
        probability=round(final_prob, 4)
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)