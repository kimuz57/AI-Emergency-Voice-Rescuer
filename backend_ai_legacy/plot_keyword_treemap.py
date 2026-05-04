#!/usr/bin/env python3
"""Render keyword frequency inventory as a treemap PNG — rainbow colours, box-fitted fonts."""

from pathlib import Path
import argparse

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib import font_manager, rcParams
import matplotlib.colors as mcolors
import pandas as pd
import squarify


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV = BASE_DIR / 'datasets' / 'task4_splits' / 'keyword_inventory.csv'
DEFAULT_OUT = BASE_DIR / 'datasets' / 'task4_splits' / 'keyword_treemap_top50.png'

# ── Figure geometry ──────────────────────────────────────────────────────────
FIG_W, FIG_H = 22, 12          # figure inches
# Axes positioned via add_axes → exact known size
AX_L, AX_B, AX_W, AX_H = 0.005, 0.005, 0.990, 0.880   # fraction of figure
AX_W_IN = FIG_W * AX_W         # axes width  in inches ≈ 21.8
AX_H_IN = FIG_H * AX_H         # axes height in inches ≈ 10.6

# ── Font metrics (fraction of fontsize in pts) ───────────────────────────────
CHAR_W_FRAC = 0.65   # char width  = CHAR_W_FRAC × fontsize
LINE_H_FRAC = 1.35   # line height = LINE_H_FRAC × fontsize  (incl. spacing)

# Pre-computed: pts per data-unit × per char/line
# max_fs_w = w × X_K / n_chars,  max_fs_h = h × Y_K / n_lines
X_K = 72 * AX_W_IN / 100 / CHAR_W_FRAC   # ≈ 24.1
Y_K = 72 * AX_H_IN / 100 / LINE_H_FRAC   # ≈  5.7
MARGIN = 0.76   # keep text inside 76 % of box

FS_MAX = 30     # font size ceiling (pts)
FS_MIN = 5      # font size floor  (pts)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', type=Path, default=DEFAULT_CSV)
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--top-n', type=int, default=50)
    return parser.parse_args()


def configure_thai_font():
    candidates = ['Leelawadee UI', 'Leelawadee', 'TH Sarabun New',
                  'TH SarabunPSK', 'Tahoma', 'Noto Sans Thai']
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for name in candidates:
        if name in installed:
            rcParams['font.family'] = name
            rcParams['axes.unicode_minus'] = False
            return name
    return None


def rainbow_colors(n: int):
    """Smooth rainbow (red→violet) across n items, softened 15% toward white."""
    cmap = plt.cm.rainbow
    out = []
    for i in range(n):
        t = i / max(n - 1, 1)
        r, g, b, _ = cmap(t)
        s = 0.85   # saturation scale
        out.append(mcolors.to_hex((r * s + (1 - s),
                                   g * s + (1 - s),
                                   b * s + (1 - s))))
    return out


def fit_label(keyword: str, count: int, w: float, h: float):
    """Return (label_str, fontsize_pts) that fills the box as much as possible."""
    # -- Two-line label: keyword / (count)
    count_str = f"({count:,})"
    n2_chars  = max(len(keyword), len(count_str))
    fs2_w = w * X_K * MARGIN / n2_chars
    fs2_h = h * Y_K * MARGIN / 2
    fs2   = min(fs2_w, fs2_h, FS_MAX)

    if fs2 >= 8:
        return f"{keyword}\n{count_str}", max(fs2, FS_MIN)

    # -- Single-line label: keyword only
    fs1_w = w * X_K * MARGIN / max(len(keyword), 1)
    fs1_h = h * Y_K * MARGIN / 1
    fs1   = min(fs1_w, fs1_h, FS_MAX)

    return keyword, max(fs1, FS_MIN)


def render_treemap(csv_path: Path, output_path: Path, top_n: int):
    configure_thai_font()
    df = pd.read_csv(csv_path).head(top_n).copy()
    df = df.sort_values('substring_count', ascending=False).reset_index(drop=True)

    sizes   = df['substring_count'].tolist()
    sources = df['source'].tolist()
    colors  = rainbow_colors(len(df))

    fig = plt.figure(figsize=(FIG_W, FIG_H))
    fig.patch.set_facecolor('white')
    ax = fig.add_axes([AX_L, AX_B, AX_W, AX_H])
    ax.set_axis_off()

    normed = squarify.normalize_sizes(sizes, 100, 100)
    rects  = squarify.squarify(normed, 0, 0, 100, 100)

    for i, (rect, color) in enumerate(zip(rects, colors)):
        x, y, w, h = rect['x'], rect['y'], rect['dx'], rect['dy']
        row = df.iloc[i]
        kw, cnt, src = row['keyword'], int(row['substring_count']), sources[i]

        patch = mpatches.FancyBboxPatch(
            (x + 0.12, y + 0.12), w - 0.24, h - 0.24,
            boxstyle='round,pad=0',
            facecolor=color,
            edgecolor='white',
            linewidth=2.0,
        )
        ax.add_patch(patch)

        label, fs = fit_label(kw, cnt, w, h)

        r, g, b, _ = mcolors.to_rgba(color)
        brightness = 0.299 * r + 0.587 * g + 0.114 * b
        txt_col = '#111111' if brightness > 0.48 else '#ffffff'

        # Emergency marker (top-right corner, small text)
        if src == 'emergency_kws':
            ax.text(x + w - 0.5, y + h - 0.4, '[E]',
                    ha='right', va='top',
                    fontsize=max(fs * 0.50, 5),
                    color='#cc0000', fontweight='bold', clip_on=True)

        ax.text(x + w / 2, y + h / 2, label,
                ha='center', va='center',
                fontsize=fs, fontweight='bold',
                color=txt_col, clip_on=True, linespacing=1.05)

    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)

    # Title area above axes
    fig.text(0.5, 0.955, 'Keyword Frequency Treemap (Top 50)',
             ha='center', fontsize=24, fontweight='bold', color='#222')
    fig.text(0.5, 0.915,
             'ขนาดกล่อง = ความถี่  |  สี = ลำดับความถี่ (rainbow)  |  [E] = emergency keyword',
             ha='center', fontsize=12, color='#555')

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=200, bbox_inches='tight', facecolor='white')
    plt.close(fig)


def main():
    args = parse_args()
    render_treemap(args.csv, args.out, args.top_n)
    print(f'Saved → {args.out}')


if __name__ == '__main__':
    main()