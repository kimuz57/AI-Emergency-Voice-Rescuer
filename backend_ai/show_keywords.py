#!/usr/bin/env python3
import numpy as np
from collections import Counter

train_kw = np.load('datasets/features_cache/train_y_keyword.npy', allow_pickle=True).tolist()
val_kw   = np.load('datasets/features_cache/validation_y_keyword.npy', allow_pickle=True).tolist()
test_kw  = np.load('datasets/features_cache/test_y_keyword.npy', allow_pickle=True).tolist()

all_kw  = train_kw + val_kw + test_kw
counts  = Counter(all_kw)
train_c = Counter(train_kw)
val_c   = Counter(val_kw)
test_c  = Counter(test_kw)

print(f"รวมทั้งหมด: {len(all_kw):,} samples | {len(counts)} คำ")
print()
print(f"{'#':<4} {'คำ':<22} {'train':>8} {'val':>7} {'test':>8} {'รวม':>8}")
print("-" * 62)

for i, (word, total) in enumerate(counts.most_common(50), 1):
    t  = train_c.get(word, 0)
    v  = val_c.get(word, 0)
    ts = test_c.get(word, 0)
    print(f"{i:<4} {word:<22} {t:>8,} {v:>7,} {ts:>8,} {total:>8,}")

print("-" * 62)
top50_total = sum(v for _, v in counts.most_common(50))
print(f"{'รวม Top 50':<26} {sum(train_c.get(w,0) for w,_ in counts.most_common(50)):>8,} "
      f"{sum(val_c.get(w,0) for w,_ in counts.most_common(50)):>7,} "
      f"{sum(test_c.get(w,0) for w,_ in counts.most_common(50)):>8,} "
      f"{top50_total:>8,}")
