"use client";
/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-explicit-any */
import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// คลาสของหน้า auth ใช้ Tailwind + ตัวแปร --tb-* ตรงๆ ไม่ใช้ .neu-*
// เพราะ .neu-* เป็น CSS นอก layer จะทับ utility (hover:, focus:) ที่ใส่คู่กัน
const cardClass =
  "w-full rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] p-6 shadow-[var(--tb-shadow-card)] sm:p-8";
const labelClass = "mb-1.5 block text-sm font-medium text-[var(--tb-text)]";
const inputClass =
  "block h-11 w-full rounded-[var(--tb-radius)] border border-[var(--tb-border-strong)] bg-[var(--tb-surface)] px-3.5 text-base text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--tb-placeholder)] focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)] aria-[invalid=true]:border-[var(--tb-danger)] sm:text-sm";
const primaryBtnClass =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] px-4 text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] transition-colors duration-150 hover:bg-[var(--tb-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
const secondaryBtnClass =
  "inline-flex h-11 w-full items-center justify-center gap-3 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] px-4 text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] transition-colors duration-150 hover:bg-[var(--tb-surface-2)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
const fieldErrorClass = "mt-1.5 text-sm text-[var(--tb-danger-text)]";

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

// ช่องรหัสผ่าน + ปุ่มรูปตาแสดง/ซ่อนที่ขอบขวา (ใช้ซ้ำ 3 ช่องในหน้านี้)
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

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ดึงค่า callbackUrl ถ้าไม่มีให้ดีดไป /dashboard เป็นค่าเริ่มต้น
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [isLogin, setIsLogin] = useState(true);

  // States สำหรับเก็บข้อมูลฟอร์ม
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [errors, setErrors] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    general: "",
  });
  const [successMsg, setSuccessMsg] = useState("");

  const handleStandardAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrors({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      general: "",
    });
    setSuccessMsg("");

    // ==============================================
    // โหมดสมัครสมาชิก (Register)
    // ==============================================
    if (!isLogin) {
      if (password !== confirmPassword) {
        setErrors((prev) => ({
          ...prev,
          confirmPassword: "รหัสผ่านไม่ตรงกัน กรุณากรอกใหม่",
        }));
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name,
            email: email,
            password: password,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          setSuccessMsg(
            "สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบกล่องข้อความในอีเมลของคุณเพื่อยืนยันบัญชี",
          );
          setIsLogin(true);
          setName("");
          setPassword("");
          setConfirmPassword("");
        } else {
          if (
            response.status === 409 ||
            (data.error && data.error.toLowerCase().includes("email"))
          ) {
            setErrors((prev) => ({
              ...prev,
              email: "มีอีเมลนี้ในระบบแล้ว กรุณาเข้าสู่ระบบ",
            }));
          } else {
            setErrors((prev) => ({
              ...prev,
              general: data.error || "เกิดข้อผิดพลาดในการสมัครสมาชิก",
            }));
          }
        }
      } catch (error) {
        console.error("Error:", error);
        setErrors((prev) => ({
          ...prev,
          general: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์",
        }));
      }

      // ==============================================
      // โหมดเข้าสู่ระบบ (Login)
      // ==============================================
    } else {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: email, password: password }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          setErrors({
            name: "",
            email: "",
            password: "",
            confirmPassword: "",
            general: "",
          });
          setSuccessMsg(
            `เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับคุณ ${data.user?.name || "ผู้ใช้งาน"}`,
          );

          const loggedInEmail = data.user?.email || email;
          localStorage.setItem("userEmail", loggedInEmail);

          // ไม่เก็บ role ลง localStorage อีกแล้ว — ทุกหน้า admin ถาม backend
          // ผ่าน useAdminGuard แทน ค่าที่เก็บไว้ในเครื่องปลอมได้ และค้างข้ามคน
          // เพราะ logout ไม่เคยล้างมันทิ้ง
          localStorage.removeItem("userRole");

          const token = data.token || data.accessToken;
          if (token) {
            localStorage.setItem("token", token);
            await fetch("/api/session-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
            });
          }

          // เมื่อล็อกอินสำเร็จ จะพาเด้งกลับไปที่ callbackUrl (ซึ่งอาจพก ?mac=... มาด้วย)
          setTimeout(() => {
            window.location.href = callbackUrl;
            router.refresh();
          }, 500);
        } else {
          if (response.status === 403) {
            setErrors((prev) => ({
              ...prev,
              general: data.error || "กรุณายืนยันอีเมลของคุณก่อนเข้าสู่ระบบ",
            }));
          } else {
            setErrors((prev) => ({
              ...prev,
              password: data.error || "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
            }));
          }
        }
      } catch (error) {
        console.error("Error:", error);
        setErrors((prev) => ({
          ...prev,
          general: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์",
        }));
      }
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setErrors({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      general: "",
    });
    setSuccessMsg("");
    setConfirmPassword("");
  };

  return (
    <main className="neu-surface relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <BrandLink />

        <div className={cardClass}>
          {/* key ตามโหมด → เนื้อหาในการ์ดถูก mount ใหม่ตอนสลับ จึงค่อยๆ จางเข้า (ปิดถ้าผู้ใช้ลดการเคลื่อนไหว) */}
          <div
            key={isLogin ? "login" : "register"}
            className="motion-safe:transition-opacity motion-safe:duration-200 motion-safe:starting:opacity-0"
          >
            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold text-[var(--tb-text)]">
                {isLogin ? "เข้าสู่ระบบบัญชีของคุณ" : "สร้างบัญชีใหม่"}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--tb-muted)]">
                {isLogin
                  ? "เข้าสู่ระบบเพื่อเฝ้าระวังคนที่คุณรักต่อได้เลย"
                  : "สมัครสมาชิกเพื่อเริ่มใช้งาน Emergency Voice Rescuer"}
              </p>
            </div>

            {(errors.general || successMsg) && (
              <div className="mb-5 flex flex-col gap-3">
                {errors.general && <FormAlert tone="danger">{errors.general}</FormAlert>}
                {successMsg && <FormAlert tone="success">{successMsg}</FormAlert>}
              </div>
            )}

            {isLogin ? (
              // =================IN FORM=================
              // ไม่ใช่ <form> ตามเดิม: กด Enter เรียก handleStandardAuth ผ่าน onKeyDown ของแต่ละช่อง
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="login-email" className={labelClass}>
                    อีเมล
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleStandardAuth(e as any); }}
                    className={inputClass}
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor="login-password" className="text-sm font-medium text-[var(--tb-text)]">
                      รหัสผ่าน
                    </label>
                    {/* min-h-10 + margin ติดลบ: ขยายพื้นที่กดให้สูง 40px โดยไม่ดันแถว label */}
                    <Link
                      href="/forgot-password"
                      className="-my-2.5 inline-flex min-h-10 items-center rounded-[var(--tb-radius)] text-sm font-medium text-[var(--tb-primary-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
                    >
                      ลืมรหัสผ่านใช่ไหม?
                    </Link>
                  </div>
                  <PasswordField
                    id="login-password"
                    visible={showLoginPassword}
                    onToggleVisible={() => setShowLoginPassword(!showLoginPassword)}
                    placeholder="กรอกรหัสผ่าน"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleStandardAuth(e as any); }}
                    aria-invalid={errors.password ? true : undefined}
                    aria-describedby={errors.password ? "login-password-error" : undefined}
                  />
                  {errors.password && (
                    <p id="login-password-error" role="alert" className={fieldErrorClass}>
                      {errors.password}
                    </p>
                  )}
                </div>

                <button type="button" onClick={handleStandardAuth} className={`${primaryBtnClass} mt-2`}>
                  เข้าสู่ระบบ
                </button>
              </div>
            ) : (
              // =================UP FORM=================
              <form onSubmit={handleStandardAuth} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="register-name" className={labelClass}>
                    ชื่อผู้ใช้งาน
                  </label>
                  <input
                    id="register-name"
                    type="text"
                    placeholder="กรอกชื่อของคุณ"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="register-email" className={labelClass}>
                    อีเมล
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? "register-email-error" : undefined}
                    className={inputClass}
                  />
                  {errors.email && (
                    <p id="register-email-error" role="alert" className={fieldErrorClass}>
                      {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="register-password" className={labelClass}>
                    รหัสผ่าน
                  </label>
                  <PasswordField
                    id="register-password"
                    visible={showPassword}
                    onToggleVisible={() => setShowPassword(!showPassword)}
                    placeholder="กรอกรหัสผ่าน"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="register-confirm-password" className={labelClass}>
                    ยืนยันรหัสผ่าน
                  </label>
                  <PasswordField
                    id="register-confirm-password"
                    visible={showConfirmPassword}
                    onToggleVisible={() => setShowConfirmPassword(!showConfirmPassword)}
                    placeholder="กรอกรหัสผ่านอีกครั้ง"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-invalid={errors.confirmPassword ? true : undefined}
                    aria-describedby={errors.confirmPassword ? "register-confirm-password-error" : undefined}
                  />
                  {errors.confirmPassword && (
                    <p id="register-confirm-password-error" role="alert" className={fieldErrorClass}>
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>

                <button type="submit" className={`${primaryBtnClass} mt-2`}>
                  สมัครสมาชิก
                </button>
              </form>
            )}

            <div className="my-6 flex items-center gap-3">
              <span aria-hidden="true" className="h-px flex-1 bg-[var(--tb-border)]" />
              <span className="text-sm text-[var(--tb-muted)]">หรือ</span>
              <span aria-hidden="true" className="h-px flex-1 bg-[var(--tb-border)]" />
            </div>

            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl }, { prompt: "select_account" })}
              className={secondaryBtnClass}
            >
              <img src="/google-color.svg" alt="" aria-hidden="true" className="h-5 w-5" />
              ดำเนินการต่อด้วย Google
            </button>
          </div>
        </div>

        {/* สลับโหมดเข้าสู่ระบบ / สมัครสมาชิก — ตัวอักษรเข้มเต็มเพราะวางบนภาพพื้นหลังโดยตรง */}
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-1 text-sm text-[var(--tb-text)]">
          <span>{isLogin ? "ยังไม่มีบัญชี?" : "มีบัญชีแล้ว?"}</span>
          <button
            type="button"
            onClick={toggleMode}
            className="inline-flex h-10 items-center rounded-[var(--tb-radius)] px-1.5 font-semibold text-[var(--tb-primary-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
          >
            {isLogin ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
          </button>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[var(--tb-muted)]">
          Loading...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
