#!/usr/bin/env python3
"""
Guardian AI - Utility Functions
Common functions for audio processing and model handling
"""

import os
import numpy as np
from pathlib import Path

def ensure_directories():
    """Create necessary directories if they don't exist"""
    dirs = [
        'datasets/emergency',
        'datasets/normal',
        'datasets/custom',
        'models',
        'logs'
    ]
    
    for dir_path in dirs:
        os.makedirs(dir_path, exist_ok=True)
    
    return True

def get_audio_files(directory):
    """Get all audio files from directory"""
    audio_extensions = ('.wav', '.mp3', '.ogg', '.flac', '.m4a')
    return [f for f in os.listdir(directory) if f.lower().endswith(audio_extensions)]

def calculate_metrics(y_true, y_pred):
    """Calculate precision, recall, f1 score"""
    from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix
    
    metrics = {
        'precision': precision_score(y_true, y_pred, zero_division=0),
        'recall': recall_score(y_true, y_pred, zero_division=0),
        'f1': f1_score(y_true, y_pred, zero_division=0),
        'confusion_matrix': confusion_matrix(y_true, y_pred).tolist()
    }
    
    return metrics

def log_training_info(log_file='logs/training.log'):
    """Log training information"""
    os.makedirs('logs', exist_ok=True)
    return open(log_file, 'a')
