"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useState, useRef } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImg } from "../../untils/cropUtils";
import { getAuthToken } from "@/lib/auth";

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
        const token = getAuthToken();
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

        const url = `${BASE_URL}/api/user/profile?email=${encodeURIComponent(email)}`;
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

  // ฟังก์ชันยืนยันการตัดรูป
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
      const token = getAuthToken();
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
      const token = getAuthToken();
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



  // คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า patients
  const card =
    "rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]";
  const btnSecondary =
    "inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const btnPrimary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const labelClass = "block text-sm font-semibold text-[var(--tb-text)] mb-1.5";
  const inputClass =
    "w-full h-10 px-3 rounded-[var(--tb-radius)] border border-[var(--tb-border-strong)] bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] outline-none transition placeholder:text-[var(--tb-placeholder)] focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)] disabled:bg-[var(--tb-surface-2)] disabled:text-[var(--tb-muted)] disabled:shadow-none disabled:cursor-not-allowed";

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
        <p className="text-sm text-[var(--tb-muted)]">
          กำลังโหลดข้อมูลผู้ดูแล...
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-20">
        <div
          role="alert"
          className="mx-auto max-w-md flex flex-col items-center text-center px-6 py-10 rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]"
        >
          <span className="inline-flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          </span>
          <p className="text-base font-semibold text-[var(--tb-danger-text)]">
            ไม่พบข้อมูลผู้ใช้งาน กรุณาล็อกอินใหม่อีกครั้ง
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* หัวหน้า */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-[var(--tb-muted)]">บัญชี</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">
          ข้อมูลส่วนตัว
        </h1>
        <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
          จัดการข้อมูลบัญชีผู้ดูแลระบบและการแจ้งเตือนเหตุฉุกเฉิน
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-1 space-y-6">
          {/* ========================================== */}
          {/* ส่วนโปรไฟล์รูปภาพ (คอลัมน์ซ้าย) */}
          {/* ========================================== */}
          <div className={`${card} p-6 flex flex-col items-center text-center`}>
            <div className="relative select-none">
              {/* กดที่รูปก็เปิดเลือกไฟล์ได้ (เมาส์) — ผู้ใช้คีย์บอร์ดใช้ปุ่มดินสอด้านล่าง */}
              <div
                onClick={() => fileInputRef.current?.click()}
                aria-hidden="true"
                className={`w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold overflow-hidden cursor-pointer transition hover:brightness-95 bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)] border-4 border-[var(--tb-surface)] ring-1 ring-[var(--tb-border)] ${
                  isUploading ? "animate-pulse" : ""
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
                className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full flex items-center justify-center bg-[var(--tb-primary)] text-[var(--tb-primary-contrast)] border-4 border-[var(--tb-surface)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
                title="เปลี่ยนรูปโปรไฟล์"
                aria-label="เปลี่ยนรูปโปรไฟล์"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
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

            <h2 className="mt-4 text-lg font-bold text-[var(--tb-text)] break-words max-w-full">
              {profile?.name}
            </h2>
            <p className="text-sm text-[var(--tb-muted)] break-all max-w-full">
              {profile?.email}
            </p>

            <span className="mt-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]">
              {profile?.role}
            </span>
          </div>

        </div>

        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <section className={card}>
            <div className="flex flex-wrap justify-between items-center gap-3 px-5 py-4 border-b border-[var(--tb-border)]">
              <h3 className="text-base font-semibold text-[var(--tb-text)]">
                รายละเอียดผู้ดูแล
              </h3>
              <button
                type="button"
                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                className={isEditing ? btnPrimary : btnSecondary}
              >
                {isEditing ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                )}
                {isEditing ? "บันทึกข้อมูล" : "แก้ไขข้อมูล"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
              <div className="sm:col-span-1">
                <label htmlFor="profile-name" className={labelClass}>
                  ชื่อผู้ใช้งาน
                </label>
                <div className="relative">
                  <input
                    id="profile-name"
                    type="text"
                    disabled={!isEditing}
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="sm:col-span-1">
                <label htmlFor="profile-phone" className={labelClass}>
                  เบอร์โทรศัพท์รับเหตุฉุกเฉิน
                </label>
                <input
                  id="profile-phone"
                  type="text"
                  disabled={!isEditing}
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile({ ...profile, phone: e.target.value })
                  }
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>
          </section>

          {/* การตั้งค่าแจ้งเตือนย้ายไปหน้าของตัวเองที่ /settings/notifications
              เก็บไว้ที่เดียวจะได้ไม่ต้องแก้สองที่ทุกครั้งที่เพิ่มช่องทางใหม่ */}
          <a
            href="/settings/notifications"
            className={`${card} p-5 flex items-center justify-between gap-4 transition-colors hover:bg-[var(--tb-surface-2)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--tb-radius)] bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[var(--tb-text)]">
                  ช่องทางการรับสัญญาณเตือนภัย
                </h3>
                <p className="text-sm text-[var(--tb-muted)] mt-0.5">
                  เชื่อมต่อ LINE / Telegram และเปิด-ปิดการแจ้งเตือนแต่ละช่องทาง
                </p>
              </div>
            </div>
            <svg className="w-5 h-5 shrink-0 text-[var(--tb-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>

          {/* ไม่มี API ให้ผู้ใช้ลบบัญชีตัวเอง (ลบได้เฉพาะผู้ดูแลระบบ ที่ /admin/users) จึงบอกช่องทางแทนปุ่มที่กดไม่ได้ */}
          <p className="flex items-center justify-end gap-1.5 text-sm text-[var(--tb-muted)]">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            หากต้องการลบบัญชี กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </div>
      </div>

      {/* ========================================== */}
      {/* ส่วนของ Modal สำหรับ Cropper วางไว้ตรงนี้ก่อนปิด Component */}
      {/* ========================================== */}
      {showCropper && tempImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-title"
            className="w-full max-w-md rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)]"
          >
            <h3
              id="crop-title"
              className="px-5 py-4 border-b border-[var(--tb-border)] text-lg font-bold text-[var(--tb-text)]"
            >
              ปรับตำแหน่งรูปโปรไฟล์
            </h3>

            <div className="p-5">
              {/* พื้นที่แสดงรูปสำหรับ Crop */}
              <div className="relative w-full h-64 bg-[var(--tb-surface-3)] rounded-[var(--tb-radius)] overflow-hidden mb-5">
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
              <div>
                <label htmlFor="crop-zoom" className={labelClass}>
                  ซูมรูปภาพ
                </label>
                <input
                  id="crop-zoom"
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-11 accent-[var(--tb-primary)] cursor-pointer"
                />
              </div>
            </div>

            {/* ปุ่มยืนยัน / ยกเลิก */}
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-[var(--tb-border)]">
              <button
                type="button"
                onClick={() => {
                  setShowCropper(false);
                  setTempImage(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className={`${btnSecondary} flex-1 sm:flex-none`}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmCrop}
                className={`${btnPrimary} flex-1 sm:flex-none`}
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
