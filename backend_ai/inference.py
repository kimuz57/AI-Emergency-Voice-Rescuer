#!/usr/bin/env python3
"""
Guardian AI - Inference Server
REST API for audio analysis and emergency detection
"""

import json
import sys
import os
from pathlib import Path
import base64
import pickle
import io
from datetime import datetime

try:
    import librosa
    import numpy as np
    from flask import Flask, request, jsonify
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False
    print("⚠️  Flask not installed. Install: pip install flask")

app = Flask(__name__)

SR = 16000
N_MFCC = 13
DEFAULT_EMERGENCY_THRESHOLD = 0.35
MODEL_DIR = Path(__file__).resolve().parent / 'models'

class AIInference:
    def __init__(self):
        self.binary_model = None
        self.binary_label_encoder = None
        self.keyword_model = None
        self.keyword_label_encoder = None
        self.emergency_threshold = DEFAULT_EMERGENCY_THRESHOLD
        self._load_models()
        
    def _load_pickle_model(self, model_path):
        """Load estimator from pickle. Supports plain estimator or dict payload."""
        try:
            with open(model_path, 'rb') as f:
                data = pickle.load(f)
            if isinstance(data, dict):
                model = data.get('model') or data.get('estimator')
            else:
                model = data

            if model is None:
                raise ValueError('Loaded object does not contain a valid model')
            return model
        except Exception as e:
            print(f"❌ Error loading model {model_path}: {e}")
            return None

    def _load_models(self):
        """Load binary and keyword models produced by train_audio.py."""
        binary_model_path = MODEL_DIR / 'audio_binary_model.pkl'
        binary_le_path = MODEL_DIR / 'audio_binary_label_encoder.pkl'
        keyword_model_path = MODEL_DIR / 'audio_keyword_model.pkl'
        keyword_le_path = MODEL_DIR / 'audio_keyword_label_encoder.pkl'

        if binary_model_path.exists() and binary_le_path.exists():
            self.binary_model = self._load_pickle_model(binary_model_path)
            try:
                with open(binary_le_path, 'rb') as f:
                    self.binary_label_encoder = pickle.load(f)
                print(f"✓ Binary model loaded: {binary_model_path}")
            except Exception as e:
                print(f"❌ Error loading binary label encoder: {e}")

        if keyword_model_path.exists() and keyword_le_path.exists():
            self.keyword_model = self._load_pickle_model(keyword_model_path)
            try:
                with open(keyword_le_path, 'rb') as f:
                    self.keyword_label_encoder = pickle.load(f)
                print(f"✓ Keyword model loaded: {keyword_model_path}")
            except Exception as e:
                print(f"❌ Error loading keyword label encoder: {e}")

        if self.binary_model is None:
            print(f"⚠️  Binary model not available at {binary_model_path}")
        if self.keyword_model is None:
            print(f"⚠️  Keyword model not available at {keyword_model_path}")

        report_path = MODEL_DIR / 'audio_binary_report.json'
        if report_path.exists():
            try:
                with open(report_path, 'r', encoding='utf-8') as f:
                    report = json.load(f)
                tuned = report.get('best_threshold')
                if tuned is not None:
                    self.emergency_threshold = float(tuned)
                    print(f"✓ Loaded tuned emergency threshold: {self.emergency_threshold:.2f}")
            except Exception as e:
                print(f"⚠️  Could not load threshold from report: {e}")

        return self.binary_model is not None

    def extract_features(self, audio_data, sr=16000):
        """Extract the same 43-dim feature vector used during training."""
        try:
            if isinstance(audio_data, bytes):
                try:
                    # Primary path: bytes contain encoded WAV/MP3 container data.
                    y, sr = librosa.load(io.BytesIO(audio_data), sr=SR, mono=True)
                except Exception:
                    # Fallback path: bytes are raw float32 PCM from client.
                    y = np.frombuffer(audio_data, dtype=np.float32)
                    sr = SR
            else:
                y = np.frombuffer(audio_data, dtype=np.float32)

            if len(y) < SR * 0.05:
                return None

            # MFCC + delta + delta2
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC)
            mfcc_mean = np.mean(mfcc, axis=1)
            delta = librosa.feature.delta(mfcc)
            delta_mean = np.mean(delta, axis=1)
            delta2 = librosa.feature.delta(mfcc, order=2)
            delta2_mean = np.mean(delta2, axis=1)

            # Spectral features
            sc = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
            sb = np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr))
            zcr = np.mean(librosa.feature.zero_crossing_rate(y))
            rms = np.mean(librosa.feature.rms(y=y))

            features = np.concatenate([
                mfcc_mean,
                delta_mean,
                delta2_mean,
                [sc, sb, zcr, rms],
            ])

            return features.reshape(1, -1)

        except Exception as e:
            print(f"Error extracting features: {e}")
            return None

    def _predict_keyword(self, features):
        if self.keyword_model is None or self.keyword_label_encoder is None:
            return ""
        try:
            pred = self.keyword_model.predict(features)[0]
            return str(self.keyword_label_encoder.inverse_transform([pred])[0])
        except Exception as e:
            print(f"Keyword prediction error: {e}")
            return ""

    def _predict_emergency(self, features):
        if self.binary_model is None or self.binary_label_encoder is None:
            return 0, 0.0

        proba = self.binary_model.predict_proba(features)[0]
        emergency_encoded = int(self.binary_label_encoder.transform(['emergency'])[0])

        model_classes = getattr(self.binary_model, 'classes_', None)
        if model_classes is None:
            return 0, 0.0

        emg_idx = int(np.where(model_classes == emergency_encoded)[0][0])
        emergency_prob = float(proba[emg_idx])

        is_alert = int(emergency_prob >= self.emergency_threshold)
        confidence = emergency_prob if is_alert else (1.0 - emergency_prob)
        return is_alert, confidence
    
    def analyze_audio(self, audio_buffer, **kwargs):
        """
        Analyze audio and return detection result
        
        Args:
            audio_buffer: WAV audio data (bytes or base64 string)
            
        Returns:
            dict: Detection result
        """
        start_time = datetime.now()
        
        try:
            # Handle base64 encoded input
            if isinstance(audio_buffer, str):
                try:
                    audio_buffer = base64.b64decode(audio_buffer)
                except:
                    pass
            
            # Extract features
            features = self.extract_features(audio_buffer)
            if features is None:
                return {
                    "success": False,
                    "isAlert": 0,
                    "keyword": "",
                    "level": 0,
                    "confidence": 0,
                    "transcribedText": "",
                    "processingTime": int((datetime.now() - start_time).total_seconds() * 1000),
                    "error": "Feature extraction failed"
                }
            
            is_alert, confidence = self._predict_emergency(features)
            keyword_pred = self._predict_keyword(features)
            
            # Assign level based on confidence
            if not is_alert:
                level = 1  # Low priority
                keyword = keyword_pred or "normal"
            else:
                # Simple heuristic: confidence determines severity
                if confidence >= 0.95:
                    level = 4  # Critical
                    keyword = keyword_pred or "emergency"
                elif confidence >= 0.85:
                    level = 3  # High
                    keyword = keyword_pred or "urgent"
                elif confidence >= 0.70:
                    level = 2  # Medium
                    keyword = keyword_pred or "alert"
                else:
                    level = 1  # Low
                    keyword = keyword_pred or "caution"
            
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            result = {
                "success": True,
                "isAlert": is_alert,
                "keyword": keyword,
                "level": level,
                "confidence": round(confidence, 4),
                "transcribedText": f"Detected: {keyword}",
                "processingTime": processing_time
            }
            
            return result
            
        except Exception as e:
            print(f"Error in analysis: {e}")
            return {
                "success": False,
                "isAlert": 0,
                "keyword": "",
                "level": 0,
                "confidence": 0,
                "transcribedText": "",
                "processingTime": int((datetime.now() - start_time).total_seconds() * 1000),
                "error": str(e)
            }

# Initialize inference engine
inference = AIInference()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "service": "Guardian AI Inference",
        "models": {
            "binary": inference.binary_model is not None,
            "keyword": inference.keyword_model is not None,
            "emergency_threshold": inference.emergency_threshold,
        },
        "timestamp": datetime.now().isoformat()
    })

@app.route('/api/v1/audio/analyze', methods=['POST'])
def analyze():
    """
    POST /api/v1/audio/analyze
    
    Request:
    {
        "audioBuffer": "base64_encoded_audio",
        "deviceId": "device001",
        "sampleRate": 16000,
        "duration": 3.5
    }
    
    Response:
    {
        "success": true,
        "isAlert": 1,
        "keyword": "help",
        "level": 4,
        "confidence": 0.95,
        "transcribedText": "help me please",
        "processingTime": 234
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'audioBuffer' not in data:
            return jsonify({
                "success": False,
                "error": "Missing audioBuffer"
            }), 400
        
        result = inference.analyze_audio(
            data['audioBuffer'],
            deviceId=data.get('deviceId'),
            sampleRate=data.get('sampleRate', 16000)
        )
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

def run_server(host='0.0.0.0', port=3000):
    if not FLASK_AVAILABLE:
        print("❌ Flask is required to run inference server")
        print("Install: pip install flask")
        return
    
    print(f"""
╔═════════════════════════════════════════════╗
║  Guardian AI - Inference Server             ║
║  Listening on {host}:{port}
╚═════════════════════════════════════════════╝
    """)
    
    app.run(host=host, port=port, debug=False)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--server':
        run_server(port=int(sys.argv[2]) if len(sys.argv) > 2 else 3000)
    else:
        print("Usage:")
        print("  python inference.py --server [port]")
        print("  python inference.py --server 3000")
