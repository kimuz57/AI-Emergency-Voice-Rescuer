#!/usr/bin/env python3
"""
Training/Validation/Testing Split
Split normal dataset into proper train/validation/testing sets
"""

import pandas as pd
import os
from pathlib import Path
from sklearn.model_selection import train_test_split

class DataSplitter:
    def __init__(self, dataset_path='datasets/normal_data.csv'):
        self.dataset_path = dataset_path
        self.df = None
        
    def load_dataset(self):
        """Load normal dataset"""
        try:
            self.df = pd.read_csv(self.dataset_path, engine='python', encoding_errors='ignore')
            print(f"✓ Loaded dataset: {len(self.df)} rows")
            return self.df
        except Exception as e:
            print(f"❌ Error loading dataset: {e}")
            return None
    
    def show_current_split(self):
        """Show current train/dev/test split distribution"""
        if self.df is None:
            self.load_dataset()
        
        print(f"\n📊 Current Dataset Split (from original LOTUSDIS):")
        print(f"{'Split':<10} {'Count':<10} {'Percentage':<15}")
        print("-" * 40)
        
        splits = self.df['split'].value_counts()
        total = len(self.df)
        
        for split_name, count in splits.items():
            percentage = (count / total) * 100
            print(f"{split_name:<10} {count:<10} {percentage:>6.1f}%")
        
        print(f"{'TOTAL':<10} {total:<10}")
    
    def create_optimal_split(self, train_ratio=0.7, val_ratio=0.15, test_ratio=0.15):
        """
        Create optimal train/validation/test split
        Default: 70% train, 15% validation, 15% test
        """
        if self.df is None:
            self.load_dataset()
        
        print(f"\n🔀 Creating optimal split:")
        print(f"  Train: {train_ratio*100:.0f}%")
        print(f"  Validation: {val_ratio*100:.0f}%")
        print(f"  Test: {test_ratio*100:.0f}%")
        
        # First split: train vs (validation + test)
        train_df, temp_df = train_test_split(
            self.df,
            test_size=(1 - train_ratio),
            random_state=42
        )
        
        # Second split: validation vs test
        val_ratio_adjusted = val_ratio / (val_ratio + test_ratio)
        val_df, test_df = train_test_split(
            temp_df,
            test_size=(1 - val_ratio_adjusted),
            random_state=42
        )
        
        print(f"\n✓ Split completed:")
        print(f"  Train: {len(train_df)} ({len(train_df)/len(self.df)*100:.1f}%)")
        print(f"  Validation: {len(val_df)} ({len(val_df)/len(self.df)*100:.1f}%)")
        print(f"  Test: {len(test_df)} ({len(test_df)/len(self.df)*100:.1f}%)")
        
        return train_df, val_df, test_df
    
    def analyze_keyword_distribution(self, train_df, val_df, test_df):
        """Analyze keyword distribution across splits"""
        print(f"\n📈 Keyword Distribution per Split:")
        print(f"{'Keyword':<40} {'Train':<10} {'Val':<10} {'Test':<10}")
        print("-" * 70)
        
        for keyword in self.df['sentence'].unique():
            train_count = len(train_df[train_df['sentence'] == keyword])
            val_count = len(val_df[val_df['sentence'] == keyword])
            test_count = len(test_df[test_df['sentence'] == keyword])
            
            keyword_trunc = keyword[:37] + "..." if len(keyword) > 40 else keyword
            print(f"{keyword_trunc:<40} {train_count:<10} {val_count:<10} {test_count:<10}")
    
    def analyze_speaker_distribution(self, train_df, val_df, test_df):
        """Analyze speaker distribution across splits"""
        print(f"\n👥 Speaker Distribution:")
        print(f"  Train speakers: {train_df['speaker'].nunique()}")
        print(f"  Validation speakers: {val_df['speaker'].nunique()}")
        print(f"  Test speakers: {test_df['speaker'].nunique()}")
        print(f"  Total unique speakers: {self.df['speaker'].nunique()}")
    
    def save_splits(self, train_df, val_df, test_df):
        """Save splits to CSV files"""
        output_dir = 'datasets/splits'
        os.makedirs(output_dir, exist_ok=True)
        
        train_path = os.path.join(output_dir, 'train.csv')
        val_path = os.path.join(output_dir, 'validation.csv')
        test_path = os.path.join(output_dir, 'test.csv')
        
        train_df.to_csv(train_path, index=False)
        val_df.to_csv(val_path, index=False)
        test_df.to_csv(test_path, index=False)
        
        print(f"\n💾 Saved split files:")
        print(f"  - {train_path} ({len(train_df)} rows)")
        print(f"  - {val_path} ({len(val_df)} rows)")
        print(f"  - {test_path} ({len(test_df)} rows)")
        
        # Create summary file
        summary_path = os.path.join(output_dir, 'split_summary.txt')
        with open(summary_path, 'w', encoding='utf-8') as f:
            f.write("Training/Validation/Testing Split Summary\n")
            f.write("=" * 50 + "\n\n")
            f.write(f"Total samples: {len(self.df)}\n")
            f.write(f"Train samples: {len(train_df)} ({len(train_df)/len(self.df)*100:.1f}%)\n")
            f.write(f"Validation samples: {len(val_df)} ({len(val_df)/len(self.df)*100:.1f}%)\n")
            f.write(f"Test samples: {len(test_df)} ({len(test_df)/len(self.df)*100:.1f}%)\n\n")
            f.write(f"Unique keywords: {self.df['sentence'].nunique()}\n")
            f.write(f"Train speakers: {train_df['speaker'].nunique()}\n")
            f.write(f"Validation speakers: {val_df['speaker'].nunique()}\n")
            f.write(f"Test speakers: {test_df['speaker'].nunique()}\n")
        
        print(f"  - {summary_path}")
    
    def create_label_mapping(self):
        """Create keyword to label mapping"""
        keywords = sorted(self.df['sentence'].unique())
        
        label_mapping = {keyword: idx for idx, keyword in enumerate(keywords)}
        
        output_path = 'datasets/label_mapping.txt'
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("Keyword to Label Mapping\n")
            f.write("=" * 50 + "\n\n")
            for keyword, label in sorted(label_mapping.items(), key=lambda x: x[1]):
                f.write(f"{label:2d}: {keyword}\n")
        
        print(f"  - {output_path}")
        
        return label_mapping

def main():
    print("╔════════════════════════════════════════╗")
    print("║  Train/Validation/Test Split Tool     ║")
    print("╚════════════════════════════════════════╝\n")
    
    splitter = DataSplitter(dataset_path='datasets/normal_data.csv')
    
    # Load dataset
    df = splitter.load_dataset()
    if df is None:
        return
    
    # Step 1: Show current split
    print("\n" + "="*70)
    print("STEP 1: Show Current Dataset Split")
    print("="*70)
    splitter.show_current_split()
    
    # Step 2: Create optimal split
    print("\n" + "="*70)
    print("STEP 2: Create Optimal Train/Val/Test Split")
    print("="*70)
    train_df, val_df, test_df = splitter.create_optimal_split(
        train_ratio=0.7,
        val_ratio=0.15,
        test_ratio=0.15
    )
    
    # Step 3: Analyze keyword distribution
    print("\n" + "="*70)
    print("STEP 3: Analyze Keyword Distribution")
    print("="*70)
    splitter.analyze_keyword_distribution(train_df, val_df, test_df)
    
    # Step 4: Analyze speaker distribution
    print("\n" + "="*70)
    print("STEP 4: Analyze Speaker Distribution")
    print("="*70)
    splitter.analyze_speaker_distribution(train_df, val_df, test_df)
    
    # Step 5: Save splits
    print("\n" + "="*70)
    print("STEP 5: Save Split Files")
    print("="*70)
    splitter.save_splits(train_df, val_df, test_df)
    
    # Step 6: Create label mapping
    print("\n" + "="*70)
    print("STEP 6: Create Label Mapping")
    print("="*70)
    label_mapping = splitter.create_label_mapping()
    
    print("\n✅ Train/Validation/Test split complete!")

if __name__ == "__main__":
    main()
