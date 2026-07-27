import os
import sys
import time
import torch
import torch.nn.functional as F  
import numpy as np
import soundfile as sf
import torchaudio.transforms as T
import io
import librosa

# ============================================================
# ⚙️ แผงควบคุม CONFIGURATION
# ============================================================
NORMALIZATION_MODE = 0  # 🔄 ปิดการทำ Normalization เพื่อดูค่าดิบ
INVERT_CLASS = False    # 🔄 ปิดการสลับคลาส

TARGET_MELS = 128       # 📊 จำนวนคลาสความถี่ Mel
TARGET_FFT = 512        # 📊 ค่า n_fft
TARGET_WIN = 400        # 📊 ค่า win_length ที่โมเดลต้องการ
TARGET_HOP = 160        # 📊 ค่า hop_length 
TARGET_SR = 16000       # 🎧 อัตรา Sampling Rate 
DURATION_SEC = 2.0      # ⏱️ ความยาวท่อนเสียงเป้าหมาย (วินาที)
TARGET_SAMPLES = int(TARGET_SR * DURATION_SEC)  # 📏 จำนวน Samples
# ============================================================

# สร้างโครงสร้างแปลงสัญญาณ MelSpectrogram
mel_transform = T.MelSpectrogram(
    sample_rate=TARGET_SR,
    n_fft=TARGET_FFT,        
    win_length=TARGET_WIN,   
    hop_length=TARGET_HOP,   
    n_mels=TARGET_MELS       
)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from models import BCResNet
except ImportError:
    print("❌ ไม่สามารถโหลด BCResNet จาก models.py ได้")
    sys.exit(1)

def preprocess_audio(audio_bytes: bytes) -> torch.Tensor:
    t0 = time.perf_counter()

    # 1. Read WAV
    waveform, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32")
    t1 = time.perf_counter()

    # 2. Mono / Stereo
    if waveform.ndim == 1:
        waveform = waveform[None, :]
    else:
        waveform = waveform.T
    t2 = time.perf_counter()

    # 3. Resample
    if sr != TARGET_SR:
        waveform = librosa.resample(
            waveform,
            orig_sr=sr,
            target_sr=TARGET_SR,
            axis=1,
        )
    t3 = time.perf_counter()

    waveform = torch.from_numpy(waveform).to(device)

    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    t4 = time.perf_counter()

    # 4. 🟢 Chunking Logic (หั่นไฟล์เป็นท่อนละ 2 วินาที)
    total_samples = waveform.shape[1]
    chunks = []
    
    # สไลซ์ไฟล์เสียงทีละ 2 วินาที
    for start in range(0, total_samples, TARGET_SAMPLES):
        chunk = waveform[:, start:start + TARGET_SAMPLES]
        # ถ้าท่อนสุดท้ายสั้นกว่า 2 วิ ให้เติมศูนย์ (Pad)
        if chunk.shape[1] < TARGET_SAMPLES:
            pad = TARGET_SAMPLES - chunk.shape[1]
            chunk = F.pad(chunk, (0, pad))
        chunks.append(chunk)
    t5 = time.perf_counter()

    # 5. Normalize & MelSpectrogram สำหรับทุกท่อน (Batch Processing)
    mels = []
    for chunk in chunks:
        peak = chunk.abs().max()
        if peak > 0:
            chunk /= peak
            
        with torch.no_grad():
            mel = mel_transform(chunk)
            if NORMALIZATION_MODE == 1:
                mel = torch.log(mel + 1e-6)
            elif NORMALIZATION_MODE == 2:
                if mel.std() > 0:
                    mel = (mel - mel.mean()) / (mel.std() + 1e-6)
            mels.append(mel)
            
    # รวบท่อนทั้งหมดให้เป็นก้อน Tensor เดียว (Shape: [จำนวนท่อน, 1, MELS, TIME])
    batch_mels = torch.stack(mels)
    t6 = time.perf_counter()

    # 🟢 ปรินต์รายงานความเร็ว Pipeline เหมือนเดิม
#     print(
#         f"""
# 📊 สถิติเวลาประมวลผล Pipeline [Librosa Engine | ถูกหั่นเป็น {len(chunks)} ท่อน]:
# -----------------------------------------------
# Read WAV       : {(t1-t0)*1000:.1f} ms
# Channel        : {(t2-t1)*1000:.1f} ms
# Resample       : {(t3-t2)*1000:.1f} ms
# Tensor         : {(t4-t3)*1000:.1f} ms
# Split/Pad      : {(t5-t4)*1000:.1f} ms
# Norm & Mel     : {(t6-t5)*1000:.1f} ms
# TOTAL PREPROC  : {(t6-t0)*1000:.1f} ms
# -----------------------------------------------"""
#     )

    return batch_mels

# ตั้งค่าหน่วยประมวลผลฮาร์ดแวร์
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# โหลดโครงสร้างสมองกล BCResNet
model = BCResNet(num_classes=2)

# ค้นหาไฟล์ค่าน้ำหนัก
weights_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "best_sens_model.pth")
if not os.path.exists(weights_path):
    print(f"❌ ไม่พบไฟล์โมเดลที่: {weights_path}")
    sys.exit(1)

model.load_state_dict(torch.load(weights_path, map_location=device))
model.to(device)
model.eval()

# โฟลเดอร์ทดสอบไฟล์เสียงบวก (Positive) และ ลบ (Negative)
target_folders = [r"C:\Project 1\audiotest\pos", r"C:\Project 1\audiotest\neg"]

total_tests = 0
correct_predictions = 0
false_positives = 0
false_negatives = 0

print("="*85)
print(f" เริ่มรันระบบทดสอบจำแนกเสียงเหตุฉุกเฉิน [Chunking & Validation Mode] ")
print("="*85)

with torch.no_grad():
    for folder_path in target_folders:
        if not os.path.exists(folder_path):
            print(f"❌ ไม่พบโฟลเดอร์ทดสอบที่ระบุ: {folder_path}")
            continue
            
        folder_name = os.path.basename(folder_path).lower()
        if "pos" in folder_name:
            actual_label = "yes"
        else:
            actual_label = "no"

        for file_name in os.listdir(folder_path):
            if file_name.lower().endswith('.wav'):
                total_tests += 1
                audio_path = os.path.join(folder_path, file_name)
                
                with open(audio_path, 'rb') as f:
                    audio_bytes = f.read()
                
                try:
                    # 🟢 โมเดลประมวลผลทุกท่อนพร้อมกัน
                    input_tensor = preprocess_audio(audio_bytes).to(device)
                    output = model(input_tensor) # Shape: [จำนวนท่อน, 2]
                    
                    probabilities = torch.softmax(output, dim=-1)
                    predictions = torch.argmax(probabilities, dim=-1).tolist() # ผลลัพธ์ของทุกท่อน
                    
                    # 🟢 ตรรกะการรวบยอด: ถ้ามีท่อนใดท่อนหนึ่งทาย 0 (yes) ให้ถือว่าไฟล์นี้คือ yes ทันที
                    if 0 in predictions:
                        predicted_label = "yes"
                        # ดึงค่าความมั่นใจของท่อนที่มั่นใจว่าเป็น yes มากที่สุดมาโชว์
                        best_chunk_idx = probabilities[:, 0].argmax()
                        final_probs = probabilities[best_chunk_idx].tolist()
                    else:
                        predicted_label = "no"
                        # ถ้าไม่มีท่อนไหนเป็น yes เลย ดึงท่อนที่มั่นใจว่าเป็น no มากที่สุดมาโชว์
                        best_chunk_idx = probabilities[:, 1].argmax()
                        final_probs = probabilities[best_chunk_idx].tolist()

                    if predicted_label == actual_label:
                        correct_predictions += 1
                        status = "✅ ถูกต้อง"
                    else:
                        if predicted_label == "yes" and actual_label == "no":
                            false_positives += 1
                            status = "❌ ผิดพลาด [False Positive]"
                        else:
                            false_negatives += 1
                            status = "❌ ผิดพลาด [False Negative]"
                            
                    print(f"[{total_tests:03d}] {file_name:<30} -> ทาย: {predicted_label} (เฉลย: {actual_label}) | [คลาส 0 (yes): {final_probs[0]:.4f}, คลาส 1 (no): {final_probs[1]:.4f}] | {status}")
                except Exception as e:
                    print(f"[{total_tests:03d}] ⚠️ ระบบขัดข้องขณะประมวลผลไฟล์ {file_name}: {e}")

print("="*85)
print(" รายงานสรุปตัวเลขเชิงประสิทธิภาพสำหรับกรอกลงรายงานวิจัย ")
print("="*85)
if total_tests > 0:
    accuracy = (correct_predictions / total_tests) * 100
    fp_rate = (false_positives / total_tests) * 100
    fn_rate = (false_negatives / total_tests) * 100
    
    print(f" 🔹 ความแม่นยำของระบบรวม (Accuracy)      : {accuracy:.2f} %")
    print(f" 🔹 อัตราการตื่นตูมมั่ว (False Positive Rate) : {fp_rate:.2f} %")
    print(f" 🔹 อัตราการหลุดรอดภัย (False Negative Rate) : {fn_rate:.2f} %")
    print(f" 🔹 ปริมาณชุดเสียงที่ทดสอบสำเร็จ (Total Tests) : {total_tests} ครั้ง")
else:
    print("⚠️ ข้อความระบบ: ไม่พบไฟล์สกุล .wav เพื่อเข้าสู่กระบวนการทดสอบ")
print("="*85)