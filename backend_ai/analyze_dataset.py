import pandas as pd

df = pd.read_csv('datasets/normal_data.csv')
print('Unique speakers:', df['speaker'].unique()[:10])
print('Total unique speakers:', df['speaker'].nunique())
print('Unique sentences:', df['sentence'].unique()[:20])
print('Total unique sentences:', df['sentence'].nunique())

# Get keyword frequencies
keyword_counts = df['sentence'].value_counts()
print('\nTop 20 keywords by frequency:')
for kw, count in keyword_counts.head(20).items():
    print(f'{kw}: {count}')

# Check for multi-speaker entries
multi_speakers = df[df['speaker'].str.contains('&', na=False)]
print(f'\nMulti-speaker entries: {len(multi_speakers)}')
print('Examples:', multi_speakers['speaker'].unique()[:5])