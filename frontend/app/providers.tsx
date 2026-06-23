"use client";

import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react"; // 🟢 1. Import SessionProvider เข้ามา

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // 🟢 2. เอา SessionProvider ครอบไว้ชั้นนอกสุด
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}