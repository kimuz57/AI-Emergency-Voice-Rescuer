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

class AIInference:
    def __init__(self, model_path='models/trained_model_v3.pkl'):
        self.model = None
        self.scaler = None
        self.label_encoder = None
        self.load_model(model_path)
        
    def load_model(self, model_path):
        """Load trained model"""
        if not os.path.exists(model_path):
            fallback = 'models/model.pkl'
            print(f"⚠️  Model not found: {model_path}")
            if os.path.exists(fallback):
                print(f"🔁 Falling back to default model: {fallback}")
                model_path = fallback
            else:
                return False
        
        try:
            with open(model_path, 'rb') as f:
                data = pickle.load(f)

            # Support both direct estimator and dictionary payloads
            if isinstance(data, dict):
                self.model = data.get('model') or data.get('estimator')
                self.scaler = data.get('scaler')
                self.label_encoder = data.get('label_encoder')
            else:
                self.model = data

            if self.model is None:
                raise ValueError('Loaded object does not contain a valid model')

            print(f"✓ Model loaded successfully from {model_path}")
            return True
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            return False
    
    def extract_features(self, audio_data, sr=16000):
        """Extract features from audio buffer"""
        try:
            # Load audio data
            if isinstance(audio_data, bytes):
                y, sr = librosa.load(io.BytesIO(audio_data), sr=sr, mono=True)
            else:
                y = np.frombuffer(audio_data, dtype=np.float32)
            
            # MFCC features
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
            
            return features.reshape(1, -1)
            
        except Exception as e:
            print(f"Error extracting features: {e}")
            return None
    
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
            
            # Normalize features if scaler is available
            if self.scaler is not None:
                features = self.scaler.transform(features)
            
            # Predict
            prediction = self.model.predict(features)[0]
            probability = self.model.predict_proba(features)[0]
            
            # Determine alert level
            is_alert = int(prediction)
            confidence = float(probability[1]) if is_alert else float(probability[0])
            
            # Assign level based on confidence
            if not is_alert:
                level = 1  # Low priority
                keyword = "normal"
            else:
                # Simple heuristic: confidence determines severity
                if confidence >= 0.95:
                    level = 4  # Critical
                    keyword = "emergency"
                elif confidence >= 0.85:
                    level = 3  # High
                    keyword = "urgent"
                elif confidence >= 0.70:
                    level = 2  # Medium
                    keyword = "alert"
                else:
                    level = 1  # Low
                    keyword = "caution"
            
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
