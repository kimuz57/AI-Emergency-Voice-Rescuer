import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import FloatingThemeToggle from "@/components/FloatingThemeToggle";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Emergency Voice Rescuer",
    default: "Emergency Voice Rescuer",
  },
  description:
    "Emergency Voice Rescuer —  ระบบช่วยเหลือฉุกเฉินด้วยเสียงโดยใช้ปัญญาประดิษฐ์",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-colors duration-300">
        <Providers>
          {children}
          {/* Floating Theme Toggle — ปรากฏทุกหน้า */}
          <FloatingThemeToggle />
        </Providers>
      </body>
    </html>
  );
}
