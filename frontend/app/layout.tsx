/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import FloatingThemeToggle from "@/components/FloatingThemeToggle";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Inter อยู่ก่อนในลำดับ font ตัวละตินจึงเป็น Inter ส่วนตัวไทยตกมาที่ตัวนี้
const thai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai"],
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

// ตั้ง data-sidebar ก่อนหน้าเว็บวาดครั้งแรก — ถ้ารอให้ Sidebar อ่าน localStorage
// หลัง hydrate คนที่ย่อเมนูไว้จะเห็น sidebar กว้าง 256px แว้บหนึ่งทุกครั้งที่โหลดหน้า
// คีย์ต้องตรงกับ "sidebarCollapsed" ใน components/Sidebar.tsx
const sidebarInitScript = `try{if(localStorage.getItem("sidebarCollapsed")==="1")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${inter.variable} ${thai.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: sidebarInitScript }} />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* สีพื้นกับสีตัวอักษรมาจากตัวแปรใน globals.css และพื้นหลังรูปภาพวาดด้วย body::before
          ไม่ฮาร์ดโค้ด bg-slate-* ตรงนี้ ไม่งั้นจะทับพื้นหลังรูปภาพ */}
      <body className="neu-text transition-colors duration-300 overflow-x-hidden">
        <Providers>
          {children}
          {/* Floating Theme Toggle — ปรากฏทุกหน้า */}
          <FloatingThemeToggle />
        </Providers>
      </body>
    </html>
  );
}
