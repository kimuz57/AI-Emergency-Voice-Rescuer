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

  return (
    <div className="flex flex-col items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600">
      {/* Compass Circle */}
      <div className="relative w-24 h-24">
        {/* Outer circle with cardinal directions */}
        <div className="absolute inset-0 rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
          {/* North marker */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            N
          </div>
          {/* East marker */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            E
          </div>
          {/* South marker */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            S
          </div>
          {/* West marker */}
          <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            W
          </div>

          {/* Center dot */}
          <div className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 bg-slate-400 dark:bg-slate-500 rounded-full" />

          {/* Rotating needle (arrow) */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-500 ease-out"
            style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
          >
            {/* Arrow shaft */}
            <div className="relative w-1 h-10 bg-gradient-to-b from-red-500 to-red-600 rounded-full -translate-x-1/2 shadow-lg">
              {/* Arrow head */}
              <div
                className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0"
                style={{
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderBottom: '6px solid rgb(239, 68, 68)',
                }}
              />
              {/* Arrow tail */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-400 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Direction info */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <span className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {Math.round(angle)}°
          </span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {directionLabel}
          </span>
        </div>

        {distance !== null && (
          <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            ~{distance.toFixed(1)} เมตร
          </div>
        )}

        {/* Confidence bar */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
            {confidencePercent}%
          </span>
        </div>
      </div>
    </div>
  );
}
