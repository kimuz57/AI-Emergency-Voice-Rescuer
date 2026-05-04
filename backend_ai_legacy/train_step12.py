#!/usr/bin/env python3
"""
Step 12: Retrain Model with Speaker-Separated Dataset
ใช้ dataset ใหม่ที่แยก speaker แล้ว
"""

import pandas as pd
import numpy as np
import os
import pickle
import json
import hashlib
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.preprocessing import LabelEncoder
from pathlib import Path

class RetrainedModel:
    def __init__(self):
        self.model = None
        self.label_encoder = LabelEncoder()

    def extract_features_from_sentence(self, sentence_text):
        """สร้าง features จาก text (เหมือนเดิม แต่ปรับปรุง)"""
        features = [
            len(sentence_text),           # ความยาวคำ
            len(sentence_text.split()),   # จำนวนคำ
            ord(sentence_text[0]) if sentence_text else 0,  # ASCII แรก
            sum(ord(c) for c in sentence_text) % 256,  # hash
            len([c for c in sentence_text if c in 'เแโไ']),  # tone marks
            1.0 if any(c.isdigit() for c in sentence_text) else 0.0,  # has digit
            sentence_text.count('า'),  # longest vowel
            sentence_text.count('ำ'),  # nasal mark
            sentence_text.count('ะ'),  # short ending
            sentence_text.count('ั'),  # tone mark 1
            len(set(sentence_text)),  # unique chars
            sentence_text.count(' '),   # spaces
            len([c for c in sentence_text if c in 'คกขค']),  # consonants
            len([c for c in sentence_text if c in 'เแโไ']),  # vowels
            int(hashlib.sha256(sentence_text.encode('utf-8')).hexdigest(), 16) % 256,  # sentence hash
            # Additional features for better performance
            sentence_text.count('ร'),  # common consonant
            sentence_text.count('น'),  # common consonant
            len([c for c in sentence_text if c in 'ฤฦ']),  # rare chars
        ]
        return np.array(features, dtype=float)

    def load_split_data(self, split_csv_path):
        """โหลด train/val/test data จาก CSV"""
        df = pd.read_csv(split_csv_path, engine='python', encoding_errors='ignore')

        X = []
        y = []

        for idx, row in df.iterrows():
            features = self.extract_features_from_sentence(row['sentence'])
            X.append(features)
            y.append(row['sentence'])

        return np.array(X), np.array(y)

    def train(self, X_train, y_train, X_val, y_val):
        """
        เทรน Model ด้วย GradientBoosting (เหมือน step 9)
        """
        print("\n" + "="*70)
        print("🎓 RETRAINING MODEL WITH SPEAKER SEPARATION")
        print("="*70)

        # Encode labels
        print(f"\n1️⃣ Encoding labels...")
        y_train_enc = self.label_encoder.fit_transform(y_train)
        y_val_enc = self.label_encoder.transform(y_val)

        n_classes = len(self.label_encoder.classes_)
        print(f"   Classes: {n_classes}")
        print(f"   Keywords: {list(self.label_encoder.classes_)[:5]}... (showing 5/{n_classes})")

        # Create Model
        print(f"\n2️⃣ Creating GradientBoosting...")
        print(f"   🌳 n_estimators=200 (200 ต้นไม้)")
        print(f"   📊 max_depth=10 (ลึก 10 ชั้น)")
        print(f"   🎯 learning_rate=0.1")

        self.model = GradientBoostingClassifier(
            n_estimators=200,
            max_depth=10,
            learning_rate=0.1,
            random_state=42,
            n_iter_no_change=10,
            validation_fraction=0.1
        )

        # Train
        print(f"\n3️⃣ Training on {len(X_train)} samples...")
        self.model.fit(X_train, y_train_enc)
        print(f"   ✓ Training finished!")

        # Validate
        print(f"\n4️⃣ Validation on {len(X_val)} samples...")

        y_train_pred = self.model.predict(X_train)
        y_val_pred = self.model.predict(X_val)

        train_acc = accuracy_score(y_train_enc, y_train_pred)
        val_acc = accuracy_score(y_val_enc, y_val_pred)

        # Results
        print(f"\n📊 RESULTS:")
        print(f"   Train Accuracy: {train_acc*100:.2f}%")
        print(f"   Validation Accuracy: {val_acc*100:.2f}%")
        print(f"   Overfitting Gap: {abs(train_acc-val_acc)*100:.2f}%")

        # Per keyword accuracy
        print(f"\n📈 Accuracy per Keyword (Validation):")
        print(f"{'Keyword':<20} {'Accuracy':<10} {'Samples':<10}")
        print("-" * 40)

        for idx, label in enumerate(self.label_encoder.classes_):
            mask = y_val_enc == idx
            if np.sum(mask) > 0:
                acc = accuracy_score(y_val_enc[mask], y_val_pred[mask])
                print(f"{label:<20} {acc*100:>6.2f}%    {np.sum(mask):>6d}")

        return train_acc, val_acc

    def save_model(self, model_path='models/retrained_model.pkl'):
        """บันทึก model"""
        os.makedirs(os.path.dirname(model_path) or '.', exist_ok=True)

        # Save model
        with open(model_path, 'wb') as f:
            pickle.dump(self.model, f)

        # Save label encoder
        le_path = model_path.replace('.pkl', '_labels.pkl')
        with open(le_path, 'wb') as f:
            pickle.dump(self.label_encoder, f)

        print(f"\n💾 Model Saved:")
        print(f"   ✓ {model_path}")
        print(f"   ✓ {le_path}")

    def save_report(self, train_acc, val_acc, report_path='models/retraining_report.json'):
        """บันทึกรายงาน"""
        os.makedirs(os.path.dirname(report_path) or '.', exist_ok=True)

        report = {
            'timestamp': str(pd.Timestamp.now()),
            'step': 12,
            'task': 'Retrain Model with Speaker Separation',
            'model_type': 'GradientBoostingClassifier',
            'n_estimators': 200,
            'max_depth': 10,
            'learning_rate': 0.1,
            'n_keywords': len(self.label_encoder.classes_),
            'keywords': list(self.label_encoder.classes_),
            'train_accuracy': float(train_acc),
            'validation_accuracy': float(val_acc),
            'overfitting_gap': float(abs(train_acc - val_acc))
        }

        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"   ✓ {report_path}")

def main():
    print("╔══════════════════════════════════════════════╗")
    print("║  Step 12: Retrain with Speaker Separation  ║")
    print("╚══════════════════════════════════════════════╝")

    trainer = RetrainedModel()

    # New dataset paths
    train_csv = 'datasets/task3_speaker_separated/train.csv'
    val_csv = 'datasets/task3_speaker_separated/validation.csv'
    test_csv = 'datasets/task3_speaker_separated/test.csv'

    # Load data
    print("\n" + "="*70)
    print("📂 LOADING NEW DATASET")
    print("="*70)

    print(f"\n📥 Loading Train data ({train_csv})...")
    X_train, y_train = trainer.load_split_data(train_csv)
    print(f"   ✓ {len(X_train)} samples loaded")

    print(f"\n📥 Loading Validation data ({val_csv})...")
    X_val, y_val = trainer.load_split_data(val_csv)
    print(f"   ✓ {len(X_val)} samples loaded")

    print(f"\n📥 Loading Test data ({test_csv})...")
    X_test, y_test = trainer.load_split_data(test_csv)
    print(f"   ✓ {len(X_test)} samples loaded")

    # Train
    if len(X_train) > 0 and len(X_val) > 0:
        train_acc, val_acc = trainer.train(X_train, y_train, X_val, y_val)

        # Save
        print("\n" + "="*70)
        print("💾 SAVING RESULTS")
        print("="*70)
        trainer.save_model()
        trainer.save_report(train_acc, val_acc)

        # Summary
        print("\n" + "="*70)
        print("✅ RETRAINING SUMMARY")
        print("="*70)
        print(f"\n☑️  New dataset: Speaker-separated splits")
        print(f"☑️  Data loaded: {len(X_train)} train + {len(X_val)} validation")
        print(f"☑️  Model trained: GradientBoosting with 200 trees")
        print(f"☑️  Results: Train {train_acc*100:.2f}% | Val {val_acc*100:.2f}%")
        print(f"☑️  Model saved: models/retrained_model.pkl")
        print(f"\n🎯 Next Step: Test with test set (Step 13)")
    else:
        print("❌ Failed to load data")

if __name__ == "__main__":
    main()