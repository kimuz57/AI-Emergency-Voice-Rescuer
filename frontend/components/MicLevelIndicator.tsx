'use client';

import { useState } from 'react';

interface MicLevelIndicatorProps {
  levels: number[]; // Array of 4 mic levels (0-1)
  labels?: string[]; // Optional custom labels (default: Mic 1, Mic 2, ...)
  compact?: boolean; // Compact mode (mini bars)
}

const DEFAULT_LABELS = ['ไมค์ 1', 'ไมค์ 2', 'ไมค์ 3', 'ไมค์ 4'];

export default function MicLevelIndicator({
  levels,
  labels = DEFAULT_LABELS,
  compact = true,
}: MicLevelIndicatorProps) {
  // Ensure we have exactly 4 levels
  const normalizedLevels = levels.slice(0, 4).concat(Array(4).fill(0)).slice(0, 4);

  // Find the highest level mic
  const maxLevel = Math.max(...normalizedLevels);
  const maxIndex = normalizedLevels.indexOf(maxLevel);

  // Tooltip คุมด้วย state ไม่ใช่ group-hover
  //
  // ของเดิมใช้ `opacity-0 group-hover:opacity-100` แล้วเจอบั๊ก tooltip ทั้ง 4 อัน
  // โผล่ค้างพร้อมกัน ตัวหนังสือทับกันเป็น "ไมค์1: ไมค์2: ไมค์3: ไมค์4:45%"
  // (เพราะ tooltip เป็น absolute + whitespace-nowrap กว้างกว่าแท่ง w-8 หลายเท่า)
  //
  // เปลี่ยนมาคุมด้วย state แทน ทำให้แสดงได้ทีละอันเท่านั้นตามโครงสร้าง
  // บั๊กเดิมเกิดซ้ำไม่ได้อีก และไม่ต้องพึ่ง variant ของ Tailwind ให้ทำงานถูก
  const [hovered, setHovered] = useState<number | null>(null);

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
            const isHovered = hovered === index;

            return (
              <div
                key={index}
                className="relative"
                tabIndex={0}
                aria-label={`${labels[index]}: ${percentage}%`}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered((prev) => (prev === index ? null : prev))}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered((prev) => (prev === index ? null : prev))}
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

                {/* Tooltip — แสดงได้ทีละอันเท่านั้น */}
                {isHovered && (
                  <div
                    role="tooltip"
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[9px] font-bold rounded whitespace-nowrap pointer-events-none z-50 shadow-lg"
                  >
                    {labels[index]}: {percentage}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Full mode — ใช้ในหน้า /admin/audio-diagnostics ที่มีพื้นที่พอ
  // โหมดนี้แสดง label กับ % เป็นคอลัมน์ของตัวเอง เลยไม่ต้องมี tooltip เลย
  return (
    <div className="space-y-2">
      {normalizedLevels.map((level, index) => {
        const isMax = index === maxIndex && level > 0;
        const percentage = Math.round(level * 100);

        return (
          <div key={index} className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-14 shrink-0">
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
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-10 text-right tabular-nums shrink-0">
              {percentage}%
            </span>
            <span className="w-4 shrink-0 text-sm">
              {isMax && level > 0.7 && <span className="animate-pulse">✨</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
