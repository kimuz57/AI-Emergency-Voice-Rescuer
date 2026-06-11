"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 opacity-50" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle Dark Mode"
      style={{
        boxShadow: isDark
          ? "0 0 12px 3px rgba(250, 204, 21, 0.6), 0 0 28px 6px rgba(250, 204, 21, 0.25)"
          : "0 0 12px 3px rgba(99, 102, 241, 0.5), 0 0 28px 6px rgba(99, 102, 241, 0.2)",
        transition: "box-shadow 0.4s ease, transform 0.2s ease, background 0.3s ease",
      }}
      className={
        "relative p-2.5 rounded-full transition-all hover:scale-110 active:scale-95 " +
        (isDark
          ? "bg-slate-800 text-yellow-300 border border-yellow-400/40"
          : "bg-white text-indigo-500 border border-indigo-300/60")
      }
    >
      {/* Pulse ring */}
      <span
        className="absolute inset-0 rounded-full animate-ping opacity-20"
        style={{ backgroundColor: isDark ? "#facc15" : "#6366f1" }}
      />

      {isDark ? (
        // ☀️ Sun icon
        <svg className="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        // 🌙 Moon icon
        <svg className="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}