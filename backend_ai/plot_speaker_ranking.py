#!/usr/bin/env python3
"""Render speaker ranking CSV as a presentation-ready PNG."""

from pathlib import Path
import argparse

import matplotlib.pyplot as plt
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV = BASE_DIR / 'datasets' / 'task4_splits' / 'speaker_ranking.csv'
DEFAULT_OUT = BASE_DIR / 'datasets' / 'task4_splits' / 'speaker_ranking_top20.png'


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', type=Path, default=DEFAULT_CSV, help='Path to speaker_ranking.csv')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help='Output PNG path')
    parser.add_argument('--top-n', type=int, default=20, help='Number of ranked speakers to plot')
    return parser.parse_args()


def render_chart(csv_path: Path, output_path: Path, top_n: int):
    df = pd.read_csv(csv_path)
    top_df = df.head(top_n).copy()
    top_df = top_df.sort_values('vocab_coverage', ascending=True)

    plt.style.use('seaborn-v0_8-whitegrid')
    fig, (ax1, ax2) = plt.subplots(
        nrows=1,
        ncols=2,
        figsize=(16, 9),
        gridspec_kw={'width_ratios': [1.15, 1.0]},
        constrained_layout=True,
    )

    bars1 = ax1.barh(top_df['speaker'], top_df['vocab_coverage'], color='#2f6db2')
    ax1.set_title(f'Top {top_n} Speakers by Vocabulary Coverage', fontsize=18, weight='bold')
    ax1.set_xlabel('Unique Target Keywords Covered')
    ax1.set_ylabel('Speaker')
    ax1.set_xlim(0, max(top_df['vocab_coverage']) + 6)

    for bar, pct in zip(bars1, top_df['coverage_pct']):
        width = bar.get_width()
        ax1.text(width + 0.3, bar.get_y() + bar.get_height() / 2, f'{int(width)} ({pct:.1f}%)',
                 va='center', fontsize=10)

    bars2 = ax2.barh(top_df['speaker'], top_df['total_target_tokens'], color='#eb7f37')
    ax2.set_title('Total Target Tokens Spoken', fontsize=18, weight='bold')
    ax2.set_xlabel('Token Count')
    ax2.set_ylabel('')
    ax2.set_xlim(0, max(top_df['total_target_tokens']) * 1.15)

    for bar in bars2:
        width = int(bar.get_width())
        ax2.text(width + max(top_df['total_target_tokens']) * 0.01,
                 bar.get_y() + bar.get_height() / 2,
                 f'{width:,}',
                 va='center', fontsize=10)

    fig.suptitle(
        'Speaker Ranking Summary for Advisor Review\nTask 4 Split Preparation from LOTUSDIS',
        fontsize=22,
        weight='bold',
    )
    fig.text(
        0.5,
        0.02,
        'Ranking is based on coverage of target vocabulary and total target-token frequency.',
        ha='center',
        fontsize=11,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=200, bbox_inches='tight')
    plt.close(fig)


def main():
    args = parse_args()
    render_chart(args.csv, args.out, args.top_n)
    print(f'Saved chart to {args.out}')


if __name__ == '__main__':
    main()