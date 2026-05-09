"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AmbientOrbs from "@/components/AmbientOrbs";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
      return;
    }

    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง");
      return;
    }

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setIsSubmitting(true);
    void phoneNumber;
    router.push("/verify-email-notice");
  };

  return (
    <div className="guardian-page relative min-h-[100dvh] overflow-x-hidden pb-12 text-slate-900">
      <AmbientOrbs />

      <header className="fixed left-0 right-0 top-0 z-50 mx-auto flex h-16 w-full items-center justify-between border-b border-white/40 bg-white/70 px-5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-4">
          <Link className="text-primary transition-transform active:scale-95" href="/login">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="text-xl font-bold text-primary">ลงทะเบียน</h1>
        </div>
        <div className="w-10" />
      </header>

      <main className="page-rise relative z-10 mx-auto w-full max-w-md px-5 pt-24">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[34px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              shield_with_heart
            </span>
          </div>
          <h2 className="text-[32px] font-black tracking-tight">สมัครสมาชิก</h2>
          <p className="mt-2 text-sm text-slate-500">เริ่มต้นการดูแลคนที่คุณรักด้วย Guardian AI</p>
        </div>

        <div className="glass-card rounded-[30px] p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="ml-1 block text-sm font-semibold text-slate-600">ชื่อผู้ใช้</label>
              <input
                className="glass-input h-12 w-full rounded-2xl px-4 outline-none"
                placeholder="ระบุชื่อผู้ใช้"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 block text-sm font-semibold text-slate-600">อีเมล</label>
              <input
                className="glass-input h-12 w-full rounded-2xl px-4 outline-none"
                placeholder="example@email.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 block text-sm font-semibold text-slate-600">รหัสผ่าน</label>
              <div className="relative">
                <input
                  className="glass-input h-12 w-full rounded-2xl px-4 pr-12 outline-none"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-primary"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="ml-1 block text-sm font-semibold text-slate-600">ยืนยันรหัสผ่าน</label>
              <input
                className="glass-input h-12 w-full rounded-2xl px-4 outline-none"
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="block text-sm font-semibold text-slate-600">เบอร์โทรศัพท์</label>
                <span className="text-xs text-slate-400">(ถ้ามี)</span>
              </div>
              <input
                className="glass-input h-12 w-full rounded-2xl px-4 outline-none"
                placeholder="08x-xxx-xxxx"
                type="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
              />
            </div>

            <button
              className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-white shadow-lg shadow-primary/30 transition-all active:scale-[0.98]"
              disabled={isSubmitting}
              type="submit"
            >
              <span>{isSubmitting ? "กำลังดำเนินการ" : "สมัครสมาชิก"}</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            มีบัญชีอยู่แล้ว?
            <Link className="ml-1 font-semibold text-primary hover:underline" href="/login">
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>

        <div className="mt-8 px-4 text-center text-xs leading-relaxed text-slate-400">
          การสมัครสมาชิกหมายความว่าคุณยอมรับ
          <button className="mx-1 underline" type="button">
            ข้อตกลงการใช้งาน
          </button>
          และ
          <button className="mx-1 underline" type="button">
            นโยบายความเป็นส่วนตัว
          </button>
          ของเรา
        </div>
      </main>
    </div>
  );
}
