#!/usr/bin/env python3
"""
Guardian AI - Audio Detection Model Training
Trains emergency keyword detection model using LOTUSDIS dataset
"""

import os
import json
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import pickle
import sys

# Try importing ML libraries
try:
    import librosa
    import numpy as np
    from sklearn.svm import SVC
    from sklearn.ensemble import RandomForestClassifier
    print("✓ All ML libraries imported successfully")
except ImportError as e:
    print(f"⚠️  Warning: Missing library: {e}")
    print("Run: pip install -r requirements.txt")

# Alert level keywords
KEYWORDS_DATABASE = {
    4: ['help', 'ช่วย', 'ฉุกเฉิน', 'crisis', 'สัญญาณเตือน'],  # Critical
    3: ['hurt', 'pain', 'ไม่สบาย', 'ปวด', 'ร้องขาดใจ'],  # High
    2: ['medicine', 'needed', 'need', 'ต้องการ', 'ยา'],  # Medium
    1: ['hello', 'call', 'ok', 'สวัสดี', 'โอเค']  # Low
}

class VoiceDetectionModel:
    def __init__(self, model_path='models/model.pkl'):
        self.model = None
        self.scaler = StandardScaler()
        self.model_path = model_path
        os.makedirs('models', exist_ok=True)
        
    def extract_features(self, audio_file):
        """
        Extract MFCC and spectral features from audio
        
        Args:
            audio_file: Path to WAV file
            
        Returns:
            numpy array of features
        """
        try:
            y, sr = librosa.load(audio_file, sr=16000, mono=True)
            
            # MFCC features (13 coefficients)
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            mfcc_mean = np.mean(mfcc, axis=1)
            
            # Spectral features
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            zero_crossing_rate = librosa.feature.zero_crossing_rate(y)[0]
            
            # Combine features
            features = np.concatenate([
                mfcc_mean,
                [np.mean(spectral_centroid)],
                [np.mean(zero_crossing_rate)]
            ])
            
            return features
            
        except Exception as e:
            print(f"Error extracting features from {audio_file}: {e}")
            return None
    
    def load_dataset(self, dataset_dir='datasets'):
        """
        Load training data from dataset directory structure:
        datasets/
        ├── emergency/     (label=1)
        └── normal/        (label=0)
        """
        X_train = []
        y_train = []
        class_distribution = {0: 0, 1: 0}
        
        # Load normal samples (label=0)
        normal_dir = os.path.join(dataset_dir, 'normal')
        if os.path.exists(normal_dir):
            for audio_file in os.listdir(normal_dir):
                if audio_file.endswith(('.wav', '.mp3')):
                    features = self.extract_features(os.path.join(normal_dir, audio_file))
                    if features is not None:
                        X_train.append(features)
                        y_train.append(0)
                        class_distribution[0] += 1
                        
        # Load emergency samples (label=1)
        emergency_dir = os.path.join(dataset_dir, 'emergency')
        if os.path.exists(emergency_dir):
            for audio_file in os.listdir(emergency_dir):
                if audio_file.endswith(('.wav', '.mp3')):
                    features = self.extract_features(os.path.join(emergency_dir, audio_file))
                    if features is not None:
                        X_train.append(features)
                        y_train.append(1)
                        class_distribution[1] += 1
        
        print(f"✓ Dataset loaded: {len(X_train)} samples")
        print(f"  - Normal: {class_distribution[0]}")
        print(f"  - Emergency: {class_distribution[1]}")
        
        return np.array(X_train), np.array(y_train)
    
    def train(self, dataset_dir='datasets', test_size=0.2):
        """
        Train the model on provided dataset
        """
        print("\n📚 Loading dataset...")
        X, y = self.load_dataset(dataset_dir)
        
        if len(X) == 0:
            print("❌ No training data found. Create datasets/emergency/ and datasets/normal/ directories")
            return False
        
        print("\n🔄 Splitting data (80/20)...")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )
        
        print("📊 Training model...")
        # Use Random Forest for better results
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=15,
            random_state=42,
            n_jobs=-1
        )
        
        # Normalize features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Train
        self.model.fit(X_train_scaled, y_train)
        
        # Evaluate
        train_score = self.model.score(X_train_scaled, y_train)
        test_score = self.model.score(X_test_scaled, y_test)
        
        print(f"\n✓ Training complete!")
        print(f"  - Train accuracy: {train_score:.2%}")
        print(f"  - Test accuracy: {test_score:.2%}")
        
        # Save model
        self.save()
        return True
    
    def save(self):
        """Save trained model and scaler"""
        if self.model is None:
            print("❌ No model to save. Train first!")
            return False
        
        with open(self.model_path, 'wb') as f:
            pickle.dump({
                'model': self.model,
                'scaler': self.scaler
            }, f)
        
        print(f"✓ Model saved to {self.model_path}")
        return True
    
    def load(self):
        """Load pre-trained model"""
        if not os.path.exists(self.model_path):
            print(f"❌ Model not found at {self.model_path}")
            return False
        
        with open(self.model_path, 'rb') as f:
            data = pickle.load(f)
            self.model = data['model']
            self.scaler = data['scaler']
        
        print(f"✓ Model loaded from {self.model_path}")
        return True

def main():
    model = VoiceDetectionModel()
    
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        # Test mode
        if model.load():
            print("\n✓ Model ready for inference")
    else:
        # Training mode
        print("""
╔═════════════════════════════════════════════╗
║  Guardian AI - Training Script              ║
║  Emergency Voice Detection Model            ║
╚═════════════════════════════════════════════╝
        """)
        
        # Create sample dataset directory if not exists
        os.makedirs('datasets/emergency', exist_ok=True)
        os.makedirs('datasets/normal', exist_ok=True)
        
        print("\n📁 Dataset structure:")
        print("  datasets/")
        print("  ├── emergency/    ← Add emergency audio files here (.wav)")
        print("  └── normal/       ← Add normal audio files here (.wav)")
        
        if model.train():
            print("\n✓ Training successful!")
        else:
            print("\n⚠️  Training skipped - add audio files first")

if __name__ == "__main__":
    main()
