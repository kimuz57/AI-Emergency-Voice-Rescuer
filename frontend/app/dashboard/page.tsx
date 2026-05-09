import Link from "next/link";
import AmbientOrbs from "@/components/AmbientOrbs";
import MobileNav from "@/components/MobileNav";
import { featuredEvent, patientSummaries } from "@/lib/mockAppData";

const statusStyles = {
  normal: {
    dot: "bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]",
    label: "ปกติ",
    text: "text-emerald-600",
    card: "bg-white/65",
  },
  risk: {
    dot: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
    label: "เสี่ยง",
    text: "text-amber-600",
    card: "bg-amber-50/60 border border-amber-200/70",
  },
};

const avatarStyles = {
  red: "bg-red-100 text-red-600 border-red-200",
  blue: "bg-blue-100 text-blue-600 border-blue-200",
  emerald: "bg-emerald-100 text-emerald-600 border-emerald-200",
  amber: "bg-amber-100 text-amber-600 border-amber-200",
};

export default function DashboardPage() {
  const criticalPatient = patientSummaries[0];
  const monitoredPatients = patientSummaries.slice(1);

  return (
    <div className="guardian-page relative min-h-[100dvh] overflow-hidden pb-32 text-slate-900">
      <AmbientOrbs />

      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/40 bg-white/70 px-5 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-4">
          <button className="text-primary transition-transform active:scale-95" type="button">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold">ผู้ป่วยของคุณ</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-slate-500" type="button">
            <span className="material-symbols-outlined">search</span>
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-xs font-bold text-primary">
            GA
          </div>
        </div>
      </header>

      <main className="page-rise mx-auto flex w-full max-w-md flex-col gap-4 px-5 pt-24">
        <Link
          className="glass-card attention-pulse rounded-[26px] border border-red-200/70 bg-red-50/65 p-5 transition-transform active:scale-[0.98]"
          href="/event-details"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-300 bg-white text-xl font-black text-red-600 shadow-sm">
                  {criticalPatient.initials}
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 text-white">
                  <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    priority_high
                  </span>
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{criticalPatient.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-red-500 px-3 py-1 font-bold text-white">ฉุกเฉิน</span>
                  <span className="text-slate-500">{criticalPatient.relativeTime}</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-red-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/25">
              ช่วยเหลือด่วน
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-red-600">ข้อความล่าสุด: “{featuredEvent.transcript}”</p>
            <p className="mt-1">ตำแหน่ง: {featuredEvent.location}</p>
          </div>
        </Link>

        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold">สถานะปกติ</h3>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Live Feed</p>
          </div>

          {monitoredPatients.map((patient) => {
            const status = statusStyles[patient.status as "normal" | "risk"];

            return (
              <Link
                key={patient.id}
                className={`glass-card flex items-center justify-between rounded-[24px] p-4 transition-all active:scale-[0.98] ${status.card}`.trim()}
                href={patient.status === "risk" ? "/history" : "/event-details"}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full border text-lg font-black ${avatarStyles[patient.accent]}`}>
                    {patient.initials}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">{patient.name}</h4>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                      <span className={`font-semibold ${status.text}`}>{status.label}</span>
                      <span className="text-slate-400">• {patient.relativeTime}</span>
                    </div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-slate-400">chevron_right</span>
              </Link>
            );
          })}
        </section>
      </main>

      <Link
        aria-label="เพิ่มผู้ป่วย"
        className="fixed bottom-28 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform active:scale-90"
        href="/add-patient"
      >
        <span className="material-symbols-outlined text-[28px]">person_add</span>
      </Link>

      <MobileNav current="dashboard" />
    </div>
  );
}