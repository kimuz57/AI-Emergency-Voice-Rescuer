#!/usr/bin/env python3
"""
Step 7: Train Model with Validation
เทรน AI model โดยใช้ validation set ตรวจการเรียน
"""

import pandas as pd
import numpy as np
import librosa
import os
import pickle
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.preprocessing import LabelEncoder
from pathlib import Path
import json

class AudioTrainer:
    def __init__(self):
        self.model = None
        self.label_encoder = LabelEncoder()
        self.training_history = []
        
    def load_audio_file(self, audio_path):
        """
        โหลดไฟล์เสียง .wav
        
        Returns: audio  ay)
        """
        try:
            # Load audio file
            y, sr = librosa.load(audio_path, sr=16000)
            return y
        except Exception as e:
            return None
    
    def extract_features(self, audio_signal):
        """
        แปลงเสียง → ตัวเลข (Feature Extraction)
        
        ใช้ 3 วิธี:
        1. MFCC (13 features) - ความถี่หลัก
        2. Spectral Centroid - ศูนย์กลางความถี่
        3. Zero Crossing Rate - จำนวนการเปลี่ยนแปลง
        
        รวม = 15 ตัวเลข ใช้บอก AI
        """
        try:
            # 1. MFCC - เอาความถี่สำคัญ 13 อันแรก
            mfcc = librosa.feature.mfcc(y=audio_signal, sr=16000, n_mfcc=13)
            mfcc_mean = np.mean(mfcc, axis=1)  # เฉลี่ยตามแกน time
            
            # 2. Spectral Centroid - ศูนย์กลางความถี่
            spectral_centroid = librosa.feature.spectral_centroid(y=audio_signal, sr=16000)
            sc_mean = np.mean(spectral_centroid)
            
            # 3. Zero Crossing Rate - ความประหม่า (จำนวนเปลี่ยนแปลง)
            zcr = librosa.feature.zero_crossing_rate(audio_signal)
            zcr_mean = np.mean(zcr)
            
            # รวมทั้งหมด = 13 + 1 + 1 = 15 ตัวเลข
            features = np.concatenate([mfcc_mean, [sc_mean, zcr_mean]])
            return features
            
        except Exception as e:
            print(f"❌ Error extracting features: {e}")
            return None
    
    def load_dataset(self, csv_file, audio_base_path='../LOTUSDIS_train/audio'):
        """
        โหลดข้อมูล Train/Validation/Test จาก CSV
        """
        print(f"📂 Loading dataset from {csv_file}...")
        
        df = pd.read_csv(csv_file, engine='python', encoding_errors='ignore')
        print(f"   Total rows: {len(df)}")
        
        # Extract features และ labels
        X = []
        y = []
        failed_count = 0
        
        for idx, row in df.iterrows():
            if idx % 500 == 0:
                print(f"   Processing: {idx}/{len(df)}")
            
            # Build audio path
            audio_file = row['path'].replace('lotus_dis_ult/audio/', '')
            audio_path = os.path.join(audio_base_path, audio_file)
            
            # ลองโหลด
            audio = self.load_audio_file(audio_path)
            if audio is None:
                failed_count += 1
                continue
            
            # Extract features
            features = self.extract_features(audio)
            if features is None:
                failed_count += 1
                continue
            
            X.append(features)
            y.append(row['sentence'])
        
        print(f"   ✓ Successfully loaded: {len(X)}")
        print(f"   ✗ Failed: {failed_count}")
        
        return np.array(X), np.array(y)
    
    def train(self, X_train, y_train, X_val, y_val):
        """
        เทรน Random Forest model
        
        ระหว่างเทรน ให้ตรวจด้วย validation set
        """
        print("\n" + "="*70)
        print("🎓 TRAINING MODEL")
        print("="*70)
        
        # Step 1: Encode labels (คำ → ตัวเลข)
        print(f"\n1️⃣ Encoding labels...")
        y_train_encoded = self.label_encoder.fit_transform(y_train)
        y_val_encoded = self.label_encoder.transform(y_val)
        
        n_classes = len(self.label_encoder.classes_)
        print(f"   Classes: {n_classes}")
        print(f"   Labels: {list(self.label_encoder.classes_)}")
        
        # Step 2: Create model
        print(f"\n2️⃣ Creating Random Forest model...")
        self.model = RandomForestClassifier(
            n_estimators=100,      # 100 ต้นไม้
            max_depth=20,          # ลึก 20 ชั้น
            random_state=42,
            n_jobs=-1  # ใช้ CPU หมด
        )
        
        # Step 3: Train
        print(f"\n3️⃣ Training on {len(X_train)} samples...")
        self.model.fit(X_train, y_train_encoded)
        print(f"   ✓ Training completed")
        
        # Step 4: Validate
        print(f"\n4️⃣ Validating on {len(X_val)} samples...")
        y_train_pred = self.model.predict(X_train)
        y_val_pred = self.model.predict(X_val)
        
        # Calculate metrics
        train_acc = accuracy_score(y_train_encoded, y_train_pred)
        val_acc = accuracy_score(y_val_encoded, y_val_pred)
        
        print(f"\n📊 RESULTS:")
        print(f"   Train Accuracy: {train_acc*100:.2f}%")
        print(f"   Validation Accuracy: {val_acc*100:.2f}%")
        
        # Detailed validation metrics
        print(f"\n📈 Detailed Validation Metrics:")
        for idx, label in enumerate(self.label_encoder.classes_):
            # สำหรับแต่ละคำ
            mask = y_val_encoded == idx
            if np.sum(mask) == 0:
                print(f"   {label:20s}: --")
            else:
                acc = accuracy_score(y_val_encoded[mask], y_val_pred[mask])
                print(f"   {label:20s}: {acc*100:.2f}% ({np.sum(mask)} samples)")
        
        # Store history
        self.training_history.append({
            'train_acc': train_acc,
            'val_acc': val_acc,
            'n_train': len(X_train),
            'n_val': len(X_val)
        })
        
        return train_acc, val_acc
    
    def save_model(self, model_path='models/trained_model_v2.pkl'):
        """บันทึก model ลงดิสก์"""
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        with open(model_path, 'wb') as f:
            pickle.dump(self.model, f)
        
        # Save label encoder
        label_encoder_path = model_path.replace('.pkl', '_labels.pkl')
        with open(label_encoder_path, 'wb') as f:
            pickle.dump(self.label_encoder, f)
        
        print(f"\n💾 Model saved:")
        print(f"   Model: {model_path}")
        print(f"   Labels: {label_encoder_path}")
    
    def save_training_report(self, report_path='models/training_report_v2.json'):
        """บันทึกรายงานการเทรน"""
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        
        report = {
            'timestamp': str(pd.Timestamp.now()),
            'model_type': 'RandomForestClassifier',
            'n_estimators': 100,
            'n_classes': len(self.label_encoder.classes_),
            'classes': list(self.label_encoder.classes_),
            'training_history': self.training_history
        }
        
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        print(f"   Report: {report_path}")

def main():
    print("╔════════════════════════════════════════╗")
    print("║  Step 7: Train Model with Validation  ║")
    print("╚════════════════════════════════════════╝\n")
    
    trainer = AudioTrainer()
    
    # Load training data
    print("="*70)
    print("LOADING TRAINING DATA")
    print("="*70)
    X_train, y_train = trainer.load_dataset(
        'datasets/splits/train.csv',
        audio_base_path='../LOTUSDIS_train/audio'
    )
    
    # Load validation data
    print("\n" + "="*70)
    print("LOADING VALIDATION DATA")
    print("="*70)
    X_val, y_val = trainer.load_dataset(
        'datasets/splits/validation.csv',
        audio_base_path='../LOTUSDIS_train/audio'
    )
    
    # Train model
    if len(X_train) > 0 and len(X_val) > 0:
        train_acc, val_acc = trainer.train(X_train, y_train, X_val, y_val)
        
        # Save model
        print("\n" + "="*70)
        print("SAVING MODEL")
        print("="*70)
        trainer.save_model()
        trainer.save_training_report()
        
        print("\n✅ Training complete!")
        print(f"\n📌 Key Results:")
        print(f"   Training Accuracy: {train_acc*100:.2f}%")
        print(f"   Validation Accuracy: {val_acc*100:.2f}%")
        print(f"   Gap: {abs(train_acc - val_acc)*100:.2f}%")
        
        if abs(train_acc - val_acc) > 0.15:
            print(f"\n⚠️  Warning: Large gap suggests overfitting")
        else:
            print(f"\n✓ Good! Model generalizes well")
    else:
        print("❌ Failed to load data")

if __name__ == "__main__":
    main()
