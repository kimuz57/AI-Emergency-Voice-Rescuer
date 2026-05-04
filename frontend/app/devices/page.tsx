"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDeviceStore, Device } from "@/stores/deviceStore";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import AmbientOrbs from "@/components/AmbientOrbs";
import GlassCard from "@/components/GlassCard";

function DeviceCard({ device }: { device: Device }) {
  const statusConfig = {
    online: { dot: "bg-emerald-500", label: "ออนไลน์", color: "text-emerald-600", opacity: "" },
    offline: { dot: "bg-slate-400", label: "ออฟไลน์", color: "text-slate-500", opacity: "opacity-70" },
    warning: { dot: "bg-orange-500 animate-pulse", label: "คำเตือน", color: "text-orange-600", opacity: "" },
  };

  const cfg = statusConfig[device.status];

  return (
    <div
      className={`lucid-glass rounded-2xl p-6 group cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${cfg.opacity}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <span className={`text-[10px] font-bold ${cfg.color} uppercase tracking-widest`}>{cfg.label}</span>
        </div>
        <span className="text-sm font-mono text-slate-400 bg-slate-100/50 px-2 py-0.5 rounded">
          {device.code}
        </span>
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-4 group-hover:text-primary transition-colors">
        {device.name}
      </h3>
      <div className="flex items-center gap-4 text-sm text-slate-500">
        {device.signal && (
          <span className="flex items-center gap-1 bg-slate-50/50 px-2 py-1 rounded-lg">
            <span className="material-symbols-outlined text-sm">signal_cellular_alt</span>
            {device.signal}
          </span>
        )}
        {device.temperature && (
          <span className="flex items-center gap-1 bg-slate-50/50 px-2 py-1 rounded-lg">
            <span className="material-symbols-outlined text-sm text-blue-500">thermostat</span>
            {device.temperature}
          </span>
        )}
        {device.warningMessage && (
          <span className="flex items-center gap-1 text-orange-600 font-bold bg-orange-50/50 px-2 py-1 rounded-lg">
            <span className="material-symbols-outlined text-sm">warning</span>
            {device.warningMessage}
          </span>
        )}
        {device.status === "offline" && (
          <span className="flex items-center gap-1 bg-slate-50/50 px-2 py-1 rounded-lg">
            <span className="material-symbols-outlined text-sm">signal_cellular_alt</span>
            ไม่มีสัญญาณ
          </span>
        )}
      </div>
    </div>
  );
}

export default function DevicesPage() {
  useAuth();
  const { devices, totalNodes, onlineNodes, alertCount, isLoading, fetchDevices } = useDeviceStore();

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return (
    <div className="relative min-h-screen flex flex-col">
      <AmbientOrbs />
      <Navbar />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-10">
          <div className="mb-12">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">จัดการอุปกรณ์</h1>
            <p className="text-slate-500 text-sm mt-2 font-medium">
              เชื่อมต่อแล้ว {onlineNodes} โหนดทั่วโครงสร้างพื้นฐาน
            </p>
          </div>

          {/* Stats */}
          <GlassCard className="p-6 md:p-8 flex flex-wrap items-center gap-8 md:gap-16 mb-16" hover={false}>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">โหนดทั้งหมด</p>
              <p className="text-2xl font-extrabold text-slate-900">{totalNodes}</p>
            </div>
            <div className="w-px h-10 bg-slate-200/50 hidden md:block" />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">สถานะออนไลน์</p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <p className="text-2xl font-extrabold text-slate-900">{onlineNodes}</p>
              </div>
            </div>
            <div className="w-px h-10 bg-slate-200/50 hidden md:block" />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">การแจ้งเตือน</p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
                <p className="text-2xl font-extrabold text-slate-900">
                  {String(alertCount).padStart(2, "0")}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center py-20">
              <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {/* Device Grid */}
          {!isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {devices.map((device) => (
                <DeviceCard key={device.id} device={device} />
              ))}
              {/* Add New */}
              <div className="border-2 border-dashed border-slate-200/60 rounded-2xl flex items-center justify-center p-6 group hover:border-primary/50 hover:bg-white/30 transition-all cursor-pointer min-h-[180px]">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">
                      add
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-400 group-hover:text-slate-600">เพิ่มโหนดใหม่</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-20 pt-8 flex items-center justify-between text-sm font-bold text-slate-400 border-t border-slate-200/30">
            <span>หน้า 1 จาก 24</span>
            <div className="flex gap-8">
              <button className="hover:text-slate-900 transition-colors">ก่อนหน้า</button>
              <button className="hover:text-slate-900 transition-colors">ถัดไป</button>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-12 mt-auto border-t border-white/10">
        <div className="max-w-7xl mx-auto px-10 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold">
          <p>© 2024 Guardian AI</p>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">lock</span>
            <p>สภาพแวดล้อมที่เป็นส่วนตัวและปลอดภัย</p>
          </div>
        </div>
      </footer>

      <MobileNav />
    </div>
  );
}
