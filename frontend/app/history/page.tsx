"use client";

import { useState } from "react";
import Link from "next/link";
import AmbientOrbs from "@/components/AmbientOrbs";
import MobileNav from "@/components/MobileNav";
import { notificationEvents } from "@/lib/mockAppData";

type FilterKey = "all" | "critical" | "warning" | "normal";

const filterLabels: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "ทั้งหมด" },
  { key: "critical", label: "ฉุกเฉิน" },
  { key: "warning", label: "ติดตาม" },
  { key: "normal", label: "ปกติ" },
];

const severityStyles = {
  critical: {
    pill: "bg-red-500 text-white",
    accent: "border-red-200 bg-red-50/60",
    dot: "bg-red-500",
  },
  warning: {
    pill: "bg-amber-500 text-white",
    accent: "border-amber-200 bg-amber-50/70",
    dot: "bg-amber-500",
  },
  normal: {
    pill: "bg-emerald-100 text-emerald-700",
    accent: "border-white/40 bg-white/60",
    dot: "bg-emerald-500",
  },
};

const avatarStyles = {
  critical: "bg-red-100 text-red-600 border-red-200",
  warning: "bg-amber-100 text-amber-600 border-amber-200",
  normal: "bg-emerald-100 text-emerald-600 border-emerald-200",
};

export default function HistoryPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const visibleEvents = notificationEvents.filter((event) => {
    const matchesFilter = filter === "all" ? true : event.severity === filter;
    const searchableText = [event.patientName, event.description, event.transcript, event.location]
      .join(" ")
      .toLowerCase();
    const matchesQuery = searchableText.includes(query.trim().toLowerCase());

    return matchesFilter && matchesQuery;
  });

  return (
    <div className="guardian-page relative min-h-[100dvh] overflow-hidden pb-32 text-slate-900">
      <AmbientOrbs />

      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/40 bg-white/70 px-5 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-4">
          <Link className="text-primary transition-transform active:scale-95" href="/dashboard">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="text-lg font-bold">ประวัติการแจ้งเตือน</h1>
        </div>
        <div className="text-sm font-semibold text-slate-400">{visibleEvents.length} รายการ</div>
      </header>

      <main className="page-rise mx-auto flex w-full max-w-md flex-col gap-4 px-5 pt-24">
        <div className="glass-card rounded-[28px] p-5">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              search
            </span>
            <input
              className="glass-input h-12 w-full rounded-full pl-12 pr-4 outline-none"
              placeholder="ค้นหาชื่อผู้ป่วย, สถานที่, หรือข้อความ"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {filterLabels.map((item) => {
              const active = item.key === filter;

              return (
                <button
                  key={item.key}
                  className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition-all ${
                    active ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white/60 text-slate-500"
                  }`}
                  type="button"
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <section className="space-y-3">
          {visibleEvents.map((event) => {
            const style = severityStyles[event.severity];

            return (
              <Link
                key={event.id}
                className={`glass-card block rounded-[26px] border p-4 transition-transform active:scale-[0.98] ${style.accent}`.trim()}
                href="/event-details"
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-lg font-black ${avatarStyles[event.severity]}`}>
                    {event.initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-base font-bold text-slate-900">{event.patientName}</h2>
                      <span className="text-xs font-semibold text-slate-400">{event.timeLabel}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-3 py-1 font-bold ${style.pill}`}>{event.severityLabel}</span>
                      <span className="text-slate-400">{event.relativeTime}</span>
                    </div>

                    <p className="mt-3 text-sm font-semibold text-slate-700">{event.description}</p>
                    <p className="mt-1 text-sm text-slate-500">“{event.transcript}”</p>

                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                        {event.location}
                      </div>
                      <span>•</span>
                      <span>{Math.round(event.confidence * 100)}% confidence</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {visibleEvents.length === 0 ? (
            <div className="glass-card rounded-[26px] px-5 py-10 text-center text-sm text-slate-500">
              ไม่พบรายการที่ตรงกับคำค้นหา
            </div>
          ) : null}
        </section>
      </main>

      <MobileNav current="history" />
    </div>
  );
}
