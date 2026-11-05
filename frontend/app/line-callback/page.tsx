"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authHeaders, LINE_OAUTH_STATE_KEY } from "@/lib/auth";

// การ์ดกลางจอ — หน้านี้อยู่นอก app shell เหมือนหน้า auth จึงวางการ์ดเดี่ยวด้วยตัวแปร --tb-*
const CARD_CLASS =
  "w-full max-w-md rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] px-6 py-8 sm:px-8 text-center";
const SPINNER_CLASS =
  "w-12 h-12 rounded-full border-4 border-[var(--tb-border)] border-t-[var(--tb-success)] animate-spin";

// แยก Component สำหรับอ่าน URL Parameter ออกมา
function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // 1. เปิดใช้งานตัวล็อกตรงนี้! เพื่อป้องกัน React ยิงซ้ำ 2 รอบ
  const hasFetched = useRef(false);

  const [status, setStatus] = useState("กำลังเชื่อมต่อกับ LINE...");
  const [phase, setPhase] = useState<"working" | "done" | "error">("working");
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  useEffect(() => {
    const linkLineAccount = async () => {
      // 2. ถ้าเคยถูกเรียกไปแล้ว ให้ตัดจบการทำงานทันที (บล็อกรอบสอง)
      if (hasFetched.current) return;

      const authCode = searchParams.get("code");

      if (!authCode) {
        setStatus("ไม่พบรหัสยืนยันจาก LINE กรุณาลองใหม่อีกครั้ง");
        setPhase("error");
        return;
      }

      // ล็อกทันที ป้องกันรอบที่สองวิ่งมาชน
      hasFetched.current = true;

      // S27: state ต้องตรงกับที่ /settings/notifications สุ่มเก็บไว้ก่อน redirect ไป LINE
      // ใช้ได้ครั้งเดียว — ลบทิ้งทันทีไม่ว่าจะตรงหรือไม่
      const returnedState = searchParams.get("state");
      let expectedState: string | null = null;
      try {
        expectedState = sessionStorage.getItem(LINE_OAUTH_STATE_KEY);
        sessionStorage.removeItem(LINE_OAUTH_STATE_KEY);
      } catch {
        expectedState = null;
      }
      if (!expectedState || !returnedState || returnedState !== expectedState) {
        setStatus("คำขอเชื่อมต่อ LINE ไม่ถูกต้องหรือหมดอายุ กรุณากดเชื่อมต่อใหม่จากหน้าตั้งค่าการแจ้งเตือน");
        setPhase("error");
        return;
      }

      setStatus("กำลังนำรหัสไปผูกกับบัญชีของคุณ...");

      try {
        const email = localStorage.getItem("userEmail");

        const response = await fetch(
          `${BASE_URL}/api/user/link-line`,
          {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ code: authCode, email: email }),
          },
        );

        if (response.ok) {
          // การเชื่อมต่อเริ่มจากหน้าตั้งค่าการแจ้งเตือน จึงพากลับไปที่นั่น
          setStatus("ผูกบัญชี LINE สำเร็จ! กำลังพากลับหน้าตั้งค่าการแจ้งเตือน...");
          setPhase("done");
          redirectTimer.current = setTimeout(() => {
            router.push("/settings/notifications");
          }, 2000);
        } else {
          const errData = await response.json().catch(() => ({}));
          setStatus(
            `เกิดข้อผิดพลาด: ${errData.error || "ไม่สามารถผูกบัญชีได้"}`,
          );
          setPhase("error");
        }
      } catch (error) {
        console.error("Error linking line:", error);
        setStatus("ไม่สามารถติดต่อเซิร์ฟเวอร์ Backend ได้");
        setPhase("error");
      }
    };

    linkLineAccount();
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [searchParams, router]);

  return (
    <div className={CARD_CLASS}>
      <p className="text-xs font-semibold text-[var(--tb-muted)]">เชื่อมต่อ LINE</p>
      <div className="mt-5 mb-5 flex justify-center">
        {phase === "working" ? (
          <div className={SPINNER_CLASS} aria-hidden="true" />
        ) : (
          <span
            className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${
              phase === "done"
                ? "bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]"
                : "bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]"
            }`}
            aria-hidden="true"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {phase === "done" ? (
                <polyline points="20 6 9 17 4 12" />
              ) : (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              )}
            </svg>
          </span>
        )}
      </div>
      <h2 className="text-xl font-bold text-[var(--tb-text)]">
        {phase === "working" ? "ระบบกำลังประมวลผล" : phase === "done" ? "เชื่อมต่อ LINE สำเร็จ" : "เชื่อมต่อ LINE ไม่สำเร็จ"}
      </h2>
      <p className="mt-2 text-sm text-[var(--tb-muted)] leading-relaxed" role="status" aria-live="polite">
        {status}
      </p>

      <button
        type="button"
        onClick={() => router.push("/settings/notifications")}
        className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 h-10 min-h-[44px] sm:min-h-0 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        กลับไปหน้าตั้งค่าการแจ้งเตือน
      </button>
    </div>
  );
}

export default function LineCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <Suspense
        fallback={
          <div className={CARD_CLASS}>
            <div className="mb-4 flex justify-center">
              <div className={SPINNER_CLASS} aria-hidden="true" />
            </div>
            <p className="text-sm text-[var(--tb-muted)]">กำลังโหลดหน้าต่างเชื่อมต่อ...</p>
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
    </div>
  );
}
