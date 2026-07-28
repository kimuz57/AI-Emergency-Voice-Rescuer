"use client";
import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("ไม่พบ Token สำหรับรีเซ็ตรหัสผ่าน กรุณาตรวจสอบลิงก์ในอีเมลของคุณอีกครั้ง");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    if (password !== confirmPassword) {
      setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setSuccess(true);
        setMessage(data.message || "รีเซ็ตรหัสผ่านสำเร็จ!");
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      } else {
        setError(data.error || "ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่");
      }
    } catch (err) {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="w-full max-w-md bg-white dark:bg-slate-800/80 backdrop-blur-md rounded-3xl shadow-xl p-8 border border-slate-200 dark:border-slate-700 text-center">
        <h1 className="text-xl font-bold text-red-500 mb-4">ลิงก์ไม่ถูกต้อง</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">{error}</p>
        <Link
          href="/forgot-password"
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold shadow-md hover:bg-blue-700 transition-colors"
        >
          ขอลิงก์รีเซ็ตรหัสผ่านใหม่
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white dark:bg-slate-800/80 backdrop-blur-md rounded-3xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">ตั้งรหัสผ่านใหม่</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          กรุณากรอกรหัสผ่านใหม่ของคุณ
        </p>
      </div>

      {success ? (
        <div className="text-center">
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
            {message}
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">กำลังพากลับไปยังหน้าเข้าสู่ระบบ...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 mb-1 block">
              รหัสผ่านใหม่
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 mb-1 block">
              ยืนยันรหัสผ่านใหม่
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-slate-100/50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full py-3.5 mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-transparent flex flex-col items-center justify-center p-4 transition-colors">
      <Suspense fallback={<div className="text-slate-500">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
