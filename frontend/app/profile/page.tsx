"use client";
import React, { useEffect, useState, useRef } from "react";
import Cropper from "react-easy-crop";
import { getCroppedImg } from "../../untils/cropUtils";

// กำหนด Interface สำหรับข้อมูลผู้ใช้ (TypeScript)
interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: "caregiver" | "admin" | "user";
  phone: string;
  profileImage?: string;
  isLineConnected: boolean;
  notifyWeb: boolean;
  notifyLine: boolean;
  isTelegramConnected: boolean;
  notifyTelegram: boolean;
}

export default function ProfilePage() {
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // State และ Ref สำหรับจัดการรูปภาพ
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // State สำหรับระบบ Crop
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

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

  // ฟังก์ชันเมื่อผู้ใช้กดเลือกรูปเสร็จ
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const imageUrl = URL.createObjectURL(file);
      setTempImage(imageUrl);
      setShowCropper(true); // เปิดหน้าต่าง Modal Crop
    }
  };

  // 🟢 ฟังก์ชันยืนยันการตัดรูป
  const handleConfirmCrop = async () => {
    try {
      if (!tempImage || !croppedAreaPixels) return;
      
      // 1. นำรูปดิบ + พิกัด ไปประมวลผลตัดรูปผ่าน Canvas
      const croppedFile = await getCroppedImg(tempImage, croppedAreaPixels);
      
      // 2. โชว์รูปที่ตัดแล้วบนหน้าเว็บ และปิดหน้าต่าง
      const croppedUrl = URL.createObjectURL(croppedFile as Blob);
      setPreviewImage(croppedUrl);
      setShowCropper(false);
      setTempImage(null);

      // 3. ส่งไฟล์ที่ถูกตัดแล้วไปให้ Go Backend อัปโหลด
      uploadProfileImage(croppedFile as File);
      
    } catch (e) {
      console.error("เกิดข้อผิดพลาดในการตัดรูป", e);
      alert("เกิดข้อผิดพลาดในการประมวลผลรูปภาพ");
    }
  };

  // ฟังก์ชันยิง API อัปโหลดรูปไปหา Go
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
          notifyWeb: profile?.notifyWeb,
          notifyLine: profile?.notifyLine,
          notifyTelegram: profile?.notifyTelegram,
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
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการเชื่อมต่อกับ LINE Notify?")) {
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

  const handleDisconnectTelegram = async () => {
    const confirm = window.confirm("แน่ใจหรือไม่ว่าต้องการยกเลิกการเชื่อมต่อ Telegram?");
    if (!confirm) return;
    try {
      const res = await fetch(`${BASE_URL}/api/user/telegram/disconnect`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile?.id }),
      });

      if (res.ok) {
        setProfile((prev) => 
          prev ? { ...prev, isTelegramConnected: false, notifyTelegram: false } : null
        );
      }
    } catch (error) {
      console.error("Error disconnecting Telegram:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen w-full">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-blue-400 rounded-full mb-4"></div>
          <p className="text-slate-500 font-medium">กำลังโหลดข้อมูลผู้ดูแล...</p>
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ข้อมูลส่วนตัว</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          จัดการข้อมูลบัญชีผู้ดูแลระบบและการแจ้งเตือนเหตุฉุกเฉิน
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 ">
        <div className="md:col-span-1 space-y-6 ">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center text-center dark:bg-slate-800">
            <div className="relative group select-none ">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`w-28 h-28 rounded-full flex items-center justify-center text-slate-900 text-4xl font-bold shadow-md overflow-hidden cursor-pointer transition-all hover:brightness-95 border-4 border-slate-100 dark:border-slate-700 ${
                  isUploading ? "animate-pulse bg-slate-200" : "bg-white"
                }`}
              >
                {previewImage ? (
                  <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                ) : profile?.profileImage ? (
                  <img
                    src={profile.profileImage}
                    alt="Profile"
                    className="w-full h-full object-cover "
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  profile?.name?.substring(0, 2).toUpperCase() || "SU"
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-blue-600 text-white p-2.5 rounded-full shadow-lg hover:bg-blue-700 transition-all border-2 border-white dark:border-slate-800 flex items-center justify-center transform group-hover:scale-110"
                title="เปลี่ยนรูปโปรไฟล์"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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

            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
              {profile?.name}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {profile?.email}
            </p>

            <span className="dark:bg-slate-700 mt-3 px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full border border-blue-100 dark:border-slate-600 tracking-wide uppercase">
              {profile?.role}
            </span>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                รายละเอียดผู้ดูแล
              </h3>
              <button
                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all  ${
                  isEditing
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                }`}
              >
                {isEditing ? "บันทึกข้อมูล" : "แก้ไขข้อมูล"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  ชื่อผู้ใช้งาน
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm
                      text-slate-900 bg-white 
                      dark:text-white dark:bg-slate-700
                      disabled:bg-slate-50 disabled:text-slate-500 
                      dark:disabled:bg-slate-900/50 dark:disabled:text-slate-400"
                  />
                </div>
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  เบอร์โทรศัพท์รับเหตุฉุกเฉิน
                </label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-mono
                    text-slate-900 bg-white 
                    dark:text-white dark:bg-slate-700
                    disabled:bg-slate-50 disabled:text-slate-500 
                    dark:disabled:bg-slate-900/50 dark:disabled:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                ช่องทางการรับสัญญาณเตือนภัย
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                เปิด-ปิดช่องทางรับสัญญาณเมื่อ AI ตรวจพบเสียงร้องขอความช่วยเหลือ
              </p>
            </div>

            <div className="p-4 bg-emerald-50/50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100/60 dark:border-emerald-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-emerald-500 text-white rounded-xl mt-0.5">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738s-12 4.369-12 9.738c0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.058.592.121.303.079.778.039 1.084l-.171 1.027c-.052.303-.25 1.187 1.081.647 1.332-.54 7.186-4.231 9.805-7.242 2.152-2.31 3.152-4.59 3.152-6.516z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                    LINE Notify Integration
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    ส่งข้อความเตือนภัยและตำแหน่งห้องเข้า LINE ทันทีเมื่อเกิดเหตุ
                  </p>
                </div>
              </div>
              <button
                onClick={profile.isLineConnected ? handleDisconnectLINE : handleConnectLINE}
                className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all whitespace-nowrap ${
                  profile.isLineConnected
                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/50 dark:hover:bg-amber-900/50"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {profile.isLineConnected ? "🚫 ยกเลิกการเชื่อมต่อ" : "🔗 เชื่อมต่อ LINE Notify"}
              </button>
            </div>

            <div className="p-4 bg-sky-50/50 dark:bg-sky-900/20 rounded-2xl border border-sky-100/60 dark:border-sky-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-sky-500 text-white rounded-xl mt-0.5">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.08-.19-.09-.05-.21-.02-.3.01-.13.04-2.21 1.42-6.24 4.14-.59.4-1.12.6-1.6.59-.53-.01-1.56-.3-2.32-.55-.94-.3-1.68-.46-1.61-.97.04-.26.39-.53 1.05-.8 4.11-1.79 6.85-2.93 8.22-3.5 3.91-1.64 4.72-1.92 5.25-1.93.12 0 .37.03.5.15.11.1.15.24.16.35-.01.07-.01.16-.02.21z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                    Telegram Integration
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    ส่งข้อความเตือนภัยและไฟล์เสียงเข้า Telegram ทันทีเมื่อเกิดเหตุ
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  if (profile.isTelegramConnected) {
                    handleDisconnectTelegram();
                  } else {
                    window.open(`https://t.me/EVR_Alert_bot?start=${profile.id}`, "_blank");
                    setTimeout(() => {
                      window.location.reload();
                    }, 5000);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all whitespace-nowrap ${
                  profile.isTelegramConnected
                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/50 dark:hover:bg-amber-900/50"
                    : "bg-sky-500 text-white hover:bg-sky-600"
                }`}
              >
                {profile.isTelegramConnected ? "🚫 ยกเลิกการเชื่อมต่อ" : "🔗 เชื่อมต่อ Telegram"}
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700 pt-1">
              <div className="flex items-center justify-between py-3.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    เปิดระบบเสียงเตือนภัยบนเว็บไซต์
                  </h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    ส่งเสียงไซเรนและหน้าต่าง Pop-up บนเบราว์เซอร์นี้แบบทันท่วงที
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.notifyWeb}
                    onChange={(e) => setProfile({ ...profile, notifyWeb: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white dark:after:bg-slate-200 after:border-slate-300 dark:after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-3.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    ส่งการแจ้งเตือนไปยังแอปพลิเคชัน LINE
                  </h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    อนุญาตให้บอร์ด IoT ส่งสัญญาณพุชข้อความเข้าไลน์กลุ่ม/ส่วนตัว
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!profile.isLineConnected}
                    checked={profile.notifyLine}
                    onChange={(e) => setProfile({ ...profile, notifyLine: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white dark:after:bg-slate-200 after:border-slate-300 dark:after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"></div>
                </label>
              </div>
              <div className="flex items-center justify-between py-3.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    ส่งการแจ้งเตือนไปยังแอปพลิเคชัน Telegram
                  </h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    อนุญาตให้ระบบส่งข้อความแจ้งเหตุร้ายเข้าแชท Telegram ของเจ้าหน้าที่
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!profile.isTelegramConnected}
                    checked={profile.notifyTelegram}
                    onChange={(e) => setProfile({ ...profile, notifyTelegram: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white dark:after:bg-slate-200 after:border-slate-300 dark:after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button className="text-xs font-medium text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:underline transition-all">
              ⚠️ ต้องการลบบัญชีผู้ดูแลและล้างข้อมูลโครงข่าย IoT?
            </button>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* 🟢 ส่วนของ Modal สำหรับ Cropper วางไว้ตรงนี้ก่อนปิด Component */}
      {/* ========================================== */}
      {showCropper && tempImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">ปรับตำแหน่งรูปโปรไฟล์</h3>
            
            {/* พื้นที่แสดงรูปสำหรับ Crop */}
            <div className="relative w-full h-64 bg-gray-900 rounded-xl overflow-hidden mb-6">
              <Cropper
                image={tempImage}
                crop={crop}
                zoom={zoom}
                aspect={1} // บังคับสัดส่วนสี่เหลี่ยมจัตุรัส
                cropShape="round" // ทำให้เห็นกรอบเป็นวงกลม
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(croppedArea, croppedAreaPixels) => {
                  setCroppedAreaPixels(croppedAreaPixels);
                }}
              />
            </div>

            {/* แถบเลื่อนปรับระยะซูม */}
            <div className="mb-6">
              <label className="text-sm text-slate-600 dark:text-slate-300 mb-2 block">ซูมรูปภาพ</label>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>

            {/* ปุ่มยืนยัน / ยกเลิก */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCropper(false);
                  setTempImage(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="px-4 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmCrop}
                className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-colors font-medium"
              >
                ยืนยันการตัดรูป
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}