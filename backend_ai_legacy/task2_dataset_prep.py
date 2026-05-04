#!/usr/bin/env python3
"""Task 2 Dataset Preparation

Aligns dataset preparation with the teacher-assigned task list.
This script assumes `backend_ai/datasets/combined_dataset.csv` exists.
"""

import os
from pathlib import Path
import pandas as pd


class Task2DatasetPrep:
    def __init__(self, combined_path=None):
        self.base_dir = Path(__file__).resolve().parent
        self.data_dir = self.base_dir / 'datasets'
        self.combined_path = Path(combined_path) if combined_path else self.data_dir / 'combined_dataset.csv'
        self.df = None
        self.selected_keywords = []
        self.selected_speakers = []
        self.selected_kws_df = None
        self.train_df = None
        self.val_df = None
        self.test_df = None

    def load_combined_dataset(self):
        if not self.combined_path.exists():
            raise FileNotFoundError(f'Combined dataset not found: {self.combined_path}')

        self.df = pd.read_csv(self.combined_path, engine='python', encoding_errors='ignore')
        print(f'✓ Loaded combined dataset: {len(self.df):,} rows')
        return self.df

    def report_summary(self):
        print('\n=== Dataset Summary ===')
        print(f'Total rows: {len(self.df):,}')
        print(f'Unique speakers: {self.df["speaker"].nunique():,}')
        print(f'Unique keywords/sentences: {self.df["sentence"].nunique():,}')
        print('\nSplit counts:')
        if 'split' in self.df.columns:
            print(self.df['split'].value_counts())

    def compute_top_keywords(self, top_n=20):
        keyword_counts = self.df['sentence'].value_counts()
        top_keywords = keyword_counts.head(top_n)
        print(f'\n=== Top {top_n} Most Frequent Keywords ===')
        print(f"{'Rank':<4} {'Count':<8} {'Speakers':<10} Keyword")
        print('-' * 70)

        for idx, (keyword, count) in enumerate(top_keywords.items(), 1):
            speakers = self.df[self.df['sentence'] == keyword]['speaker'].nunique()
            keyword_display = keyword if len(keyword) <= 40 else keyword[:37] + '...'
            print(f'{idx:<4} {count:<8} {speakers:<10} {keyword_display}')

        return top_keywords

    def find_single_speaker_keywords(self, top_keywords):
        single_speaker_info = []
        for keyword in top_keywords.index.tolist():
            subset = self.df[self.df['sentence'] == keyword]
            unique_speakers = subset['speaker'].nunique()
            if unique_speakers == 1:
                speaker = subset['speaker'].iloc[0]
                single_speaker_info.append((keyword, speaker, len(subset)))

        if single_speaker_info:
            single_speaker_info.sort(key=lambda x: x[2], reverse=True)
            print('\n=== Top Keywords with Single Speaker ===')
            print(f"{'Keyword':<40} {'Speaker':<20} {'Utterances':<10}")
            print('-' * 80)
            for keyword, speaker, count in single_speaker_info:
                short = keyword if len(keyword) <= 40 else keyword[:37] + '...'
                print(f'{short:<40} {speaker:<20} {count:<10}')
        else:
            print('\n⚠️  No top keywords have exactly one speaker in the combined dataset')
        return single_speaker_info

    def choose_training_keywords(self, single_speaker_info, fallback_top=10):
        if len(single_speaker_info) >= 20:
            chosen = single_speaker_info[:20]
            print('\nUsing 20 single-speaker top keywords for training selection')
        elif 0 < len(single_speaker_info) < 20:
            chosen = single_speaker_info[:10]
            print(f'\nOnly {len(single_speaker_info)} single-speaker keywords found. Using top 10 for training selection')
        else:
            print('\nNo single-speaker keywords available. Falling back to top keywords with lowest speaker diversity')
            top20 = self.compute_top_keywords(20)
            speaker_counts = []
            for keyword in top20.index.tolist():
                subset = self.df[self.df['sentence'] == keyword]
                speaker_counts.append((keyword, subset['speaker'].nunique(), len(subset)))
            speaker_counts.sort(key=lambda x: (x[1], -x[2]))
            chosen = [(keyword, None, count) for keyword, _, count in speaker_counts[:fallback_top]]
            print('\n=== Fallback Selected Keywords ===')
            print(f"{'Keyword':<40} {'Speakers':<10} {'Utterances':<10}")
            print('-' * 70)
            for keyword, speakers, count in speaker_counts[:fallback_top]:
                short = keyword if len(keyword) <= 40 else keyword[:37] + '...'
                print(f'{short:<40} {speakers:<10} {count:<10}')

        self.selected_keywords = [kw for kw, _, _ in chosen]
        print(f'\nSelected keywords count: {len(self.selected_keywords)}')
        return self.selected_keywords

    def build_training_set(self):
        if not self.selected_keywords:
            raise ValueError('No selected keywords available for training')

        subset = self.df[self.df['sentence'].isin(self.selected_keywords)].copy()
        speaker_counts = subset['speaker'].value_counts()
        speaker_rank = speaker_counts.sort_values(ascending=False)

        # Choose top 10 speakers by utterance count among the selected keywords
        top_speakers = speaker_rank.head(10).index.tolist()
        self.selected_speakers = top_speakers
        self.selected_kws_df = subset[subset['speaker'].isin(top_speakers)].copy()
        self.train_df = self.selected_kws_df.copy()

        print('\n=== Training Set Selection ===')
        print(f'Selected top {len(top_speakers)} speakers from the selected keyword set:')
        for speaker, count in speaker_rank.head(10).items():
            print(f'  - {speaker}: {count} utterances')

        print(f'\nTraining set rows: {len(self.train_df):,}')
        return self.train_df

    def split_remaining(self):
        remaining = self.df.drop(self.train_df.index)
        print(f'\nRemaining rows after training selection: {len(remaining):,}')
        validation = remaining.sample(frac=0.5, random_state=42)
        testing = remaining.drop(validation.index)

        self.val_df = validation.reset_index(drop=True)
        self.test_df = testing.reset_index(drop=True)

        print(f'Validation rows: {len(self.val_df):,}')
        print(f'Testing rows: {len(self.test_df):,}')
        return self.val_df, self.test_df

    def save_split_files(self, output_dir=None):
        if output_dir is None:
            output_dir = self.data_dir / 'task2_splits'
        else:
            output_dir = Path(output_dir)

        os.makedirs(output_dir, exist_ok=True)
        self.train_df.to_csv(output_dir / 'train.csv', index=False)
        self.val_df.to_csv(output_dir / 'validation.csv', index=False)
        self.test_df.to_csv(output_dir / 'test.csv', index=False)

        selected_path = output_dir / 'selected_keywords_speakers.csv'
        if self.selected_kws_df is not None:
            self.selected_kws_df.to_csv(selected_path, index=False)

        print(f'\nSaved split files to: {output_dir}')
        print(f'  - train.csv: {len(self.train_df):,}')
        print(f'  - validation.csv: {len(self.val_df):,}')
        print(f'  - test.csv: {len(self.test_df):,}')
        print(f'  - selected_keywords_speakers.csv: {len(self.selected_kws_df):,}')

    def run(self):
        self.load_combined_dataset()
        self.report_summary()
        top20 = self.compute_top_keywords(20)
        single_speaker_info = self.find_single_speaker_keywords(top20)
        self.choose_training_keywords(single_speaker_info, fallback_top=10)
        self.build_training_set()
        self.split_remaining()
        self.save_split_files()


if __name__ == '__main__':
    prep = Task2DatasetPrep()
    prep.run()
