#!/usr/bin/env python3
"""
Task 4: Dataset Preparation ตามเกณฑ์อาจารย์
==============================================
ขั้นตอนที่ 1a: วิเคราะห์ข้อมูลพื้นฐาน
- นับจำนวน speaker ทั้งหมด (เดี่ยว vs multi)
- นับจำนวนคำไม่ซ้ำทั้งหมด
- นับจำนวน sample ทั้งหมด
"""

import pandas as pd
import numpy as np
import os

# ============================================================
# ขั้นตอนที่ 1a: โหลดข้อมูล + สถิติพื้นฐาน
# ============================================================

def load_data():
    """โหลด combined_dataset.csv"""
    csv_path = os.path.join('datasets', 'combined_dataset.csv')
    df = pd.read_csv(csv_path, engine='python', encoding_errors='ignore')
    return df

def analyze_basic_stats(df):
    """วิเคราะห์สถิติพื้นฐานของ dataset"""
    
    print("=" * 60)
    print("  Task 4 - ขั้นตอนที่ 1a: สถิติพื้นฐานของ Dataset")
    print("=" * 60)
    
    # จำนวน sample ทั้งหมด
    print(f"\n📊 จำนวน sample ทั้งหมด: {len(df)}")
    
    # แยก single-speaker vs multi-speaker
    is_multi = df['speaker'].str.contains('&', na=False)
    single_df = df[~is_multi]
    multi_df = df[is_multi]
    
    print(f"\n👤 Speaker Statistics:")
    print(f"   - Single-speaker samples: {len(single_df)}")
    print(f"   - Multi-speaker samples : {len(multi_df)}")
    
    # นับ unique speakers (เฉพาะ single)
    unique_single_speakers = sorted(single_df['speaker'].unique())
    print(f"   - Unique single speakers: {len(unique_single_speakers)}")
    print(f"   - รายชื่อ: {', '.join(unique_single_speakers)}")
    
    # นับ unique multi-speaker combinations
    if len(multi_df) > 0:
        unique_multi = sorted(multi_df['speaker'].unique())
        print(f"   - Multi-speaker combos : {len(unique_multi)}")
        for combo in unique_multi[:10]:
            count = len(multi_df[multi_df['speaker'] == combo])
            print(f"     {combo}: {count} samples")
    
    # จำนวนคำไม่ซ้ำทั้งหมด (จาก single-speaker เท่านั้น)
    unique_words = single_df['sentence'].nunique()
    print(f"\n📝 Unique words/sentences (single-speaker): {unique_words}")
    
    # Top 20 คำที่พบบ่อยที่สุด
    word_counts = single_df['sentence'].value_counts()
    print(f"\n🔝 Top 20 คำที่พบบ่อยที่สุด:")
    for i, (word, count) in enumerate(word_counts.head(20).items()):
        n_speakers = single_df[single_df['sentence'] == word]['speaker'].nunique()
        print(f"   {i+1:2d}. {word:<15s}  count={count:4d}  speakers={n_speakers}")
    
    # สถิติจำนวน sample ต่อ speaker
    samples_per_speaker = single_df.groupby('speaker').size()
    print(f"\n📈 Samples per speaker:")
    print(f"   - min: {samples_per_speaker.min()}")
    print(f"   - max: {samples_per_speaker.max()}")
    print(f"   - mean: {samples_per_speaker.mean():.1f}")
    print(f"   - median: {samples_per_speaker.median():.1f}")
    
    return single_df, multi_df

# ============================================================
# ขั้นตอนที่ 1b: เลือก Top 50 keywords (ไม่รวม filler)
# ============================================================

# Filler words ที่ต้องตัดออก - คำที่ไม่มีความหมายเชิงเนื้อหา
FILLER_WORDS = {
    'อืม', 'เอ่อ', 'เออ', 'ก็', 'ใช่', 'อื๋ม', 'อ่า', 'แล้วก็',
    'คือ', 'แล้ว', 'แต่ว่า', 'อ๋อ', 'ค่ะ', 'เพราะว่า', 'แบบ',
    'มัน', 'ก็คือ', 'นะครับ', 'ครับ', 'อะ', 'ฮะ', 'ฮ่ะ', 'น่ะ',
    'นะ', 'จ้ะ', 'จ๊ะ', 'ค่า', 'คะ', 'ล่ะ', 'เนาะ', 'เนอะ',
    'อืมม', 'อะครับ', 'อ่าา', 'ฮึ', 'เห้อ', 'เฮ้ย',
    'อะไรอย่างนี้', 'ว่า', 'ที่', 'ไม่', 'ได้', 'มี', 'เป็น',
    'ให้', 'จะ', 'ของ', 'กัน', 'กับ', 'ไป', 'มา', 'แล้วก็',
}
# หมายเหตุ: 'มา' อยู่ใน filler ตอนนี้ แต่จะถูกเพิ่มกลับมาใน emergency KWS ทีหลัง

def select_top50_keywords(single_df):
    """เลือก Top 50 keywords จากความถี่ (ไม่รวม filler words)"""
    
    print("\n" + "=" * 60)
    print("  Task 4 - ขั้นตอนที่ 1b: เลือก Top 50 Keywords")
    print("=" * 60)
    
    # นับความถี่แต่ละคำ
    word_counts = single_df['sentence'].value_counts()
    
    # กรอง filler words ออก
    filtered = word_counts[~word_counts.index.isin(FILLER_WORDS)]
    
    # เอา top 50
    top50 = filtered.head(50)
    
    print(f"\n📋 Top 50 Keywords (หลังกรอง filler {len(FILLER_WORDS)} คำ):")
    print(f"   (กรอง filler ออกไป: {len(word_counts) - len(filtered)} คำ)")
    print()
    
    for i, (word, count) in enumerate(top50.items()):
        n_speakers = single_df[single_df['sentence'] == word]['speaker'].nunique()
        print(f"   {i+1:2d}. {word:<20s}  count={count:4d}  speakers={n_speakers}")
    
    top50_list = list(top50.index)
    print(f"\n✅ เลือก {len(top50_list)} keywords จาก top frequency")
    
    return top50_list, word_counts

# ============================================================
# Main
# ============================================================
if __name__ == '__main__':
    df = load_data()
    single_df, multi_df = analyze_basic_stats(df)
    top50, word_counts = select_top50_keywords(single_df)
    
    print("\n" + "=" * 60)
    print("  ขั้นตอนที่ 1b เสร็จสิ้น ✓")
    print("  ขั้นตอนถัดไป: 1c - กำหนด Emergency KWS keywords")
    print("=" * 60)
