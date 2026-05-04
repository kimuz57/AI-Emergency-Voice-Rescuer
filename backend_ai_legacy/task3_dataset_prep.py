#!/usr/bin/env python3
"""
Step 11: Revised Dataset Preparation with Speaker Separation and Keyword Selection
ตามคำแนะนำของอาจารย์: แยก speaker และเลือก keyword ที่มี 의미
"""

import pandas as pd
import numpy as np
import os
from pathlib import Path
from sklearn.model_selection import train_test_split

class RevisedDatasetPrep:
    def __init__(self):
        self.data_dir = 'datasets'
        self.output_dir = 'datasets/task3_speaker_separated'
        os.makedirs(self.output_dir, exist_ok=True)

    def load_combined_data(self):
        """โหลดข้อมูลรวม"""
        csv_path = os.path.join(self.data_dir, 'combined_dataset.csv')
        df = pd.read_csv(csv_path, engine='python', encoding_errors='ignore')
        print(f"Loaded {len(df)} samples from {csv_path}")
        return df

    def clean_speakers(self, df):
        """ทำความสะอาดข้อมูล speaker - แยก multi-speaker entries"""
        # Remove multi-speaker entries (containing &)
        single_speaker_df = df[~df['speaker'].str.contains('&', na=False)].copy()
        print(f"Removed {len(df) - len(single_speaker_df)} multi-speaker entries")
        return single_speaker_df

    def select_meaningful_keywords(self, df, min_samples=10):
        """เลือก keyword ที่มี 의미 (ไม่รวม filler words)"""
        # Filler words to exclude
        fillers = {'ค่ะ', 'ครับ', 'อะ', 'อืม', 'อื๋ม', 'เอ่อ', 'เออ', 'อ๋อ', 'ก็', 'แล้ว', 'คือ', 'แบบ', 'ใช่', 'แต่ว่า', 'เพราะว่า', 'แล้วก็', 'มัน'}

        # Get keyword frequencies
        keyword_counts = df['sentence'].value_counts()

        # Filter out fillers and select keywords with minimum samples
        meaningful_keywords = []
        for kw, count in keyword_counts.items():
            if kw not in fillers and count >= min_samples:
                meaningful_keywords.append(kw)
                if len(meaningful_keywords) >= 50:  # Select top 50
                    break

        print(f"Selected {len(meaningful_keywords)} meaningful keywords:")
        for i, kw in enumerate(meaningful_keywords[:10]):
            print(f"  {i+1}. {kw}")

        return meaningful_keywords

    def separate_speakers(self, df):
        """แยก speakers เป็น train/val/test โดยไม่ให้ซ้ำ"""
        # Get unique speakers
        unique_speakers = df['speaker'].unique()
        print(f"Total unique speakers: {len(unique_speakers)}")

        # Split speakers: 70% train, 15% val, 15% test
        speakers_train, speakers_temp = train_test_split(
            unique_speakers, test_size=0.3, random_state=42
        )
        speakers_val, speakers_test = train_test_split(
            speakers_temp, test_size=0.5, random_state=42
        )

        print(f"Speaker split: Train {len(speakers_train)}, Val {len(speakers_val)}, Test {len(speakers_test)}")

        return speakers_train, speakers_val, speakers_test

    def create_splits(self, df, keywords, speakers_train, speakers_val, speakers_test):
        """สร้าง train/val/test splits"""
        splits = {}

        for split_name, speakers in [('train', speakers_train),
                                   ('validation', speakers_val),
                                   ('test', speakers_test)]:
            # Filter by speakers and keywords
            split_df = df[
                df['speaker'].isin(speakers) &
                df['sentence'].isin(keywords)
            ].copy()

            split_df['split'] = split_name
            splits[split_name] = split_df

            print(f"{split_name.capitalize()}: {len(split_df)} samples")

        return splits

    def save_splits(self, splits):
        """บันทึก splits เป็น CSV"""
        for split_name, df in splits.items():
            output_path = os.path.join(self.output_dir, f'{split_name}.csv')
            df.to_csv(output_path, index=False, encoding='utf-8')
            print(f"Saved {output_path}")

    def create_summary_report(self, splits, keywords):
        """สร้างรายงานสรุป"""
        report = {
            'total_keywords': len(keywords),
            'keywords': keywords,
            'train_samples': len(splits['train']),
            'val_samples': len(splits['validation']),
            'test_samples': len(splits['test']),
            'train_speakers': len(splits['train']['speaker'].unique()),
            'val_speakers': len(splits['validation']['speaker'].unique()),
            'test_speakers': len(splits['test']['speaker'].unique())
        }

        report_path = os.path.join(self.output_dir, 'dataset_summary.json')
        import json
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"Summary saved to {report_path}")

def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  Step 11: Revised Dataset Prep - Speaker Separation       ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    prep = RevisedDatasetPrep()

    # Load data
    df = prep.load_combined_data()

    # Clean speakers
    df_clean = prep.clean_speakers(df)

    # Select meaningful keywords
    keywords = prep.select_meaningful_keywords(df_clean)

    # Separate speakers
    speakers_train, speakers_val, speakers_test = prep.separate_speakers(df_clean)

    # Create splits
    splits = prep.create_splits(df_clean, keywords, speakers_train, speakers_val, speakers_test)

    # Save splits
    prep.save_splits(splits)

    # Create summary
    prep.create_summary_report(splits, keywords)

    print("\n✅ Dataset preparation completed!")
    print(f"📁 Output directory: {prep.output_dir}")
    print(f"🎯 Keywords selected: {len(keywords)}")
    print(f"👥 Speakers separated: Train/Val/Test")

if __name__ == "__main__":
    main()