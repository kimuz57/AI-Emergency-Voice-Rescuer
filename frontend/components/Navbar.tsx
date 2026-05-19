"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { getSession } from "next-auth/react";

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
      let targetEmail = localStorage.getItem("userEmail");
      console.log("👉 [1] ค่าที่อ่านได้จาก localStorage คือ:", targetEmail); // 🔴 จุดดักที่ 1

      if (
        !targetEmail ||
        targetEmail === "null" ||
        targetEmail === "undefined"
      ) {
        console.log(
          "👉 [2] ไม่มีใน localStorage! กำลังพยายามดึงจาก Google NextAuth...",
        ); // 🔴 จุดดักที่ 2

        const session = await getSession();
        console.log("👉 [3] ข้อมูล Session จาก Google คือ:", session); // 🔴 จุดดักที่ 3

        if (session?.user?.email) {
          targetEmail = session.user.email;
          localStorage.setItem("userEmail", targetEmail);
          console.log(
            "👉 [4] เจออีเมลจาก Google แล้ว! เซฟลงเครื่องเรียบร้อย:",
            targetEmail,
          );
        }
      }

      if (
        !targetEmail ||
        targetEmail === "null" ||
        targetEmail === "undefined"
      ) {
        console.log(
          "❌ [5] สรุปคือหาอีเมลไม่เจอเลยสักทาง! ระบบหยุดดึงข้อมูลโปรไฟล์",
        ); // 🔴 จุดดักที่ 4
        return;
      }

      console.log(
        "✅ [6] ได้อีเมลแล้ว กำลังยิงไปถาม Go Backend ด้วยอีเมล:",
        targetEmail,
      ); // 🔴 จุดดักที่ 5
      const res = await fetch(
        `http://localhost:8080/api/user/profile?email=${targetEmail}`,
      );

      if (res.ok) {
        const data = await res.json();
        console.log("✅ [7] ข้อมูลที่ Go Backend ตอบกลับมาคือ:", data); // 🔴 จุดดักที่ 6
        setUser(data);
      } else {
        console.log("❌ [8] Go Backend บอกว่าหาอีเมลนี้ไม่เจอใน Database!"); // 🔴 จุดดักที่ 7
      }
    } catch (error) {
      console.error("💥 ล้มเหลว:", error);
    }
    try {
      // 🟢 1. แวะไปถาม NextAuth ก่อนว่ามีข้อมูลเซสชันของ Google ไหม?
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();

      let targetEmail = localStorage.getItem("userEmail");

      // 🟢 2. ถ้าดึงข้อมูลจาก Google สำเร็จ ให้เอาอีเมลมาอัปเดตลง localStorage ทันที!
      // (ทำแบบนี้หน้า Dashboard ที่รอดึงอีเมลอยู่ ก็จะทำงานได้ปกติไปด้วยครับ)
      if (session?.user?.email) {
        targetEmail = session.user.email;
        localStorage.setItem("userEmail", targetEmail);
      }

      // 🟢 3. เช็คด่านสุดท้าย ถ้ายังไงก็ไม่มีอีเมล ให้เบรกไว้แค่นี้
      if (
        !targetEmail ||
        targetEmail === "null" ||
        targetEmail === "undefined"
      ) {
        console.log("❌ ยังไม่มีข้อมูลอีเมลข้ามไปก่อน");
        return;
      }

      // 🟢 4. ยิงไปดึงข้อมูลเต็มๆ (บทบาท/ชื่อ) จาก Go Backend ของเรา
      const res = await fetch(
        `http://localhost:8080/api/user/profile?email=${targetEmail}`,
      );
      if (res.ok) {
        const data = await res.json();

        // 💡 ทริคพิเศษ: ถ้า Go Backend ไม่มีรูปโปรไฟล์เซฟไว้ ให้ดึงรูปจาก Google มาโชว์แทนซะเลย!
        if (!data.profileImage && session?.user?.image) {
          data.profileImage = session.user.image;
        }

        setUser(data); // อัปเดตข้อมูลขึ้นหน้าเว็บ
      }
    } catch (error) {
      console.error("💥 ล้มเหลวในการดึงข้อมูลโปรไฟล์:", error);
    }
  };

  // 🟢 ฟังก์ชันสำหรับ ส่งคำสั่ง Logout ไปหลังบ้าน และล้างข้อมูลหน้าบ้าน
  // 🟢 ฟังก์ชันสำหรับ ส่งคำสั่ง Logout ไปหลังบ้าน และล้างข้อมูลหน้าบ้าน
  const handleLogout = async () => {
    try {
      // สเต็ปที่ 1: ยิง API แบบ GET ไปหา Go Backend (พอร์ต 8080) เพื่อสั่งล้างคุกกี้ "token" ที่เป็น httpOnly
      // 💡 ต้องใส่ credentials: "include" เพื่ออนุญาตให้เบราว์เซอร์ส่งและลบคุกกี้ข้ามพอร์ตได้ครับ
      await fetch("http://localhost:8080/logout", {
        method: "GET",
        credentials: "include",
      });
    } catch (error) {
      console.error("ล้มเหลวในการสั่งลบคุกกี้ฝั่ง Go Backend:", error);
    }

    // สเต็ปที่ 2: ล้างข้อมูลอีเมลขยะใน Local Storage ฝั่งหน้าบ้านออกให้หมด
    localStorage.removeItem("userEmail");
    setIsProfileOpen(false);

    // สเต็ปที่ 3: 🚀 พระเอกของงาน! สั่งให้ NextAuth ลบพวกคุกกี้ next-auth.session-token ทิ้งให้เกลี้ยงระบบ
    // พร้อมกับสั่งเตะผู้ใช้กลับไปที่หน้าแรก (ในที่นี้คือ "/" ตามหน้าโครงสร้าง Login ของผู้กอง)
    await signOut({ callbackUrl: "/" });
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
    <nav className="w-full bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          Guardian AI Dashboard
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative" ref={dropdownRef}>
          {/* ปุ่มกดรูปโปรไฟล์ */}
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-3 focus:outline-none transition-transform hover:scale-103"
          >
            {/* <span className="text-xl text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              ⚙️
            </span> */}
            <img
              src={
                user?.profileImage ||
                "https://ui-avatars.com/api/?name=" +
                  (user?.name || "U") +
                  "&background=EBF4FF&color=1E3A8A"
              }
              // 🟢 2. โค้ดเวทมนตร์! คำสั่งนี้จะบอก Google ว่า "ขออนุญาตดึงรูปมาโชว์หน่อยนะ"
              referrerPolicy="no-referrer"
              alt="Profile"
              className="w-11 h-11 rounded-full border border-gray-200 object-cover shadow-sm"
            />
          </button>

          {/* หน้าต่างเมนูรายละเอียด */}
          {/* 🟢 1. เอาคำว่า && user ออก ให้เหลือแค่นี้ เพื่อให้หน้าต่างกางได้เสมอ */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
              <div className="px-4 py-4 border-b border-gray-50 bg-blue-50/40">
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrl}
                    alt="Profile Large"
                    className="w-11 h-11 rounded-full border border-gray-200 object-cover shadow-sm"
                  />
                  <div className="overflow-hidden">
                    {/* 🟢 2. เติมเครื่องหมาย ? (Optional Chaining) และค่าสำรอง (||) ป้องกัน Error */}
                    <p className="text-sm font-bold text-gray-800 truncate">
                      {user?.name || "ผู้ใช้งานระบบ"}
                    </p>
                    <p className="text-xs text-gray-500 truncate mb-1">
                      {user?.email || "ไม่มีข้อมูลอีเมล"}
                    </p>
                    <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {user?.role || "User"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="py-1">
                <a
                  href="#"
                  className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                >
                  👤 ข้อมูลส่วนตัว
                </a>
                <a
                  href="#"
                  className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                >
                  🔔 การแจ้งเตือน
                </a>
              </div>
              <div className="border-t border-gray-100 py-1 bg-gray-50">
                <button
                  onClick={handleLogout}
                  className="w-full text-left block px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 hover:font-bold transition-colors"
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
