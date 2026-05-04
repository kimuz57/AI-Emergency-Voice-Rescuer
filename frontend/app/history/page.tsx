"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useEventStore } from "@/stores/eventStore";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import AmbientOrbs from "@/components/AmbientOrbs";
import GlassCard from "@/components/GlassCard";

export default function HistoryPage() {
  useAuth();
  const { events, filter, searchQuery, isLoading, setFilter, setSearchQuery, fetchEvents, filteredEvents } =
    useEventStore();

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const displayed = filteredEvents();

  const filters = ["ทั้งหมด", "เสียง", "การเคลื่อนไหว"];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น.";
    }
    return "เมื่อวานนี้, " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น.";
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      <AmbientOrbs />
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-20">
        <div className="text-center mb-24">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-4">ประวัติเหตุการณ์</h1>
          <p className="text-slate-500 text-base max-w-lg mx-auto leading-relaxed mb-8">
            ภาพรวมบันทึกกิจกรรมความปลอดภัยของคุณอย่างเป็นระเบียบ
          </p>

          {/* Search */}
          <div className="flex justify-center mb-8">
            <div className="relative w-full max-w-md">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">
                search
              </span>
              <input
                className="glass-input w-full pl-12 pr-4 py-3 rounded-full text-sm outline-none"
                placeholder="ค้นหาเหตุการณ์..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex justify-center gap-4 flex-wrap">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-6 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${
                  filter === f
                    ? "bg-slate-900 text-white shadow-lg"
                    : "lucid-glass border-white/40 text-slate-600 hover:bg-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && displayed.length === 0 && (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-5xl text-gray-300 mb-4">search_off</span>
            <p className="text-gray-400 text-lg">ไม่พบเหตุการณ์ที่ตรงกัน</p>
          </div>
        )}

        {/* Timeline */}
        {!isLoading && displayed.length > 0 && (
          <div className="relative space-y-16 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-px before:bg-slate-200/60">
            {displayed.map((event, idx) => (
              <div
                key={event.id}
                className={`relative flex items-center justify-between md:justify-normal group gap-4 ${
                  idx % 2 === 0 ? "md:flex-row-reverse" : ""
                }`}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/60 lucid-glass text-slate-400 z-10 md:order-1 shrink-0 transition-transform group-hover:scale-110">
                  <span className="material-symbols-outlined text-lg">{event.icon}</span>
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[42%] lucid-glass p-6 rounded-2xl hover:bg-white/50 transition-all duration-500 hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <time className="text-slate-400 text-sm opacity-70 font-semibold uppercase tracking-wider">
                      {formatTime(event.created_at)}
                    </time>
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {Math.round(event.confidence * 100)}%
                    </span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-1 leading-tight">
                    {event.description}
                  </h3>
                  <p className="text-slate-500 text-base leading-relaxed">{event.zone}</p>
                  {event.audio_url && (
                    <button className="mt-3 flex items-center gap-2 text-primary text-sm font-semibold hover:underline">
                      <span className="material-symbols-outlined text-lg">play_circle</span>
                      เล่นเสียง
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-24 flex justify-center">
          <button className="px-8 py-3 rounded-full border border-white/60 lucid-glass text-slate-500 text-sm font-bold uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all duration-300">
            โหลดเหตุการณ์เพิ่มเติม
          </button>
        </div>
      </main>

      <footer className="mt-20 px-6 py-12 lucid-glass border-t border-white/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-slate-400 text-sm font-bold uppercase tracking-[0.2em] opacity-70">
          <p>© 2026 Guardian AI. สงวนลิขสิทธิ์ทั้งหมด.</p>
          <div className="flex gap-10">
            <a className="hover:text-primary transition-colors" href="#">ความเป็นส่วนตัว</a>
            <a className="hover:text-primary transition-colors" href="#">สถานะ</a>
            <a className="hover:text-primary transition-colors" href="#">สนับสนุน</a>
          </div>
        </div>
      </footer>

      <MobileNav />
    </div>
  );
}
