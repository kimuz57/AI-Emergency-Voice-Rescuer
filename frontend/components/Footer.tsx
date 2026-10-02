import React from "react";

export default function Footer() {
  return (
    <footer className="mt-auto w-full bg-[var(--tb-surface)] border-t border-[var(--tb-border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-[var(--tb-muted)]">
        <p>© 2026 Emergency Voice Rescuer</p>

        <div className="flex items-center gap-2">
          {/* แม่กุญแจลายเส้น แทนอิโมจิ */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>

          <p>สภาพแวดล้อมที่เป็นส่วนตัวและปลอดภัย</p>
        </div>
      </div>
    </footer>
  );
}
