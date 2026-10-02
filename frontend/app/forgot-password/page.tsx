"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState } from "react";
import AuthSplitCard, {
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_SUBMIT_CLASS,
  AuthAlert,
  RESET_STEPS,
  Spinner,
} from "@/components/AuthSplitCard";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
    <AuthSplitCard
      title="ลืมรหัสผ่าน"
      subtitle="กรอกอีเมลที่ใช้สมัครสมาชิก ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้"
      panelTitle="ไม่ต้องกังวล"
      panelText="ตั้งรหัสผ่านใหม่ได้ในไม่กี่ขั้นตอน แล้วกลับไปเฝ้าระวังคนที่คุณรักต่อได้เลย"
      steps={RESET_STEPS}
      activeStep={message ? 2 : 1}
    >
      {message && <AuthAlert tone="success">{message}</AuthAlert>}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="forgot-email" className={AUTH_LABEL_CLASS}>
            อีเมล
          </label>
          <input
            id="forgot-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className={AUTH_INPUT_CLASS}
          />
        </div>

        <button type="submit" disabled={loading} className={AUTH_SUBMIT_CLASS}>
          {loading ? (
            <>
              <Spinner />
              กำลังส่ง...
            </>
          ) : (
            "ส่งลิงก์รีเซ็ตรหัสผ่าน"
          )}
        </button>
      </form>
    </AuthSplitCard>
  );
}
