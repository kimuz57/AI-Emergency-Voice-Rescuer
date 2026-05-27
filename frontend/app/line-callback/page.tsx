"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// แยก Component สำหรับอ่าน URL Parameter ออกมา
function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState("กำลังเชื่อมต่อกับ LINE...");
  const [code, setCode] = useState<string | null>(null);

  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  useEffect(() => {
    const linkLineAccount = async () => {
      // 1. ดึงรหัส code จาก URL
      const authCode = searchParams.get("code");

      if (!authCode) {
        setStatus("ไม่พบรหัสยืนยันจาก LINE กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setCode(authCode);
      setStatus("กำลังนำรหัสไปผูกกับบัญชีของคุณ...");

      try {
        // 2. ดึงข้อมูลยืนยันตัวตนของผู้ใช้ (Token หรือ Email ที่เราทำไว้)
        const token = localStorage.getItem("token");
        const email = localStorage.getItem("userEmail");

        // 3. ยิง API ส่งรหัส Code ไปให้ Go Backend นำไปแลกเป็น Line User ID
        const response = await fetch(
          `${BASE_URL}/api/user/link-line`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token || ""}`,
            },
            // ส่ง Code และ Email ไปให้ Go รู้ว่าใครเป็นคนขอผูก LINE
            body: JSON.stringify({ code: authCode, email: email }),
          },
        );

        if (response.ok) {
          setStatus("✅ ผูกบัญชี LINE สำเร็จ! กำลังพากลับหน้าโปรไฟล์...");
          // สั่งให้เด้งกลับหน้าโปรไฟล์อัตโนมัติใน 2 วินาที
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

      {/* โชว์ Code ชั่วคราวเพื่อให้รู้ว่าดึงมาได้จริง (เดี๋ยวค่อยลบออกตอนทำเสร็จ) */}
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
      {/* ใช้ Suspense ครอบไว้เพราะ Next.js บังคับเวลาใช้ useSearchParams */}
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
