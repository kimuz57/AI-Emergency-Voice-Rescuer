#!/usr/bin/env python3
"""
Step 7-8: Train & Evaluate with MFCC Audio Features
====================================================
- Extracts MFCC + delta features from .wav files
- Trains RandomForest and GradientBoosting
- Validates on validation set, evaluates on test set
- Caches features to avoid re-extraction
"""

import pandas as pd
import numpy as np
import librosa
import os
import pickle
import json
import time
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, classification_report, confusion_matrix
)
from sklearn.preprocessing import LabelEncoder

# ============================================================
# CONFIG
# ============================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)

SPLITS_DIR = os.path.join(BASE_DIR, 'datasets', 'task4_splits')
CACHE_DIR = os.path.join(BASE_DIR, 'datasets', 'features_cache')
MODELS_DIR = os.path.join(BASE_DIR, 'models')

AUDIO_DIRS = [
    os.path.join(PROJECT_DIR, 'LOTUSDIS_train', 'train'),
    os.path.join(PROJECT_DIR, 'LOTUSDIS_dev', 'dev'),
    os.path.join(PROJECT_DIR, 'LOTUSDIS_test', 'test'),
]

SR = 16000       # Sample rate
N_MFCC = 13      # Number of MFCC coefficients
MAX_LEN = 3.0    # Max audio length in seconds (pad/trim)


# ============================================================
# 1. BUILD FILE INDEX
# ============================================================
def build_file_index():
    """Build a dict: filename -> full_path for all .wav files."""
    print("Building audio file index...")
    index = {}
    total = 0
    for audio_dir in AUDIO_DIRS:
        if not os.path.isdir(audio_dir):
            print(f"  SKIP (not found): {audio_dir}")
            continue
        count = 0
        for fname in os.listdir(audio_dir):
            if fname.lower().endswith('.wav'):
                index[fname] = os.path.join(audio_dir, fname)
                count += 1
        total += count
        print(f"  {audio_dir}: {count} files")
    print(f"  Total indexed: {total}")
    return index


# ============================================================
# 2. FEATURE EXTRACTION
# ============================================================
def extract_features(audio_path, sr=SR, n_mfcc=N_MFCC, max_len=MAX_LEN):
    """
    Extract audio features from a .wav file.
    
    Features (45 total):
    - 13 MFCC means
    - 13 MFCC stds
    - 13 delta-MFCC means
    - spectral centroid mean
    - spectral centroid std
    - ZCR mean
    - ZCR std
    - spectral bandwidth mean
    - spectral rolloff mean
    = 13+13+13+2+2+1+1 = 45
    """
    try:
        y, _ = librosa.load(audio_path, sr=sr)
        
        # Pad or trim to fixed length
        max_samples = int(sr * max_len)
        if len(y) > max_samples:
            y = y[:max_samples]
        elif len(y) < max_samples:
            y = np.pad(y, (0, max_samples - len(y)), mode='constant')
        
        # Skip silent files
        if np.max(np.abs(y)) < 1e-6:
            return None
        
        # MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_std = np.std(mfcc, axis=1)
        
        # Delta MFCC
        delta_mfcc = librosa.feature.delta(mfcc)
        delta_mean = np.mean(delta_mfcc, axis=1)
        
        # Spectral centroid
        sc = librosa.feature.spectral_centroid(y=y, sr=sr)
        sc_mean = np.mean(sc)
        sc_std = np.std(sc)
        
        # ZCR
        zcr = librosa.feature.zero_crossing_rate(y)
        zcr_mean = np.mean(zcr)
        zcr_std = np.std(zcr)
        
        # Spectral bandwidth
        sb = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        sb_mean = np.mean(sb)
        
        # Spectral rolloff
        sr_feat = librosa.feature.spectral_rolloff(y=y, sr=sr)
        sr_mean = np.mean(sr_feat)
        
        features = np.concatenate([
            mfcc_mean, mfcc_std, delta_mean,
            [sc_mean, sc_std, zcr_mean, zcr_std, sb_mean, sr_mean]
        ])
        
        return features
        
    except Exception as e:
        return None


# ============================================================
# 3. LOAD & CACHE DATASET
# ============================================================
def load_split(split_name, file_index, force_reextract=False):
    """
    Load a split CSV → extract features → cache to .npz.
    Returns X (features), y (sentences), meta_df (matched rows).
    """
    csv_path = os.path.join(SPLITS_DIR, f'{split_name}.csv')
    cache_path = os.path.join(CACHE_DIR, f'{split_name}_features.npz')
    
    os.makedirs(CACHE_DIR, exist_ok=True)
    
    # Check cache
    if os.path.exists(cache_path) and not force_reextract:
        print(f"Loading cached features: {cache_path}")
        data = np.load(cache_path, allow_pickle=True)
        return data['X'], data['y'], None
    
    print(f"\nExtracting features for {split_name}...")
    df = pd.read_csv(csv_path, engine='python', encoding_errors='ignore')
    print(f"  CSV rows: {len(df)}")
    
    X_list = []
    y_list = []
    found = 0
    not_found = 0
    extract_fail = 0
    
    t0 = time.time()
    for idx, row in df.iterrows():
        if idx % 2000 == 0 and idx > 0:
            elapsed = time.time() - t0
            rate = idx / elapsed
            eta = (len(df) - idx) / rate
            print(f"  [{idx}/{len(df)}] found={found} skip={not_found} "
                  f"fail={extract_fail} ({rate:.0f} rows/s, ETA {eta:.0f}s)")
        
        filename = os.path.basename(row['path'])
        audio_path = file_index.get(filename)
        
        if audio_path is None:
            not_found += 1
            continue
        
        features = extract_features(audio_path)
        if features is None:
            extract_fail += 1
            continue
        
        X_list.append(features)
        y_list.append(row['sentence'])
        found += 1
    
    elapsed = time.time() - t0
    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list)
    
    print(f"  Done in {elapsed:.1f}s: {found} samples extracted, "
          f"{not_found} not found, {extract_fail} extract failures")
    
    # Cache
    np.savez_compressed(cache_path, X=X, y=y)
    print(f"  Cached to {cache_path}")
    
    return X, y, None


# ============================================================
# 4. TRAINING
# ============================================================
def train_and_evaluate():
    print("=" * 70)
    print("  MFCC Audio Training Pipeline")
    print("=" * 70)
    
    # Build file index
    file_index = build_file_index()
    if not file_index:
        print("ERROR: No audio files found!")
        return
    
    # Load splits
    X_train, y_train, _ = load_split('train', file_index)
    X_val, y_val, _ = load_split('validation', file_index)
    X_test, y_test, _ = load_split('test', file_index)
    
    print(f"\nDataset sizes:")
    print(f"  Train:      {X_train.shape}")
    print(f"  Validation: {X_val.shape}")
    print(f"  Test:       {X_test.shape}")
    
    # Encode labels
    le = LabelEncoder()
    y_train_enc = le.fit_transform(y_train)
    y_val_enc = le.transform(y_val)
    y_test_enc = le.transform(y_test)
    
    n_classes = len(le.classes_)
    print(f"  Classes: {n_classes}")
    
    # Replace NaN/Inf
    for arr in [X_train, X_val, X_test]:
        arr[np.isnan(arr)] = 0
        arr[np.isinf(arr)] = 0
    
    # ---- Model 1: RandomForest ----
    print("\n" + "=" * 70)
    print("  Training RandomForest")
    print("=" * 70)
    
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=30,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )
    t0 = time.time()
    rf.fit(X_train, y_train_enc)
    rf_train_time = time.time() - t0
    
    rf_train_acc = accuracy_score(y_train_enc, rf.predict(X_train))
    rf_val_acc = accuracy_score(y_val_enc, rf.predict(X_val))
    rf_val_f1 = f1_score(y_val_enc, rf.predict(X_val), average='weighted')
    
    print(f"  Train time: {rf_train_time:.1f}s")
    print(f"  Train Accuracy: {rf_train_acc*100:.2f}%")
    print(f"  Val Accuracy:   {rf_val_acc*100:.2f}%")
    print(f"  Val F1:         {rf_val_f1*100:.2f}%")
    
    # ---- Model 2: GradientBoosting ----
    print("\n" + "=" * 70)
    print("  Training GradientBoosting")
    print("=" * 70)
    
    gb = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=8,
        learning_rate=0.1,
        subsample=0.8,
        random_state=42,
    )
    t0 = time.time()
    gb.fit(X_train, y_train_enc)
    gb_train_time = time.time() - t0
    
    gb_train_acc = accuracy_score(y_train_enc, gb.predict(X_train))
    gb_val_acc = accuracy_score(y_val_enc, gb.predict(X_val))
    gb_val_f1 = f1_score(y_val_enc, gb.predict(X_val), average='weighted')
    
    print(f"  Train time: {gb_train_time:.1f}s")
    print(f"  Train Accuracy: {gb_train_acc*100:.2f}%")
    print(f"  Val Accuracy:   {gb_val_acc*100:.2f}%")
    print(f"  Val F1:         {gb_val_f1*100:.2f}%")
    
    # ---- Pick best model ----
    best_name = 'RandomForest' if rf_val_f1 >= gb_val_f1 else 'GradientBoosting'
    best_model = rf if rf_val_f1 >= gb_val_f1 else gb
    best_val_acc = rf_val_acc if rf_val_f1 >= gb_val_f1 else gb_val_acc
    best_val_f1 = rf_val_f1 if rf_val_f1 >= gb_val_f1 else gb_val_f1
    
    print(f"\n>>> Best model: {best_name} (Val F1={best_val_f1*100:.2f}%)")
    
    # ---- Step 8: Test evaluation ----
    print("\n" + "=" * 70)
    print(f"  Step 8: Final Test Evaluation ({best_name})")
    print("=" * 70)
    
    y_test_pred = best_model.predict(X_test)
    test_acc = accuracy_score(y_test_enc, y_test_pred)
    test_f1 = f1_score(y_test_enc, y_test_pred, average='weighted')
    test_precision = precision_score(y_test_enc, y_test_pred, average='weighted', zero_division=0)
    test_recall = recall_score(y_test_enc, y_test_pred, average='weighted', zero_division=0)
    
    print(f"  Test Accuracy:  {test_acc*100:.2f}%")
    print(f"  Test Precision: {test_precision*100:.2f}%")
    print(f"  Test Recall:    {test_recall*100:.2f}%")
    print(f"  Test F1:        {test_f1*100:.2f}%")
    
    # Per-class report (top 20 + worst 10)
    report_dict = classification_report(
        y_test_enc, y_test_pred,
        target_names=le.classes_,
        output_dict=True,
        zero_division=0
    )
    
    # Sort by f1-score
    class_results = []
    for cls_name in le.classes_:
        r = report_dict[cls_name]
        class_results.append({
            'keyword': cls_name,
            'precision': r['precision'],
            'recall': r['recall'],
            'f1': r['f1-score'],
            'support': r['support'],
        })
    class_results.sort(key=lambda x: x['f1'], reverse=True)
    
    print(f"\n  Top 10 keywords:")
    for cr in class_results[:10]:
        print(f"    {cr['keyword']:25s}  F1={cr['f1']:.3f}  P={cr['precision']:.3f}  "
              f"R={cr['recall']:.3f}  n={cr['support']}")
    
    print(f"\n  Bottom 10 keywords:")
    for cr in class_results[-10:]:
        print(f"    {cr['keyword']:25s}  F1={cr['f1']:.3f}  P={cr['precision']:.3f}  "
              f"R={cr['recall']:.3f}  n={cr['support']}")
    
    # ---- Save ----
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    # Save best model
    model_path = os.path.join(MODELS_DIR, 'audio_model_best.pkl')
    with open(model_path, 'wb') as f:
        pickle.dump(best_model, f)
    
    # Save label encoder
    le_path = os.path.join(MODELS_DIR, 'audio_label_encoder.pkl')
    with open(le_path, 'wb') as f:
        pickle.dump(le, f)
    
    # Save both models
    with open(os.path.join(MODELS_DIR, 'audio_rf.pkl'), 'wb') as f:
        pickle.dump(rf, f)
    with open(os.path.join(MODELS_DIR, 'audio_gb.pkl'), 'wb') as f:
        pickle.dump(gb, f)
    
    # Save report
    report = {
        'timestamp': str(pd.Timestamp.now()),
        'feature_config': {
            'type': 'MFCC + delta + spectral',
            'n_mfcc': N_MFCC,
            'sr': SR,
            'max_len_sec': MAX_LEN,
            'n_features': int(X_train.shape[1]),
        },
        'dataset': {
            'train_samples': int(X_train.shape[0]),
            'val_samples': int(X_val.shape[0]),
            'test_samples': int(X_test.shape[0]),
            'n_classes': n_classes,
        },
        'models': {
            'RandomForest': {
                'train_acc': float(rf_train_acc),
                'val_acc': float(rf_val_acc),
                'val_f1': float(rf_val_f1),
                'train_time_sec': float(rf_train_time),
            },
            'GradientBoosting': {
                'train_acc': float(gb_train_acc),
                'val_acc': float(gb_val_acc),
                'val_f1': float(gb_val_f1),
                'train_time_sec': float(gb_train_time),
            },
        },
        'best_model': best_name,
        'test_results': {
            'accuracy': float(test_acc),
            'precision': float(test_precision),
            'recall': float(test_recall),
            'f1': float(test_f1),
        },
        'per_class': class_results,
    }
    
    report_path = os.path.join(MODELS_DIR, 'audio_training_report.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"\nSaved:")
    print(f"  Model:  {model_path}")
    print(f"  Labels: {le_path}")
    print(f"  Report: {report_path}")
    print(f"\nDone!")


if __name__ == '__main__':
    train_and_evaluate()
