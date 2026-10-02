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
        <span className="text-[10px] font-bold neu-text-muted uppercase tracking-wide inline-flex items-center gap-1">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          Signal:
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
                <div className="neu-track w-8 h-2">
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
                    <svg className="w-2.5 h-2.5 animate-pulse" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                    </svg>
                  </div>
                )}

                {/* Tooltip — แสดงได้ทีละอันเท่านั้น */}
                {isHovered && (
                  <div
                    role="tooltip"
                    className="neu-card-sm absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 neu-text text-[9px] font-bold whitespace-nowrap pointer-events-none z-50"
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
            <span className="text-xs font-medium neu-text-muted w-14 shrink-0">
              {labels[index]}
            </span>
            <div className="neu-track flex-1 h-3">
              <div
                className={`h-full transition-all duration-300 ${
                  isMax
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                    : 'bg-gradient-to-r from-blue-400 to-blue-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs font-bold neu-text-muted w-10 text-right tabular-nums shrink-0">
              {percentage}%
            </span>
            <span className="w-4 shrink-0 text-sm">
              {isMax && level > 0.7 && (
                <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                </svg>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
