'use client';

interface MicLevelIndicatorProps {
  levels: number[]; // Array of 4 mic levels (0-1)
  labels?: string[]; // Optional custom labels (default: Mic 1, Mic 2, ...)
  compact?: boolean; // Compact mode (mini bars)
}

export default function MicLevelIndicator({
  levels,
  labels = ['ไมค์ 1', 'ไมค์ 2', 'ไมค์ 3', 'ไมค์ 4'],
  compact = true,
}: MicLevelIndicatorProps) {
  // Ensure we have exactly 4 levels
  const normalizedLevels = levels.slice(0, 4).concat(Array(4).fill(0)).slice(0, 4);

  // Find the highest level mic
  const maxLevel = Math.max(...normalizedLevels);
  const maxIndex = normalizedLevels.indexOf(maxLevel);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          🎤 Signal:
        </span>
        <div className="flex gap-1.5">
          {normalizedLevels.map((level, index) => {
            const isMax = index === maxIndex && level > 0;
            const percentage = Math.round(level * 100);

            return (
              <div
                key={index}
                className="relative group"
                title={`${labels[index]}: ${percentage}%`}
              >
                {/* Mini bar */}
                <div className="w-8 h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isMax
                        ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                        : 'bg-gradient-to-r from-blue-400 to-blue-500'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {/* Sparkle effect for max mic */}
                {isMax && level > 0.7 && (
                  <div className="absolute -top-1 -right-1">
                    <span className="text-[10px] animate-pulse">✨</span>
                  </div>
                )}

                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[9px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                  {labels[index]}: {percentage}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Full mode (not used in Phase 3, but available for future)
  return (
    <div className="space-y-2">
      {normalizedLevels.map((level, index) => {
        const isMax = index === maxIndex && level > 0;
        const percentage = Math.round(level * 100);

        return (
          <div key={index} className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-12">
              {labels[index]}
            </span>
            <div className="flex-1 h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isMax
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                    : 'bg-gradient-to-r from-blue-400 to-blue-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-10 text-right tabular-nums">
              {percentage}%
            </span>
            {isMax && level > 0.7 && (
              <span className="text-sm animate-pulse">✨</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
