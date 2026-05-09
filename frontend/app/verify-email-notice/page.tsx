"use client";

import Link from "next/link";
import AmbientOrbs from "@/components/AmbientOrbs";

export default function VerifyEmailPage() {
  return (
    <div className="guardian-page relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-10 text-slate-900">
      <AmbientOrbs />

      <main className="page-rise relative z-10 w-full max-w-md">
        <div className="glass-card rounded-[32px] p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
            <span className="material-symbols-outlined text-[32px]">mark_email_read</span>
          </div>
          <h1 className="text-[30px] font-black tracking-tight text-slate-900">กรุณายืนยันอีเมลของคุณ</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            เราส่งลิงก์สำหรับยืนยันบัญชีไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบกล่องข้อความเข้าและคลิกลิงก์เพื่อเปิดใช้งานบัญชี
          </p>

          <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-700">
            หากไม่พบอีเมล กรุณาตรวจสอบในโฟลเดอร์ Spam หรือ Promotions
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Link className="flex h-14 items-center justify-center rounded-2xl bg-primary text-base font-semibold text-white shadow-lg shadow-primary/20" href="/login">
              กลับไปเข้าสู่ระบบ
            </Link>
            <button className="h-12 rounded-2xl bg-white/70 text-sm font-semibold text-slate-600" type="button">
              ส่งอีเมลอีกครั้ง
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}