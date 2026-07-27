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
TARGET_SR = 16000      
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
 
    # ทำ Amplitude Normalization
    # peak = chunk_waveform.abs().max()
    # if peak > 0:
    #     chunk_waveform /= peak
 
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
true_positives = 0   # ทาย yes, เฉลย yes
true_negatives = 0   # ทาย no, เฉลย no
false_positives = 0  # ทาย yes, เฉลย no (ตื่นตูม)
false_negatives = 0  # ทาย no, เฉลย yes (หลุดรอด)
 
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
                    waveform, sr = sf.read(audio_path, dtype="float32")
                    if waveform.ndim == 1:
                        waveform = waveform[None, :]
                    else:
                        waveform = waveform.T
                    
                    if sr != TARGET_SR:
                        waveform = librosa.resample(waveform, orig_sr=sr, target_sr=TARGET_SR, axis=1)
                    
                    waveform_tensor = torch.from_numpy(waveform).to(device)
                    if waveform_tensor.shape[0] > 1:
                        waveform_tensor = waveform_tensor.mean(dim=0, keepdim=True)
                        
                    # ทำ Peak Normalization ระดับไฟล์ (เร่งเสียงทั้งไฟล์รอบเดียว)
                    peak = waveform_tensor.abs().max()
                    if peak > 0:
                        waveform_tensor /= peak
                        
                    folder_name = os.path.basename(os.path.normpath(folder_path)).lower()
                    actual_label = None
                    for keyword, label in FOLDER_TO_LABEL_MAP.items():
                        if keyword in folder_name:
                            actual_label = label
                            break
                    if actual_label is None:
                        actual_label = "yes" if "emergency" in file_name.lower() else "no"
                    
                    total_length = waveform_tensor.shape[1]
                    chunk_size = TARGET_SAMPLES
                    
                    file_predicted_label = "no" 
                    chunk_results = [] 
                    
                    for chunk_idx, start_idx in enumerate(range(0, total_length, chunk_size)):
                        chunk = waveform_tensor[:, start_idx : start_idx + chunk_size]
                        input_tensor = extract_mel_from_chunk(chunk)
                        output = model(input_tensor)
                        
                        prediction = torch.argmax(output, dim=-1).item()
                        
                        if prediction == 0:
                            chunk_results.append("yes")
                            file_predicted_label = "yes"
                        else:
                            chunk_results.append("no")
                            
                    # 🟢 เก็บสถิติแยกตามประเภทให้ชัดเจนขึ้น
                    if file_predicted_label == actual_label:
                        if actual_label == "yes":
                            true_positives += 1
                        else:
                            true_negatives += 1
                        status = "✅"
                    else:
                        if file_predicted_label == "yes" and actual_label == "no":
                            false_positives += 1
                            status = "❌"
                        else:
                            false_negatives += 1
                            status = "❌"

                    total_chunks = len(chunk_results)
                    chunk_str = ", ".join([f"c{i+1}:{res}" for i, res in enumerate(chunk_results)])
                    safe_filename = (file_name[:32] + '...') if len(file_name) > 35 else file_name
                    
                    print(
                        f"{status} | "
                        f"[{total_tests:03d}] {safe_filename:<35} | "
                        f"{total_chunks:>2} chunk | "
                        f"[{chunk_str:<30}] | "
                        f"สรุป: {file_predicted_label.upper():<3} (เฉลย: {actual_label.upper():<3})"
                    )
                except Exception as e:
                    print(f"[{total_tests:03d}] ⚠️ ระบบขัดข้องขณะประมวลผลไฟล์ {file_name}: {e}")
 
print("="*85)
print(" รายงานสรุปตัวเลขเชิงประสิทธิภาพสำหรับนำไปวิเคราะห์ ")
print("="*85)
if total_tests > 0:
    # คำนวณจำนวนไฟล์ทั้งหมดตามเฉลยจริง
    actual_yes = true_positives + false_negatives
    actual_no = true_negatives + false_positives
    
    # 🟢 คำนวณค่าความแม่นยำในมุมมองเชิงบวก
    overall_acc = ((true_positives + true_negatives) / total_tests) * 100
    sens_acc = (true_positives / actual_yes * 100) if actual_yes > 0 else 0
    spec_acc = (true_negatives / actual_no * 100) if actual_no > 0 else 0
    
    print(f" 🔹 ความแม่นยำรวมทั้งระบบ (Overall Accuracy)       : {overall_acc:.2f} %")
    print(f" 🔹 ความแม่นยำในการจับเสียงฉุกเฉิน (Sensitivity)  : {sens_acc:.2f} %  (ทายถูก {true_positives}/{actual_yes} ไฟล์)")
    print(f" 🔹 ความแม่นยำในการคัดกรองเสียงปกติ (Specificity) : {spec_acc:.2f} %  (ทายถูก {true_negatives}/{actual_no} ไฟล์)")
    print(f" 🔹 ปริมาณชุดเสียงที่ทดสอบทั้งหมด (Total Tests)     : {total_tests} ไฟล์")
else:
    print("⚠️ ข้อความระบบ: ไม่พบไฟล์สกุล .wav เพื่อเข้าสู่กระบวนการทดสอบ")
print("="*85)