#!/usr/bin/env python3
"""
Guardian AI - Dataset Preparation Script
Merge train/dev/test splits and prepare data for model training
"""

import os
import pandas as pd
import numpy as np
from pathlib import Path
import json
from tqdm import tqdm

class DatasetPreparator:
    def __init__(self, root_dir='..'):
        self.root_dir = root_dir
        self.annotations_dir = os.path.join(root_dir, 'LOTUSDIS_annotations_extracted', 'annotation')
        
    def load_split_files(self):
        """Load individual train/dev/test CSV files and combine them"""
        splits = {}
        total_rows = 0
        
        for split_name in ['train', 'dev', 'test']:
            file_path = os.path.join(self.annotations_dir, f'{split_name}.csv')
            if os.path.exists(file_path):
                try:
                    df = pd.read_csv(file_path, engine='python', encoding_errors='ignore')
                    df['split'] = split_name  # Add split column
                    splits[split_name] = df
                    total_rows += len(df)
                    print(f"✓ Loaded {split_name}.csv: {len(df)} rows")
                except Exception as e:
                    print(f"❌ Error loading {split_name}.csv: {e}")
            else:
                print(f"⚠️  {file_path} not found")
        
        return splits, total_rows
    
    def combine_datasets(self):
        """Combine train/dev/test splits into single dataset"""
        splits, _ = self.load_split_files()
        
        if not splits:
            print("❌ No split files found")
            return None
        
        # Combine all splits
        combined_df = pd.concat(splits.values(), ignore_index=True)
        print(f"✓ Combined dataset: {len(combined_df)} total rows")
        
        # Save combined dataset
        output_file = os.path.join(self.root_dir, 'backend_ai', 'datasets', 'combined_dataset.csv')
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        combined_df.to_csv(output_file, index=False)
        print(f"✓ Saved combined dataset to: {output_file}")
        
        return combined_df
    
    def load_annotations(self):
        """Load combined dataset or create it if not exists"""
        combined_file = os.path.join(self.root_dir, 'backend_ai', 'datasets', 'combined_dataset.csv')
        
        if os.path.exists(combined_file):
            try:
                df = pd.read_csv(combined_file, engine='python', encoding_errors='ignore')
                print(f"✓ Loaded combined dataset: {len(df)} rows")
                return df
            except Exception as e:
                print(f"❌ Error loading combined dataset: {e}")
        
        # If combined file doesn't exist, create it
        print("📝 Combined dataset not found, creating from split files...")
        return self.combine_datasets()
    
    def explore_dataset(self):
        """Explore dataset structure and statistics"""
        df = self.load_annotations()
        if df is None:
            return
        
        print("\n📊 Dataset Structure:")
        print(f"  - Total samples: {len(df)}")
        print(f"  - Columns: {df.columns.tolist()}")
        print(f"\n  - Shape: {df.shape}")
        
        if 'split' in df.columns:
            print(f"\n  - Splits:")
            print(df['split'].value_counts())
        
        print(f"\n  - Missing values:")
        print(df.isnull().sum())
        
    def get_split_summary(self):
        """Get train/dev/test split summary"""
        df = self.load_annotations()
        if df is None:
            return
        
        print("\n📈 Split Summary:")
        if 'split' in df.columns:
            train_split = df[df['split'] == 'train']
            dev_split = df[df['split'] == 'dev']
            test_split = df[df['split'] == 'test']
            
            print(f"  - Train: {len(train_split)} samples (~88h)")
            print(f"  - Dev: {len(dev_split)} samples (~12.8h)")
            print(f"  - Test: {len(test_split)} samples (~13.3h)")
            print(f"  - Total: {len(df)} samples (~114h)")
        
        return df
    
    def create_train_dev_test_split(self):
        """Create separate train/dev/test CSV files"""
        df = self.load_annotations()
        if df is None:
            return
        
        # Create datasets directory if not exists
        output_dir = os.path.join(self.root_dir, 'backend_ai', 'datasets')
        os.makedirs(output_dir, exist_ok=True)
        
        try:
            if 'split' in df.columns:
                train_df = df[df['split'] == 'train']
                dev_df = df[df['split'] == 'dev']
                test_df = df[df['split'] == 'test']
            else:
                # If no split column, use default splits
                n = len(df)
                train_df = df[:int(0.8*n)]
                dev_df = df[int(0.8*n):int(0.9*n)]
                test_df = df[int(0.9*n):]
            
            # Save splits
            train_df.to_csv(os.path.join(output_dir, 'train.csv'), index=False)
            dev_df.to_csv(os.path.join(output_dir, 'dev.csv'), index=False)
            test_df.to_csv(os.path.join(output_dir, 'test.csv'), index=False)
            
            print(f"\n✓ Created split files:")
            print(f"  - {output_dir}/train.csv ({len(train_df)} rows)")
            print(f"  - {output_dir}/dev.csv ({len(dev_df)} rows)")
            print(f"  - {output_dir}/test.csv ({len(test_df)} rows)")
            
        except Exception as e:
            print(f"❌ Error creating split files: {e}")
    
    def check_data_quality(self):
        """Check data quality and report issues"""
        df = self.load_annotations()
        if df is None:
            return
        
        print("\n🔍 Data Quality Check:")
        
        # Check missing values
        missing = df.isnull().sum()
        if missing.sum() > 0:
            print(f"  ⚠️  Missing values found:")
            print(missing[missing > 0])
        else:
            print(f"  ✓ No missing values")
        
        # Check for duplicates
        duplicates = df.duplicated().sum()
        print(f"  - Duplicate rows: {duplicates}")
        
        # Check for unique speakers (if available)
        if 'speaker_id' in df.columns:
            print(f"  - Unique speakers: {df['speaker_id'].nunique()}")
        
        if 'device' in df.columns:
            print(f"  - Devices used: {df['device'].nunique()}")
            print(f"    {df['device'].unique().tolist()}")

def main():
    print("╔════════════════════════════════════════╗")
    print("║  LOTUSDIS Dataset Preparation Tool    ║")
    print("╚════════════════════════════════════════╝")
    
    preparator = DatasetPreparator(root_dir='.')
    
    # 1. Combine datasets from split files
    print("\n📋 Step 1: Combining datasets...")
    combined_df = preparator.combine_datasets()
    if combined_df is None:
        print("❌ Failed to combine datasets")
        return
    
    # 2. Explore combined dataset
    print("\n📊 Step 2: Exploring dataset...")
    preparator.explore_dataset()
    
    # 3. Get split summary
    preparator.get_split_summary()
    
    # 4. Check data quality
    print("\n🔍 Step 3: Checking data quality...")
    preparator.check_data_quality()
    
    # 5. Create split files (if needed)
    print("\n📁 Step 4: Creating split files...")
    preparator.create_train_dev_test_split()
    
    print("\n✅ Dataset preparation complete!")

if __name__ == "__main__":
    main()
