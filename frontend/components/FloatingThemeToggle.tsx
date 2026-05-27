"use client";

import ThemeToggle from "@/components/ThemeToggle";

export default function FloatingThemeToggle() {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] drop-shadow-xl">
      <ThemeToggle />
    </div>
  );
}
