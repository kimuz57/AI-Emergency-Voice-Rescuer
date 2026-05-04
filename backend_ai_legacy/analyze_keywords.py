#!/usr/bin/env python3
"""
Keyword Analysis Tool
Analyze top 20 keywords from LOTUSDIS dataset and prepare for fine-tuning
"""

import pandas as pd
import os
from collections import Counter
from pathlib import Path

class KeywordAnalyzer:
    def __init__(self, dataset_path='datasets/combined_dataset.csv'):
        self.dataset_path = dataset_path
        self.df = None
        
    def load_dataset(self):
        """Load combined dataset"""
        try:
            self.df = pd.read_csv(
                self.dataset_path,
                engine='python',
                encoding_errors='ignore'
            )
            print(f"✓ Loaded dataset: {len(self.df)} rows")
            return self.df
        except Exception as e:
            print(f"❌ Error loading dataset: {e}")
            return None
    
    def analyze_speakers(self):
        """Analyze number of unique speakers"""
        if self.df is None:
            self.load_dataset()
        
        unique_speakers = self.df['speaker'].nunique()
        print(f"\n👥 Unique Speakers: {unique_speakers}")
        
        # Speaker distribution
        speaker_counts = self.df['speaker'].value_counts()
        print(f"\n📊 Top 10 most active speakers:")
        for idx, (speaker, count) in enumerate(speaker_counts.head(10).items(), 1):
            print(f"  {idx}. {speaker}: {count} utterances")
    
    def analyze_sentences(self):
        """Analyze unique sentences/keywords"""
        if self.df is None:
            self.load_dataset()
        
        unique_sentences = self.df['sentence'].nunique()
        print(f"\n🗣️ Total Unique Sentences/Keywords: {unique_sentences}")
        
        # Most frequent sentences
        sentence_counts = self.df['sentence'].value_counts()
        print(f"\n📈 Top 20 Most Frequent Sentences:")
        print(f"{'Rank':<6} {'Count':<8} {'Sentence':<50}")
        print("-" * 70)
        for idx, (sentence, count) in enumerate(sentence_counts.head(20).items(), 1):
            sentence_trunc = sentence[:47] + "..." if len(sentence) > 50 else sentence
            print(f"{idx:<6} {count:<8} {sentence_trunc:<50}")
        
        return sentence_counts
    
    def analyze_top20_keywords(self):
        """Detailed analysis of top 20 keywords"""
        if self.df is None:
            self.load_dataset()
        
        sentence_counts = self.df['sentence'].value_counts()
        top20_keywords = sentence_counts.head(20)
        
        print(f"\n🎯 Detailed Analysis of Top 20 Keywords:")
        print(f"{'#':<4} {'Keyword':<30} {'Count':<8} {'Speakers':<8} {'Sets':<15}")
        print("-" * 75)
        
        for idx, (keyword, count) in enumerate(top20_keywords.items(), 1):
            keyword_df = self.df[self.df['sentence'] == keyword]
            unique_speakers = keyword_df['speaker'].nunique()
            sets = keyword_df['set'].unique().tolist()
            sets_str = ', '.join(sets) if len(sets) <= 3 else f"{len(sets)} sets"
            
            keyword_trunc = keyword[:27] + "..." if len(keyword) > 30 else keyword
            print(f"{idx:<4} {keyword_trunc:<30} {count:<8} {unique_speakers:<8} {sets_str:<15}")
        
        return top20_keywords
    
    def analyze_top20_speaker_distribution(self):
        """Analyze speaker distribution for top 20 keywords"""
        if self.df is None:
            self.load_dataset()
        
        sentence_counts = self.df['sentence'].value_counts()
        top20_keywords = sentence_counts.head(20).index.tolist()
        
        print(f"\n📋 Speaker Distribution for Top 20 Keywords:")
        print()
        
        keyword_speaker_map = {}
        for keyword in top20_keywords:
            keyword_df = self.df[self.df['sentence'] == keyword]
            speakers = keyword_df['speaker'].unique().tolist()
            keyword_speaker_map[keyword] = speakers
            print(f"{len(keyword_speaker_map)}. {keyword:<40} | {len(speakers)} speakers")
        
        return keyword_speaker_map
    
    def analyze_splits_for_top20(self):
        """Analyze train/dev/test split for top 20 keywords"""
        if self.df is None:
            self.load_dataset()
        
        sentence_counts = self.df['sentence'].value_counts()
        top20_keywords = sentence_counts.head(20).index.tolist()
        
        print(f"\n🔀 Train/Dev/Test Split for Top 20 Keywords:")
        print(f"{'#':<4} {'Keyword':<40} {'Train':<8} {'Dev':<8} {'Test':<8}")
        print("-" * 80)
        
        for idx, keyword in enumerate(top20_keywords, 1):
            keyword_df = self.df[self.df['sentence'] == keyword]
            train_count = len(keyword_df[keyword_df['split'] == 'train'])
            dev_count = len(keyword_df[keyword_df['split'] == 'dev'])
            test_count = len(keyword_df[keyword_df['split'] == 'test'])
            
            keyword_trunc = keyword[:37] + "..." if len(keyword) > 40 else keyword
            print(f"{idx:<4} {keyword_trunc:<40} {train_count:<8} {dev_count:<8} {test_count:<8}")
    
    def create_top20_dataset(self):
        """Create a CSV with only top 20 keywords"""
        if self.df is None:
            self.load_dataset()
        
        sentence_counts = self.df['sentence'].value_counts()
        top20_keywords = sentence_counts.head(20).index.tolist()
        
        # Filter dataset for top 20 keywords
        top20_df = self.df[self.df['sentence'].isin(top20_keywords)]
        
        # Save to CSV
        output_path = 'datasets/top20_keywords.csv'
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        top20_df.to_csv(output_path, index=False)
        
        print(f"\n💾 Created top20_keywords.csv")
        print(f"  Rows: {len(top20_df)}")
        print(f"  Unique keywords: {top20_df['sentence'].nunique()}")
        print(f"  Path: {output_path}")
        
        return top20_df

def main():
    print("╔════════════════════════════════════════════╗")
    print("║  Keyword Analysis Tool                     ║")
    print("╚════════════════════════════════════════════╝\n")
    
    analyzer = KeywordAnalyzer(dataset_path='datasets/combined_dataset.csv')
    
    # Load dataset
    df = analyzer.load_dataset()
    if df is None:
        return
    
    # Step 1: Analyze speakers
    print("\n" + "="*70)
    print("STEP 1: Analyze Speakers")
    print("="*70)
    analyzer.analyze_speakers()
    
    # Step 2: Analyze sentences/keywords
    print("\n" + "="*70)
    print("STEP 2: Analyze Sentences/Keywords")
    print("="*70)
    analyzer.analyze_sentences()
    
    # Step 3: Detailed analysis of top 20
    print("\n" + "="*70)
    print("STEP 3: Top 20 Keywords - Detailed Analysis")
    print("="*70)
    analyzer.analyze_top20_keywords()
    
    # Step 4: Speaker distribution
    print("\n" + "="*70)
    print("STEP 4: Speaker Distribution for Top 20")
    print("="*70)
    analyzer.analyze_top20_speaker_distribution()
    
    # Step 5: Split analysis
    print("\n" + "="*70)
    print("STEP 5: Train/Dev/Test Split Analysis")
    print("="*70)
    analyzer.analyze_splits_for_top20()
    
    # Step 6: Create top20 dataset
    print("\n" + "="*70)
    print("STEP 6: Create Top 20 Dataset")
    print("="*70)
    analyzer.create_top20_dataset()
    
    print("\n✅ Analysis complete!")

if __name__ == "__main__":
    main()
