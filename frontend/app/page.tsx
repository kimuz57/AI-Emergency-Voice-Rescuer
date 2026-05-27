"use client";
import React from "react";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-slate-50 overflow-hidden font-sans">
      
      {/* ========================================== */}
      {/* 🌟 1. Background Glowing Orbs */}
      {/* ========================================== */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-pulse"></div>
      <div className="absolute top-[20%] right-[-5%] w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-pulse" style={{ animationDelay: '2s' }}></div>

      {/* ========================================== */}
      {/* 🚀 2. Navbar (แก้บั๊กมือถือแล้ว ✅) */}
      {/* ========================================== */}
      <nav className="relative z-10 bg-white/60 backdrop-blur-xl border-b border-white/50 px-4 md:px-12 py-3 flex justify-between items-center shadow-sm">
        
        {/* ฝั่งซ้าย: Logo */}
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {/* 🔊 ไอคอนคลื่นเสียง */}
          <div className="flex items-end gap-0.5 md:gap-1 h-4 md:h-6 shrink-0">
            <div className="w-1 md:w-1.5 h-2 md:h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1 md:w-1.5 h-4 md:h-6 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1 md:w-1.5 h-3 md:h-4 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>

          <span className="text-[13px] sm:text-lg md:text-xl font-extrabold bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600 bg-clip-text text-transparent whitespace-nowrap truncate">
            Emergency Voice Rescuer
          </span>
        </div>
        
        {/* ฝั่งขวา: Buttons */}
        <div className="flex items-center gap-1 sm:gap-4 shrink-0">
          <a href="/login" className="px-2 sm:px-5 py-2 text-slate-600 hover:text-blue-600 font-bold transition-all text-xs sm:text-base">
            Sign In
          </a>
          <a href="/register" className="px-3 sm:px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-bold hover:shadow-lg hover:shadow-purple-500/30 transition-all hover:-translate-y-0.5 text-xs sm:text-base whitespace-nowrap flex items-center gap-1">
            Get Started <span className="hidden sm:inline">✨</span>
          </a>
        </div>
      </nav>

      {/* ========================================== */}
      {/* 🎯 3. Hero Section */}
      {/* ========================================== */}
      <main className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-24 md:pt-32 pb-20">
        
        {/* ป้าย Tag Status */}
        <div className="inline-flex items-center gap-2 px-3 md:px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-purple-100 shadow-sm mb-6 md:mb-8">
          <span className="flex h-2 w-2 md:h-2.5 md:w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-purple-500"></span>
          </span>
          <span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-wider">
            AI Voice Detection Active
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold mb-4 md:mb-6 text-slate-900 tracking-tight leading-tight">
          ฟังทุกเสียงร้องขอ <br className="hidden md:block"/>
          <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 bg-clip-text text-transparent drop-shadow-sm">
            ปกป้องด้วย AI อัจฉริยะ
          </span>
        </h1>

        <p className="text-base md:text-xl text-slate-500 mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed px-4">
          ยกระดับความปลอดภัยให้ผู้สูงอายุและผู้ป่วย ด้วยเทคโนโลยีจำแนกเสียงที่ทำงานตลอด 24 ชั่วโมง พร้อมระบบแจ้งเตือนความหน่วงต่ำ
        </p>

        {/* ปุ่ม CTA หรูๆ */}
        <a href="/login" className="group relative px-6 md:px-8 py-3 md:py-4 bg-slate-900 text-white rounded-2xl font-bold text-base md:text-lg hover:bg-slate-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <span className="relative flex items-center gap-2">
            Start Monitoring 
            <svg className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        </a>
      </main>

      {/* ========================================== */}
      {/* 🧩 4. Key Features Block */}
      {/* ========================================== */}
      <section className="relative z-10 py-12 md:py-20 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          
          <div className="p-6 md:p-8 bg-white/80 backdrop-blur-lg rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-blue-100 to-blue-50 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-xl md:text-2xl group-hover:scale-110 transition-transform">🧠</div>
            <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800">BCResNet Engine</h3>
            <p className="text-sm text-slate-500 leading-relaxed">แม่นยำสูงด้วยโมเดลวิเคราะห์เสียง AI ระดับแนวหน้า</p>
          </div>

          <div className="p-6 md:p-8 bg-white/80 backdrop-blur-lg rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-xl md:text-2xl group-hover:scale-110 transition-transform">⚡</div>
            <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800">Low-Latency Alert</h3>
            <p className="text-sm text-slate-500 leading-relaxed">แจ้งเตือนฉุกเฉินในเสี้ยววินาที ทันทีที่เกิดเหตุการณ์</p>
          </div>

          <div className="p-6 md:p-8 bg-white/80 backdrop-blur-lg rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-purple-100 to-purple-50 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-xl md:text-2xl group-hover:scale-110 transition-transform">🛡️</div>
            <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800">Access Control</h3>
            <p className="text-sm text-slate-500 leading-relaxed">จัดการสิทธิ์ผู้ดูแลและปกป้องข้อมูลผู้ป่วยอย่างแน่นหนา</p>
          </div>

          <div className="p-6 md:p-8 bg-white/80 backdrop-blur-lg rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-sky-100 to-sky-50 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-xl md:text-2xl group-hover:scale-110 transition-transform">🎙️</div>
            <h3 className="font-bold text-base md:text-lg mb-2 text-slate-800">Voice Archive</h3>
            <p className="text-sm text-slate-500 leading-relaxed">ระบบคลังเสียงย้อนหลัง เก็บหลักฐานและใช้เทรน AI ได้</p>
          </div>

        </div>
      </section>
      
    </div>
  );
}