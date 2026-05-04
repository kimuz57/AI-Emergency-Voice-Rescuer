import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} font-sans text-slate-900 antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
