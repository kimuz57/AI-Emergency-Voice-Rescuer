"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AmbientOrbs from "@/components/AmbientOrbs";
import MobileNav from "@/components/MobileNav";

export default function AddPatientPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    void fullName;
    void age;
    void note;
    router.push("/dashboard");
  };

  return (
    <div className="guardian-page relative min-h-[100dvh] overflow-hidden pb-32 text-slate-900">
      <AmbientOrbs />

      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/40 bg-white/70 px-5 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-4">
          <Link className="text-primary transition-transform active:scale-95" href="/dashboard">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="text-lg font-bold">เพิ่มผู้ป่วย</h1>
        </div>
        <div className="text-base font-black text-primary">Guardian AI</div>
      </header>

      <main className="page-rise mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-24">
        <div className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-primary/15 via-white/60 to-sky-200/60 px-6 py-7 shadow-lg shadow-primary/10">
          <div className="absolute right-[-24px] top-[-24px] h-28 w-28 rounded-full bg-white/45 blur-2xl" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">Patient Setup</p>
              <h2 className="mt-2 text-[26px] font-black tracking-tight">ข้อมูลเบื้องต้น</h2>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                กรอกรายละเอียดผู้ป่วยที่คุณต้องการดูแล เพื่อเริ่มติดตามสถานะและการแจ้งเตือนแบบเรียลไทม์
              </p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 text-primary shadow-sm">
              <span className="material-symbols-outlined text-[30px]">person_add</span>
            </div>
          </div>
        </div>

        <section className="glass-card rounded-[32px] p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="ml-1 block text-sm font-semibold text-slate-600">ชื่อ</label>
              <input
                className="glass-input h-14 w-full rounded-2xl px-4 outline-none"
                placeholder="ระบุชื่อ-นามสกุล"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 block text-sm font-semibold text-slate-600">อายุ</label>
              <input
                className="glass-input h-14 w-full rounded-2xl px-4 outline-none"
                placeholder="เช่น 75"
                type="number"
                value={age}
                onChange={(event) => setAge(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 block text-sm font-semibold text-slate-600">หมายเหตุ</label>
              <textarea
                className="glass-input min-h-[120px] w-full rounded-2xl px-4 py-4 outline-none"
                placeholder="ระบุโรคประจำตัว หรือสิ่งที่ต้องระวังเป็นพิเศษ"
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <button
              className="mt-2 h-14 w-full rounded-full bg-primary text-base font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark disabled:opacity-70"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "กำลังบันทึก" : "บันทึก"}
            </button>
          </form>
        </section>

        <div className="flex justify-center gap-2 opacity-40">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="h-2 w-2 rounded-full bg-primary/60" />
          <span className="h-2 w-2 rounded-full bg-primary/30" />
        </div>
      </main>

      <MobileNav current="settings" />
    </div>
  );
}