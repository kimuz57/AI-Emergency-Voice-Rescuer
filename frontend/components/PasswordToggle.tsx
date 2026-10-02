"use client";

// ปุ่มรูปตาในช่องรหัสผ่าน — ซ่อนอยู่แสดงรูปตา, แสดงอยู่แสดงรูปตาขีดฆ่า
// วางไว้ใน wrapper ที่เป็น relative และให้ input เว้นขวา (pr-12) ไว้ให้ปุ่ม
// ป้ายคงที่ "แสดงรหัสผ่าน" คู่กับ aria-pressed ถ้าสลับป้ายด้วยโปรแกรมอ่านหน้าจอจะอ่าน
// "ซ่อนรหัสผ่าน, pressed" ตอนรหัสกำลังแสดงอยู่ ซึ่งกลับความหมายกัน
export default function PasswordToggle({
  visible,
  onToggle,
  controls,
}: {
  visible: boolean;
  onToggle: () => void;
  controls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="แสดงรหัสผ่าน"
      aria-pressed={visible}
      aria-controls={controls}
      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-lg text-[var(--tb-muted)] hover:text-[var(--tb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tb-primary-ring)] transition-colors"
    >
      {visible ? (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
          <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
          <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
          <path d="m2 2 20 20" />
        </svg>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
