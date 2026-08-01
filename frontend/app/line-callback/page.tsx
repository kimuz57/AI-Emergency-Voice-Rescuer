"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// แยก Component สำหรับอ่าน URL Parameter ออกมา
function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 🟢 1. เปิดใช้งานตัวล็อกตรงนี้! เพื่อป้องกัน React ยิงซ้ำ 2 รอบ
  const hasFetched = useRef(false);
  
  const [status, setStatus] = useState("กำลังเชื่อมต่อกับ LINE...");
  const [code, setCode] = useState<string | null>(null);

  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  
  useEffect(() => {
    const linkLineAccount = async () => {
      // 🟢 2. ถ้าเคยถูกเรียกไปแล้ว ให้ตัดจบการทำงานทันที (บล็อกรอบสอง)
      if (hasFetched.current) return;

      const authCode = searchParams.get("code");

      if (!authCode) {
        setStatus("ไม่พบรหัสยืนยันจาก LINE กรุณาลองใหม่อีกครั้ง");
        return;
      }

      // 🔒 ล็อกทันที ป้องกันรอบที่สองวิ่งมาชน
      hasFetched.current = true;
      setCode(authCode);
      setStatus("กำลังนำรหัสไปผูกกับบัญชีของคุณ...");

      try {
        const token = localStorage.getItem("token");
        const email = localStorage.getItem("userEmail");

        const response = await fetch(
          `${BASE_URL}/api/user/link-line`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token || ""}`,
            },
            body: JSON.stringify({ code: authCode, email: email }),
          },
        );

        if (response.ok) {
          setStatus("✅ ผูกบัญชี LINE สำเร็จ! กำลังพากลับหน้าโปรไฟล์...");
          setTimeout(() => {
            router.push("/profile");
          }, 2000);
        } else {
          const errData = await response.json();
          setStatus(
            `❌ เกิดข้อผิดพลาด: ${errData.error || "ไม่สามารถผูกบัญชีได้"}`,
          );
        }
      } catch (error) {
        console.error("Error linking line:", error);
        setStatus("❌ ไม่สามารถติดต่อเซิร์ฟเวอร์ Backend ได้");
      }
    };

    linkLineAccount();
  }, [searchParams, router]);

  return (
    <div className="flex flex-col items-center justify-center h-[50vh] space-y-6">
      <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      <h2 className="text-xl font-bold text-slate-800">ระบบกำลังประมวลผล</h2>
      <p className="text-slate-500">{status}</p>

      {code && (
        <div className="mt-4 p-4 bg-slate-100 rounded-lg text-xs font-mono text-slate-600 break-all max-w-lg text-center">
          Code: {code}
        </div>
      )}

      <button
        onClick={() => router.push("/profile")}
        className="mt-6 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all text-sm font-medium"
      >
        กลับไปหน้าโปรไฟล์
      </button>
    </div>
  );
}

export default function LineCallbackPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col">
      <Suspense
        fallback={
          <div className="text-center mt-20">กำลังโหลดหน้าต่างเชื่อมต่อ...</div>
        }
      >
        <CallbackContent />
      </Suspense>
    </div>
  );
}