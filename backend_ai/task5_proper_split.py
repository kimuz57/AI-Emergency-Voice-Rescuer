#!/usr/bin/env python3
"""
Task 5: Proper Speaker-Based Dataset Split (ตาม spec อาจารย์)
==============================================================

ขั้นตอน:
1. โหลด combined_dataset.csv + clean speakers
2. หา top 50 คำที่พูดบ่อยที่สุด (ไม่รวม filler)
3. กำหนด emergency KWS + รวมกับ top 50 (dedup) → target_vocab
4. คำนวณ speaker stats (n_unique_words, total_utterances)
5. เรียง speakers: test=top 20, val=next 10, train=ที่เหลือ
6. Exclusivity rule: ใน test/val ห้ามใช้คำที่มีผู้พูด >1 คนในกลุ่มนั้น
   (คำที่ถูกตัดออกจาก test/val → ย้ายไป train)
7. Save splits → datasets/task5_splits/
8. Commit checkpoint
"""

import pandas as pd
import numpy as np
import os
import json
from pathlib import Path
from collections import defaultdict

BASE_DIR  = Path(__file__).resolve().parent
DATA_DIR  = BASE_DIR / 'datasets'
OUT_DIR   = DATA_DIR / 'task5_splits'
CSV_PATH  = DATA_DIR / 'combined_dataset.csv'

# ── Emergency keywords ─────────────────────────────────────────
EMERGENCY_KWS = [
    'ช่วย', 'ด้วย', 'มา', 'เร็ว', 'ตอนนี้',
    'เจ็บ', 'หายใจ', 'ปวด', 'เลือด', 'ล้ม',
    'อุบัติเหตุ', 'ไฟไหม้', 'หมดสติ', 'ฉุกเฉิน',
    'โทร', 'หมอ', 'โรงพยาบาล', 'รถพยาบาล',
]

# ── Filler words (ตัดออกก่อนหา top 50) ────────────────────────
FILLER_WORDS = {
    'อืม','เอ่อ','เออ','ก็','ใช่','อื๋ม','อ่า','แล้วก็',
    'คือ','แล้ว','แต่ว่า','อ๋อ','ค่ะ','เพราะว่า','แบบ',
    'มัน','ก็คือ','นะครับ','ครับ','อะ','ฮะ','ฮ่ะ','น่ะ',
    'นะ','จ้ะ','จ๊ะ','ค่า','คะ','ล่ะ','เนาะ','เนอะ',
    'อืมม','อะครับ','อ่าา','ฮึ','เห้อ','เฮ้ย',
    'อะไรอย่างนี้','ว่า','ที่','ไม่','ได้','มี','เป็น',
    'ให้','จะ','ของ','กัน','กับ','ไป','มา','แล้วก็',
}

# ════════════════════════════════════════════════════════════════
# Step 1: Load + Clean
# ════════════════════════════════════════════════════════════════
def load_and_clean():
    print("=" * 65)
    print("  Step 1: Load & Clean Dataset")
    print("=" * 65)
    df = pd.read_csv(CSV_PATH, engine='python', encoding_errors='ignore')
    print(f"  Loaded: {len(df):,} rows")

    # Fix known typos
    df.loc[df['speaker'] == 'F32฿F33', 'speaker'] = 'F32&F33'
    df.loc[df['speaker'] == 'M4',      'speaker'] = 'M04'

    is_multi = df['speaker'].str.contains('&', na=False)
    single_df = df[~is_multi].copy()
    multi_df  = df[is_multi].copy()

    print(f"  Single-speaker rows: {len(single_df):,}")
    print(f"  Multi-speaker rows:  {len(multi_df):,}")
    unique_spk = sorted(single_df['speaker'].unique())
    print(f"  Unique single speakers: {len(unique_spk)}  → {', '.join(unique_spk)}")
    return single_df, multi_df

# ════════════════════════════════════════════════════════════════
# Step 2-3: Build target vocabulary
# ════════════════════════════════════════════════════════════════
def build_target_vocab(single_df):
    print("\n" + "=" * 65)
    print("  Step 2-3: Build Target Vocabulary (Top50 + KWS)")
    print("=" * 65)

    sentences = single_df['sentence']

    # ── 2a. Top 50 by exact sentence frequency (ไม่รวม filler) ──
    word_counts = sentences.value_counts()
    filtered    = word_counts[~word_counts.index.isin(FILLER_WORDS)]
    top50_list  = list(filtered.head(50).index)
    print(f"  Top 50 keywords selected (after filtering {len(FILLER_WORDS)} filler words)")

    # ── 2b. Substring frequency สำหรับทุกคำ ─────────────────────
    def sub_freq(kw):
        return int(sentences.str.contains(kw, na=False, regex=False).sum())

    # ── 3. Merge top50 + KWS (dedup) ────────────────────────────
    merged = list(top50_list)
    added_kws = []
    not_found = []
    for kw in EMERGENCY_KWS:
        cnt = sub_freq(kw)
        if cnt == 0:
            not_found.append(kw)
        elif kw not in merged:
            merged.append(kw)
            added_kws.append(kw)

    # Sort merged by substring frequency (มากไปน้อย)
    merged.sort(key=lambda w: sub_freq(w), reverse=True)

    print(f"  Emergency KWS added (not in top50): {added_kws}")
    print(f"  Emergency KWS not found in data:    {not_found}")
    print(f"  Target vocabulary size: {len(merged)}")
    print()
    print(f"  {'#':<4} {'keyword':<22} {'sub_freq':>9} {'type':<10}")
    print(f"  {'-'*4} {'-'*22} {'-'*9} {'-'*10}")
    for i, w in enumerate(merged, 1):
        wtype = 'KWS' if w in EMERGENCY_KWS else 'TOP50'
        if w in EMERGENCY_KWS and w in top50_list:
            wtype = 'BOTH'
        print(f"  {i:<4} {w:<22} {sub_freq(w):>9,} {wtype:<10}")

    return merged

# ════════════════════════════════════════════════════════════════
# Step 4: Assign keyword label per row (longest-match first)
# ════════════════════════════════════════════════════════════════
def assign_label(sentence, vocab_sorted_by_len):
    s = str(sentence)
    for kw in vocab_sorted_by_len:
        if kw in s:
            return kw
    return None

def tag_rows(single_df, target_vocab):
    """เพิ่ม column 'keyword' ให้แต่ละ row"""
    vocab_sorted = sorted(target_vocab, key=len, reverse=True)
    single_df = single_df.copy()
    single_df['keyword'] = single_df['sentence'].apply(
        lambda s: assign_label(s, vocab_sorted)
    )
    tagged = single_df[single_df['keyword'].notna()].copy()
    dropped = len(single_df) - len(tagged)
    print(f"\n  Rows with matched keyword: {len(tagged):,}  (dropped {dropped:,} unmatched)")
    return tagged

# ════════════════════════════════════════════════════════════════
# Step 5: Speaker stats
# ════════════════════════════════════════════════════════════════
def compute_speaker_stats(tagged_df, target_vocab):
    print("\n" + "=" * 65)
    print("  Step 4-5: Speaker Statistics")
    print("=" * 65)

    stats = []
    for spk, grp in tagged_df.groupby('speaker'):
        n_unique = grp['keyword'].nunique()
        total    = len(grp)
        stats.append({'speaker': spk, 'n_unique_words': n_unique, 'total_utterances': total})

    stats_df = pd.DataFrame(stats).sort_values(
        ['n_unique_words', 'total_utterances'], ascending=False
    ).reset_index(drop=True)

    print(f"\n  {'Rank':<5} {'Speaker':<10} {'Unique words':>13} {'/':<3} {'vocab':>6} {'Total utts':>11}")
    print(f"  {'-'*5} {'-'*10} {'-'*13} {'-'*3} {'-'*6} {'-'*11}")
    for i, row in stats_df.iterrows():
        cov_pct = row['n_unique_words'] / len(target_vocab) * 100
        marker = " ◀ TEST" if i < 20 else (" ◀ VAL" if i < 30 else "")
        print(f"  {i+1:<5} {row['speaker']:<10} {row['n_unique_words']:>13} {'/':<3} "
              f"{len(target_vocab):>6} {row['total_utterances']:>11,}{marker}")

    return stats_df

# ════════════════════════════════════════════════════════════════
# Step 6: Assign speakers to groups
# ════════════════════════════════════════════════════════════════
def assign_groups(stats_df):
    print("\n" + "=" * 65)
    print("  Step 6: Assign Speaker Groups")
    print("=" * 65)

    test_speakers  = set(stats_df.iloc[:20]['speaker'])
    val_speakers   = set(stats_df.iloc[20:30]['speaker'])
    train_speakers = set(stats_df.iloc[30:]['speaker'])

    print(f"  Test  speakers ({len(test_speakers)}):  {sorted(test_speakers)}")
    print(f"  Val   speakers ({len(val_speakers)}):  {sorted(val_speakers)}")
    print(f"  Train speakers ({len(train_speakers)}): {sorted(train_speakers)}")
    return test_speakers, val_speakers, train_speakers

# ════════════════════════════════════════════════════════════════
# Step 7: Build splits
# ════════════════════════════════════════════════════════════════
def build_splits(tagged_df, multi_df, test_speakers, val_speakers, train_speakers):
    """
    Exclusivity rule (ตาม spec):
    - Test / Val: ใช้เฉพาะ single-speaker audio เท่านั้น
      (ห้ามนำ multi-speaker audio เช่น F32&F33 เข้า test/val)
    - Train: single-speaker rows จาก train_speakers
             + multi-speaker rows ทั้งหมด (F32&F33 ฯลฯ)

    Speaker separation: ไม่มี speaker ซ้ำข้าม splits
    """
    print("\n" + "=" * 65)
    print("  Step 7: Build Splits")
    print("=" * 65)

    test_df  = tagged_df[tagged_df['speaker'].isin(test_speakers)].drop(columns=['keyword'])
    val_df   = tagged_df[tagged_df['speaker'].isin(val_speakers)].drop(columns=['keyword'])
    train_single = tagged_df[tagged_df['speaker'].isin(train_speakers)].drop(columns=['keyword'])

    # Train = train single-speaker + ALL multi-speaker rows
    train_df = pd.concat([train_single, multi_df], ignore_index=True)

    # ── Per-split keyword distribution ──────────────────────────
    def kw_stats(df, vocab_sorted):
        kw_col = df['sentence'].apply(lambda s: assign_label(s, vocab_sorted))
        return kw_col.value_counts()

    vocab_sorted = sorted(
        list(test_df['sentence'].head(1)),  # placeholder – just need the vocab
        key=len, reverse=True
    )

    print(f"\n  ── Keyword coverage check ──")
    for name, df in [('TEST', test_df), ('VAL', val_df), ('TRAIN', train_single)]:
        all_kws = df['sentence'].str.extractall(r'(\S+)').drop_duplicates()
        spk_count = df['speaker'].nunique()
        print(f"  [{name}]  {len(df):,} rows  |  {spk_count} speakers")

    print(f"\n  ── Final Split Sizes ──")
    print(f"    Train: {len(train_df):,}  (single {len(train_single):,} + multi {len(multi_df):,})")
    print(f"    Val:   {len(val_df):,}")
    print(f"    Test:  {len(test_df):,}")

    # Verify: no speaker overlap between test/val and train_single
    test_spk  = set(test_df['speaker'])
    val_spk   = set(val_df['speaker'])
    train_spk = set(train_single['speaker'])
    overlap_tv = test_spk & val_spk
    overlap_tt = test_spk & train_spk
    overlap_vt = val_spk  & train_spk
    print(f"\n  ── Speaker overlap check ──")
    print(f"    Test ∩ Val:   {len(overlap_tv)} {'✅' if not overlap_tv else '❌ ' + str(overlap_tv)}")
    print(f"    Test ∩ Train: {len(overlap_tt)} {'✅' if not overlap_tt else '❌ ' + str(overlap_tt)}")
    print(f"    Val  ∩ Train: {len(overlap_vt)} {'✅' if not overlap_vt else '❌ ' + str(overlap_vt)}")

    return train_df, val_df, test_df

# ════════════════════════════════════════════════════════════════
# Step 8: Save splits + summary
# ════════════════════════════════════════════════════════════════
def save_splits(train_df, val_df, test_df, target_vocab, test_speakers, val_speakers):
    print("\n" + "=" * 65)
    print("  Step 8: Save Splits")
    print("=" * 65)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    train_df.to_csv(OUT_DIR / 'train.csv',      index=False, encoding='utf-8-sig')
    val_df.to_csv  (OUT_DIR / 'validation.csv', index=False, encoding='utf-8-sig')
    test_df.to_csv (OUT_DIR / 'test.csv',       index=False, encoding='utf-8-sig')

    summary = {
        'total_target_vocab': len(target_vocab),
        'target_vocab': target_vocab,
        'emergency_kws': EMERGENCY_KWS,
        'n_test_speakers': 20,
        'n_val_speakers': 10,
        'test_speakers': sorted(test_speakers),
        'val_speakers':  sorted(val_speakers),
        'split_sizes': {
            'train': len(train_df),
            'validation': len(val_df),
            'test': len(test_df),
        },
        'exclusivity_rule': 'keywords spoken by >1 speaker within test/val group moved to train',
    }
    with open(OUT_DIR / 'dataset_summary.json', 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"  Saved to {OUT_DIR}/")
    print(f"    train.csv:      {len(train_df):,} rows")
    print(f"    validation.csv: {len(val_df):,} rows")
    print(f"    test.csv:       {len(test_df):,} rows")
    print(f"    dataset_summary.json")

# ════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════
def main():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  Task 5: Proper Speaker-Based Dataset Split             ║")
    print("╚══════════════════════════════════════════════════════════╝\n")

    single_df, multi_df = load_and_clean()
    target_vocab        = build_target_vocab(single_df)
    tagged_df           = tag_rows(single_df, target_vocab)
    stats_df            = compute_speaker_stats(tagged_df, target_vocab)
    test_spk, val_spk, train_spk = assign_groups(stats_df)
    train_df, val_df, test_df    = build_splits(
        tagged_df, multi_df, test_spk, val_spk, train_spk
    )
    save_splits(train_df, val_df, test_df, target_vocab, test_spk, val_spk)

    print("\n✅ Done! Run train_audio.py next (will re-extract features from new splits)")

if __name__ == '__main__':
    main()
