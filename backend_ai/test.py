import os
import sys
import time
import torch
import torch.nn.functional as F  
import numpy as np
import soundfile as sf
import torchaudio.transforms as T
import librosa
 
# ============================================================
# ⚙️ แผงควบคุม CONFIGURATION
# ============================================================
NORMALIZATION_MODE = 0  
INVERT_CLASS = False    
 
TARGET_MELS = 128       
TARGET_FFT = 1024       
TARGET_WIN = 400        
TARGET_HOP = 160        
TARGET_SR =  16000    
DURATION_SEC = 2.0      
TARGET_SAMPLES = int(TARGET_SR * DURATION_SEC) 

FOLDER_TO_LABEL_MAP = {
    "p1": "yes",
    "p2": "yes",
    "pos": "yes",
    "positive": "yes",
    "n1": "no",
    "neg": "no",
    "negative": "no"
}
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

# ตั้งค่าหน่วยประมวลผลฮาร์ดแวร์
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
mel_transform = mel_transform.to(device)
 
# 🟢 ฟังก์ชันนี้ถูกปรับใหม่ให้รับ "ก้อนเสียง 2 วินาที (Tensor)" ที่ตัดมาแล้ว
def extract_mel_from_chunk(chunk_waveform: torch.Tensor) -> torch.Tensor:
    # เติมศูนย์ (Pad) กรณีที่ก้อนเสียงสุดท้ายความยาวไม่ถึง 2 วินาที
    if chunk_waveform.shape[1] < TARGET_SAMPLES:
        pad = TARGET_SAMPLES - chunk_waveform.shape[1]
        chunk_waveform = F.pad(chunk_waveform, (0, pad)) 
    else:
        chunk_waveform = chunk_waveform[:, :TARGET_SAMPLES]
 
    # แปลงฟีเจอร์เสียงเป็น Log-Mel
    with torch.no_grad():
        mel = mel_transform(chunk_waveform)
        mel = torch.log(mel + 1e-6)
 
    return mel.unsqueeze(0)
 
# โหลดโครงสร้างโมเดล
model = BCResNet(num_classes=2)
weights_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "best_sens_model.pth")
if not os.path.exists(weights_path):
    print(f"❌ ไม่พบไฟล์โมเดลที่: {weights_path}")
    sys.exit(1)
 
model.load_state_dict(torch.load(weights_path, map_location=device))
model.to(device)
model.eval()
 
# ============================================================
# 🟢 เริ่มการทดสอบแบบ Chunking (สับไฟล์เสียง)
# ============================================================

target_folders = [r"C:\Project 1\audiotest\pos", r"C:\Project 1\audiotest\neg"]

total_tests = 0
correct_predictions = 0
true_positives = 0    
true_negatives = 0    
false_positives = 0
false_negatives = 0
 
print("="*85)
print(f" เริ่มรันระบบทดสอบจำแนกเสียงเหตุฉุกเฉิน [Audio Chunking Mode] ")
print("="*85)
 
with torch.no_grad():
    for folder_path in target_folders:
        
        if not os.path.exists(folder_path):
            print(f"❌ ข้ามการทดสอบ: ไม่พบโฟลเดอร์ที่ระบุ '{folder_path}'")
            continue 
            
        print(f"\n📂 เริ่มดึงข้อมูลจากโฟลเดอร์: {folder_path} ...")
        
        for file_name in os.listdir(folder_path):
            if file_name.lower().endswith('.wav'):
                total_tests += 1
                audio_path = os.path.join(folder_path, file_name)
                
                try:
                    # 🟢 1. อ่านไฟล์เสียงทั้งไฟล์ "รอบเดียว"
                    waveform, sr = sf.read(audio_path, dtype="float32")
                    if waveform.ndim == 1:
                        waveform = waveform[None, :]
                    else:
                        waveform = waveform.T
                    
                    # 🟢 2. ทำ Resampling ให้ตรงเกณฑ์
                    if sr != TARGET_SR:
                        waveform = librosa.resample(waveform, orig_sr=sr, target_sr=TARGET_SR, axis=1)
                    
                    waveform_tensor = torch.from_numpy(waveform).to(device)
                    if waveform_tensor.shape[0] > 1:
                        waveform_tensor = waveform_tensor.mean(dim=0, keepdim=True)

                    peak = waveform_tensor.abs().max()
                    if peak > 0:
                        waveform_tensor /= peak
                    
                    # หาค่าเฉลย (Ground Truth) จากโฟลเดอร์
                    folder_name = os.path.basename(os.path.normpath(folder_path)).lower()
                    actual_label = None
                    for keyword, label in FOLDER_TO_LABEL_MAP.items():
                        if keyword in folder_name:
                            actual_label = label
                            break
                    if actual_label is None:
                        actual_label = "yes" if "emergency" in file_name.lower() else "no"
                    
                    # 🟢 3. กระบวนการสับไฟล์ (Chunking)
                    total_length = waveform_tensor.shape[1]
                    chunk_size = TARGET_SAMPLES
                    
                    file_predicted_label = "no" # ตั้งค่าตั้งต้น
                    chunk_results = [] # เก็บผลลัพธ์ของแต่ละท่อน
                    
                    # ลูปตัดเสียงทีละ 2 วินาที
                    for chunk_idx, start_idx in enumerate(range(0, total_length, chunk_size)):
                        chunk = waveform_tensor[:, start_idx : start_idx + chunk_size]
                        
                        input_tensor = extract_mel_from_chunk(chunk)
                        output = model(input_tensor)
                        
                        prediction = torch.argmax(output, dim=-1).item()
                        
                        # ถอดรหัส: 0 คือ yes
                        if prediction == 0:
                            chunk_results.append("yes")
                            file_predicted_label = "yes"
                        else:
                            chunk_results.append("no")
                            
                
                    # 🟢 4. สรุปผลของไฟล์นั้น และเก็บค่า Confusion Matrix
                    if file_predicted_label == actual_label:
                        correct_predictions += 1
                        status = "✅"
                        if actual_label == "yes":
                            true_positives += 1  # ทายถูกว่าเป็นเหตุฉุกเฉิน (TP)
                        else:
                            true_negatives += 1  # ทายถูกว่าเป็นเสียงปกติ (TN)
                    else:
                        if file_predicted_label == "yes" and actual_label == "no":
                            false_positives += 1 # ตื่นตูม (FP)
                            status = "❌"
                        else:
                            false_negatives += 1 # หลุดรอด (FN)
                            status = "❌"

                    # 🟢 จัดรูปแบบข้อความ Chunk
                    total_chunks = len(chunk_results)
                    chunk_str = ", ".join([f"c{i+1}:{res}" for i, res in enumerate(chunk_results)])
                    
                    # เทคนิคจัดตารางให้ตรงเป๊ะ:
                    safe_filename = (file_name[:32] + '...') if len(file_name) > 35 else file_name
                    
                    print(
                        f"{status} | "
                        f"[{total_tests:03d}] {safe_filename:<30} | "
                        f"{total_chunks:>2} chunk | "
                        f"[{chunk_str:<30}] | "
                        f"สรุป: {file_predicted_label.upper():<3} (เฉลย: {actual_label.upper():<3})"
                    )

                except Exception as e:
                    print(f"[{total_tests:03d}] ⚠️ ระบบขัดข้องขณะประมวลผลไฟล์ {file_name}: {e}")
 
print("="*85)
print(" MODEL PERFORMANCE EVALUATION REPORT ")
print("="*85)
if total_tests > 0:
    # 🟢 คำนวณฐานของแต่ละกลุ่มตัวอย่าง
    actual_positives = true_positives + false_negatives
    actual_negatives = true_negatives + false_positives
    
    accuracy = (correct_predictions / total_tests) * 100
    fp_rate = (false_positives / actual_negatives) * 100 if actual_negatives > 0 else 0
    fn_rate = (false_negatives / actual_positives) * 100 if actual_positives > 0 else 0
    
    print(f" 🔹 Overall Accuracy          : {accuracy:.2f} %")
    print(f" 🔹 False Positive Rate (FPR) : {fp_rate:.2f} % (from {actual_negatives} normal files)")
    print(f" 🔹 False Negative Rate (FNR) : {fn_rate:.2f} % (from {actual_positives} emergency files)")
    print(f" 🔹 Total Audio Samples       : {total_tests} Tests")
    print("-" * 85)
    print(" 📊 CONFUSION MATRIX")
    print(f"                 | Predicted: YES (Pos) | Predicted: NO (Neg)")
    print("-" * 85)
    print(f" Actual: YES (P) | TP: {true_positives:<16} | FN: {false_negatives}")
    print(f" Actual: NO (N)  | FP: {false_positives:<16} | TN: {true_negatives}")
    print("-" * 85)
else:
    print("⚠️ System Warning: No .wav files found for evaluation.")
print("="*85)