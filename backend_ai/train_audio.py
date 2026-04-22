#!/usr/bin/env python3
"""
Step 7-8: Audio-based Training Pipeline
========================================
ใช้ MFCC features จากไฟล์เสียง .wav จริง เทรน keyword classification model

Pipeline:
1. Build audio file index (filename → absolute path)
2. Match CSV rows to actual .wav files
3. Assign keyword label per row (longest match from 64 target keywords)
4. Extract MFCC + delta features (cached to .npy)
5. Train GradientBoosting + RandomForest
6. Validate → Evaluate on test set
7. Export models + reports
"""

import pandas as pd
import numpy as np
import librosa
import os
import sys
import json
import pickle
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix
)

# ==============================================================
# Config
# ==============================================================
BASE_DIR = Path(__file__).resolve().parent.parent  # main_smartvoice/
SPLITS_DIR = Path(__file__).resolve().parent / 'datasets' / 'task4_splits'
CACHE_DIR = Path(__file__).resolve().parent / 'datasets' / 'features_cache'
MODEL_DIR = Path(__file__).resolve().parent / 'models'

AUDIO_DIRS = [
    BASE_DIR / 'LOTUSDIS_train' / 'train',
    BASE_DIR / 'LOTUSDIS_dev' / 'dev',
    BASE_DIR / 'LOTUSDIS_test' / 'test',
]

SR = 16000          # sample rate
N_MFCC = 13         # MFCC coefficients
MAX_WORKERS = 6     # threads for feature extraction

# Emergency keywords (same as task4_dataset_prep.py)
EMERGENCY_KWS = [
    'ช่วย', 'ด้วย', 'มา', 'เร็ว', 'ตอนนี้',
    'เจ็บ', 'หายใจ', 'ปวด', 'เลือด', 'ล้ม',
    'อุบัติเหตุ', 'ไฟไหม้', 'หมดสติ', 'ฉุกเฉิน',
    'โทร', 'หมอ', 'โรงพยาบาล', 'รถพยาบาล',
]


# ==============================================================
# 1. Build audio file index
# ==============================================================
def build_file_index():
    """Scan all LOTUSDIS directories, map filename → full path."""
    print("=" * 70)
    print("  Step 1: Building audio file index")
    print("=" * 70)

    index = {}
    for audio_dir in AUDIO_DIRS:
        if not audio_dir.exists():
            print(f"  ⚠ Directory not found: {audio_dir}")
            continue
        count = 0
        for f in audio_dir.iterdir():
            if f.suffix == '.wav':
                index[f.name] = str(f)
                count += 1
        print(f"  📁 {audio_dir}: {count} files")

    print(f"  ✅ Total indexed: {len(index)} wav files")
    return index


# ==============================================================
# 2. Load keyword list from dataset_summary.json
# ==============================================================
def load_target_keywords():
    """Load the 64 target keywords from dataset_summary.json."""
    summary_path = SPLITS_DIR / 'dataset_summary.json'
    with open(summary_path, 'r', encoding='utf-8') as f:
        summary = json.load(f)
    keywords = summary['target_vocabulary']['keywords']
    print(f"  📋 Loaded {len(keywords)} target keywords")
    return keywords


# ==============================================================
# 3. Assign keyword label to each sentence
# ==============================================================
def assign_keyword_label(sentence, keywords_sorted_by_len):
    """Find the longest keyword that appears as substring in sentence.
    Returns keyword string or None if no match.
    """
    for kw in keywords_sorted_by_len:
        if kw in sentence:
            return kw
    return None


# ==============================================================
# 4. Feature extraction
# ==============================================================
def extract_mfcc_features(audio_path):
    """Extract MFCC + delta + delta-delta from a single wav file.

    Returns: numpy array of shape (N_MFCC*3 + 4,) or None on error
      - 13 MFCC means
      - 13 MFCC delta means
      - 13 MFCC delta-delta means
      - spectral centroid mean
      - spectral bandwidth mean
      - zero crossing rate mean
      - RMS energy mean
    Total: 43 features
    """
    try:
        y, sr = librosa.load(audio_path, sr=SR)
        if len(y) < SR * 0.05:  # skip clips < 50ms
            return None

        # MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC)
        mfcc_mean = np.mean(mfcc, axis=1)

        # Delta & delta-delta
        delta = librosa.feature.delta(mfcc)
        delta_mean = np.mean(delta, axis=1)
        delta2 = librosa.feature.delta(mfcc, order=2)
        delta2_mean = np.mean(delta2, axis=1)

        # Spectral features
        sc = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        sb = np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr))
        zcr = np.mean(librosa.feature.zero_crossing_rate(y))
        rms = np.mean(librosa.feature.rms(y=y))

        features = np.concatenate([mfcc_mean, delta_mean, delta2_mean, [sc, sb, zcr, rms]])
        return features.astype(np.float32)
    except Exception:
        return None


def extract_single(args):
    """Worker: extract features for one row. Returns (index, features) or (index, None)."""
    idx, audio_path = args
    feat = extract_mfcc_features(audio_path)
    return idx, feat


def extract_features_for_split(df, file_index, keywords_sorted, split_name):
    """Extract features for an entire split. Uses cache if available.

    Returns: X (np.ndarray), y_keyword (list[str]), y_binary (list[int]), indices (list[int])
    """
    cache_X = CACHE_DIR / f'{split_name}_X.npy'
    cache_y_kw = CACHE_DIR / f'{split_name}_y_keyword.npy'
    cache_y_bin = CACHE_DIR / f'{split_name}_y_binary.npy'

    if cache_X.exists() and cache_y_kw.exists() and cache_y_bin.exists():
        print(f"  💾 Loading cached features for {split_name}...")
        X = np.load(cache_X)
        y_kw = np.load(cache_y_kw, allow_pickle=True).tolist()
        y_bin = np.load(cache_y_bin).tolist()
        print(f"     {split_name}: {len(X)} samples loaded from cache")
        return X, y_kw, y_bin

    print(f"\n  🔊 Extracting features for {split_name} ({len(df)} rows)...")

    # Prepare work items: (row_index, audio_path, keyword_label)
    work_items = []
    labels_kw = []
    labels_bin = []

    for idx, row in df.iterrows():
        filename = os.path.basename(row['path'])
        audio_path = file_index.get(filename)
        if audio_path is None:
            continue

        kw = assign_keyword_label(str(row['sentence']), keywords_sorted)
        if kw is None:
            continue

        is_emergency = 1 if kw in EMERGENCY_KWS else 0
        work_items.append((len(work_items), audio_path))
        labels_kw.append(kw)
        labels_bin.append(is_emergency)

    print(f"     Matched rows with audio: {len(work_items)}")

    # Extract features in parallel
    features_list = [None] * len(work_items)
    success = 0
    failed = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(extract_single, item): item[0] for item in work_items}
        for i, future in enumerate(as_completed(futures)):
            idx_local, feat = future.result()
            if feat is not None:
                features_list[idx_local] = feat
                success += 1
            else:
                failed += 1

            if (i + 1) % 2000 == 0 or (i + 1) == len(work_items):
                elapsed = time.time() - t0
                rate = (i + 1) / elapsed
                eta = (len(work_items) - i - 1) / rate if rate > 0 else 0
                print(f"     [{split_name}] {i+1}/{len(work_items)} "
                      f"({success} ok, {failed} fail) "
                      f"{rate:.0f} files/s, ETA {eta:.0f}s")

    # Filter out None
    valid_X = []
    valid_kw = []
    valid_bin = []
    for i, feat in enumerate(features_list):
        if feat is not None:
            valid_X.append(feat)
            valid_kw.append(labels_kw[i])
            valid_bin.append(labels_bin[i])

    X = np.array(valid_X, dtype=np.float32)
    elapsed_total = time.time() - t0
    print(f"  ✅ {split_name}: {len(X)} samples extracted in {elapsed_total:.0f}s")

    # Cache
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    np.save(cache_X, X)
    np.save(cache_y_kw, np.array(valid_kw, dtype=object))
    np.save(cache_y_bin, np.array(valid_bin, dtype=np.int32))
    print(f"  💾 Cached to {CACHE_DIR}")

    return X, valid_kw, valid_bin


# ==============================================================
# 5. Training
# ==============================================================
def train_models(X_train, y_train, X_val, y_val, label_type='keyword'):
    """Train GradientBoosting + RandomForest, pick best on validation."""

    print(f"\n{'='*70}")
    print(f"  Step 5: Training ({label_type} classification)")
    print(f"{'='*70}")

    le = LabelEncoder()
    y_train_enc = le.fit_transform(y_train)
    y_val_enc = le.transform(y_val)

    n_classes = len(le.classes_)
    print(f"  Classes: {n_classes}")
    print(f"  Train: {len(X_train)}, Val: {len(X_val)}")

    results = {}

    # --- GradientBoosting ---
    print(f"\n  🌳 Training GradientBoosting...")
    t0 = time.time()
    gb = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=8,
        learning_rate=0.1,
        subsample=0.8,
        random_state=42,
    )
    gb.fit(X_train, y_train_enc)
    gb_time = time.time() - t0

    gb_train_acc = accuracy_score(y_train_enc, gb.predict(X_train))
    gb_val_pred = gb.predict(X_val)
    gb_val_acc = accuracy_score(y_val_enc, gb_val_pred)
    gb_val_f1 = f1_score(y_val_enc, gb_val_pred, average='weighted', zero_division=0)

    print(f"     Train Acc: {gb_train_acc*100:.2f}%")
    print(f"     Val Acc:   {gb_val_acc*100:.2f}%")
    print(f"     Val F1:    {gb_val_f1*100:.2f}%")
    print(f"     Time:      {gb_time:.0f}s")

    results['GradientBoosting'] = {
        'model': gb, 'le': le,
        'train_acc': gb_train_acc, 'val_acc': gb_val_acc, 'val_f1': gb_val_f1,
        'time': gb_time,
    }

    # --- RandomForest ---
    print(f"\n  🌲 Training RandomForest...")
    t0 = time.time()
    rf = RandomForestClassifier(
        n_estimators=300,
        max_depth=25,
        min_samples_split=5,
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train_enc)
    rf_time = time.time() - t0

    rf_train_acc = accuracy_score(y_train_enc, rf.predict(X_train))
    rf_val_pred = rf.predict(X_val)
    rf_val_acc = accuracy_score(y_val_enc, rf_val_pred)
    rf_val_f1 = f1_score(y_val_enc, rf_val_pred, average='weighted', zero_division=0)

    print(f"     Train Acc: {rf_train_acc*100:.2f}%")
    print(f"     Val Acc:   {rf_val_acc*100:.2f}%")
    print(f"     Val F1:    {rf_val_f1*100:.2f}%")
    print(f"     Time:      {rf_time:.0f}s")

    results['RandomForest'] = {
        'model': rf, 'le': le,
        'train_acc': rf_train_acc, 'val_acc': rf_val_acc, 'val_f1': rf_val_f1,
        'time': rf_time,
    }

    # Pick best
    best_name = max(results, key=lambda k: results[k]['val_f1'])
    print(f"\n  🏆 Best model: {best_name} (Val F1={results[best_name]['val_f1']*100:.2f}%)")

    return results, best_name


# ==============================================================
# 6. Evaluation on test set
# ==============================================================
def evaluate_on_test(model, le, X_test, y_test, model_name, label_type='keyword'):
    """Full evaluation on held-out test set."""

    print(f"\n{'='*70}")
    print(f"  Step 6: Test Evaluation — {model_name} ({label_type})")
    print(f"{'='*70}")

    y_test_enc = le.transform(y_test)
    y_pred = model.predict(X_test)

    acc = accuracy_score(y_test_enc, y_pred)
    prec = precision_score(y_test_enc, y_pred, average='weighted', zero_division=0)
    rec = recall_score(y_test_enc, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_test_enc, y_pred, average='weighted', zero_division=0)

    print(f"  Test Accuracy:  {acc*100:.2f}%")
    print(f"  Test Precision: {prec*100:.2f}%")
    print(f"  Test Recall:    {rec*100:.2f}%")
    print(f"  Test F1:        {f1*100:.2f}%")

    # Per-class report (top 20 classes by support)
    report_dict = classification_report(
        y_test_enc, y_pred,
        target_names=le.classes_,
        output_dict=True, zero_division=0
    )
    report_str = classification_report(
        y_test_enc, y_pred,
        target_names=le.classes_,
        zero_division=0
    )
    print(f"\n  Classification Report:\n{report_str}")

    return {
        'model_name': model_name,
        'label_type': label_type,
        'test_accuracy': acc,
        'test_precision': prec,
        'test_recall': rec,
        'test_f1': f1,
        'n_test_samples': len(X_test),
        'n_classes': len(le.classes_),
        'classes': list(le.classes_),
        'classification_report': report_dict,
    }


# ==============================================================
# 7. Save model & reports
# ==============================================================
def save_artifacts(results, best_name, test_report, label_type):
    """Save best model, label encoder, and training report."""

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    prefix = f'audio_{label_type}'

    best = results[best_name]

    # Save model
    model_path = MODEL_DIR / f'{prefix}_model.pkl'
    with open(model_path, 'wb') as f:
        pickle.dump(best['model'], f)

    # Save label encoder
    le_path = MODEL_DIR / f'{prefix}_label_encoder.pkl'
    with open(le_path, 'wb') as f:
        pickle.dump(best['le'], f)

    # Save report
    report = {
        'timestamp': pd.Timestamp.now().isoformat(),
        'label_type': label_type,
        'feature_type': f'MFCC-{N_MFCC} + delta + delta2 + spectral (43 features)',
        'sample_rate': SR,
        'best_model': best_name,
        'models': {},
        'test_evaluation': test_report,
    }
    for name, r in results.items():
        report['models'][name] = {
            'train_accuracy': r['train_acc'],
            'val_accuracy': r['val_acc'],
            'val_f1': r['val_f1'],
            'training_time_sec': r['time'],
        }

    report_path = MODEL_DIR / f'{prefix}_report.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n  💾 Saved:")
    print(f"     Model:   {model_path}")
    print(f"     Labels:  {le_path}")
    print(f"     Report:  {report_path}")

    return model_path, report_path


# ==============================================================
# Main
# ==============================================================
def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Step 7-8: Audio MFCC Training & Evaluation         ║")
    print("╚══════════════════════════════════════════════════════╝\n")

    # 1. File index
    file_index = build_file_index()

    # 2. Load keywords
    keywords = load_target_keywords()
    # Sort by length descending for longest-match-first
    keywords_sorted = sorted(keywords, key=len, reverse=True)

    # 3. Load CSVs
    print(f"\n{'='*70}")
    print("  Step 2: Loading split CSVs")
    print(f"{'='*70}")
    train_df = pd.read_csv(SPLITS_DIR / 'train.csv', engine='python', encoding_errors='ignore')
    val_df = pd.read_csv(SPLITS_DIR / 'validation.csv', engine='python', encoding_errors='ignore')
    test_df = pd.read_csv(SPLITS_DIR / 'test.csv', engine='python', encoding_errors='ignore')
    print(f"  Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")

    # 4. Extract features
    print(f"\n{'='*70}")
    print("  Step 3-4: Feature Extraction (MFCC)")
    print(f"{'='*70}")

    X_train, y_train_kw, y_train_bin = extract_features_for_split(
        train_df, file_index, keywords_sorted, 'train')
    X_val, y_val_kw, y_val_bin = extract_features_for_split(
        val_df, file_index, keywords_sorted, 'validation')
    X_test, y_test_kw, y_test_bin = extract_features_for_split(
        test_df, file_index, keywords_sorted, 'test')

    print(f"\n  📊 Feature Summary:")
    print(f"     Feature dim: {X_train.shape[1]}")
    print(f"     Train: {X_train.shape[0]}, Val: {X_val.shape[0]}, Test: {X_test.shape[0]}")
    print(f"     Unique keywords (train): {len(set(y_train_kw))}")
    print(f"     Emergency ratio (train): {sum(y_train_bin)}/{len(y_train_bin)} "
          f"({sum(y_train_bin)/len(y_train_bin)*100:.1f}%)")

    # ========== A) Keyword multi-class ==========
    print("\n" + "▓" * 70)
    print("  TASK A: Multi-class Keyword Classification")
    print("▓" * 70)

    kw_results, kw_best = train_models(X_train, y_train_kw, X_val, y_val_kw, 'keyword')
    kw_test_report = evaluate_on_test(
        kw_results[kw_best]['model'], kw_results[kw_best]['le'],
        X_test, y_test_kw, kw_best, 'keyword')
    save_artifacts(kw_results, kw_best, kw_test_report, 'keyword')

    # ========== B) Binary emergency detection ==========
    print("\n" + "▓" * 70)
    print("  TASK B: Binary Emergency Detection")
    print("▓" * 70)

    y_train_bin_str = ['emergency' if b == 1 else 'normal' for b in y_train_bin]
    y_val_bin_str = ['emergency' if b == 1 else 'normal' for b in y_val_bin]
    y_test_bin_str = ['emergency' if b == 1 else 'normal' for b in y_test_bin]

    bin_results, bin_best = train_models(X_train, y_train_bin_str, X_val, y_val_bin_str, 'binary')
    bin_test_report = evaluate_on_test(
        bin_results[bin_best]['model'], bin_results[bin_best]['le'],
        X_test, y_test_bin_str, bin_best, 'binary')
    save_artifacts(bin_results, bin_best, bin_test_report, 'binary')

    # ========== Summary ==========
    print("\n" + "═" * 70)
    print("  FINAL SUMMARY")
    print("═" * 70)
    print(f"  Keyword Classification:")
    print(f"    Best: {kw_best}")
    print(f"    Val F1:  {kw_results[kw_best]['val_f1']*100:.2f}%")
    print(f"    Test F1: {kw_test_report['test_f1']*100:.2f}%")
    print(f"    Test Acc: {kw_test_report['test_accuracy']*100:.2f}%")
    print(f"\n  Binary Emergency Detection:")
    print(f"    Best: {bin_best}")
    print(f"    Val F1:  {bin_results[bin_best]['val_f1']*100:.2f}%")
    print(f"    Test F1: {bin_test_report['test_f1']*100:.2f}%")
    print(f"    Test Acc: {bin_test_report['test_accuracy']*100:.2f}%")
    print(f"\n✅ All done! Models saved to {MODEL_DIR}")


if __name__ == '__main__':
    main()
