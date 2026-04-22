#!/usr/bin/env python3
"""
Retrain Binary Emergency Detection only
- Uses cached .npy features (no re-extraction needed)
- Fixes class imbalance with class_weight='balanced'
- Evaluates with macro F1 to properly measure emergency recall
"""

import numpy as np
import pickle
import json
import time
from pathlib import Path
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score,
    classification_report
)
import pandas as pd

CACHE_DIR = Path(__file__).resolve().parent / 'datasets' / 'features_cache'
MODEL_DIR = Path(__file__).resolve().parent / 'models'

def load_cache():
    print("Loading cached features...")
    X_train = np.load(CACHE_DIR / 'train_X.npy')
    X_val   = np.load(CACHE_DIR / 'validation_X.npy')
    X_test  = np.load(CACHE_DIR / 'test_X.npy')
    y_train_bin = np.load(CACHE_DIR / 'train_y_binary.npy').tolist()
    y_val_bin   = np.load(CACHE_DIR / 'validation_y_binary.npy').tolist()
    y_test_bin  = np.load(CACHE_DIR / 'test_y_binary.npy').tolist()
    print(f"  Train: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape}")
    return X_train, X_val, X_test, y_train_bin, y_val_bin, y_test_bin


def train_binary(X_train, y_train, X_val, y_val):
    # Convert int labels to string
    y_tr = ['emergency' if b == 1 else 'normal' for b in y_train]
    y_v  = ['emergency' if b == 1 else 'normal' for b in y_val]

    le = LabelEncoder()
    y_tr_enc = le.fit_transform(y_tr)
    y_v_enc  = le.transform(y_v)

    emg_count = sum(y_train)
    nor_count = len(y_train) - emg_count
    print(f"\n  Class distribution (train): normal={nor_count}, emergency={emg_count}")
    print(f"  Imbalance ratio: 1:{nor_count//emg_count}")

    results = {}

    # --- GradientBoosting (no native class_weight, use sample_weight) ---
    print(f"\n  🌳 Training GradientBoosting (sample_weight)...")
    t0 = time.time()
    weights = np.where(np.array(y_train) == 1,
                       nor_count / emg_count,   # upweight emergency
                       1.0)
    gb = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.1,
        subsample=0.8,
        random_state=42,
    )
    gb.fit(X_train, y_tr_enc, sample_weight=weights)
    gb_time = time.time() - t0

    gb_val_pred = gb.predict(X_val)
    gb_val_f1   = f1_score(y_v_enc, gb_val_pred, average='macro', zero_division=0)
    gb_val_acc  = accuracy_score(y_v_enc, gb_val_pred)
    print(f"     Val Acc:    {gb_val_acc*100:.2f}%")
    print(f"     Val F1 (macro): {gb_val_f1*100:.2f}%")
    print(f"     Time:       {gb_time:.0f}s")
    results['GradientBoosting'] = {'model': gb, 'le': le, 'val_f1': gb_val_f1, 'val_acc': gb_val_acc, 'time': gb_time}

    # --- RandomForest with class_weight='balanced' ---
    print(f"\n  🌲 Training RandomForest (class_weight=balanced)...")
    t0 = time.time()
    rf = RandomForestClassifier(
        n_estimators=300,
        max_depth=25,
        min_samples_split=5,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_tr_enc)
    rf_time = time.time() - t0

    rf_val_pred = rf.predict(X_val)
    rf_val_f1   = f1_score(y_v_enc, rf_val_pred, average='macro', zero_division=0)
    rf_val_acc  = accuracy_score(y_v_enc, rf_val_pred)
    print(f"     Val Acc:    {rf_val_acc*100:.2f}%")
    print(f"     Val F1 (macro): {rf_val_f1*100:.2f}%")
    print(f"     Time:       {rf_time:.0f}s")
    results['RandomForest'] = {'model': rf, 'le': le, 'val_f1': rf_val_f1, 'val_acc': rf_val_acc, 'time': rf_time}

    best_name = max(results, key=lambda k: results[k]['val_f1'])
    print(f"\n  🏆 Best: {best_name} (Val F1 macro={results[best_name]['val_f1']*100:.2f}%)")
    return results, best_name, le


def evaluate_test(model, le, X_test, y_test):
    y_ts = ['emergency' if b == 1 else 'normal' for b in y_test]
    y_ts_enc = le.transform(y_ts)
    y_pred = model.predict(X_test)

    acc  = accuracy_score(y_ts_enc, y_pred)
    f1m  = f1_score(y_ts_enc, y_pred, average='macro', zero_division=0)
    f1w  = f1_score(y_ts_enc, y_pred, average='weighted', zero_division=0)
    prec = precision_score(y_ts_enc, y_pred, average='macro', zero_division=0)
    rec  = recall_score(y_ts_enc, y_pred, average='macro', zero_division=0)

    print(f"\n{'='*60}")
    print(f"  Test Evaluation")
    print(f"{'='*60}")
    print(f"  Accuracy:       {acc*100:.2f}%")
    print(f"  F1 (macro):     {f1m*100:.2f}%")
    print(f"  F1 (weighted):  {f1w*100:.2f}%")
    print(f"  Precision (macro): {prec*100:.2f}%")
    print(f"  Recall (macro):    {rec*100:.2f}%")
    print()
    print(classification_report(y_ts_enc, y_pred, target_names=le.classes_, zero_division=0))

    return {'test_accuracy': acc, 'test_f1_macro': f1m, 'test_f1_weighted': f1w,
            'test_precision_macro': prec, 'test_recall_macro': rec,
            'n_test_samples': len(X_test)}


def save(results, best_name, le, test_report):
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    best = results[best_name]

    model_path = MODEL_DIR / 'audio_binary_model.pkl'
    le_path    = MODEL_DIR / 'audio_binary_label_encoder.pkl'
    report_path = MODEL_DIR / 'audio_binary_report.json'

    with open(model_path, 'wb') as f:
        pickle.dump(best['model'], f)
    with open(le_path, 'wb') as f:
        pickle.dump(le, f)

    report = {
        'timestamp': pd.Timestamp.now().isoformat(),
        'label_type': 'binary',
        'note': 'Retrained with class_weight=balanced / sample_weight to fix emergency=0 recall',
        'best_model': best_name,
        'models': {n: {'val_accuracy': r['val_acc'], 'val_f1_macro': r['val_f1'],
                        'training_time_sec': r['time']}
                   for n, r in results.items()},
        'test_evaluation': test_report,
    }
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n  💾 Saved:")
    print(f"     {model_path}")
    print(f"     {le_path}")
    print(f"     {report_path}")


def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║  Retrain Binary Emergency Detection (Balanced)  ║")
    print("╚══════════════════════════════════════════════════╝\n")

    X_train, X_val, X_test, y_tr_bin, y_v_bin, y_ts_bin = load_cache()

    results, best_name, le = train_binary(X_train, y_tr_bin, X_val, y_v_bin)

    test_report = evaluate_test(results[best_name]['model'], le, X_test, y_ts_bin)

    save(results, best_name, le, test_report)

    print("\n✅ Done!")


if __name__ == '__main__':
    main()
