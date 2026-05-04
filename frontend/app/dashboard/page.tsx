"use client";

import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export default function DashboardPage() {
  const { isLoading } = useAuth(); // ดึงสถานะโหลดมาใช้ถ้าต้องการ

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">กำลังตรวจสอบสิทธิ์...</div>;
  }

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-10 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
      
      {/* Left Column: Primary Monitoring */}
      <div className="lg:col-span-8 flex flex-col gap-10">
        
        {/* Alert Banner */}
        <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-xl p-8 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 alert-pulse deep-shadow">
          <div className="flex items-center gap-5">
            <div className="size-14 rounded-2xl bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30 shrink-0">
              <span className="material-symbols-outlined text-2xl fill-1">emergency</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-red-600 mb-0.5">การแจ้งเตือนวิกฤต</h3>
              <p className="text-base text-red-600/80">ตรวจพบเสียงขอความช่วยเหลือในห้องนั่งเล่น</p>
            </div>
          </div>
          <button className="bg-red-600 text-white px-8 py-3.5 rounded-2xl font-semibold text-base transition-all hover:bg-red-700 hover:shadow-lg hover:shadow-red-600/20 active:scale-95 whitespace-nowrap">
            ส่งความช่วยเหลือ
          </button>
        </div>

        {/* Main Detection Visualization */}
        <div className="lucid-glass rounded-3xl p-16 flex flex-col items-center justify-center min-h-[540px] relative overflow-hidden deep-shadow floating-layer">
          {/* Subtle Inner Glow Overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
          
          <div className="flex flex-col items-center text-center relative z-10">
            {/* Microphone Icon */}
            <div className="size-36 rounded-full lucid-glass-inner flex items-center justify-center mb-10 transition-transform duration-700 hover:scale-110">
              <span className="material-symbols-outlined text-6xl text-primary drop-shadow-[0_0_10px_rgba(0,113,227,0.3)]">
                mic
              </span>
            </div>
            <span className="text-xs text-primary font-bold uppercase tracking-[0.25em] mb-6">
              กำลังรับฟัง...
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-gray-900">
              "ช่วยเหลือ"
            </h1>
            <p className="text-lg text-gray-500/80">ระดับความมั่นใจ 92%</p>
          </div>

          {/* Enhanced Waveform (Static HTML Version) */}
          <div className="absolute bottom-16 inset-x-0 h-16 flex items-center justify-center gap-2 opacity-30">
            <div className="w-1.5 bg-primary rounded-full h-4"></div>
            <div className="w-1.5 bg-primary rounded-full h-12"></div>
            <div className="w-1.5 bg-primary rounded-full h-6"></div>
            <div className="w-1.5 bg-primary rounded-full h-16"></div>
            <div className="w-1.5 bg-primary rounded-full h-20"></div>
            <div className="w-1.5 bg-primary rounded-full h-12"></div>
            <div className="w-1.5 bg-primary rounded-full h-8"></div>
            <div className="w-1.5 bg-primary rounded-full h-10"></div>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="lucid-glass p-8 rounded-3xl flex items-center gap-6 floating-layer">
            <div className="size-16 rounded-2xl lucid-glass-inner flex items-center justify-center text-gray-400">
              <span className="material-symbols-outlined text-3xl">volume_up</span>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium mb-1">ระดับเดซิเบล</p>
              <p className="text-2xl font-bold text-gray-900">
                74 dB <span className="text-base text-green-500 font-semibold ml-2">ปกติ</span>
              </p>
            </div>
          </div>
          <div className="lucid-glass p-8 rounded-3xl flex items-center gap-6 floating-layer">
            <div className="size-16 rounded-2xl lucid-glass-inner flex items-center justify-center text-gray-400">
              <span className="material-symbols-outlined text-3xl">event_available</span>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium mb-1">เหตุการณ์ล่าสุด</p>
              <p className="text-2xl font-bold text-gray-900">4 วันที่แล้ว</p>
            </div>
          </div>
        </div>

      </div>

      {/* Right Column: System Status */}
      <div className="lg:col-span-4 flex flex-col gap-10">
        
        {/* Status List */}
        <div className="lucid-glass p-8 rounded-3xl deep-shadow">
          <h3 className="text-2xl font-bold mb-8 tracking-tight text-gray-900">กิจกรรมของระบบ</h3>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between py-5 border-b border-white/20">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-500 text-2xl">keyboard_voice</span>
                <span className="text-base font-medium text-gray-800">การจดจำเสียง</span>
              </div>
              <span className="text-xs text-green-500 uppercase tracking-widest font-bold">เปิดใช้งาน</span>
            </div>
            <div className="flex items-center justify-between py-5 border-b border-white/20">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-500 text-2xl">sensors</span>
                <span className="text-base font-medium text-gray-800">เซนเซอร์ตรวจจับ</span>
              </div>
              <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">สแตนด์บาย</span>
            </div>
          </div>

          <div className="mt-10">
            <p className="text-xs text-gray-500 uppercase tracking-[0.15em] mb-6 font-bold">
              โครงข่ายอุปกรณ์
            </p>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="size-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                  <span className="text-base text-gray-700 font-medium">โหนดห้องนั่งเล่น</span>
                </div>
                <span className="text-sm font-medium text-gray-500">12ms</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="size-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                  <span className="text-base text-gray-700 font-medium">เซนเซอร์ห้องครัว</span>
                </div>
                <span className="text-sm font-medium text-gray-500">18ms</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="size-2.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]" />
                  <span className="text-base text-gray-400">ฮับนอกชาน</span>
                </div>
                <span className="text-[10px] text-red-400 font-bold uppercase">ออฟไลน์</span>
              </div>
            </div>
          </div>
        </div>

        {/* Map View */}
        <div className="relative overflow-hidden rounded-3xl h-64 lucid-glass deep-shadow floating-layer">
          <div 
            className="absolute inset-0 bg-cover bg-center grayscale brightness-90 transition-transform duration-1000 hover:scale-105"
            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAxBCCJoxB5R2JXH9edpCNLHJdJ48GBRurFgS8q52N813-zf4PG_NNzt0gGS9jY3xMDW7lnAB6g2IZ9zZXVZqvdkK0Z4-HZDBHfubdivtJlx3SWEMnoznPEP8QX5meO0eVebHEA3QbVGM-y6v6h5-X3ZB8H-v9xOCbunce4k5U0Y3TDtDpbTmiTAO_gVhOtyJGUPTS4Lob3Sz_eyeXaNrRFQ_OD8Q1avSG9Ccb-Oy9IpaS_G8lVkCFJYgTk5AWLfo0YppXgcnQM30A")' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent flex flex-col justify-end p-8">
            <h4 className="text-gray-900 text-xl mb-1 font-semibold">กิจกรรมตามโซน</h4>
            <p className="text-sm text-gray-700 font-medium">กำลังตรวจสอบฮับซานฟรานซิสโก</p>
          </div>
          <div className="absolute top-6 right-6 size-11 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/30">
            <span className="material-symbols-outlined text-xl">location_on</span>
          </div>
        </div>

        {/* System Health Check */}
        <button className="w-full py-5 rounded-2xl lucid-glass text-gray-900 font-bold text-base border border-white/40 hover:bg-white/50 transition-all active:scale-[0.97] deep-shadow">
          ตรวจสอบสุขภาพของระบบ
        </button>

      </div>
    </main>
  );
}