"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import AuthSplitCard, {
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_SUBMIT_CLASS,
  AuthAlert,
  RESET_STEPS,
  Spinner,
} from "@/components/AuthSplitCard";
import PasswordToggle from "@/components/PasswordToggle";

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
  // สถานะของปุ่มรูปตาเท่านั้น ไม่มีผลกับการตรวจหรือการส่งรหัสผ่าน
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

  // ลิงก์ไม่มี token — พากลับไปขอลิงก์ใหม่ที่หน้าลืมรหัสผ่าน
  if (!token) {
    return (
      <AuthSplitCard
        title="ลิงก์ไม่ถูกต้อง"
        subtitle="ลิงก์นี้ใช้ตั้งรหัสผ่านใหม่ไม่ได้ ขอลิงก์ใหม่แล้วเปิดจากอีเมลล่าสุดอีกครั้ง"
        panelTitle="ขอลิงก์ใหม่ได้เลย"
        panelText="ลิงก์ตั้งรหัสผ่านใหม่มีอายุจำกัด ถ้าหมดอายุหรือเปิดไม่ครบ ให้ขอลิงก์ใหม่จากหน้าลืมรหัสผ่าน"
        steps={RESET_STEPS}
        activeStep={2}
      >
        {error && <AuthAlert tone="error">{error}</AuthAlert>}
        <Link href="/forgot-password" className={AUTH_SUBMIT_CLASS}>
          ขอลิงก์รีเซ็ตรหัสผ่านใหม่
        </Link>
      </AuthSplitCard>
    );
  }

  return (
    <AuthSplitCard
      title="ตั้งรหัสผ่านใหม่"
      subtitle="กรอกรหัสผ่านใหม่ที่ต้องการใช้เข้าสู่ระบบ"
      panelTitle="เกือบเสร็จแล้ว"
      panelText="ตั้งรหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร แล้วใช้เข้าสู่ระบบได้ทันที"
      steps={RESET_STEPS}
      activeStep={success ? 4 : 3}
    >
      {success ? (
        <div className="text-center">
          <AuthAlert tone="success">{message}</AuthAlert>
          <p className="neu-text-muted text-sm">กำลังพากลับไปยังหน้าเข้าสู่ระบบ...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <AuthAlert tone="error">{error}</AuthAlert>}

          <div>
            <label htmlFor="reset-password" className={AUTH_LABEL_CLASS}>
              รหัสผ่านใหม่
            </label>
            <div className="relative">
              <input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                className={`${AUTH_INPUT_CLASS} pr-12`}
              />
              <PasswordToggle
                visible={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                controls="reset-password"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reset-confirm-password" className={AUTH_LABEL_CLASS}>
              ยืนยันรหัสผ่านใหม่
            </label>
            <div className="relative">
              <input
                id="reset-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                className={`${AUTH_INPUT_CLASS} pr-12`}
              />
              <PasswordToggle
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
                controls="reset-confirm-password"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className={AUTH_SUBMIT_CLASS}>
            {loading ? (
              <>
                <Spinner />
                กำลังบันทึก...
              </>
            ) : (
              "บันทึกรหัสผ่านใหม่"
            )}
          </button>
        </form>
      )}
    </AuthSplitCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center neu-text-muted">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
