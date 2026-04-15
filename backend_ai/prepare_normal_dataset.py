#!/usr/bin/env python3
"""
Normal Dataset Preparation
Create normal speech dataset with 20 keywords from 10+ different speakers
"""

import pandas as pd
import os
from pathlib import Path

class NormalDatasetPreparer:
    def __init__(self, dataset_path='datasets/top20_keywords.csv'):
        self.dataset_path = dataset_path
        self.df = None
        self.min_speakers = 10  # Minimum 10 speakers per keyword
        
    def load_dataset(self):
        """Load top 20 keywords dataset"""
        try:
            self.df = pd.read_csv(self.dataset_path, engine='python', encoding_errors='ignore')
            print(f"✓ Loaded dataset: {len(self.df)} rows")
            return self.df
        except Exception as e:
            print(f"❌ Error loading dataset: {e}")
            return None
    
    def validate_keywords(self):
        """Validate that all keywords have at least 10 speakers"""
        if self.df is None:
            self.load_dataset()
        
        print(f"\n✅ Validating Keywords (minimum {self.min_speakers} speakers required):")
        print(f"{'#':<4} {'Keyword':<40} {'Speakers':<12} {'Status':<10}")
        print("-" * 70)
        
        valid_keywords = []
        invalid_keywords = []
        
        for idx, keyword in enumerate(self.df['sentence'].unique(), 1):
            keyword_data = self.df[self.df['sentence'] == keyword]
            num_speakers = keyword_data['speaker'].nunique()
            
            keyword_trunc = keyword[:37] + "..." if len(keyword) > 40 else keyword
            status = "✓ VALID" if num_speakers >= self.min_speakers else "✗ INVALID"
            print(f"{idx:<4} {keyword_trunc:<40} {num_speakers:<12} {status:<10}")
            
            if num_speakers >= self.min_speakers:
                valid_keywords.append(keyword)
            else:
                invalid_keywords.append((keyword, num_speakers))
        
        print(f"\n📊 Summary:")
        print(f"  Valid keywords (≥{self.min_speakers} speakers): {len(valid_keywords)}")
        print(f"  Invalid keywords (<{self.min_speakers} speakers): {len(invalid_keywords)}")
        
        if invalid_keywords:
            print(f"\n⚠️  Keywords with insufficient speakers:")
            for keyword, count in invalid_keywords:
                print(f"    - {keyword}: {count} speakers")
        
        return valid_keywords, invalid_keywords
    
    def get_speaker_distribution(self):
        """Show speaker distribution for top 20 keywords"""
        if self.df is None:
            self.load_dataset()
        
        print(f"\n📋 Speaker Distribution per Keyword:")
        print(f"{'Keyword':<40} {'Speakers':<12} {'Utterances':<12}")
        print("-" * 70)
        
        for keyword in self.df['sentence'].unique():
            keyword_data = self.df[self.df['sentence'] == keyword]
            speakers = keyword_data['speaker'].nunique()
            count = len(keyword_data)
            
            keyword_trunc = keyword[:37] + "..." if len(keyword) > 40 else keyword
            print(f"{keyword_trunc:<40} {speakers:<12} {count:<12}")
    
    def create_normal_dataset(self):
        """Create normal dataset with validated keywords"""
        if self.df is None:
            self.load_dataset()
        
        valid_keywords, _ = self.validate_keywords()
        
        # Filter for only valid keywords
        normal_df = self.df[self.df['sentence'].isin(valid_keywords)].copy()
        
        # Save normal dataset
        output_path = 'datasets/normal_data.csv'
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        normal_df.to_csv(output_path, index=False)
        
        print(f"\n💾 Created normal_data.csv")
        print(f"  Total rows: {len(normal_df)}")
        print(f"  Unique keywords: {normal_df['sentence'].nunique()}")
        print(f"  Unique speakers: {normal_df['speaker'].nunique()}")
        print(f"  Path: {output_path}")
        
        # Create split summary
        print(f"\n📊 Split Distribution (Normal Data):")
        splits = normal_df['split'].value_counts()
        for split_name, count in splits.items():
            percentage = (count / len(normal_df)) * 100
            print(f"  - {split_name}: {count} ({percentage:.1f}%)")
        
        return normal_df
    
    def create_keywords_list(self):
        """Create a text file with validated keywords"""
        if self.df is None:
            self.load_dataset()
        
        valid_keywords, _ = self.validate_keywords()
        
        # Save keywords list
        output_path = 'datasets/valid_keywords.txt'
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"Valid Keywords for Normal Data ({len(valid_keywords)} keywords)\n")
            f.write("=" * 50 + "\n\n")
            for idx, keyword in enumerate(valid_keywords, 1):
                keyword_data = self.df[self.df['sentence'] == keyword]
                speakers = keyword_data['speaker'].nunique()
                count = len(keyword_data)
                f.write(f"{idx:2d}. {keyword:<40} ({speakers} speakers, {count} utterances)\n")
        
        print(f"\n📄 Created valid_keywords.txt")
        print(f"  Path: {output_path}")
    
    def summary_statistics(self):
        """Print summary statistics"""
        if self.df is None:
            self.load_dataset()
        
        print(f"\n" + "="*70)
        print("SUMMARY STATISTICS - NORMAL DATASET")
        print("="*70)
        
        print(f"\n📊 Overall Statistics:")
        print(f"  Total utterances: {len(self.df):,}")
        print(f"  Unique keywords: {self.df['sentence'].nunique()}")
        print(f"  Unique speakers: {self.df['speaker'].nunique()}")
        print(f"  Duration range: {self.df['dur'].min():.2f}s - {self.df['dur'].max():.2f}s")
        print(f"  Average duration: {self.df['dur'].mean():.2f}s")
        
        print(f"\n📈 By Split:")
        splits = self.df['split'].value_counts()
        total = len(self.df)
        for split_name, count in splits.items():
            percentage = (count / total) * 100
            print(f"  - {split_name:5s}: {count:6,d} ({percentage:5.1f}%)")
        
        print(f"\n🎤 Top Languages:")
        if 'lang' in self.df.columns:
            langs = self.df['lang'].value_counts()
            for lang, count in langs.head(5).items():
                print(f"  - {lang}: {count}")
        
        print(f"\n🎧 Microphone Types:")
        if 'mic' in self.df.columns:
            mics = self.df['mic'].value_counts()
            for mic, count in mics.head(5).items():
                print(f"  - {mic}: {count}")

def main():
    print("╔════════════════════════════════════════════╗")
    print("║  Normal Dataset Preparation Tool           ║")
    print("╚════════════════════════════════════════════╝\n")
    
    preparer = NormalDatasetPreparer(dataset_path='datasets/top20_keywords.csv')
    
    # Load dataset
    df = preparer.load_dataset()
    if df is None:
        return
    
    # Step 1: Show speaker distribution
    print("\n" + "="*70)
    print("STEP 1: Speaker Distribution Analysis")
    print("="*70)
    preparer.get_speaker_distribution()
    
    # Step 2: Validate keywords
    print("\n" + "="*70)
    print("STEP 2: Validate Keywords (≥10 speakers required)")
    print("="*70)
    preparer.validate_keywords()
    
    # Step 3: Create normal dataset
    print("\n" + "="*70)
    print("STEP 3: Create Normal Dataset")
    print("="*70)
    preparer.create_normal_dataset()
    
    # Step 4: Create keywords list
    print("\n" + "="*70)
    print("STEP 4: Create Keywords List")
    print("="*70)
    preparer.create_keywords_list()
    
    # Step 5: Summary statistics
    preparer.summary_statistics()
    
    print("\n✅ Normal dataset preparation complete!")

if __name__ == "__main__":
    main()
