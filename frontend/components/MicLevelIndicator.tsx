'use client';

import { useState } from 'react';

// อุปกรณ์ firmwareV2 มีไมโครโฟน INMP441 2 ตัวบนบัส I2S เดียว (ช่องซ้าย/ขวา)
export const MIC_LABELS = ['ไมค์ 1 (ซ้าย)', 'ไมค์ 2 (ขวา)'];

interface MicLevelIndicatorProps {
  levels: number[]; // ระดับสัญญาณของแต่ละไมค์ ช่วง 0-1 เรียงตาม MIC_LABELS
  labels?: string[];
  compact?: boolean; // แท่งเล็กพร้อม tooltip
}

export default function MicLevelIndicator({
  levels,
  labels = MIC_LABELS,
  compact = true,
}: MicLevelIndicatorProps) {
  // จำนวนแท่งเท่ากับจำนวนป้ายชื่อ ค่าที่ขาดถือเป็น 0 ค่าที่เกินช่วงถูกตัดให้อยู่ใน 0-1
  const normalizedLevels = labels.map((_, i) =>
    Math.min(1, Math.max(0, levels[i] ?? 0)),
  );

  const maxLevel = Math.max(...normalizedLevels);
  const maxIndex = normalizedLevels.indexOf(maxLevel);

  // Tooltip คุมด้วย state ให้แสดงได้ทีละอันเท่านั้น
  // (เดิมใช้ group-hover แล้ว tooltip ทุกอันโผล่ค้างพร้อมกันจนตัวหนังสือทับกัน)
  const [hovered, setHovered] = useState<number | null>(null);

  const barColor = (index: number, level: number) =>
    index === maxIndex && level > 0
      ? 'bg-[var(--tb-success)]'
      : 'bg-[var(--tb-primary)]';

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--tb-muted)]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          สัญญาณ
        </span>
        <div className="flex gap-2">
          {normalizedLevels.map((level, index) => {
            const percentage = Math.round(level * 100);
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
                <div className="w-10 h-2 rounded-full overflow-hidden bg-[var(--tb-surface-3)]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${barColor(index, level)}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                {hovered === index && (
                  <div
                    role="tooltip"
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-[var(--tb-text)] text-[var(--tb-surface)] text-xs font-semibold whitespace-nowrap pointer-events-none z-50"
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

  // โหมดเต็ม — หน้า /admin/audio-diagnostics แสดงชื่อไมค์และ % เป็นคอลัมน์ ไม่ต้องมี tooltip
  return (
    <div className="space-y-3">
      {normalizedLevels.map((level, index) => {
        const percentage = Math.round(level * 100);
        return (
          <div key={index} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm font-medium text-[var(--tb-text)]">
              {labels[index]}
            </span>
            <div
              className="flex-1 h-3 rounded-full overflow-hidden bg-[var(--tb-surface-3)]"
              role="meter"
              aria-label={labels[index]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${barColor(index, level)}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--tb-text)]">
              {percentage}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
