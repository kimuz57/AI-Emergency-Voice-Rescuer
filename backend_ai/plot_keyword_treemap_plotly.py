#!/usr/bin/env python3
"""Generate keyword treemap using Plotly — cleaner labels, warm gradient."""

from pathlib import Path
import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio

BASE_DIR = Path(__file__).resolve().parent
CSV  = BASE_DIR / 'datasets' / 'task4_splits' / 'keyword_inventory.csv'
OUT  = BASE_DIR / 'datasets' / 'task4_splits' / 'keyword_treemap_top50.png'


def warm_color(norm_val: float, is_emergency: bool) -> str:
    """Map normalised frequency (0-1) to a warm hex colour."""
    if is_emergency:
        # emergency keywords → brick red zone (high contrast)
        r = int(180 + norm_val * 55)
        g = int(30  + norm_val * 30)
        b = int(20  + norm_val * 20)
    else:
        # normal → light yellow (low) to deep orange (high)
        r = int(250 - norm_val * 30)
        g = int(230 - norm_val * 130)
        b = int(100 - norm_val * 85)
    return f'rgb({r},{g},{b})'


def main():
    df = pd.read_csv(CSV)
    max_count = df['substring_count'].max()

    labels, parents, values, colors, texts = [], [], [], [], []

    for row in df.itertuples(index=False):
        norm = row.substring_count / max_count
        is_emg = row.source == 'emergency_kws'
        color = warm_color(norm, is_emg)
        labels.append(row.keyword)
        parents.append('')   # flat — no root node
        values.append(int(row.substring_count))
        colors.append(color)
        texts.append(f"{row.keyword}<br><b>{int(row.substring_count):,}</b>")

    fig = go.Figure(go.Treemap(
        labels=labels,
        parents=parents,
        values=values,
        text=texts,
        texttemplate='%{text}',
        textposition='middle center',
        hovertemplate='<b>%{label}</b><br>Count: %{value:,}<extra></extra>',
        marker=dict(
            colors=colors,
            line=dict(width=1.5, color='white'),
        ),
        textfont=dict(family='Leelawadee UI, Tahoma, Arial', size=14),
        tiling=dict(packing='squarify', pad=2),
    ))

    fig.update_layout(
        title=dict(
            text='<b>Treemap of Keyword Frequency (Top 50)</b>',
            x=0.5, xanchor='center',
            font=dict(size=22, family='Leelawadee UI, Tahoma, Arial'),
        ),
        margin=dict(t=80, l=10, r=10, b=10),
        width=1800,
        height=1000,
        paper_bgcolor='white',
    )

    pio.write_image(fig, str(OUT), scale=2)
    print(f'Saved → {OUT}')


if __name__ == '__main__':
    main()
