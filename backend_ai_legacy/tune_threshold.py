#!/usr/bin/env python3
"""
Tune decision threshold for binary emergency model.
Default variant is V1. Use --variant v2 to tune the V2 model and caches.
"""

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
from sklearn.metrics import (
    accuracy_score, classification_report, f1_score,
    precision_score, recall_score,
)

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / 'models'


def parse_args():
    parser = argparse.ArgumentParser(description='Tune binary emergency threshold')
    parser.add_argument(
        '--variant',
        choices=['v1', 'v2'],
        default='v1',
        help='Model/cache variant to tune (default: v1)',
    )
    return parser.parse_args()


def get_variant_config(variant):
    if variant == 'v2':
        return {
            'name': 'V2',
            'cache_dir': BASE_DIR / 'datasets' / 'features_cache_v2',
            'cache_suffix': '_v2',
            'model_path': MODEL_DIR / 'audio_binary_v2_model.pkl',
            'label_encoder_path': MODEL_DIR / 'audio_binary_v2_label_encoder.pkl',
            'report_path': MODEL_DIR / 'audio_binary_v2_report.json',
        }

    return {
        'name': 'V1',
        'cache_dir': BASE_DIR / 'datasets' / 'features_cache',
        'cache_suffix': '',
        'model_path': MODEL_DIR / 'audio_binary_model.pkl',
        'label_encoder_path': MODEL_DIR / 'audio_binary_label_encoder.pkl',
        'report_path': MODEL_DIR / 'audio_binary_report.json',
    }


def to_str(labels):
    return ['emergency' if label == 1 else 'normal' for label in labels]


def main():
    args = parse_args()
    config = get_variant_config(args.variant)
    cache_dir = config['cache_dir']
    cache_suffix = config['cache_suffix']

    with open(config['model_path'], 'rb') as f:
        model = pickle.load(f)
    with open(config['label_encoder_path'], 'rb') as f:
        le = pickle.load(f)

    X_val = np.load(cache_dir / f'validation_X{cache_suffix}.npy')
    y_val = np.load(cache_dir / f'validation_y_binary{cache_suffix}.npy').tolist()
    X_test = np.load(cache_dir / f'test_X{cache_suffix}.npy')
    y_test = np.load(cache_dir / f'test_y_binary{cache_suffix}.npy').tolist()

    y_val_enc = le.transform(to_str(y_val))
    y_test_enc = le.transform(to_str(y_test))

    emergency_encoded = int(le.transform(['emergency'])[0])
    normal_encoded = int(le.transform(['normal'])[0])

    model_classes = model.classes_
    emg_proba_idx = int(np.where(model_classes == emergency_encoded)[0][0])

    val_proba = model.predict_proba(X_val)[:, emg_proba_idx]
    test_proba = model.predict_proba(X_test)[:, emg_proba_idx]

    print("=" * 65)
    print(f"  Threshold Tuning ({config['name']} / Val set)")
    print("=" * 65)
    print(f"{'Threshold':>10} {'Acc':>8} {'Emg Prec':>10} {'Emg Rec':>10} {'Emg F1':>8}")
    print("-" * 65)

    best_threshold = 0.5
    best_f1 = 0.0

    for thr in np.arange(0.05, 0.55, 0.05):
        y_pred = np.where(val_proba >= thr, emergency_encoded, normal_encoded)
        acc = accuracy_score(y_val_enc, y_pred)
        prec = precision_score(y_val_enc, y_pred, pos_label=emergency_encoded, zero_division=0)
        rec = recall_score(y_val_enc, y_pred, pos_label=emergency_encoded, zero_division=0)
        f1 = f1_score(y_val_enc, y_pred, pos_label=emergency_encoded, zero_division=0)
        marker = " ◀" if f1 > best_f1 else ""
        if f1 > best_f1:
            best_f1 = f1
            best_threshold = thr
        print(f"{thr:>10.2f} {acc*100:>7.2f}% {prec*100:>9.2f}% {rec*100:>9.2f}% {f1*100:>7.2f}%{marker}")

    print(f"\n  Best threshold (by emergency F1): {best_threshold:.2f}")

    print("\n" + "=" * 65)
    print(f"  Test Evaluation — {config['name']} / threshold={best_threshold:.2f}")
    print("=" * 65)

    y_test_pred = np.where(test_proba >= best_threshold, emergency_encoded, normal_encoded)
    print(classification_report(y_test_enc, y_test_pred, target_names=le.classes_, zero_division=0))

    report_path = config['report_path']
    if report_path.exists():
        with open(report_path, 'r', encoding='utf-8') as f:
            report = json.load(f)
    else:
        report = {}

    report['best_threshold'] = float(best_threshold)
    report['threshold_selection_metric'] = 'emergency_f1'
    report['test_evaluation_at_best_threshold'] = {
        'threshold': float(best_threshold),
        'accuracy': float(accuracy_score(y_test_enc, y_test_pred)),
        'emergency_precision': float(precision_score(y_test_enc, y_test_pred, pos_label=emergency_encoded, zero_division=0)),
        'emergency_recall': float(recall_score(y_test_enc, y_test_pred, pos_label=emergency_encoded, zero_division=0)),
        'emergency_f1': float(f1_score(y_test_enc, y_test_pred, pos_label=emergency_encoded, zero_division=0)),
    }

    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"  Threshold saved to {report_path}")


if __name__ == '__main__':
    main()
