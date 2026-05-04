"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUserStore } from "@/stores/userStore";
import AmbientOrbs from "@/components/AmbientOrbs";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const register = useUserStore((s) => s.register);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน กรุณากรอกรหัสผ่านให้ตรงกันทั้งสองช่อง");
      return;
    }

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setIsLoading(true);
    const success = await register(name, email, password);
    if (success) {
      router.push("/login");
    } else {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative px-6">
      <AmbientOrbs />

      <header className="fixed top-0 left-0 right-0 px-6 py-6 flex items-center justify-between z-50">
        <div className="flex items-center gap-2 text-slate-900">
          <div className="bg-primary text-white p-2 rounded-xl shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined">emergency</span>
          </div>
          <h2 className="text-lg font-bold tracking-tight">Guardian AI</h2>
        </div>
      </header>

      <main className="w-full max-w-md">
        <div className="glass-panel rounded-3xl p-8 md:p-10 flex flex-col gap-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">สร้างบัญชีผู้ใช้</h1>
            <p className="text-slate-500 text-sm">ร่วมเป็นส่วนหนึ่งของระบบรักษาความปลอดภัยอัจฉริยะ</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-base text-slate-600 ml-1">ชื่อ-นามสกุล</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">person</span>
                <input
                  className="glass-input w-full pl-12 pr-4 py-4 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none"
                  placeholder="ชื่อ-นามสกุล ของคุณ"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-base text-slate-600 ml-1">ที่อยู่อีเมล</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">mail</span>
                <input
                  className="glass-input w-full pl-12 pr-4 py-4 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none"
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-base text-slate-600 ml-1">รหัสผ่าน</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock</span>
                <input
                  className="glass-input w-full pl-12 pr-12 py-4 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-base text-slate-600 ml-1">ยืนยันรหัสผ่าน</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock</span>
                <input
                  className={`glass-input w-full pl-12 pr-12 py-4 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none ${
                    confirmPassword && password !== confirmPassword ? "border-red-400" : ""
                  }`}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 ml-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">error</span>
                  รหัสผ่านไม่ตรงกัน
                </p>
              )}
              {confirmPassword && password === confirmPassword && confirmPassword.length > 0 && (
                <p className="text-xs text-green-600 ml-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  รหัสผ่านตรงกัน
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary-dark text-white text-lg font-medium py-4 rounded-xl shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60 mt-4"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  กำลังสร้างบัญชี...
                </>
              ) : (
                <>
                  สร้างบัญชี
                  <span className="material-symbols-outlined">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-slate-500 text-sm">
              มีบัญชีอยู่แล้ว?{" "}
              <Link className="text-primary font-semibold hover:underline" href="/login">
                เข้าสู่ระบบ
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="mt-12 text-center text-slate-400 text-xs tracking-wide">
        <p>© 2024 Guardian AI Detection Systems Inc.</p>
      </footer>
    </div>
  );
}
