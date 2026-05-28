import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Guardian AI",
    default: "Guardian AI — ระบบตรวจจับเสียงฉุกเฉินอัจฉริยะ",
  },
  description:
    "AI-Based Emergency Voice Detection System — ระบบตรวจจับเสียงฉุกเฉินอัจฉริยะ",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  // 🟢 ลบ html และ body ออกให้หมด ให้เหลือแค่ div หรือ children
  return (
    <div className="w-full min-h-screen">
      {children}
    </div>
  );
}
