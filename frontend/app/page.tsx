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
            Get Started <span className="hidden sm:inline">✨</span>
          </a>
        </div>
      </nav>

      {/* ========================================== */}
      {/* 🎯 3. Hero Section */}
      {/* ========================================== */}
      <main className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-24 md:pt-32 pb-20">
        <div className="inline-flex items-center gap-2 px-3 md:px-4 py-2 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-purple-100 dark:border-slate-700 shadow-sm mb-6 md:mb-8">
          <span className="flex h-2 w-2 md:h-2.5 md:w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-purple-500"></span>
          </span>
            <span className="text-[10px] md:text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            AI Voice Detection Active
          </span>
        </div>

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
              🧠
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
              ⚡
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
              🛡️
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
              🎙️
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
