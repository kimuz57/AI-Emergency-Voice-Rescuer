import io
import os
import logging
import torch
import torchaudio
import torch.nn.functional as F
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from torchaudio import transforms as T
from nnAudio.features.mel import MelSpectrogram

# Import โมเดลของคุณ
from models import BCResNet

# 🌟 1. Import ไฟล์ MQTT
import mqtt_audio_receiver

# ตั้งค่า Logger ของ Uvicorn เพื่อให้แสดงผลใน Console ชัดเจน
logger = logging.getLogger("uvicorn.error")

# =========================================================================
# 🌟 2. ดึง Core Logic ของ AI ออกมาเป็น Function ธรรมดา 
# (เพื่อให้ MQTT เรียกใช้ได้ตรงๆ โดยไม่ต้องผ่าน Network)
# =========================================================================
def run_kws_inference(audio_bytes: bytes) -> dict:
    """รับไฟล์เสียงแบบ Bytes เข้ามาประมวลผล และคืนค่าเป็น Dict"""
    try:
        input_tensor = preprocess_audio(audio_bytes)
        with torch.no_grad():
            logits = model(input_tensor)
            probabilities = torch.softmax(logits, dim=-1).squeeze()
            
            prob_yes = probabilities[0].item()
            prob_no = probabilities[1].item()

        detected = "yes" if prob_yes > prob_no else "no"
        final_prob = prob_yes if detected == "yes" else prob_no

        return {
            "detected": detected,
            "probability": round(final_prob, 4)
        }
    except Exception as e:
        logger.error(f"❌ [AI Core] Inference Error: {e}")
        return {"detected": "error", "probability": 0.0}

# =========================================================================
# 🌟 3. Lifespan สำหรับสั่งรัน MQTT ตอนเปิดเซิร์ฟเวอร์
# =========================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 [System] Starting FastAPI and MQTT Background Thread...")
    try:
        # ส่งฟังก์ชัน AI เข้าไปให้ MQTT
        mqtt_audio_receiver.start_receiver(inference_callback=run_kws_inference)
        logger.info("✅ [System] MQTT Receiver Started Successfully!")
    except Exception as e:
        logger.error(f"❌ [System] Failed to start MQTT receiver: {e}")
        
    yield  
    
    logger.info("🛑 [System] Shutting down FastAPI...")
    try:
        mqtt_audio_receiver.shutdown_receiver()
    except AttributeError:
        pass

# =========================================================================
# 🌟 4. Initialize FastAPI app (รวม Lifespan เข้าไปที่นี่ที่เดียว)
# =========================================================================
app = FastAPI(
    title="BCResNet Keyword Spotting (KWS) Service",
    lifespan=lifespan
)

# This often suppresses NNPACK initialization attempts
os.environ["PYTORCH_JIT_USE_NNC"] = "0"
os.environ["PYTORCH_JIT_USE_NVFUSER"] = "0"
torch.backends.nnpack.enabled = False

# -------------------------------------------------------------------------
# 1. Model Configuration & Loading
# -------------------------------------------------------------------------
SAMPLE_RATE = 16000  # BCResNet typically uses 16kHz
DURATION_SEC = 2
TARGET_SAMPLES = SAMPLE_RATE * DURATION_SEC
device = torch.device("cpu")

mel_transform = MelSpectrogram(
    sr=SAMPLE_RATE, n_fft=512, win_length=400, hop_length=160, n_mels=128
).to(device)

# Load model and weights safely on CPU
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) 
MODEL_PATH = os.path.join(BASE_DIR, "models", "best_sens_model.pth")
model = BCResNet(2)

try:
    state_dict = torch.load(MODEL_PATH, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()
    logger.info("✅ Model successfully loaded on CPU.")
except Exception as e:
    logger.warning(f"⚠️ Warning: Could not load model weights ({e}). Running with dummy initialization.")
    model.eval()

# -------------------------------------------------------------------------
# 2. Preprocessing Utility
# -------------------------------------------------------------------------
def preprocess_audio(audio_bytes: bytes) -> torch.Tensor:
    """Inference Preprocessing"""
    try:
        waveform, sr = torchaudio.load(io.BytesIO(audio_bytes))
        waveform = waveform.to(device)
        
        if sr != SAMPLE_RATE:
            resampler = T.Resample(orig_freq=sr, new_freq=SAMPLE_RATE).to(device)
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

        return log_mel.unsqueeze(0) 

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
    # Validate file extension
    if not sound.filename.lower().endswith(('.wav')):
        raise HTTPException(status_code=400, detail="Only standard WAV files are supported.")

    # Read the file payload into memory
    audio_bytes = await sound.read()
    
    # 🌟 เรียกใช้ฟังก์ชัน AI Core ที่แยกไว้
    result = run_kws_inference(audio_bytes)

    return KWSResponse(
        detected=result["detected"],
        probability=result["probability"]
    )

if __name__ == "__main__":
    import uvicorn
    # รันไฟล์ app2.py
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)