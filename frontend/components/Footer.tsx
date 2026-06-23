import React from 'react';

export default function Footer() {
  return (
    <footer className="py-8 mt-auto border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold">
        
        <p className="dark:text-slate-400">
          © 2026 Emergency Voice Rescuer
        </p>
        
        <div className="flex items-center gap-2">
          {/* 🟢 เปลี่ยนจากอิโมจิ มาใช้ SVG แม่กุญแจลายเส้นตามที่คุณต้องการ */}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="w-4 h-4 text-slate-400 dark:text-slate-500" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>

          <p className="dark:text-slate-400">
            สภาพแวดล้อมที่เป็นส่วนตัวและปลอดภัย
          </p>
        </div>

      </div>
    </footer>
  );
}