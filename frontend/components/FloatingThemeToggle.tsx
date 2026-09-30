"use client";

import ThemeToggle from "@/components/ThemeToggle";

export default function FloatingThemeToggle() {
  return (
    // z-40 ตั้งใจให้ต่ำกว่าฉากหลังของ sidebar (z-60) และโมดัลทุกตัว (z-50/100)
    // ของเดิมเป็น z-[9999] ทำให้ปุ่มลอยทับฉากหลัง คลิกปิด sidebar ตรงมุมขวาล่าง
    // แล้วไปโดนปุ่มสลับธีมแทน และยังลอยทับโมดัลทุกอันด้วย
    <div className="fixed bottom-6 right-6 z-40 drop-shadow-xl">
      <ThemeToggle />
    </div>
  );
}
