import Link from "next/link";
import AmbientOrbs from "@/components/AmbientOrbs";
import { featuredEvent } from "@/lib/mockAppData";

export default function EventDetailsPage() {
  return (
    <div className="guardian-page relative min-h-[100dvh] overflow-hidden pb-24 text-slate-900">
      <AmbientOrbs />

      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/40 bg-white/70 px-5 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-4">
          <Link className="text-primary transition-transform active:scale-95" href="/history">
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </Link>
          <h1 className="text-lg font-bold text-slate-800">รายละเอียดเหตุการณ์</h1>
        </div>
        <div className="text-xl font-black text-primary">Guardian AI</div>
      </header>

      <main className="page-rise mx-auto flex w-full max-w-lg flex-col gap-6 px-5 pt-24">
        <div className="attention-pulse flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-red-700">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            report
          </span>
          <span className="text-sm font-bold uppercase tracking-[0.14em]">ระดับความเสี่ยง: {featuredEvent.severityLabel}</span>
        </div>

        <section className="glass-card relative overflow-hidden rounded-[30px] p-6">
          <div className="absolute right-[-24px] top-[-24px] h-32 w-32 rounded-full bg-red-500/10 blur-3xl" />

          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-red-100 text-xl font-black text-red-600 shadow-sm">
                {featuredEvent.initials}
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight">{featuredEvent.patientName}</h2>
                <p className="text-sm font-semibold text-slate-500">ID: {featuredEvent.patientId}</p>
              </div>
            </div>
            <div className="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-sm font-semibold text-slate-500">
              {featuredEvent.timeLabel}
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">ข้อความเสียงที่ตรวจพบ</label>
              <div className="rounded-[22px] border border-white/60 bg-white/60 p-5">
                <span className="material-symbols-outlined mb-2 block text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                  record_voice_over
                </span>
                <p className="text-2xl font-black leading-relaxed text-red-600">“{featuredEvent.transcript}”</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-[22px] border border-white/50 bg-white/50 p-4">
                <span className="material-symbols-outlined text-sm text-slate-500">location_on</span>
                <p className="mt-1 text-xs text-slate-400">สถานที่</p>
                <p className="font-semibold text-slate-900">{featuredEvent.location}</p>
              </div>
              <div className="rounded-[22px] border border-white/50 bg-white/50 p-4">
                <span className="material-symbols-outlined text-sm text-slate-500">watch</span>
                <p className="mt-1 text-xs text-slate-400">อุปกรณ์</p>
                <p className="font-semibold text-slate-900">{featuredEvent.device}</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[22px] border border-white/50 bg-white/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    favorite
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">อัตราการเต้นหัวใจ</p>
                  <p className="text-2xl font-black text-red-600">
                    {featuredEvent.heartRate} <span className="text-sm font-medium text-slate-500">bpm</span>
                  </p>
                </div>
              </div>

              <div className="h-10 w-24 overflow-hidden opacity-50">
                <svg className="h-full w-full" viewBox="0 0 100 40">
                  <path
                    d="M0 30 Q 10 10, 20 30 T 40 30 T 60 10 T 80 30 T 100 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-red-500"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          การตอบสนองทันที
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="space-y-4">
          <button className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary text-base font-semibold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" type="button">
            <span className="material-symbols-outlined">call</span>
            โทรหาผู้ป่วย
          </button>
          <button className="attention-pulse flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-red-500 text-base font-semibold text-white shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]" type="button">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              emergency_share
            </span>
            โทรฉุกเฉิน (1669)
          </button>
          <button className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 text-base font-semibold text-white transition-all active:scale-[0.98]" type="button">
            <span className="material-symbols-outlined">check_circle</span>
            รับทราบเหตุการณ์
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 pb-8">
          <button className="glass-card flex flex-col items-center justify-center rounded-[22px] p-4 text-slate-600 transition-transform active:scale-95" type="button">
            <span className="material-symbols-outlined mb-2">map</span>
            <span className="text-sm font-semibold">ดูแผนที่บ้าน</span>
          </button>
          <Link className="glass-card flex flex-col items-center justify-center rounded-[22px] p-4 text-slate-600 transition-transform active:scale-95" href="/history">
            <span className="material-symbols-outlined mb-2">history</span>
            <span className="text-sm font-semibold">ประวัติย้อนหลัง</span>
          </Link>
        </div>
      </main>
    </div>
  );
}