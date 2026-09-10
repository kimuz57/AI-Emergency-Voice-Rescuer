"use client";
/* eslint-disable @typescript-eslint/no-unused-vars, react-hooks/set-state-in-effect, @next/next/no-img-element */
import { useCallback, useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import Sidebar from "@/components/Sidebar";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// กำหนดโครงสร้างข้อมูล User
type UserProfile = {
  name: string;
  email: string;
  role: string;
  profileImage: string;
};

export default function Navbar() {
  // เมนูย้ายจาก dropdown ใต้รูปโปรไฟล์ มาเป็น Sidebar ที่เลื่อนออกมาจากซ้าย
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  // 🟢 1. เปลี่ยนจากฟิกค่า เป็นการตั้ง State เริ่มต้นเป็นค่าว่าง
  const [user, setUser] = useState<UserProfile | null>(null);

  // 🟢 2. ฟังก์ชันยิงไปดึงโปรไฟล์จริงจาก Go Backend
  const fetchUserProfile = async () => {
    try {
      // 🟢 1. ดึง URL หลังบ้านจากหน้าต่าง .env (หากไม่มีให้เลือกใช้ localhost:8080 เป็นตัวสำรอง)

      let targetEmail = localStorage.getItem("userEmail");
      console.log("👉 [1] ค่าที่อ่านได้จาก localStorage คือ:", targetEmail);

      // 🟢 2. เรียกดึงข้อมูล Session (พร้อม timeout + error handling)
      let session = null;
      try {
        const sessionRes = await Promise.race([
          fetch("/api/auth/session", { cache: "no-store" }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Session timeout')), 3000)
          )
        ]) as Response;

        if (sessionRes.ok) {
          session = await sessionRes.json();
        }
      } catch (sessionError) {
        console.log("⚠️ [Session] ไม่สามารถดึง session ได้:", sessionError);
        // ไม่ throw ต่อ เพราะไม่ critical
      }

      // เช็คว่าใน localStorage ไม่มีอีเมลจริงไหม
      if (
        !targetEmail ||
        targetEmail === "null" ||
        targetEmail === "undefined"
      ) {
        console.log(
          "👉 [2] ไม่มีใน localStorage! กำลังพยายามดึงจาก Google NextAuth...",
        );
        console.log("👉 [3] ข้อมูล Session จาก Google คือ:", session);

        if (session?.user?.email) {
          targetEmail = session.user.email;
          localStorage.setItem("userEmail", targetEmail || ""); // เซฟกลับลง localStorage เผื่อใช้รอบหน้า
          console.log(
            "👉 [4] เจออีเมลจาก Google แล้ว! เซฟลงเครื่องเรียบร้อย:",
            targetEmail,
          );
        }
      }

      // ด่านตรวจสุดท้าย: ถ้าหาอีเมลไม่ได้เลยสักทาง ให้เบรกระบบ
      if (
        !targetEmail ||
        targetEmail === "null" ||
        targetEmail === "undefined"
      ) {
        console.log(
          "❌ [5] สรุปคือหาอีเมลไม่เจอเลยสักทาง! ระบบหยุดดึงข้อมูลโปรไฟล์",
        );
        return;
      }

      // 🟢 3. ได้อีเมลชัวร์ๆ แล้ว ยิง API ไปถาม Go Backend (พร้อม timeout + error handling)
      console.log(
        "✅ [6] ได้อีเมลแล้ว กำลังยิงไปถาม Go Backend ด้วยอีเมล:",
        targetEmail,
      );

      try {
        const res = await Promise.race([
          fetch(`${API_BASE_URL}/api/user/profile?email=${targetEmail}`, {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            headers: { "Content-Type": "application/json" }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Backend timeout')), 5000)
          )
        ]) as Response;

        if (res.ok) {
          const data = await res.json();
          console.log("✅ [7] ข้อมูลที่ Go Backend ตอบกลับมาคือ:", data);

          // 🟢 4. ทริคเด็ดเรื่องรูปภาพ
          const sessionEmail = session?.user?.email?.toLowerCase();
          const isSameSessionUser =
            sessionEmail && sessionEmail === targetEmail.toLowerCase();

          if (
            isSameSessionUser &&
            (!data.profileImage ||
              data.profileImage === "" ||
              data.profileImage.includes("picture/0"))
          ) {
            if (session?.user?.image) {
              data.profileImage = session.user.image;
            }
          }

          setUser(data); // อัปเดต State ขึ้นหน้าเว็บ
        } else {
          console.log("❌ [8] Go Backend ตอบกลับ status:", res.status);
          // 🆕 ไม่มี Backend → ใช้ข้อมูล fallback
          setUser({
            name: targetEmail?.split('@')[0] || "ผู้ใช้งาน",
            email: targetEmail || "ไม่มีข้อมูล",
            role: "User",
            profileImage: session?.user?.image || ""
          });
        }
      } catch (backendError) {
        console.log("⚠️ [Backend] ไม่สามารถเชื่อมต่อ Backend ได้:", backendError);
        // 🆕 Backend ไม่ตอบ → ใช้ข้อมูล fallback จาก session หรือ email
        setUser({
          name: session?.user?.name || targetEmail?.split('@')[0] || "ผู้ใช้งาน",
          email: targetEmail || session?.user?.email || "ไม่มีข้อมูล",
          role: "User",
          profileImage: session?.user?.image || ""
        });
      }
    } catch (error) {
      console.error("💥 ล้มเหลวในการดึงข้อมูลโปรไฟล์:", error);
      // 🆕 ใช้ fallback data เพื่อไม่ให้ Next.js dev overlay ขึ้น
      const email = localStorage.getItem("userEmail") || "ไม่มีข้อมูล";
      setUser({
        name: email.split('@')[0] || "ผู้ใช้งาน",
        email: email,
        role: "User",
        profileImage: ""
      });
    }
  };

  // 🟢 ฟังก์ชันสำหรับ ส่งคำสั่ง Logout ไปหลังบ้าน และล้างข้อมูลหน้าบ้าน
  const handleLogout = async () => {
    try {
      console.log("⏳ 1. กำลังสั่งลบคุกกี้...");

      // 1. ยิงไปลบคุกกี้ที่ Go Backend (ไม่ critical ถ้า fail)
      try {
        await Promise.race([
          fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: "POST",
            credentials: "include",
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Logout timeout')), 3000)
          )
        ]);
        console.log("✅ 2. Backend logout สำเร็จ");
      } catch (backendError) {
        console.log("⚠️ Backend logout ไม่สำเร็จ (ข้าม):", backendError);
      }

      try {
        await fetch("/api/logout", { method: "POST" });
      } catch (nextAuthError) {
        console.log("⚠️ NextAuth logout ไม่สำเร็จ (ข้าม):", nextAuthError);
      }

      // 2. ล้างข้อมูลหน้าบ้าน (สำคัญที่สุด)
      localStorage.removeItem("token");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userRole"); // ของเก่าที่อาจค้างจาก build ก่อนหน้า

      // 3. 🌟 เรียก signOut ของ NextAuth
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("❌ ล้มเหลว:", error);
      // 🆕 แม้ error ก็ยังล้าง localStorage และ redirect
      localStorage.removeItem("token");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userRole");
      window.location.href = "/";
    }
  };

  const handleRegisterPatient = async () => {
    try {
      // 1. ดึง Token เผื่อ Backend ต้องใช้เช็คสิทธิ์ (ถ้าไม่มีก็เอาออกได้ครับ)
      const token = localStorage.getItem("token");

      // 2. ข้อมูลที่จะส่งไปให้ Backend (ปรับ key ให้ตรงกับที่ Go Backend ต้องการ)
      const payload = {
        mac_address: "AA:BB:CC:DD:EE:FF",
        patient_name: "นายทดสอบ สมมติ",
      };

      const res = await fetch(`${API_BASE_URL}/dashboard/device`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // ส่ง Token ไปด้วย
        },
        body: JSON.stringify(payload), // แปลงข้อมูลเป็น JSON
      });

      // 3. เช็คว่า Backend ตอบกลับมาว่าสำเร็จหรือไม่ (Status 200-299)
      if (!res.ok) {
        // ถ้าไม่สำเร็จ ให้โยน Error ไปเข้าบล็อก catch
        const errorData = await res.json();
        throw new Error(errorData.error || "เกิดข้อผิดพลาดในการลงทะเบียน");
      }

      // 4. แกะข้อมูลที่ Backend ส่งกลับมาเมื่อสำเร็จ
      const data = await res.json();
      console.log("ลงทะเบียนสำเร็จ:", data);
      alert("ลงทะเบียนสำเร็จเรียบร้อย!");
    } catch (error) {
      // 🟢 แปลงประเภทตัวแปรให้ปลอดภัยก่อนดึงค่า .message
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error("❌ Error registering patient:", errorMessage);
      alert(`เกิดข้อผิดพลาด: ${errorMessage}`);
    }
  };

  useEffect(() => {
    fetchUserProfile(); // ดึงข้อมูลทันทีเมื่อโหลดหน้าเว็บ
    // การปิดเมนูย้ายไปอยู่ใน Sidebar แล้ว (ฉากหลัง + Esc + เปลี่ยนหน้า)
  }, []);

  return (
    <>
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-b border-gray-100 dark:border-slate-700 px-6 py-4 flex justify-between items-center shadow-sm transition-colors duration-300">
        <div className="flex items-center gap-3">
          {/* ปุ่มเปิดเมนู Sidebar */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="เปิดเมนู"
            aria-expanded={isSidebarOpen}
            aria-controls="app-sidebar"
            className="rounded-lg p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-end gap-1 h-6">
              <div
                className="w-1.5 h-3 bg-blue-600 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></div>
              <div
                className="w-1.5 h-6 bg-indigo-500 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></div>
              <div
                className="w-1.5 h-4 bg-purple-500 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></div>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              <a
                href="/dashboard"
                className="hover:text-blue-600 transition-colors cursor-pointer"
              >
                Emergency Voice Rescuer
              </a>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* รูปโปรไฟล์ยังกดได้ แต่ตอนนี้เปิด Sidebar แทน dropdown เดิม */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            aria-label="เปิดเมนูผู้ใช้"
            className="flex items-center gap-3 focus:outline-none transition-transform hover:scale-103"
          >
            <img
              src={
                user?.profileImage ||
                "https://ui-avatars.com/api/?name=" +
                  (user?.name || "U") +
                  "&background=EBF4FF&color=1E3A8A"
              }
              referrerPolicy="no-referrer"
              alt="Profile"
              className="w-11 h-11 rounded-full border border-gray-200 dark:border-slate-600 object-cover shadow-sm bg-white dark:bg-slate-700"
              onError={(e) => {
                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  user?.name || "U",
                )}&background=EBF4FF&color=1E3A8A`;
              }}
            />
          </button>
        </div>
      </nav>

      <Sidebar
        open={isSidebarOpen}
        onClose={closeSidebar}
        user={user}
        onLogout={handleLogout}
      />
    </>
  );
}
