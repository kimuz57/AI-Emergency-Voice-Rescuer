// frontend/hooks/useAdminGuard.ts
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const getAuthToken = () => {
  if (typeof window === "undefined") return "";
  const fromStorage = localStorage.getItem("token");
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

type AdminGuardState = {
  isAdmin: boolean;
  isChecking: boolean;
};

/**
 * ด่านตรวจสิทธิ์ Admin ฝั่งหน้าเว็บ
 *
 * ถอดมาจากที่ app/admin/patients/page.tsx ทำไว้ถูกแล้ว คือ "ถาม Backend"
 * ไม่ใช่เชื่อ localStorage.userRole (ซึ่งผู้ใช้แก้เองได้ใน devtools)
 *
 * หมายเหตุเรื่องความปลอดภัย: ตัวนี้เป็นแค่ชั้น UX กัน caregiver หลงเข้ามา
 * ด่านจริงอยู่ที่ middleware.RequireAdmin ฝั่ง Go ซึ่ง query role จาก DB
 * ทุกครั้งที่มีการเรียก /api/admin/* — ต่อให้ bypass หน้านี้ได้ก็ยิง API ไม่ผ่าน
 */
export function useAdminGuard(redirectTo = "/dashboard"): AdminGuardState {
  const router = useRouter();
  const [state, setState] = useState<AdminGuardState>({
    isAdmin: false,
    isChecking: true,
  });

  useEffect(() => {
    let cancelled = false;

    const deny = () => {
      if (cancelled) return;
      setState({ isAdmin: false, isChecking: false });
      router.replace(redirectTo);
    };

    const check = async () => {
      try {
        const email = localStorage.getItem("userEmail");
        if (!email) return deny();

        const token = getAuthToken();
        const res = await fetch(
          `${API_URL}/api/user/profile?email=${encodeURIComponent(email)}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: "include",
          },
        );

        if (!res.ok) return deny();

        const data = await res.json();
        if (data.role?.toLowerCase() !== "admin") return deny();

        if (!cancelled) setState({ isAdmin: true, isChecking: false });
      } catch {
        // Backend ล่ม/ต่อไม่ติด = พิสูจน์สิทธิ์ไม่ได้ ให้ถือว่าไม่ผ่าน
        deny();
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [router, redirectTo]);

  return state;
}
