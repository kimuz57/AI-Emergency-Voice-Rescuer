"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthSplitCard, { AUTH_SUBMIT_CLASS } from "@/components/AuthSplitCard";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ข้อความของการ์ด — ใช้ทั้งตอนโหลดหน้า (Suspense fallback) และตอนตรวจลิงก์เสร็จ
const VERIFY_CARD = {
  title: "ยืนยันอีเมล",
  subtitle: "ตรวจสอบลิงก์ยืนยันที่ส่งไปทางอีเมล เพื่อเปิดใช้งานบัญชีของคุณ",
  panelTitle: "ยินดีต้อนรับ",
  panelText: "ยืนยันอีเมลแล้วเข้าสู่ระบบ เพื่อเริ่มเฝ้าระวังคนที่คุณรักได้เลย",
};
const VERIFY_STEPS = ["สมัครสมาชิก", "เปิดลิงก์ยืนยันในอีเมล", "เข้าสู่ระบบ"];

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("กำลังตรวจสอบข้อมูลของคุณ...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("ไม่พบลิงก์ยืนยัน กรุณาตรวจสอบอีเมลของคุณอีกครั้ง");
      return;
    }

    const verifyToken = async () => {
      try {
        // ยิง Token ไปให้ Go Fiber ตรวจสอบ
        const res = await fetch(
          `${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
        );

        // ปลอดภัย: ถ้า response ไม่ใช่ JSON ให้จับเป็นข้อความสำเร็จ/ผิดพลาดทั่วไป
        let data: any = {};
        try {
          data = await res.json();
        } catch (e) {
          data = {};
        }

        if (res.ok) {
          setStatus("success");
          setMessage(
            data.message || "ยืนยันอีเมลสำเร็จ! บัญชีของคุณพร้อมใช้งานแล้ว",
          );
        } else {
          setStatus("error");
          setMessage(data.error || "ลิงก์ไม่ถูกต้อง หรือถูกใช้งานไปแล้ว");
        }
      } catch (error) {
        setStatus("error");
        setMessage("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      }
    };

    verifyToken();
  }, [token]);

  return (
    <AuthSplitCard
      {...VERIFY_CARD}
      steps={VERIFY_STEPS}
      activeStep={status === "success" ? 3 : 2}
    >
      <div className="text-center" role="status" aria-live="polite">
        {/* ไอคอนแสดงสถานะ */}
        <div className="mb-5 flex justify-center">
          {status === "loading" && (
            <div className="w-12 h-12 rounded-full border-4 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
          )}
          {status === "success" && (
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
          )}
          {status === "error" && (
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </div>
          )}
        </div>

        <h3
          className={`text-lg font-bold mb-1 ${
            status === "success"
              ? "text-[var(--tb-success-text)]"
              : status === "error"
                ? "text-[var(--tb-danger-text)]"
                : "text-[var(--tb-text)]"
          }`}
        >
          {status === "loading"
            ? "กำลังตรวจสอบ..."
            : status === "success"
              ? "สำเร็จ!"
              : "เกิดข้อผิดพลาด"}
        </h3>
        <p className="text-sm text-[var(--tb-muted)] mb-6 leading-relaxed">{message}</p>

        {/* ปุ่มหลักเฉพาะตอนยืนยันสำเร็จ — ตอนผิดพลาดใช้ลิงก์กลับท้ายการ์ดของ AuthSplitCard อยู่แล้ว */}
        {status === "success" && (
          <Link href="/login" className={`${AUTH_SUBMIT_CLASS} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]`}>
            เข้าสู่ระบบ
          </Link>
        )}
      </div>
    </AuthSplitCard>
  );
}

export default function VerifyPage() {
  return (
    // Next.js App Router บังคับให้ใช้ Suspense ครอบเวลาดึงค่าจาก URL
    <Suspense
      fallback={
        <AuthSplitCard {...VERIFY_CARD} steps={VERIFY_STEPS} activeStep={2}>
          <div className="text-center text-sm text-[var(--tb-muted)]">กำลังโหลด...</div>
        </AuthSplitCard>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
