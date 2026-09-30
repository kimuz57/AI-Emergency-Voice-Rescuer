"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState } from "react";
import Link from "next/link";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// คลาสของหน้า auth ใช้ Tailwind + ตัวแปร --tb-* ตรงๆ ไม่ใช้ .neu-*
// เพราะ .neu-* เป็น CSS นอก layer จะทับ utility (hover:, focus:) ที่ใส่คู่กัน
const cardClass =
  "w-full rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] p-6 shadow-[var(--tb-shadow-card)] sm:p-8";
const labelClass = "mb-1.5 block text-sm font-medium text-[var(--tb-text)]";
const inputClass =
  "block h-11 w-full rounded-[var(--tb-radius)] border border-[var(--tb-border-strong)] bg-[var(--tb-surface)] px-3.5 text-base text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--tb-placeholder)] focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)] sm:text-sm";
const primaryBtnClass =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] px-4 text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] transition-colors duration-150 hover:bg-[var(--tb-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[var(--tb-primary)]";

const iconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// โลโก้: ไทล์สีน้ำเงิน + แท่งเสียงสามแท่ง (นิ่ง ไม่เด้ง)
function BrandLink() {
  return (
    <div className="mb-6 flex justify-center">
      <Link
        href="/"
        className="inline-flex items-center gap-3 rounded-[var(--tb-radius)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-end justify-center gap-1 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] pb-2.5 shadow-[var(--tb-shadow-xs)]"
        >
          <span className="h-2.5 w-1.5 rounded-full bg-[var(--tb-primary-contrast)]" />
          <span className="h-5 w-1.5 rounded-full bg-[var(--tb-primary-contrast)]" />
          <span className="h-3.5 w-1.5 rounded-full bg-[var(--tb-primary-contrast)]" />
        </span>
        <span className="text-lg font-bold text-[var(--tb-text)]">Emergency Voice Rescuer</span>
      </Link>
    </div>
  );
}

// กล่องแจ้งผลในการ์ด — แดง = ผิดพลาด (role alert), เขียว = สำเร็จ (role status)
function FormAlert({ tone, children }: { tone: "danger" | "success"; children: React.ReactNode }) {
  const isDanger = tone === "danger";
  return (
    <div
      role={isDanger ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-[var(--tb-radius)] border px-3.5 py-3 text-sm font-medium ${
        isDanger
          ? "border-[var(--tb-danger)]/25 bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]"
          : "border-[var(--tb-success)]/25 bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]"
      }`}
    >
      <svg {...iconProps} className="h-5 w-5 shrink-0">
        <circle cx="12" cy="12" r="10" />
        {isDanger ? (
          <>
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </>
        ) : (
          <path d="m9 12 2 2 4-4" />
        )}
      </svg>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setMessage(data.message || "ลิงก์รีเซ็ตรหัสผ่านถูกส่งไปยังอีเมลของคุณแล้ว (ถ้าอีเมลมีในระบบ)");
        setEmail("");
      } else {
        setError(data.error || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      }
    } catch (err) {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="neu-surface flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <BrandLink />

        <div className={cardClass}>
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold text-[var(--tb-text)]">ลืมรหัสผ่าน?</h1>
            <p className="mt-1.5 text-sm text-[var(--tb-muted)]">
              กรอกอีเมลของคุณเพื่อรับลิงก์สำหรับตั้งรหัสผ่านใหม่
            </p>
          </div>

          {(message || error) && (
            <div className="mb-5 flex flex-col gap-3">
              {message && <FormAlert tone="success">{message}</FormAlert>}
              {error && <FormAlert tone="danger">{error}</FormAlert>}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="forgot-email" className={labelClass}>
                อีเมล
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={inputClass}
              />
            </div>

            <button type="submit" disabled={loading || !email} className={`${primaryBtnClass} mt-2`}>
              {loading ? "กำลังส่งลิงก์..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
            </button>
          </form>
        </div>

        {/* ลิงก์กลับวางบนภาพพื้นหลังโดยตรง จึงใช้ตัวอักษรเข้มเต็ม */}
        <p className="mt-6 flex justify-center">
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--tb-radius)] px-1.5 text-sm font-semibold text-[var(--tb-text)] underline-offset-4 transition-colors duration-150 hover:text-[var(--tb-primary-text)] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
          >
            <svg {...iconProps} className="h-5 w-5">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </main>
  );
}
