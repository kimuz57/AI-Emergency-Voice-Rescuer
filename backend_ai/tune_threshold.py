#!/usr/bin/env python3
"""
Tune decision threshold for binary emergency model
Goal: maximize recall for 'emergency' class
"""

import numpy as np
import pickle
import json
from pathlib import Path
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score,
    classification_report
)

CACHE_DIR = Path(__file__).resolve().parent / 'datasets' / 'features_cache'
MODEL_DIR  = Path(__file__).resolve().parent / 'models'

# Load model + encoder
with open(MODEL_DIR / 'audio_binary_model.pkl', 'rb') as f:
    model = pickle.load(f)
with open(MODEL_DIR / 'audio_binary_label_encoder.pkl', 'rb') as f:
    le = pickle.load(f)

# Load val & test sets
X_val  = np.load(CACHE_DIR / 'validation_X.npy')
y_val  = np.load(CACHE_DIR / 'validation_y_binary.npy').tolist()
X_test = np.load(CACHE_DIR / 'test_X.npy')
y_test = np.load(CACHE_DIR / 'test_y_binary.npy').tolist()

def to_str(y): return ['emergency' if b == 1 else 'normal' for b in y]

y_val_str  = to_str(y_val)
y_test_str = to_str(y_test)
y_val_enc  = le.transform(y_val_str)
y_test_enc = le.transform(y_test_str)

# Encoded class ids from label encoder
emergency_encoded = int(le.transform(['emergency'])[0])
normal_encoded = int(le.transform(['normal'])[0])

# Probability column index for emergency class in estimator output
model_classes = model.classes_
emg_proba_idx = int(np.where(model_classes == emergency_encoded)[0][0])

# Get probabilities
val_proba  = model.predict_proba(X_val)[:, emg_proba_idx]
test_proba = model.predict_proba(X_test)[:, emg_proba_idx]

print("=" * 65)
print("  Threshold Tuning (Val set)")
print("=" * 65)
print(f"{'Threshold':>10} {'Acc':>8} {'Emg Prec':>10} {'Emg Rec':>10} {'Emg F1':>8}")
print("-" * 65)

best_threshold = 0.5
best_f1 = 0.0

for thr in np.arange(0.05, 0.55, 0.05):
    y_pred = np.where(val_proba >= thr, emergency_encoded, normal_encoded)
    acc    = accuracy_score(y_val_enc, y_pred)
    prec   = precision_score(y_val_enc, y_pred, pos_label=emergency_encoded, zero_division=0)
    rec    = recall_score(y_val_enc, y_pred, pos_label=emergency_encoded, zero_division=0)
    f1     = f1_score(y_val_enc, y_pred, pos_label=emergency_encoded, zero_division=0)
    marker = " ◀" if f1 > best_f1 else ""
    if f1 > best_f1:
        best_f1 = f1
        best_threshold = thr
    print(f"{thr:>10.2f} {acc*100:>7.2f}% {prec*100:>9.2f}% {rec*100:>9.2f}% {f1*100:>7.2f}%{marker}")

print(f"\n  🏆 Best threshold (by emergency F1): {best_threshold:.2f}")

# Final evaluation on test set with best threshold
print("\n" + "=" * 65)
print(f"  Test Evaluation — threshold={best_threshold:.2f}")
print("=" * 65)

y_test_pred = np.where(test_proba >= best_threshold, emergency_encoded, normal_encoded)
print(classification_report(y_test_enc, y_test_pred, target_names=le.classes_, zero_division=0))

# Save best threshold to report
report_path = MODEL_DIR / 'audio_binary_report.json'
with open(report_path, 'r', encoding='utf-8') as f:
    report = json.load(f)

y_test_pred_full = np.where(test_proba >= best_threshold, emergency_encoded, normal_encoded)
report['best_threshold'] = float(best_threshold)
report['test_evaluation_at_best_threshold'] = {
    'threshold': float(best_threshold),
    'accuracy': float(accuracy_score(y_test_enc, y_test_pred_full)),
    'emergency_precision': float(precision_score(y_test_enc, y_test_pred_full, pos_label=emergency_encoded, zero_division=0)),
    'emergency_recall':    float(recall_score(y_test_enc, y_test_pred_full, pos_label=emergency_encoded, zero_division=0)),
    'emergency_f1':        float(f1_score(y_test_enc, y_test_pred_full, pos_label=emergency_encoded, zero_division=0)),
}

with open(report_path, 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print(f"  💾 Threshold saved to {report_path}")
