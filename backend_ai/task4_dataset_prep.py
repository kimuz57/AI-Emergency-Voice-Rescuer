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
# ขั้นตอนที่ 1c: กำหนด Emergency KWS keywords + รวมกับ Top 50
# ============================================================

# คำที่เกี่ยวข้องกับเหตุฉุกเฉิน (ตามที่อาจารย์กำหนด)
EMERGENCY_KWS = [
    'ช่วย', 'ด้วย', 'มา', 'เร็ว', 'ตอนนี้',
    'เจ็บ', 'หายใจ', 'ปวด', 'เลือด', 'ล้ม',
    'อุบัติเหตุ', 'ไฟไหม้', 'หมดสติ', 'ฉุกเฉิน',
    'โทร', 'หมอ', 'โรงพยาบาล', 'รถพยาบาล',
]

def merge_top50_and_kws(top50_list, word_counts, single_df):
    """รวม top50 + emergency KWS, ตัดซ้ำ, เรียงตามความถี่"""
    
    print("\n" + "=" * 60)
    print("  Task 4 - ขั้นตอนที่ 1c: รวม Top50 + Emergency KWS")
    print("=" * 60)
    
    # แสดงสถานะ emergency keywords ใน dataset
    print(f"\n🚨 Emergency KWS keywords ({len(EMERGENCY_KWS)} คำ):")
    found_in_data = []
    not_found = []
    
    for kw in EMERGENCY_KWS:
        if kw in word_counts.index:
            count = word_counts[kw]
            n_speakers = single_df[single_df['sentence'] == kw]['speaker'].nunique()
            found_in_data.append(kw)
            already = "← อยู่ใน top50 แล้ว" if kw in top50_list else ""
            print(f"   ✅ {kw:<15s}  count={count:4d}  speakers={n_speakers}  {already}")
        else:
            not_found.append(kw)
            print(f"   ❌ {kw:<15s}  ไม่มีในข้อมูล")
    
    # รวม top50 + KWS (ไม่ซ้ำ)
    merged = list(top50_list)  # เริ่มจาก top50
    added_from_kws = []
    
    for kw in EMERGENCY_KWS:
        if kw in word_counts.index and kw not in merged:
            merged.append(kw)
            added_from_kws.append(kw)
    
    # เรียงตามความถี่ (มากไปน้อย)
    merged.sort(key=lambda w: word_counts.get(w, 0), reverse=True)
    
    print(f"\n📊 สรุป:")
    print(f"   - Top 50 keywords        : {len(top50_list)}")
    print(f"   - Emergency KWS ที่เจอ     : {len(found_in_data)}")
    print(f"   - Emergency KWS ที่ไม่เจอ  : {len(not_found)} → {not_found}")
    print(f"   - เพิ่มจาก KWS (ไม่ซ้ำ)   : {len(added_from_kws)} → {added_from_kws}")
    print(f"   - Target vocabulary รวม   : {len(merged)} คำ")
    
    print(f"\n📋 Target Vocabulary ทั้งหมด ({len(merged)} คำ) เรียงตามความถี่:")
    for i, word in enumerate(merged):
        count = word_counts.get(word, 0)
        n_speakers = single_df[single_df['sentence'] == word]['speaker'].nunique()
        source = "KWS" if word in EMERGENCY_KWS else "TOP50"
        is_both = " +KWS" if word in EMERGENCY_KWS and word in top50_list else ""
        print(f"   {i+1:2d}. {word:<20s}  count={count:4d}  speakers={n_speakers:2d}  [{source}{is_both}]")
    
    return merged

# ============================================================
# ขั้นตอนที่ 1d: สร้างตาราง Speaker × Keyword count matrix
# ============================================================

def build_speaker_keyword_matrix(single_df, target_vocab):
    """สร้างตารางนับ: แต่ละ speaker พูดคำเป้าหมายแต่ละคำกี่ครั้ง"""
    
    print("\n" + "=" * 60)
    print("  Task 4 - ขั้นตอนที่ 1d: Speaker × Keyword Matrix")
    print("=" * 60)
    
    # กรองเฉพาะ rows ที่มีคำอยู่ใน target vocab
    target_df = single_df[single_df['sentence'].isin(target_vocab)].copy()
    print(f"\n📊 Samples ที่ตรงกับ target vocabulary: {len(target_df)}")
    
    # สร้าง pivot table: speaker × keyword → count
    matrix = target_df.groupby(['speaker', 'sentence']).size().unstack(fill_value=0)
    
    # เรียง columns ตามลำดับ target vocab
    cols_in_matrix = [w for w in target_vocab if w in matrix.columns]
    matrix = matrix[cols_in_matrix]
    
    print(f"   - Matrix shape: {matrix.shape[0]} speakers × {matrix.shape[1]} keywords")
    
    # คำนวณ coverage: แต่ละ speaker ครอบคลุมกี่คำจาก target vocab
    coverage = (matrix > 0).sum(axis=1)  # จำนวนคำที่ speaker พูด
    total_tokens = matrix.sum(axis=1)     # จำนวน sample รวมของ speaker
    
    # สร้าง speaker ranking table
    speaker_stats = pd.DataFrame({
        'speaker': matrix.index,
        'vocab_coverage': coverage.values,
        'total_target_tokens': total_tokens.values,
        'coverage_pct': (coverage.values / len(target_vocab) * 100).round(1)
    }).sort_values('vocab_coverage', ascending=False).reset_index(drop=True)
    
    print(f"\n👤 Speaker Ranking (by vocab coverage):")
    print(f"   {'Rank':<5} {'Speaker':<10} {'Coverage':<10} {'Tokens':<10} {'Coverage%':<10}")
    print(f"   {'─'*5} {'─'*10} {'─'*10} {'─'*10} {'─'*10}")
    
    for i, row in speaker_stats.iterrows():
        marker = ""
        if i < 20:
            marker = "← TEST"
        elif i < 30:
            marker = "← VAL"
        print(f"   {i+1:<5} {row['speaker']:<10} {row['vocab_coverage']:<10} {row['total_target_tokens']:<10} {row['coverage_pct']:<10} {marker}")
    
    return matrix, speaker_stats

# ============================================================
# ขั้นตอนที่ 1e: แบ่ง speakers → test / val / train
# ============================================================

def assign_speaker_splits(speaker_stats, single_df, multi_df, target_vocab):
    """แบ่ง speakers ตามกติกาอาจารย์:
    - test  = top 20 speakers (by coverage) → single-speaker only
    - val   = next 10 speakers             → single-speaker only
    - train = ที่เหลือ + multi-speaker (ที่ไม่มี test/val speakers ปน)
    """
    
    print("\n" + "=" * 60)
    print("  Task 4 - ขั้นตอนที่ 1e: แบ่ง Speakers → Test/Val/Train")
    print("=" * 60)
    
    # แบ่ง speakers
    all_speakers = list(speaker_stats['speaker'])
    test_speakers = set(all_speakers[:20])
    val_speakers = set(all_speakers[20:30])
    train_speakers = set(all_speakers[30:])
    
    # เพิ่ม speakers ที่ไม่มีใน target vocab เข้า train
    all_single_speakers = set(single_df['speaker'].unique())
    speakers_not_in_matrix = all_single_speakers - test_speakers - val_speakers - train_speakers
    train_speakers = train_speakers | speakers_not_in_matrix
    
    print(f"\n👥 Speaker Assignment:")
    print(f"   TEST  ({len(test_speakers):2d} speakers): {sorted(test_speakers)}")
    print(f"   VAL   ({len(val_speakers):2d} speakers): {sorted(val_speakers)}")
    print(f"   TRAIN ({len(train_speakers):2d} speakers): {sorted(train_speakers)}")
    
    # === สร้าง TEST split ===
    # เฉพาะ single-speaker + target vocab เท่านั้น
    test_df = single_df[
        single_df['speaker'].isin(test_speakers) &
        single_df['sentence'].isin(target_vocab)
    ].copy()
    test_df['split'] = 'test'
    
    # === สร้าง VAL split ===
    # เฉพาะ single-speaker + target vocab เท่านั้น
    val_df = single_df[
        single_df['speaker'].isin(val_speakers) &
        single_df['sentence'].isin(target_vocab)
    ].copy()
    val_df['split'] = 'validation'
    
    # === สร้าง TRAIN split ===
    # 1) single-speaker ของ train speakers + target vocab
    train_single = single_df[
        single_df['speaker'].isin(train_speakers) &
        single_df['sentence'].isin(target_vocab)
    ].copy()
    
    # 2) multi-speaker: เอาได้ แต่ต้องไม่มี test/val speakers ปน
    forbidden_speakers = test_speakers | val_speakers
    
    def is_safe_multi(speaker_str):
        """ตรวจว่า multi-speaker string ไม่มี test/val speakers ปน"""
        speakers_in_file = set(speaker_str.split('&'))
        return len(speakers_in_file & forbidden_speakers) == 0
    
    safe_multi = multi_df[
        multi_df['speaker'].apply(is_safe_multi) &
        multi_df['sentence'].isin(target_vocab)
    ].copy()
    
    train_df = pd.concat([train_single, safe_multi], ignore_index=True)
    train_df['split'] = 'train'
    
    # === สรุป ===
    print(f"\n📊 Split Results:")
    print(f"   {'Split':<12} {'Samples':<10} {'Speakers':<10} {'Keywords':<10}")
    print(f"   {'─'*12} {'─'*10} {'─'*10} {'─'*10}")
    
    for name, split_df in [('TRAIN', train_df), ('VAL', val_df), ('TEST', test_df)]:
        n_samples = len(split_df)
        n_speakers = split_df['speaker'].nunique()
        n_keywords = split_df['sentence'].nunique()
        print(f"   {name:<12} {n_samples:<10} {n_speakers:<10} {n_keywords:<10}")
    
    total = len(train_df) + len(val_df) + len(test_df)
    print(f"   {'─'*12} {'─'*10}")
    print(f"   {'TOTAL':<12} {total:<10}")
    
    # ตรวจสอบว่า test/val ไม่มี multi-speaker
    test_multi = test_df[test_df['speaker'].str.contains('&', na=False)]
    val_multi = val_df[val_df['speaker'].str.contains('&', na=False)]
    print(f"\n✅ Multi-speaker in TEST: {len(test_multi)} (ต้องเป็น 0)")
    print(f"✅ Multi-speaker in VAL : {len(val_multi)} (ต้องเป็น 0)")
    
    # ตรวจ speaker overlap
    test_spk = set(test_df['speaker'].unique())
    val_spk = set(val_df['speaker'].unique())
    train_spk = set(train_df['speaker'].unique())
    
    # สำหรับ multi-speaker ใน train ต้อง expand ออกก่อนเช็ค
    train_individual_spk = set()
    for s in train_spk:
        for part in s.split('&'):
            train_individual_spk.add(part)
    
    overlap_test_train = test_spk & train_individual_spk
    overlap_val_train = val_spk & train_individual_spk
    overlap_test_val = test_spk & val_spk
    
    print(f"\n🔍 Speaker Overlap Check:")
    print(f"   TEST ∩ TRAIN : {len(overlap_test_train)} speakers {'✅' if len(overlap_test_train) == 0 else '❌ ' + str(overlap_test_train)}")
    print(f"   VAL  ∩ TRAIN : {len(overlap_val_train)} speakers {'✅' if len(overlap_val_train) == 0 else '❌ ' + str(overlap_val_train)}")
    print(f"   TEST ∩ VAL   : {len(overlap_test_val)} speakers {'✅' if len(overlap_test_val) == 0 else '❌ ' + str(overlap_test_val)}")
    
    return train_df, val_df, test_df

# ============================================================
# ขั้นตอนที่ 1f: Export ไฟล์ทั้งหมด
# ============================================================

def export_all(train_df, val_df, test_df, target_vocab, matrix, speaker_stats, word_counts, single_df):
    """บันทึกไฟล์ทั้งหมดลง datasets/task4_splits/"""
    
    import json
    
    output_dir = os.path.join('datasets', 'task4_splits')
    os.makedirs(output_dir, exist_ok=True)
    
    print("\n" + "=" * 60)
    print("  Task 4 - ขั้นตอนที่ 1f: Export ไฟล์ทั้งหมด")
    print("=" * 60)
    
    # 1) Train/Val/Test CSVs
    train_df.to_csv(os.path.join(output_dir, 'train.csv'), index=False, encoding='utf-8')
    val_df.to_csv(os.path.join(output_dir, 'validation.csv'), index=False, encoding='utf-8')
    test_df.to_csv(os.path.join(output_dir, 'test.csv'), index=False, encoding='utf-8')
    print(f"   ✅ train.csv ({len(train_df)} rows)")
    print(f"   ✅ validation.csv ({len(val_df)} rows)")
    print(f"   ✅ test.csv ({len(test_df)} rows)")
    
    # 2) Keyword Inventory
    kw_data = []
    for i, word in enumerate(target_vocab):
        count = int(word_counts.get(word, 0))
        n_speakers = int(single_df[single_df['sentence'] == word]['speaker'].nunique())
        source = 'emergency_kws' if word in EMERGENCY_KWS else 'top50_frequency'
        kw_data.append({
            'rank': i + 1,
            'keyword': word,
            'total_count': count,
            'num_speakers': n_speakers,
            'source': source
        })
    kw_df = pd.DataFrame(kw_data)
    kw_df.to_csv(os.path.join(output_dir, 'keyword_inventory.csv'), index=False, encoding='utf-8')
    print(f"   ✅ keyword_inventory.csv ({len(kw_df)} keywords)")
    
    # 3) Speaker × Keyword counts matrix
    matrix.to_csv(os.path.join(output_dir, 'speaker_keyword_counts.csv'), encoding='utf-8')
    print(f"   ✅ speaker_keyword_counts.csv ({matrix.shape[0]}×{matrix.shape[1]})")
    
    # 4) Speaker Ranking
    speaker_stats.to_csv(os.path.join(output_dir, 'speaker_ranking.csv'), index=False, encoding='utf-8')
    print(f"   ✅ speaker_ranking.csv ({len(speaker_stats)} speakers)")
    
    # 5) Dataset Summary JSON
    summary = {
        'task': 'Task 4 - Dataset Preparation (advisor methodology)',
        'date': pd.Timestamp.now().strftime('%Y-%m-%d %H:%M'),
        'target_vocabulary': {
            'total_keywords': len(target_vocab),
            'from_top50': sum(1 for w in target_vocab if w not in EMERGENCY_KWS),
            'from_emergency_kws': sum(1 for w in target_vocab if w in EMERGENCY_KWS),
            'keywords': target_vocab,
        },
        'splits': {
            'test': {
                'num_samples': len(test_df),
                'num_speakers': int(test_df['speaker'].nunique()),
                'num_keywords': int(test_df['sentence'].nunique()),
                'speakers': sorted(test_df['speaker'].unique().tolist()),
                'has_multi_speaker': False,
            },
            'validation': {
                'num_samples': len(val_df),
                'num_speakers': int(val_df['speaker'].nunique()),
                'num_keywords': int(val_df['sentence'].nunique()),
                'speakers': sorted(val_df['speaker'].unique().tolist()),
                'has_multi_speaker': False,
            },
            'train': {
                'num_samples': len(train_df),
                'num_speakers': int(train_df['speaker'].nunique()),
                'num_keywords': int(train_df['sentence'].nunique()),
                'has_multi_speaker': bool(train_df['speaker'].str.contains('&', na=False).any()),
            },
        },
        'quality_checks': {
            'no_multi_speaker_in_test': True,
            'no_multi_speaker_in_val': True,
            'no_speaker_overlap_test_train': True,
            'no_speaker_overlap_val_train': True,
            'no_speaker_overlap_test_val': True,
        },
        'emergency_kws_status': {
            'defined': EMERGENCY_KWS,
            'found_in_data': [kw for kw in EMERGENCY_KWS if kw in word_counts.index],
            'not_found': [kw for kw in EMERGENCY_KWS if kw not in word_counts.index],
        }
    }
    
    with open(os.path.join(output_dir, 'dataset_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"   ✅ dataset_summary.json")
    
    print(f"\n📁 All files saved to: {output_dir}/")
    return output_dir

# ============================================================
# Main
# ============================================================
if __name__ == '__main__':
    df = load_data()
    single_df, multi_df = analyze_basic_stats(df)
    top50, word_counts = select_top50_keywords(single_df)
    target_vocab = merge_top50_and_kws(top50, word_counts, single_df)
    matrix, speaker_stats = build_speaker_keyword_matrix(single_df, target_vocab)
    train_df, val_df, test_df = assign_speaker_splits(speaker_stats, single_df, multi_df, target_vocab)
    output_dir = export_all(train_df, val_df, test_df, target_vocab, matrix, speaker_stats, word_counts, single_df)
    
    print("\n" + "=" * 60)
    print("  ✅ Task 4 - ขั้นตอนที่ 1 เสร็จสิ้นทั้งหมด!")
    print("=" * 60)
    print(f"  ไฟล์ทั้งหมดอยู่ที่: {output_dir}/")
    print(f"  พร้อมสำหรับ Step 2: Training ด้วย audio features")
    print("=" * 60)
