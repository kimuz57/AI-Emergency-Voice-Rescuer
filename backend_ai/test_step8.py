#!/usr/bin/env python3
"""
Step 8: Test Model on Final Test Set
Evaluate the trained model on the held-out test split.
"""

import hashlib
import pandas as pd
import numpy as np
import pickle
import os
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

class TestEvaluator:
    def __init__(self, model_path='models/trained_model.pkl', label_path='models/trained_model_labels.pkl'):
        self.model_path = model_path
        self.label_path = label_path
        self.model = None
        self.label_encoder = None
        
    def load_model(self):
        if not os.path.exists(self.model_path) or not os.path.exists(self.label_path):
            print(f"❌ Model or label encoder file not found.")
            print(f"   Model: {self.model_path}")
            print(f"   Labels: {self.label_path}")
            return False
        
        with open(self.model_path, 'rb') as f:
            self.model = pickle.load(f)
        with open(self.label_path, 'rb') as f:
            self.label_encoder = pickle.load(f)
        print(f"✓ Loaded model and label encoder")
        return True
    
    def extract_features(self, sentence_text):
        features = [
            len(sentence_text),
            len(sentence_text.split()),
            ord(sentence_text[0]) if sentence_text else 0,
            sum(ord(c) for c in sentence_text) % 256,
            len([c for c in sentence_text if c in 'เแโไ']),
            1.0 if any(c.isdigit() for c in sentence_text) else 0.0,
            sentence_text.count('า'),
            sentence_text.count('ำ'),
            sentence_text.count('ะ'),
            sentence_text.count('ั'),
            len(set(sentence_text)),
            sentence_text.count(' '),
            len([c for c in sentence_text if c in 'คกขค']),
            len([c for c in sentence_text if c in 'เแโไ']),
            int(hashlib.sha256(sentence_text.encode('utf-8')).hexdigest(), 16) % 256,
        ]
        return np.array(features, dtype=float)
    
    def load_test_data(self, csv_path='datasets/splits/test.csv'):
        print(f"📂 Loading test data from {csv_path}")
        df = pd.read_csv(csv_path, engine='python', encoding_errors='ignore')
        X = []
        y = []
        
        for _, row in df.iterrows():
            X.append(self.extract_features(row['sentence']))
            y.append(row['sentence'])
        
        print(f"✓ Loaded {len(X)} test samples")
        return np.array(X), np.array(y)
    
    def evaluate(self, X_test, y_test):
        print(f"\n📊 Evaluating on test set ({len(X_test)} samples)")
        y_test_enc = self.label_encoder.transform(y_test)
        y_pred_enc = self.model.predict(X_test)
        
        acc = accuracy_score(y_test_enc, y_pred_enc)
        report = classification_report(y_test_enc, y_pred_enc, target_names=self.label_encoder.classes_, zero_division=0)
        cm = confusion_matrix(y_test_enc, y_pred_enc)
        
        print(f"\n✅ Test Accuracy: {acc*100:.2f}%")
        print(f"\n--- Classification Report ---\n{report}")
        print(f"\n--- Confusion Matrix ---\n{cm}")
        
        return acc


def main():
    evaluator = TestEvaluator()
    if not evaluator.load_model():
        return
    
    X_test, y_test = evaluator.load_test_data()
    evaluator.evaluate(X_test, y_test)

if __name__ == '__main__':
    main()
