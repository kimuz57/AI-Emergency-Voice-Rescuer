#!/usr/bin/env python3
"""
Train Binary Emergency Detector (V2 Features)
=============================================
V2 adds speech-dynamics features on top of the original 43-dim MFCC stack.
This script is isolated from train_audio.py so the current stable pipeline
remains reproducible.

Features (50 dims total):
- Base 43: MFCC-13 mean + delta mean + delta2 mean + spectral(4)
- +2: pitch mean/std (librosa.yin)
- +3: mel-band energy (low/mid/high)
- +1: rms std
- +1: onset strength mean
"""

import json
import os
import time
import pickle
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import librosa
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score, precision_score, recall_score
from sklearn.preprocessing import LabelEncoder

BASE_DIR = Path(__file__).resolve().parent.parent
SPLITS_DIR = Path(__file__).resolve().parent / 'datasets' / 'task5_splits'
CACHE_DIR = Path(__file__).resolve().parent / 'datasets' / 'features_cache_v2'
MODEL_DIR = Path(__file__).resolve().parent / 'models'

AUDIO_DIRS = [
    BASE_DIR / 'LOTUSDIS_train' / 'train',
    BASE_DIR / 'LOTUSDIS_dev' / 'dev',
    BASE_DIR / 'LOTUSDIS_test' / 'test',
]

SR = 16000
N_MFCC = 13
MAX_WORKERS = 6

EMERGENCY_KWS = {
    'ช่วย', 'ด้วย', 'มา', 'เร็ว', 'ตอนนี้',
    'เจ็บ', 'หายใจ', 'ปวด', 'เลือด', 'ล้ม',
    'อุบัติเหตุ', 'ไฟไหม้', 'หมดสติ', 'ฉุกเฉิน',
    'โทร', 'หมอ', 'โรงพยาบาล', 'รถพยาบาล',
}


def build_file_index():
    index = {}
    for audio_dir in AUDIO_DIRS:
        if not audio_dir.exists():
            continue
        for f in audio_dir.iterdir():
            if f.suffix == '.wav':
                index[f.name] = str(f)
    print(f"Indexed wav files: {len(index)}")
    return index


def load_target_keywords():
    with open(SPLITS_DIR / 'dataset_summary.json', 'r', encoding='utf-8') as f:
        summary = json.load(f)
    if 'target_vocabulary' in summary:
        keywords = summary['target_vocabulary']['keywords']
    else:
        keywords = summary['target_vocab']
    return sorted(keywords, key=len, reverse=True)


def assign_keyword(sentence, keywords_sorted):
    s = str(sentence)
    for kw in keywords_sorted:
        if kw in s:
            return kw
    return None


def _safe_std(x):
    if x is None or len(x) == 0:
        return 0.0
    return float(np.std(x))


def extract_features_v2(audio_path):
    try:
        y, sr = librosa.load(audio_path, sr=SR)
        if len(y) < SR * 0.05:
            return None

        # Base 43
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC)
        mfcc_mean = np.mean(mfcc, axis=1)

        delta = librosa.feature.delta(mfcc)
        delta_mean = np.mean(delta, axis=1)
        delta2 = librosa.feature.delta(mfcc, order=2)
        delta2_mean = np.mean(delta2, axis=1)

        sc = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        sb = np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr))
        zcr = np.mean(librosa.feature.zero_crossing_rate(y))
        rms = librosa.feature.rms(y=y)[0]
        rms_mean = float(np.mean(rms))

        # Pitch features (+2)
        f0 = librosa.yin(y, fmin=75, fmax=500, sr=sr)
        f0 = f0[np.isfinite(f0)]
        if len(f0) == 0:
            pitch_mean = 0.0
            pitch_std = 0.0
        else:
            pitch_mean = float(np.mean(f0))
            pitch_std = float(np.std(f0))

        # Mel-band energies (+3)
        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=40, power=2.0)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        low_energy = float(np.mean(mel_db[0:10]))
        mid_energy = float(np.mean(mel_db[10:25]))
        high_energy = float(np.mean(mel_db[25:40]))

        # Dynamics (+2)
        rms_std = _safe_std(rms)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_mean = float(np.mean(onset_env)) if len(onset_env) else 0.0

        feat = np.concatenate([
            mfcc_mean, delta_mean, delta2_mean,
            [sc, sb, zcr, rms_mean],
            [pitch_mean, pitch_std],
            [low_energy, mid_energy, high_energy],
            [rms_std, onset_mean],
        ])
        return feat.astype(np.float32)
    except Exception:
        return None


def _extract_worker(args):
    idx, path = args
    return idx, extract_features_v2(path)


def extract_split_binary(df, file_index, keywords_sorted, split_name, limit_rows=None):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_suffix = '_quick' if limit_rows is not None else ''
    cache_X = CACHE_DIR / f'{split_name}_X_v2{cache_suffix}.npy'
    cache_y = CACHE_DIR / f'{split_name}_y_binary_v2{cache_suffix}.npy'

    if cache_X.exists() and cache_y.exists():
        X = np.load(cache_X)
        y = np.load(cache_y).tolist()
        print(f"{split_name}: loaded cache {X.shape}")
        return X, y

    work_items = []
    labels = []
    for row_idx, (_, row) in enumerate(df.iterrows()):
        if limit_rows is not None and row_idx >= limit_rows:
            break
        filename = os.path.basename(row['path'])
        path = file_index.get(filename)
        if not path:
            continue
        kw = assign_keyword(row['sentence'], keywords_sorted)
        if kw is None:
            continue
        work_items.append((len(work_items), path))
        labels.append(1 if kw in EMERGENCY_KWS else 0)

    feats = [None] * len(work_items)
    ok = 0
    bad = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(_extract_worker, it) for it in work_items]
        for i, fut in enumerate(as_completed(futures), start=1):
            idx, f = fut.result()
            if f is None:
                bad += 1
            else:
                feats[idx] = f
                ok += 1
            if i % 2000 == 0 or i == len(work_items):
                elapsed = max(time.time() - t0, 1e-6)
                print(f"{split_name}: {i}/{len(work_items)} ok={ok} bad={bad} rate={i/elapsed:.1f}/s")

    X = []
    y = []
    for i, f in enumerate(feats):
        if f is not None:
            X.append(f)
            y.append(labels[i])

    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.int32)

    np.save(cache_X, X)
    np.save(cache_y, y)
    print(f"{split_name}: extracted {X.shape} and cached")
    return X, y.tolist()


def train_binary(X_train, y_train, X_val, y_val):
    y_train_str = ['emergency' if b == 1 else 'normal' for b in y_train]
    y_val_str = ['emergency' if b == 1 else 'normal' for b in y_val]

    le = LabelEncoder()
    y_train_enc = le.fit_transform(y_train_str)
    y_val_enc = le.transform(y_val_str)

    emg_count = int(np.sum(np.array(y_train) == 1))
    nor_count = len(y_train) - emg_count
    print(f"Train imbalance: normal={nor_count}, emergency={emg_count}")

    results = {}

    # GradientBoosting + sample weight
    weights = np.where(np.array(y_train) == 1, nor_count / max(emg_count, 1), 1.0)
    t0 = time.time()
    gb = GradientBoostingClassifier(
        n_estimators=250,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.85,
        random_state=42,
    )
    gb.fit(X_train, y_train_enc, sample_weight=weights)
    gb_t = time.time() - t0

    gb_val_pred = gb.predict(X_val)
    results['GradientBoosting'] = {
        'model': gb,
        'val_acc': accuracy_score(y_val_enc, gb_val_pred),
        'val_f1_macro': f1_score(y_val_enc, gb_val_pred, average='macro', zero_division=0),
        'time_sec': gb_t,
    }

    # RandomForest + class_weight
    t0 = time.time()
    rf = RandomForestClassifier(
        n_estimators=400,
        max_depth=28,
        min_samples_split=4,
        class_weight='balanced_subsample',
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train_enc)
    rf_t = time.time() - t0

    rf_val_pred = rf.predict(X_val)
    results['RandomForest'] = {
        'model': rf,
        'val_acc': accuracy_score(y_val_enc, rf_val_pred),
        'val_f1_macro': f1_score(y_val_enc, rf_val_pred, average='macro', zero_division=0),
        'time_sec': rf_t,
    }

    best_name = max(results, key=lambda k: results[k]['val_f1_macro'])
    return results, best_name, le


def evaluate_test(model, le, X_test, y_test):
    y_test_str = ['emergency' if b == 1 else 'normal' for b in y_test]
    y_test_enc = le.transform(y_test_str)
    y_pred = model.predict(X_test)

    report = classification_report(y_test_enc, y_pred, target_names=le.classes_, output_dict=True, zero_division=0)
    return {
        'test_accuracy': float(accuracy_score(y_test_enc, y_pred)),
        'test_f1_macro': float(f1_score(y_test_enc, y_pred, average='macro', zero_division=0)),
        'test_f1_weighted': float(f1_score(y_test_enc, y_pred, average='weighted', zero_division=0)),
        'test_precision_macro': float(precision_score(y_test_enc, y_pred, average='macro', zero_division=0)),
        'test_recall_macro': float(recall_score(y_test_enc, y_pred, average='macro', zero_division=0)),
        'classification_report': report,
        'n_test_samples': int(len(X_test)),
    }


def save_artifacts(results, best_name, le, test_eval):
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    best_model = results[best_name]['model']
    model_path = MODEL_DIR / 'audio_binary_v2_model.pkl'
    le_path = MODEL_DIR / 'audio_binary_v2_label_encoder.pkl'
    report_path = MODEL_DIR / 'audio_binary_v2_report.json'

    with open(model_path, 'wb') as f:
        pickle.dump(best_model, f)
    with open(le_path, 'wb') as f:
        pickle.dump(le, f)

    report = {
        'timestamp': pd.Timestamp.now().isoformat(),
        'label_type': 'binary',
        'feature_type': 'V2 (50 dims): MFCC+delta+delta2+spectral + pitch + mel-band + dynamics',
        'sample_rate': SR,
        'best_model': best_name,
        'models': {
            name: {
                'val_accuracy': float(r['val_acc']),
                'val_f1_macro': float(r['val_f1_macro']),
                'training_time_sec': float(r['time_sec']),
            }
            for name, r in results.items()
        },
        'test_evaluation': test_eval,
    }

    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("\nSaved artifacts:")
    print(model_path)
    print(le_path)
    print(report_path)


def main():
    parser = argparse.ArgumentParser(description='Train binary emergency detector with V2 features')
    parser.add_argument('--quick', action='store_true', help='Use a small subset for fast smoke test')
    args = parser.parse_args()

    row_limit = 3000 if args.quick else None

    print("=" * 70)
    print("Train Binary Emergency Detector - V2 Features")
    if args.quick:
        print("Quick mode: enabled (up to 3000 rows/split)")
    print("=" * 70)

    file_index = build_file_index()
    keywords_sorted = load_target_keywords()

    train_df = pd.read_csv(SPLITS_DIR / 'train.csv', engine='python', encoding_errors='ignore')
    val_df = pd.read_csv(SPLITS_DIR / 'validation.csv', engine='python', encoding_errors='ignore')
    test_df = pd.read_csv(SPLITS_DIR / 'test.csv', engine='python', encoding_errors='ignore')

    X_train, y_train = extract_split_binary(train_df, file_index, keywords_sorted, 'train', row_limit)
    X_val, y_val = extract_split_binary(val_df, file_index, keywords_sorted, 'validation', row_limit)
    X_test, y_test = extract_split_binary(test_df, file_index, keywords_sorted, 'test', row_limit)

    print(f"Feature shape: train={X_train.shape}, val={X_val.shape}, test={X_test.shape}")

    results, best_name, le = train_binary(X_train, y_train, X_val, y_val)
    print("\nValidation summary:")
    for name, r in results.items():
        print(f"  {name}: val_acc={r['val_acc']*100:.2f}% val_f1_macro={r['val_f1_macro']*100:.2f}% time={r['time_sec']:.1f}s")
    print(f"Best model: {best_name}")

    test_eval = evaluate_test(results[best_name]['model'], le, X_test, y_test)
    print("\nTest summary:")
    print(f"  acc={test_eval['test_accuracy']*100:.2f}%")
    print(f"  f1_macro={test_eval['test_f1_macro']*100:.2f}%")
    print(f"  f1_weighted={test_eval['test_f1_weighted']*100:.2f}%")

    save_artifacts(results, best_name, le, test_eval)


if __name__ == '__main__':
    main()
