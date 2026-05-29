"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// กำหนดโครงสร้างข้อมูล User
type UserProfile = {
  name: string;
  email: string;
  role: string;
  profileImage: string;
};

export default function Navbar() {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 🟢 1. เปลี่ยนจากฟิกค่า เป็นการตั้ง State เริ่มต้นเป็นค่าว่าง
  const [user, setUser] = useState<UserProfile | null>(null);

  // 🟢 2. ฟังก์ชันยิงไปดึงโปรไฟล์จริงจาก Go Backend
  const fetchUserProfile = async () => {
    try {
      // 🟢 1. ดึง URL หลังบ้านจากหน้าต่าง .env (หากไม่มีให้เลือกใช้ localhost:8080 เป็นตัวสำรอง)

      let targetEmail = localStorage.getItem("userEmail");
      console.log("👉 [1] ค่าที่อ่านได้จาก localStorage คือ:", targetEmail);

      // 🟢 2. เรียกดึงข้อมูล Session มารอไว้เลย เผื่อต้องใช้ทั้งเรื่องอีเมลและดึงรูปภาพมาสลับสวมรอย
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();

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

      // 🟢 3. ได้อีเมลชัวร์ๆ แล้ว ยิง API ไปถาม Go Backend โดยใช้ค่า apiUrl จาก env
      console.log(
        "✅ [6] ได้อีเมลแล้ว กำลังยิงไปถาม Go Backend ด้วยอีเมล:",
        targetEmail,
      );
      const res = await fetch(
        `${API_BASE_URL}/api/user/profile?email=${targetEmail}`,
      );

      if (res.ok) {
        const data = await res.json();
        console.log("✅ [7] ข้อมูลที่ Go Backend ตอบกลับมาคือ:", data);

        // 🟢 4. ทริคเด็ดเรื่องรูปภาพ: ถ้า Go หลังบ้านไม่มีรูป หรือส่งมาเป็นค่าว่าง/รูปแตก
        // แต่ใน Google Session มีรูปหล่อๆ อยู่ ให้เอารูป Google มาเสียบแทนทันที
        if (
          !data.profileImage ||
          data.profileImage === "" ||
          data.profileImage.includes("picture/0")
        ) {
          if (session?.user?.image) {
            data.profileImage = session.user.image;
          }
        }

        setUser(data); // อัปเดต State ขึ้นหน้าเว็บ
      } else {
        console.log("❌ [8] Go Backend บอกว่าหาอีเมลนี้ไม่เจอใน Database!");
      }
    } catch (error) {
      console.error("💥 ล้มเหลวในการดึงข้อมูลโปรไฟล์:", error);
    }
  };

  // 🟢 ฟังก์ชันสำหรับ ส่งคำสั่ง Logout ไปหลังบ้าน และล้างข้อมูลหน้าบ้าน
  // 🟢 ฟังก์ชันสำหรับ ส่งคำสั่ง Logout ไปหลังบ้าน และล้างข้อมูลหน้าบ้าน
  const handleLogout = async () => {
    try {
      // 1. สั่งลบคุกกี้ฝั่ง Go (ใช้ POST และ Path ตามที่อยู่ใน routes.go เป๊ะๆ)
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      // 2. ล้างข้อมูลหน้าบ้าน
      localStorage.removeItem("token");
      localStorage.removeItem("userEmail");

      // 3. ใช้ signOut ของ next-auth โดยตรงให้มันจัดการเด้งไปหน้า login เองอย่างปลอดภัย
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("ล้มเหลวในการออกจากระบบ:", error);
      // แผนสำรอง เผื่อบราว์เซอร์บล็อก fetch ให้เด้งหลบออกไปก่อน
      signOut({ callbackUrl: "/" });
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

    // สคริปต์ตรวจจับคลิกนอกหน้าต่างเพื่อปิด Dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🟢 3. ลอจิกเช็ครูปโปรไฟล์: ถ้าใน DB คอลัมน์ profile ไม่มีรูป จะสลับไปใช้รูปตัวอักษรย่ออัตโนมัติ
  const avatarUrl =
    user?.profileImage ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "User")}&background=0D8ABC&color=fff&rounded=true`;

  return (
    <nav className="sticky top-0 z-50 w-full bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 px-6 py-4 flex justify-between items-center shadow-sm transition-colors duration-300">
      <div className="flex items-center gap-2">
        <div className="flex items-end gap-1 h-6">
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
          <a href="/dashboard" className="hover:text-blue-600 transition-colors">
            Emergency Voice Rescuer
          </a>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative" ref={dropdownRef}>
          {/* ปุ่มกดรูปโปรไฟล์ */}
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
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
              // 🟢 เพิ่ม onError ตรงนี้! ถ้ารูปพัง ให้เปลี่ยน src เป็นรูปตัวอักษรแทน
              onError={(e) => {
                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  user?.name || "U",
                )}&background=EBF4FF&color=1E3A8A`;
              }}
            />
          </button>

          {/* หน้าต่างเมนูรายละเอียด */}
          {/* 🟢 1. เอาคำว่า && user ออก ให้เหลือแค่นี้ เพื่อให้หน้าต่างกางได้เสมอ */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-50">
              <div className="px-4 py-4 border-b border-gray-50 dark:border-slate-700 bg-blue-50/40 dark:bg-slate-700/40">
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrl}
                    alt="Profile Large"
                    className="w-11 h-11 rounded-full border border-gray-200 dark:border-slate-600 object-cover shadow-sm bg-white dark:bg-slate-700"
                    // 🟢 เพิ่ม onError ตรงนี้เหมือนกัน!
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        user?.name || "U",
                      )}&background=0D8ABC&color=fff&rounded=true`;
                    }}
                  />
                  <div className="overflow-hidden">
                    {/* 🟢 2. เติมเครื่องหมาย ? (Optional Chaining) และค่าสำรอง (||) ป้องกัน Error */}
                    <p className="text-sm font-bold text-gray-800 dark:text-slate-100 truncate">
                      {user?.name || "ผู้ใช้งานระบบ"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 truncate mb-1">
                      {user?.email || "ไม่มีข้อมูลอีเมล"}
                    </p>
                    <span className="dark:bg-slate-800 bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {user?.role || "User"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="py-1">
                <a
                  href="/"
                  className="block px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  🏠 หน้าแรก
                </a>
                <a
                  href="/dashboard"
                  className="block px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  📊 แดชบอร์ด
                </a>
                <a
                  href="/profile"
                  className="block px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  👤 ข้อมูลส่วนตัว
                </a>
                <a
                  href="#"
                  className="block px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  🔔 การแจ้งเตือน
                </a>
                <a
                  href="/devices"
                  className="block px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  📝 ลงทะเบียนเพิ่มผู้ป่วย
                </a>
                <a
                  href="/patients"
                  className="block px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  🩺 ข้อมูลผู้ป่วย
                </a>
              </div>
              <div className="border-t border-gray-100 dark:border-slate-700 py-1 bg-gray-50 dark:bg-slate-700/50">
                <button
                  onClick={handleLogout}
                  className="w-full text-left block px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:font-bold transition-colors"
                >
                  🚪 ออกจากระบบ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
