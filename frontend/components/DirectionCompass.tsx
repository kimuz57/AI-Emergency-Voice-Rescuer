'use client';

interface DirectionCompassProps {
  angle: number; // 0-360 degrees (0 = North/บน, 90 = East/ขวา, 180 = South/ล่าง, 270 = West/ซ้าย)
  distance?: number | null; // ระยะทางเป็นเมตร (null = ไม่ทราบระยะ)
  confidence?: number; // 0-1 (ความมั่นใจ)
}

export default function DirectionCompass({
  angle,
  distance = null,
  confidence = 1,
}: DirectionCompassProps) {
  // แปลงมุมเป็นทิศทาง (8 ทิศหลัก)
  const getDirectionLabel = (deg: number): string => {
    const normalized = ((deg % 360) + 360) % 360; // normalize to 0-360
    if (normalized >= 337.5 || normalized < 22.5) return 'เหนือ';
    if (normalized >= 22.5 && normalized < 67.5) return 'ตะวันออกเฉียงเหนือ';
    if (normalized >= 67.5 && normalized < 112.5) return 'ตะวันออก';
    if (normalized >= 112.5 && normalized < 157.5) return 'ตะวันออกเฉียงใต้';
    if (normalized >= 157.5 && normalized < 202.5) return 'ใต้';
    if (normalized >= 202.5 && normalized < 247.5) return 'ตะวันตกเฉียงใต้';
    if (normalized >= 247.5 && normalized < 292.5) return 'ตะวันตก';
    return 'ตะวันตกเฉียงเหนือ';
  };

  const directionLabel = getDirectionLabel(angle);
  const confidencePercent = Math.round(confidence * 100);

  // ไม่มีกรอบของตัวเอง — หน้าที่เรียกใช้เป็นคนห่อด้วยกล่องย่อย (เช่นการ์ดแจ้งเตือนใน dashboard)
  return (
    <div className="flex items-center gap-4">
      {/* หน้าปัดเข็มทิศ */}
      <div
        className="relative w-24 h-24 shrink-0 rounded-full bg-[var(--tb-surface)] border border-[var(--tb-border)] shadow-[var(--tb-shadow-xs)]"
        aria-hidden="true"
      >
        {/* วงในบางๆ ช่วยให้กะทิศด้วยตาได้ง่ายขึ้น */}
        <div className="absolute inset-5 rounded-full border border-dashed border-[var(--tb-border)]" />

        {/* อักษรทิศหลัก */}
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-xs font-semibold leading-none text-[var(--tb-muted)]">
          N
        </span>
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold leading-none text-[var(--tb-muted)]">
          E
        </span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-semibold leading-none text-[var(--tb-muted)]">
          S
        </span>
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold leading-none text-[var(--tb-muted)]">
          W
        </span>

        {/* เข็มหมุนตามมุม — หัวลูกศรชี้ทิศของเสียง */}
        <div
          className="absolute top-1/2 left-1/2 transition-transform duration-500 ease-out"
          style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
        >
          {/* ก้านเข็ม */}
          <div className="relative w-1 h-10 rounded-full bg-[var(--tb-danger)]">
            {/* หัวลูกศร */}
            <div
              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderBottom: '6px solid var(--tb-danger)',
              }}
            />
            {/* หางเข็ม */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[var(--tb-border-strong)]" />
          </div>
        </div>

        {/* จุดหมุนกลาง (วางทับเข็ม) */}
        <div className="absolute top-1/2 left-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--tb-surface)] border-2 border-[var(--tb-danger)]" />
      </div>

      {/* ข้อมูลทิศทาง */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-lg font-bold tabular-nums text-[var(--tb-text)]">
            {Math.round(angle)}°
          </span>
          <span className="text-sm font-medium text-[var(--tb-muted)]">
            {directionLabel}
          </span>
        </div>

        {distance !== null && (
          <div className="mt-0.5 text-sm font-semibold text-[var(--tb-primary-text)]">
            ~{distance.toFixed(1)} เมตร
          </div>
        )}

        {/* แถบความมั่นใจ */}
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-medium text-[var(--tb-muted)]">
              ความมั่นใจ
            </span>
            <span className="text-xs font-semibold tabular-nums text-[var(--tb-text)]">
              {confidencePercent}%
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full overflow-hidden bg-[var(--tb-surface-3)] shadow-[inset_0_0_0_1px_var(--tb-border)]"
            role="progressbar"
            aria-label="ความมั่นใจของทิศทาง"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={confidencePercent}
          >
            <div
              className="h-full rounded-full bg-[var(--tb-success)] transition-all duration-500"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
