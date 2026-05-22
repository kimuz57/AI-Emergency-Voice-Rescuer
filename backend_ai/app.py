import io
import torchaudio
import torch.nn.functional as F
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from models import BCResNet
from torchaudio import transforms as T
from nnAudio.features.mel import MelSpectrogram

# Initialize FastAPI app
app = FastAPI(title="BCResNet Keyword Spotting (KWS) Service")

import os
# This often suppresses NNPACK initialization attempts
os.environ["PYTORCH_JIT_USE_NNC"] = "0"
os.environ["PYTORCH_JIT_USE_NVFUSER"] = "0"

import torch
# You can also try to explicitly disable it if the warning persists
torch.backends.nnpack.enabled = False

# -------------------------------------------------------------------------
# 1. Model Configuration & Loading
# -------------------------------------------------------------------------
# Define target audio specs expected by your BCResNet configuration
SAMPLE_RATE = 16000  # BCResNet typically uses 16kHz
DURATION_SEC = 2
TARGET_SAMPLES = SAMPLE_RATE * DURATION_SEC

# Define inference device explicitly as CPU
device = torch.device("cpu")


# Setup MelSpectrogram transform mapping raw audio to time-frequency domain
# (Adjust n_fft, hop_length, and n_mels to match your training configuration)
# mel_transform = torchaudio.transforms.MelSpectrogram(
#    sample_rate=SAMPLE_RATE,
#    n_fft=512,
#    win_length=400,
#    hop_length=160,
#    n_mels=128,
#    center=True,
#    pad_mode="reflect",
#    power=2.0,
#).to(device)
mel_transform = MelSpectrogram(
        sr=SAMPLE_RATE, n_fft=512, win_length=400, hop_length=160, n_mels=128
    ).to(device)

# Load model and weights safely on CPU
MODEL_PATH = "epoch000_best_sens.pth"
model = BCResNet(2) # Replace with actual model instantiated class

try:
    # map_location='cpu' guarantees it loads directly to system memory
    state_dict = torch.load(MODEL_PATH, map_location=device)
    model.load_state_dict(state_dict)
    model.eval()
    print("Model successfully loaded on CPU.")
except Exception as e:
    print(f"Warning: Could not load model weights ({e}). Running with dummy initialization.")
    model.eval()


# -------------------------------------------------------------------------
# 2. Preprocessing Utility
# -------------------------------------------------------------------------
def preprocess_audio(audio_bytes: bytes) -> torch.Tensor:
    """
    Inference Preprocessing: Strictly aligned with training 'KWS impl #4'
    """
    try:
        # 1. Load audio from memory buffer
        waveform, sr = torchaudio.load(io.BytesIO(audio_bytes))
        waveform = waveform.to(device)
        
        # 2. Force Resample
        if sr != SAMPLE_RATE:
            resampler = T.Resample(orig_freq=sr, new_freq=SAMPLE_RATE).to(device)
            waveform = resampler(waveform)

        # 3. Mono Conversion (Average across channels)
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)

        # 4. Exact Duration Alignment (2.0s / 32000 samples)
        # In training, we used padding. We do the same here for consistency.
        if waveform.shape[1] < TARGET_SAMPLES:
            pad_len = TARGET_SAMPLES - waveform.shape[1]
            waveform = F.pad(waveform, (0, pad_len))
        elif waveform.shape[1] > TARGET_SAMPLES:
            waveform = waveform[:, :TARGET_SAMPLES]

        if waveform.abs().max() > 0:
            waveform = waveform / waveform.abs().max()

        # 5. Extract Log-Mel Features
        # training used: torch.log(feature_extractor(waveforms) + 1e-6)
        with torch.no_grad():
            mel_spec = mel_transform(waveform)
            log_mel = torch.log(mel_spec + 1e-6)

        # 6. Match Training Dimensions
        # Training loop expected: [Batch, Channel, Frequency, Time]
        # mel_transform outputs [1, 128, Time]
        # .unsqueeze(0) makes it [1, 128, Time] (Batch)
        # .unsqueeze(1) makes it [1, 1, 128, Time] (Channel)
        log_mel = log_mel.unsqueeze(0) # Now it matches the training 'outputs = model(features.unsqueeze(1))'
        
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
    # Validate file extension
    if not sound.filename.lower().endswith(('.wav')):
        raise HTTPException(status_code=400, detail="Only standard WAV files are supported.")

    # Read the file payload into memory
    audio_bytes = await sound.read()
    
    # Process audio into model input features
    input_tensor = preprocess_audio(audio_bytes)

    # Execute Inference without gradient tracking
    with torch.no_grad():
        logits = model(input_tensor)
        
        # Apply Softmax to get probability distribution
        probabilities = torch.softmax(logits, dim=-1).squeeze()
        
        # Adjust index mapping depending on how your classes are configured.
        # Assuming index 0 = "yes", index 1 = "no"
        prob_yes = probabilities[0].item()
        prob_no = probabilities[1].item()

    # Determine threshold decision
    detected = "yes" if prob_yes > prob_no else "no"
    final_prob = prob_yes if detected == "yes" else prob_no

    return KWSResponse(
        detected=detected,
        probability=round(final_prob, 4)
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
