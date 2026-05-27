"use client";

import Link from "next/link";

const features = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
      </svg>
    ),
    title: "BCResNet AI Engine",
    subtitle: "ระบบโมเดลจำแนกเสียงอัจฉริยะ",
    description: "โมเดล BCResNet ที่ผ่านการฝึกสอนด้วยชุดข้อมูลเสียงฉุกเฉินจริง สามารถแยกแยะเสียงร้องขอความช่วยเหลือออกจากเสียงทั่วไปได้ด้วยความแม่นยำสูงถึง 99.98%",
    color: "indigo",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
      </svg>
    ),
    title: "Real-time Alert",
    subtitle: "ระบบแจ้งเตือนภัยความหน่วงต่ำ",
    description: "ส่งสัญญาณแจ้งเตือนไปยังแดชบอร์ดผู้ดูแลภายในเวลาต่ำกว่า 1 วินาที ผ่านโปรโตคอล WebSocket และ MQTT แบบเรียลไทม์",
    color: "red",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Access Control",
    subtitle: "ระบบจัดการสิทธิ์ผู้ดูแล",
    description: "รองรับการลงทะเบียนและยืนยันตัวตนผู้ดูแลผ่าน JWT Token และ OAuth Google ควบคุมสิทธิ์การเข้าถึงข้อมูลผู้ป่วยแต่ละรายอย่างปลอดภัย",
    color: "emerald",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
    title: "Audio Archive",
    subtitle: "ระบบบันทึกคลังเสียงย้อนหลัง",
    description: "บันทึกและจัดเก็บไฟล์เสียง .wav ทุกเหตุการณ์ที่ตรวจพบในฐานข้อมูล PostgreSQL สามารถเรียกฟังย้อนหลังและตรวจสอบผลการวิเคราะห์ AI ได้ทุกเวลา",
    color: "amber",
  },
];

const colorMap: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  indigo: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-100", icon: "text-indigo-500" },
  red:    { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-100",    icon: "text-red-500" },
  emerald:{ bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-100",icon: "text-emerald-500" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-100",  icon: "text-amber-500" },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Navbar ── */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-800 tracking-tight">Guardian AI</span>
          </div>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
            <a href="#features" className="hover:text-slate-800 transition-colors">คุณสมบัติ</a>
            <a href="#about" className="hover:text-slate-800 transition-colors">เกี่ยวกับระบบ</a>
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <Link href="/" className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">
              เข้าสู่ระบบ
            </Link>
            <Link href="/" className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors shadow-sm">
              สมัครสมาชิก
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 bg-gradient-to-b from-white to-slate-50">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-bold px-4 py-1.5 rounded-full mb-8 uppercase tracking-widest">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
          AI-Powered Emergency Detection
        </div>

        <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight max-w-3xl">
          ระบบช่วยเหลือฉุกเฉิน<br />
          <span className="text-indigo-600">ด้วยเสียงและปัญญาประดิษฐ์</span>
        </h1>

        <p className="mt-6 text-lg text-slate-500 max-w-xl leading-relaxed">
          แพลตฟอร์มตรวจจับเสียงร้องขอความช่วยเหลือแบบเรียลไทม์ เพื่อความปลอดภัยของผู้สูงอายุและผู้ป่วยในสถานพยาบาล ขับเคลื่อนด้วยโมเดล BCResNet
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-base font-bold rounded-2xl shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            เริ่มใช้งานระบบ
          </Link>
          <a href="#features" className="inline-flex items-center gap-2 px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 text-base font-semibold rounded-2xl border border-slate-200 transition-all hover:-translate-y-0.5">
            ดูคุณสมบัติ
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </a>
        </div>

        {/* Stats */}
        <div id="about" className="mt-16 grid grid-cols-3 gap-8 text-center">
          {[
            { value: "99.98%", label: "ความแม่นยำ AI" },
            { value: "< 1s", label: "ความหน่วงการแจ้งเตือน" },
            { value: "16kHz", label: "I2S PCM Mono" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold text-indigo-600">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Key Features Block ── */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-800">คุณสมบัติเด่นของระบบ</h2>
            <p className="text-slate-500 mt-3 text-base">เทคโนโลยีครบครันสำหรับการดูแลผู้ป่วยในยุคดิจิทัล</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f) => {
              const c = colorMap[f.color];
              return (
                <div key={f.title} className={`rounded-2xl border ${c.border} ${c.bg} p-6 flex gap-5 hover:shadow-md transition-shadow`}>
                  <div className={`flex-shrink-0 w-14 h-14 rounded-xl bg-white border ${c.border} flex items-center justify-center ${c.icon} shadow-sm`}>
                    {f.icon}
                  </div>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-widest ${c.text} mb-1`}>{f.subtitle}</p>
                    <h3 className="text-base font-bold text-slate-800 mb-2">{f.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{f.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 px-6 bg-indigo-600 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">พร้อมเริ่มต้นใช้งานแล้วหรือยัง?</h2>
        <p className="text-indigo-200 text-sm mb-8">สมัครสมาชิกฟรีและเริ่มปกป้องผู้ป่วยของคุณได้ทันที</p>
        <Link href="/" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white hover:bg-slate-100 text-indigo-600 text-sm font-bold rounded-2xl transition-colors shadow-lg">
          เริ่มใช้งานระบบ
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="py-6 bg-white border-t border-slate-200 text-center text-xs text-slate-400">
        © 2026 Guardian AI Emergency Voice Rescuer — All rights reserved
      </footer>
    </div>
  );
}
