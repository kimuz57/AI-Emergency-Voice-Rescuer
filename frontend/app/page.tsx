"use client";
import React from "react";
import ThemeToggle from "@/components/ThemeToggle";
export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300">
      {/* ========================================== */}
      {/* 🪄 แทรก CSS Custom Animation สำหรับลูกแก้วลอย */}
      {/* ========================================== */}
      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(250px, -150px) scale(1.2);
          }
          66% {
            transform: translate(-150px, 200px) scale(0.8);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 15s infinite ease-in-out;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>

      {/* ========================================== */}
      {/* 🌟 1. Background Glowing Orbs (เปลี่ยนมาใช้ animate-blob) */}
      {/* ========================================== */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob pointer-events-none"></div>
      <div className="absolute top-[10%] right-[-10%] w-[500px] h-[500px] bg-purple-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob animation-delay-2000 pointer-events-none"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[600px] h-[600px] bg-indigo-300 rounded-full mix-blend-multiply filter blur-[120px] opacity-30 animate-blob animation-delay-4000 pointer-events-none"></div>

      {/* ========================================== */}
      {/* 🚀 2. Navbar */}
      {/* ========================================== */}
      <nav className="relative z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-b border-white/50 dark:border-slate-700/50 px-4 md:px-12 py-3 flex justify-between items-center shadow-sm transition-colors duration-300">
        {/* ฝั่งซ้าย: Logo */}
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="flex items-end gap-0.5 md:gap-1 h-4 md:h-6 shrink-0">
            <div
              className="w-1 md:w-1.5 h-2 md:h-3 bg-blue-600 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            ></div>
            <div
              className="w-1 md:w-1.5 h-4 md:h-6 bg-indigo-500 rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            ></div>
            <div
              className="w-1 md:w-1.5 h-3 md:h-4 bg-purple-500 rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            ></div>
          </div>
          <span className="text-[13px] sm:text-lg md:text-xl font-extrabold bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600 bg-clip-text text-transparent whitespace-nowrap truncate">
            Emergency Voice Rescuer
          </span>
        </div>

        {/* ฝั่งขวา: เมนูและปุ่มต่างๆ */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* 🟢 ปุ่ม Theme Toggle จะอยู่ตรงนี้ */}
          {/* <ThemeToggle /> */}

          {/* 🟢 เส้นคั่นบางๆ (ซ่อนในมือถือ โชว์ในจอใหญ่) */}
          <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-700 transition-colors"></div>

          <a
            href="/login"
            className="px-2 sm:px-3 py-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-all text-xs sm:text-base"
          >
            Sign In
          </a>
          <a
            href="/login"
            className="px-3 sm:px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-bold hover:shadow-lg hover:shadow-purple-500/30 transition-all hover:-translate-y-0.5 text-xs sm:text-base whitespace-nowrap flex items-center gap-1"
          >
            Get Started{" "}
            <span className="text-amber-300 group-hover:rotate-12 transition-transform duration-300 hidden sm:inline">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                <path d="M5 3v4" />
                <path d="M7 5H3" />
                <path d="M19 17v4" />
                <path d="M21 19h-4" />
              </svg>
            </span>
          </a>
        </div>
      </nav>

      {/* ========================================== */}
      {/* 🎯 3. Hero Section */}
      {/* ========================================== */}
      <main className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-24 md:pt-32 pb-20">
        {/* <div className="inline-flex items-center gap-2 px-3 md:px-4 py-2 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-purple-100 dark:border-slate-700 shadow-sm mb-6 md:mb-8">
          <span className="flex h-2 w-2 md:h-2.5 md:w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-purple-500"></span>
          </span>
            <span className="text-[10px] md:text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            AI Voice Detection Active
          </span>
        </div> */}

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold mb-4 md:mb-6 text-slate-900 dark:text-white tracking-tight leading-tight">
          ฟังทุกเสียงร้องขอ <br className="hidden md:block" />
          <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 bg-clip-text text-transparent drop-shadow-sm">
            ปกป้องด้วย AI อัจฉริยะ
          </span>
        </h1>

        <p className="text-base md:text-xl text-slate-500 dark:text-slate-400 mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed px-4">
          ยกระดับความปลอดภัยให้ผู้สูงอายุและผู้ป่วย
          ด้วยเทคโนโลยีจำแนกเสียงที่ทำงานตลอด 24 ชั่วโมง
          พร้อมระบบแจ้งเตือนความหน่วงต่ำ
        </p>

        <a
          href="/login"
          className="group relative px-6 md:px-8 py-3 md:py-4 bg-slate-900 text-white rounded-2xl font-bold text-base md:text-lg hover:bg-slate-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <span className="relative flex items-center gap-2">
            Start Monitoring
            <svg
              className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </span>
        </a>
      </main>

      {/* ========================================== */}
      {/* 🧩 4. Key Features Block */}
      {/* ========================================== */}
      <section className="relative z-10 py-12 md:py-20 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="p-6 md:p-8 bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/50 dark:to-blue-800/30 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-xl md:text-2xl group-hover:scale-110 transition-transform">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-pink-500"
              >
                <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
                <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
                <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
                <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
                <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
                <path d="M6 18a4 4 0 0 1-1.967-.516" />
                <path d="M19.967 17.484A4 4 0 0 1 18 18" />
              </svg>
            </div>

            <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800 dark:text-slate-100">
              BCResNet Engine
            </h3>

            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              แพลตฟอร์มตรวจจับเสียงร้องขอความช่วยเหลือแบบเรียลไทม์
              เพื่อความปลอดภัยของผู้สูงอายุและผู้ป่วยในสถานพยาบาล
              ขับเคลื่อนด้วยโมเดล BCResNet
            </p>
          </div>

          <div className="p-6 md:p-8 bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/50 dark:to-indigo-800/30 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-xl md:text-2xl group-hover:scale-110 transition-transform">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-orange-500"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>

            <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800 dark:text-slate-100">
              Low-Latency Alert
            </h3>

            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              ส่งสัญญาณแจ้งเตือนไปยังแดชบอร์ดผู้ดูแล ผ่านโปรโตคอล WebSocket และ
              MQTT แบบเรียลไทม์
            </p>
          </div>

          <div className="p-6 md:p-8 bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/50 dark:to-purple-800/30 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-xl md:text-2xl group-hover:scale-110 transition-transform">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-blue-500"
              >
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2-1 4-2 7-2 2.5 0 4.5 1 6 2a1 1 0 0 1 1 1v7z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>

            <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800 dark:text-slate-100">
              Access Control
            </h3>

            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              รองรับการลงทะเบียนและยืนยันตัวตนผู้ดูแลผ่าน JWT Token และ OAuth
              Google ควบคุมสิทธิ์การเข้าถึงข้อมูลผู้ป่วยแต่ละรายอย่างปลอดภัย
            </p>
          </div>

          <div className="p-6 md:p-8 bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-sky-100 to-sky-50 dark:from-sky-900/50 dark:to-sky-800/30 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-xl md:text-2xl group-hover:scale-110 transition-transform">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-indigo-500"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>

            <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800 dark:text-slate-100">
              Voice Archive
            </h3>

            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              บันทึกและจัดเก็บไฟล์เสียง .wav ทุกเหตุการณ์ที่ตรวจพบในฐานข้อมูล
              สามารถเรียกฟังย้อนหลังและตรวจสอบผลการวิเคราะห์ AI ได้ทุกเวลา
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
