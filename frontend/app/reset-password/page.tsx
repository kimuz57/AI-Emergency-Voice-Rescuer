"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

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

function EyeIcon() {
  return (
    <svg {...iconProps} className="h-5 w-5">
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...iconProps} className="h-5 w-5">
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

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

type PasswordFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "className"> & {
  id: string;
  visible: boolean;
  onToggleVisible: () => void;
};

// ช่องรหัสผ่าน + ปุ่มรูปตาแสดง/ซ่อนที่ขอบขวา
// ตอนซ่อนอยู่แสดงรูปตา กดแล้วเห็นรหัส ตอนเห็นอยู่แสดงรูปตาขีดฆ่า
// ชื่อปุ่มคงที่ "แสดงรหัสผ่าน" + aria-pressed — ถ้าสลับชื่อเป็น "ซ่อนรหัสผ่าน" คู่กับ pressed=true
// โปรแกรมอ่านหน้าจอจะอ่านว่า "ซ่อนรหัสผ่าน กดอยู่" ทั้งที่รหัสกำลังแสดงอยู่
function PasswordField({ id, visible, onToggleVisible, ...inputProps }: PasswordFieldProps) {
  return (
    <div className="relative">
      <input {...inputProps} id={id} type={visible ? "text" : "password"} className={`${inputClass} pr-11`} />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label="แสดงรหัสผ่าน"
        aria-pressed={visible}
        aria-controls={id}
        className="absolute right-0.5 top-0.5 inline-flex h-10 w-10 items-center justify-center rounded-[var(--tb-radius)] text-[var(--tb-muted)] transition-colors duration-150 hover:text-[var(--tb-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

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
  // สถานะของปุ่มรูปตา (แสดง/ซ่อนรหัสผ่าน) — ใช้แค่ฝั่งหน้าจอ
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      <div className={`${cardClass} text-center`}>
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]"
        >
          <svg {...iconProps} className="h-6 w-6">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
        </span>
        <h1 className="text-xl font-bold text-[var(--tb-text)]">ลิงก์ไม่ถูกต้อง</h1>
        <p role="alert" className="mt-2 text-sm text-[var(--tb-danger-text)]">
          {error}
        </p>
        <Link href="/forgot-password" className={`${primaryBtnClass} mt-6`}>
          ขอลิงก์รีเซ็ตรหัสผ่านใหม่
        </Link>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-[var(--tb-text)]">ตั้งรหัสผ่านใหม่</h1>
        <p className="mt-1.5 text-sm text-[var(--tb-muted)]">
          กรุณากรอกรหัสผ่านใหม่ของคุณ
        </p>
      </div>

      {success ? (
        <div className="flex flex-col gap-4">
          <FormAlert tone="success">{message}</FormAlert>
          <p className="text-center text-sm text-[var(--tb-muted)]">กำลังพากลับไปยังหน้าเข้าสู่ระบบ...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <FormAlert tone="danger">{error}</FormAlert>}

          <div>
            <label htmlFor="new-password" className={labelClass}>
              รหัสผ่านใหม่
            </label>
            <PasswordField
              id="new-password"
              visible={showPassword}
              onToggleVisible={() => setShowPassword(!showPassword)}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="confirm-new-password" className={labelClass}>
              ยืนยันรหัสผ่านใหม่
            </label>
            <PasswordField
              id="confirm-new-password"
              visible={showConfirmPassword}
              onToggleVisible={() => setShowConfirmPassword(!showConfirmPassword)}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className={`${primaryBtnClass} mt-2`}
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
    <main className="neu-surface flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <BrandLink />
        <Suspense
          fallback={<div className={`${cardClass} text-center text-sm text-[var(--tb-muted)]`}>Loading...</div>}
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
