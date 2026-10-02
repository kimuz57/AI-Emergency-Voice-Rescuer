"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import Sidebar, { BrandMark, BrandName } from "@/components/Sidebar";
import { authHeaders } from "@/lib/auth";

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

  // 1. เปลี่ยนจากฟิกค่า เป็นการตั้ง State เริ่มต้นเป็นค่าว่าง
  const [user, setUser] = useState<UserProfile | null>(null);

  // 2. ฟังก์ชันยิงไปดึงโปรไฟล์จริงจาก Go Backend
  const fetchUserProfile = async () => {
    try {
      // 1. ดึง URL หลังบ้านจากหน้าต่าง .env (หากไม่มีให้เลือกใช้ localhost:8080 เป็นตัวสำรอง)

      let targetEmail = localStorage.getItem("userEmail");
      console.log("[1] ค่าที่อ่านได้จาก localStorage คือ:", targetEmail);

      // 2. เรียกดึงข้อมูล Session (พร้อม timeout + error handling)
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
        console.log("[Session] ไม่สามารถดึง session ได้:", sessionError);
        // ไม่ throw ต่อ เพราะไม่ critical
      }

      // เช็คว่าใน localStorage ไม่มีอีเมลจริงไหม
      if (
        !targetEmail ||
        targetEmail === "null" ||
        targetEmail === "undefined"
      ) {
        console.log(
          "[2] ไม่มีใน localStorage! กำลังพยายามดึงจาก Google NextAuth...",
        );
        console.log("[3] ข้อมูล Session จาก Google คือ:", session);

        if (session?.user?.email) {
          targetEmail = session.user.email;
          localStorage.setItem("userEmail", targetEmail || ""); // เซฟกลับลง localStorage เผื่อใช้รอบหน้า
          console.log(
            "[4] เจออีเมลจาก Google แล้ว! เซฟลงเครื่องเรียบร้อย:",
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
          "[5] สรุปคือหาอีเมลไม่เจอเลยสักทาง! ระบบหยุดดึงข้อมูลโปรไฟล์",
        );
        return;
      }

      // 3. ได้อีเมลชัวร์ๆ แล้ว ยิง API ไปถาม Go Backend (พร้อม timeout + error handling)
      console.log(
        "[6] ได้อีเมลแล้ว กำลังยิงไปถาม Go Backend ด้วยอีเมล:",
        targetEmail,
      );

      try {
        const res = await Promise.race([
          fetch(`${API_BASE_URL}/api/user/profile?email=${encodeURIComponent(targetEmail)}`, {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            headers: authHeaders({ "Content-Type": "application/json" }),
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Backend timeout')), 5000)
          )
        ]) as Response;

        if (res.ok) {
          const data = await res.json();
          console.log("[7] ข้อมูลที่ Go Backend ตอบกลับมาคือ:", data);

          // 4. ทริคเด็ดเรื่องรูปภาพ
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
          console.log("[8] Go Backend ตอบกลับ status:", res.status);
          // ไม่มี Backend → ใช้ข้อมูล fallback
          setUser({
            name: targetEmail?.split('@')[0] || "ผู้ใช้งาน",
            email: targetEmail || "ไม่มีข้อมูล",
            role: "User",
            profileImage: session?.user?.image || ""
          });
        }
      } catch (backendError) {
        console.log("[Backend] ไม่สามารถเชื่อมต่อ Backend ได้:", backendError);
        // Backend ไม่ตอบ → ใช้ข้อมูล fallback จาก session หรือ email
        setUser({
          name: session?.user?.name || targetEmail?.split('@')[0] || "ผู้ใช้งาน",
          email: targetEmail || session?.user?.email || "ไม่มีข้อมูล",
          role: "User",
          profileImage: session?.user?.image || ""
        });
      }
    } catch (error) {
      console.error("ล้มเหลวในการดึงข้อมูลโปรไฟล์:", error);
      // ใช้ fallback data เพื่อไม่ให้ Next.js dev overlay ขึ้น
      const email = localStorage.getItem("userEmail") || "ไม่มีข้อมูล";
      setUser({
        name: email.split('@')[0] || "ผู้ใช้งาน",
        email: email,
        role: "User",
        profileImage: ""
      });
    }
  };

  // ฟังก์ชันสำหรับ ส่งคำสั่ง Logout ไปหลังบ้าน และล้างข้อมูลหน้าบ้าน
  const handleLogout = async () => {
    try {
      console.log("1. กำลังสั่งลบคุกกี้...");

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
        console.log("2. Backend logout สำเร็จ");
      } catch (backendError) {
        console.log("Backend logout ไม่สำเร็จ (ข้าม):", backendError);
      }

      try {
        await fetch("/api/logout", { method: "POST" });
      } catch (nextAuthError) {
        console.log("NextAuth logout ไม่สำเร็จ (ข้าม):", nextAuthError);
      }

      // 2. ล้างข้อมูลหน้าบ้าน (สำคัญที่สุด)
      localStorage.removeItem("token");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userRole"); // ของเก่าที่อาจค้างจาก build ก่อนหน้า

      // 3. เรียก signOut ของ NextAuth
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("ล้มเหลว:", error);
      // แม้ error ก็ยังล้าง localStorage และ redirect
      localStorage.removeItem("token");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userRole");
      window.location.href = "/";
    }
  };


  useEffect(() => {
    fetchUserProfile(); // ดึงข้อมูลทันทีเมื่อโหลดหน้าเว็บ
    // การปิดเมนูย้ายไปอยู่ใน Sidebar แล้ว (ฉากหลัง + Esc + เปลี่ยนหน้า)
  }, []);


  return (
    <>
      {/* แถบบนมีเฉพาะจอเล็ก (ปุ่มเปิดลิ้นชักเมนู + โลโก้)
          จอคอมไม่มีแถบนี้ — sidebar แสดงตลอดและมีโลโก้กับโปรไฟล์ผู้ใช้อยู่แล้ว
          เดิมมีโปรไฟล์มุมขวาบนซ้ำกับมุมซ้ายล่างของ sidebar เลยเอาออก */}
      <header className="lg:hidden fixed top-0 right-0 left-0 z-30 h-[var(--topbar-h)] bg-[var(--tb-surface)] border-b border-[var(--tb-border)]">
        <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="เปิดเมนู"
              aria-expanded={isSidebarOpen}
              aria-controls="app-sidebar"
              className="inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-[var(--tb-radius)] text-[var(--tb-text)] transition-colors duration-150 hover:bg-[var(--tb-surface-2)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
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

            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 min-w-0 rounded-[var(--tb-radius)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
            >
              <BrandMark />
              <BrandName />
            </Link>
          </div>

        </div>
      </header>

      <Sidebar
        open={isSidebarOpen}
        onClose={closeSidebar}
        user={user}
        onLogout={handleLogout}
      />
    </>
  );
}
