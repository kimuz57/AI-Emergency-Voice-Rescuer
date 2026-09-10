"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useState, useRef } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
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
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem("token");
        let email = localStorage.getItem("userEmail");

        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();

        if (!email && session?.user?.email) {
          email = session.user.email;
          localStorage.setItem("userEmail", email!);
        }

        if (!email) {
          throw new Error("ไม่มีอีเมลในระบบ ไม่สามารถดึงโปรไฟล์ได้");
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
        const sessionEmail = session?.user?.email?.toLowerCase();
        const isSameSessionUser =
          sessionEmail && sessionEmail === email.toLowerCase();

        if (
          isSameSessionUser &&
          (!data.profileImage ||
            data.profileImage === "" ||
            data.profileImage.includes("picture/0"))
        ) {
          data.profileImage = session.user.image;
        }

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



  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen w-full">
        <div className="animate-pulse flex flex-col items-center">
          <div className="neu-inset h-12 w-12 !rounded-full mb-4"></div>
          <p className="neu-text-muted font-medium">
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
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6 neu-text">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold neu-text">
          ข้อมูลส่วนตัว
        </h1>
        <p className="text-sm neu-text-muted">
          จัดการข้อมูลบัญชีผู้ดูแลระบบและการแจ้งเตือนเหตุฉุกเฉิน
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          {/* ========================================== */}
          {/* 👤 ส่วนโปรไฟล์รูปภาพ (คอลัมน์ซ้าย) */}
          {/* ========================================== */}
          <div className="neu-card p-6 flex flex-col items-center text-center">
            <div className="relative group select-none">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`neu-card w-28 h-28 !rounded-full flex items-center justify-center neu-text text-4xl font-bold overflow-hidden cursor-pointer transition-all hover:brightness-95 border-4 border-slate-100 dark:border-slate-700 ${
                  isUploading ? "animate-pulse bg-slate-200" : "bg-white"
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
                className="neu-btn-accent absolute bottom-0 right-0 p-2.5 !rounded-full transition-all border-0 dark:border-slate-800 flex items-center justify-center transform group-hover:scale-110"
                title="เปลี่ยนรูปโปรไฟล์"
              >
                <svg
                  className="w-4 h-4"
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

            <h2 className="mt-4 text-xl font-bold neu-text">
              {profile?.name}
            </h2>
            <p className="text-sm neu-text-muted">
              {profile?.email}
            </p>

            <span className="neu-inset-sm mt-3 px-3 py-1.5 neu-text-accent text-xs font-bold !rounded-full tracking-wide uppercase">
              {profile?.role}
            </span>
          </div>

        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="neu-card p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold neu-text">
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
                <label className="block text-xs font-semibold neu-text-muted uppercase mb-1">
                  ชื่อผู้ใช้งาน
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                    className="neu-input w-full px-4 py-2.5 transition-all text-sm neu-text disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-900/50 dark:disabled:text-slate-400"
                  />
                </div>
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold neu-text-muted uppercase mb-1">
                  เบอร์โทรศัพท์รับเหตุฉุกเฉิน
                </label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile({ ...profile, phone: e.target.value })
                  }
                  className="neu-input w-full px-4 py-2.5 transition-all text-sm font-mono neu-text disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-900/50 dark:disabled:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* การตั้งค่าแจ้งเตือนย้ายไปหน้าของตัวเองที่ /settings/notifications
              เก็บไว้ที่เดียวจะได้ไม่ต้องแก้สองที่ทุกครั้งที่เพิ่มช่องทางใหม่ */}
          <a
            href="/settings/notifications"
            className="neu-card p-6 flex items-center justify-between gap-4 transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-3">
              <span className="neu-inset p-3 rounded-2xl neu-text-accent shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </span>
              <div>
                <h3 className="text-lg font-bold neu-text">
                  ช่องทางการรับสัญญาณเตือนภัย
                </h3>
                <p className="text-xs neu-text-muted mt-0.5">
                  เชื่อมต่อ LINE / Telegram และเปิด-ปิดการแจ้งเตือนแต่ละช่องทาง
                </p>
              </div>
            </div>
            <svg className="w-5 h-5 shrink-0 neu-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>

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
          <div className="neu-card p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-bold mb-4 neu-text">
              ปรับตำแหน่งรูปโปรไฟล์
            </h3>

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
              <label className="text-sm neu-text-muted mb-2 block">
                ซูมรูปภาพ
              </label>
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
                className="px-4 py-2 rounded-lg neu-text bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
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
