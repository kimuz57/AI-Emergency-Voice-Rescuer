"use client";
import React, { useEffect, useState, useRef } from "react";

// กำหนด Interface สำหรับข้อมูลผู้ใช้ (TypeScript)
interface UserProfile {
  name: string;
  email: string;
  role: "caregiver" | "admin" | "user";
  phone: string;
  profileImage?: string; // 🟢 เพิ่มฟิลด์นี้เพื่อให้รองรับรูปภาพ
  isLineConnected: boolean;
  notifyWeb: boolean;
  notifyLine: boolean;
}

export default function ProfilePage() {
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081"; // 🟢 ปรับพอร์ตสำรองให้ตรงกับ Go
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // 🟢 เพิ่ม State และ Ref สำหรับจัดการรูปภาพ
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem("token");
        const email = localStorage.getItem("userEmail");

        if (!email) {
          console.log("ไม่มีอีเมลในระบบ ไม่สามารถดึงโปรไฟล์ได้");
          setIsLoading(false);
          return;
        }

        const url = `${BASE_URL}/api/user/profile?email=${email}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
        });

        if (!response.ok) {
          throw new Error("ดึงข้อมูลโปรไฟล์ไม่สำเร็จ (Backend แจ้ง Error)");
        }

        const data = await response.json();
        setProfile(data);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [BASE_URL]);

  // 🟢 ฟังก์ชันเมื่อผู้ใช้กดเลือกรูปเสร็จ
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("ไฟล์รูปใหญ่เกินไป (จำกัดสูงสุด 5MB)");
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    setPreviewImage(imageUrl);
    await uploadProfileImage(file);
  };

  // 🟢 ฟังก์ชันยิง API อัปโหลดรูปไปหา Go
  const uploadProfileImage = async (file: File) => {
    setIsUploading(true);
    try {
      const token = localStorage.getItem("token");
      const email = localStorage.getItem("userEmail");

      const formData = new FormData();
      formData.append("profile_image", file);
      formData.append("email", email || "");

      const response = await fetch(`${BASE_URL}/api/user/upload-profile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token || ""}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setProfile((prev) =>
          prev ? { ...prev, profileImage: data.imageUrl } : null,
        );
        alert("อัปเดตรูปโปรไฟล์สำเร็จ!");
      } else {
        const err = await response.json();
        alert(`อัปโหลดล้มเหลว: ${err.error}`);
        setPreviewImage(null);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
      setPreviewImage(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleConnectLINE = () => {
    const clientId = process.env.NEXT_PUBLIC_LINE_CLIENT_ID;
    const redirectUri = encodeURIComponent(
      process.env.NEXT_PUBLIC_LINE_CALLBACK_URL || "",
    );
    const state = "random_string_12345";

    const lineLoginUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=profile%20openid`;

    window.location.href = lineLoginUrl;
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("token");
      const email = localStorage.getItem("userEmail");
      const response = await fetch(`${BASE_URL}/api/user/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          email: email,
          name: profile?.name,
          phone: profile?.phone,
        }),
      });

      if (response.ok) {
        alert("บันทึกข้อมูลสำเร็จเรียบร้อย!");
        setIsEditing(false);
      } else {
        const errData = await response.json();
        alert(`เกิดข้อผิดพลาด: ${errData.error || "ไม่สามารถอัปเดตข้อมูลได้"}`);
      }
    } catch (error) {
      console.error("Update error:", error);
      alert("ไม่สามารถติดต่อเซิร์ฟเวอร์ Backend ได้");
    }
  };

  const handleDisconnectLINE = async () => {
    if (
      !confirm("คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการเชื่อมต่อกับ LINE Notify?")
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const email = localStorage.getItem("userEmail");

      const response = await fetch(`${BASE_URL}/api/user/unlink-line`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({ email: email }),
      });

      if (response.ok) {
        alert("ยกเลิกการเชื่อมต่อ LINE สำเร็จแล้ว");
        setProfile((prev) =>
          prev ? { ...prev, isLineConnected: false, notifyLine: false } : null,
        );
      } else {
        const errData = await response.json();
        alert(`เกิดข้อผิดพลาด: ${errData.error || "ไม่สามารถทำรายการได้"}`);
      }
    } catch (error) {
      console.error("Error unlinking LINE:", error);
      alert("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen w-full">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-blue-400 rounded-full mb-4"></div>
          <p className="text-slate-500 font-medium">
            กำลังโหลดข้อมูลผู้ดูแล...
          </p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex justify-center items-center h-screen w-full text-rose-500 font-medium">
        ไม่พบข้อมูลผู้ใช้งาน กรุณาล็อกอินใหม่อีกครั้ง
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6 text-slate-800">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">ข้อมูลส่วนตัว</h1>
        <p className="text-sm text-slate-500">
          จัดการข้อมูลบัญชีผู้ดูแลระบบและการแจ้งเตือนเหตุฉุกเฉิน
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center text-center">
            <div className="relative group select-none">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-md overflow-hidden cursor-pointer transition-all hover:brightness-95 ${
                  isUploading
                    ? "animate-pulse bg-slate-300"
                    : "bg-gradient-to-tr from-sky-400 to-blue-600"
                }`}
              >
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : profile?.profileImage ? (
                  <img
                    src={profile.profileImage}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  profile?.name?.substring(0, 2).toUpperCase() || "??"
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full shadow-lg hover:bg-blue-700 transition-all border-2 border-white flex items-center justify-center transform group-hover:scale-110"
                title="เปลี่ยนรูปโปรไฟล์"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageChange}
              accept="image/png, image/jpeg, image/jpg"
              className="hidden"
            />

            <h2 className="mt-4 text-xl font-bold text-slate-900">
              {profile?.name}
            </h2>
            <p className="text-sm text-slate-400">{profile?.email}</p>

            <span className="mt-3 px-3 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full border border-blue-100 tracking-wide uppercase">
              {profile?.role}
            </span>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">
                รายละเอียดผู้ดูแล
              </h3>
              <button
                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  isEditing
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {isEditing ? "บันทึกข้อมูล" : "แก้ไขข้อมูล"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  ชื่อผู้ใช้งาน
                </label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  เบอร์โทรศัพท์รับเหตุฉุกเฉิน
                </label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile({ ...profile, phone: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500 transition-all text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                ช่องทางการรับสัญญาณเตือนภัย
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                เปิด-ปิดช่องทางรับสัญญาณเมื่อ AI ตรวจพบเสียงร้องขอความช่วยเหลือ
              </p>
            </div>

            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-emerald-500 text-white rounded-xl mt-0.5">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738s-12 4.369-12 9.738c0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.058.592.121.303.079.778.039 1.084l-.171 1.027c-.052.303-.25 1.187 1.081.647 1.332-.54 7.186-4.231 9.805-7.242 2.152-2.31 3.152-4.59 3.152-6.516z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    LINE Notify Integration
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ส่งข้อความเตือนภัยและตำแหน่งห้องเข้า LINE ทันทีเมื่อเกิดเหตุ
                  </p>
                </div>
              </div>
              <button
                onClick={
                  profile.isLineConnected
                    ? handleDisconnectLINE
                    : handleConnectLINE
                }
                className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all whitespace-nowrap ${
                  profile.isLineConnected
                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {profile.isLineConnected
                  ? "🚫 ยกเลิกการเชื่อมต่อ"
                  : "🟢 เชื่อมต่อ LINE Notify"}
              </button>
            </div>

            <div className="divide-y divide-slate-100 pt-1">
              <div className="flex items-center justify-between py-3.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">
                    เปิดระบบเสียงเตือนภัยบนเว็บไซต์
                  </h4>
                  <p className="text-xs text-slate-400">
                    ส่งเสียงไซเรนและหน้าต่าง Pop-up บนเบราว์เซอร์นี้แบบทันท่วงที
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.notifyWeb}
                    onChange={(e) =>
                      setProfile({ ...profile, notifyWeb: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-3.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">
                    ส่งการแจ้งเตือนไปยังแอปพลิเคชัน LINE
                  </h4>
                  <p className="text-xs text-slate-400">
                    อนุญาตให้บอร์ด IoT ส่งสัญญาณพุชข้อความเข้าไลน์กลุ่ม/ส่วนตัว
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!profile.isLineConnected}
                    checked={profile.notifyLine}
                    onChange={(e) =>
                      setProfile({ ...profile, notifyLine: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button className="text-xs font-medium text-rose-500 hover:text-rose-700 hover:underline transition-all">
              ⚠️ ต้องการลบบัญชีผู้ดูแลและล้างข้อมูลโครงข่าย IoT?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
