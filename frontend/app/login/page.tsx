"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AmbientOrbs from "@/components/AmbientOrbs";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน");
      return;
    }

    setIsSubmitting(true);
    router.push("/dashboard");
  };

  return (
    <div className="guardian-page relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-10 text-slate-900">
      <AmbientOrbs />
      <div className="guardian-mesh" />

      <main className="page-rise relative z-10 w-full max-w-[420px]">
        <div className="glass-card rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.06)]">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
              <span className="material-symbols-outlined text-[34px]">shield_person</span>
            </div>
            <h1 className="text-[32px] font-black tracking-tight text-primary">Guardian AI</h1>
            <p className="mt-2 text-sm text-slate-500">ดูแลคนที่คุณรักด้วยเทคโนโลยี AI</p>
          </div>

          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          ) : null}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="block px-1 text-sm font-semibold text-slate-600" htmlFor="email">
                อีเมล
              </label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-slate-400 transition-colors group-focus-within:text-primary">
                  mail
                </span>
                <input
                  id="email"
                  className="glass-input h-14 w-full rounded-2xl pl-12 pr-4 outline-none"
                  placeholder="example@email.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block px-1 text-sm font-semibold text-slate-600" htmlFor="password">
                รหัสผ่าน
              </label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-slate-400 transition-colors group-focus-within:text-primary">
                  lock
                </span>
                <input
                  id="password"
                  className="glass-input h-14 w-full rounded-2xl pl-12 pr-12 outline-none"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  checked={rememberMe}
                  className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary/20"
                  type="checkbox"
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <span className="font-semibold">จดจำฉันไว้</span>
              </label>
              <button className="font-semibold text-primary hover:underline" type="button">
                ลืมรหัสผ่าน?
              </button>
            </div>

            <button
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
              type="submit"
            >
              <span>{isSubmitting ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ"}</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </form>

          <div className="mt-8 border-t border-slate-200/60 pt-6 text-center text-sm text-slate-500">
            ยังไม่มีบัญชี?
            <Link className="ml-1 font-semibold text-primary hover:underline" href="/register">
              ลงชื่อเข้าใช้งานที่นี่
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
