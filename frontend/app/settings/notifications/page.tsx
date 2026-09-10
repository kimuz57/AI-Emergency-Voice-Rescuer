"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type NotificationProfile = {
  email: string;
  isLineConnected: boolean;
  isTelegramConnected: boolean;
  notifyWeb: boolean;
  notifyLine: boolean;
  notifyTelegram: boolean;
};

const EMPTY: NotificationProfile = {
  email: "",
  isLineConnected: false,
  isTelegramConnected: false,
  notifyWeb: false,
  notifyLine: false,
  notifyTelegram: false,
};

export default function NotificationSettingsPage() {
  const [profile, setProfile] = useState<NotificationProfile>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const token = localStorage.getItem("token");
        const email = localStorage.getItem("userEmail");
        if (!email) throw new Error("no-email");

        const res = await fetch(
          `${BASE_URL}/api/user/profile?email=${encodeURIComponent(email)}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token || ""}`,
            },
            credentials: "include",
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!cancelled) setProfile({ ...EMPTY, ...data });
      } catch {
        if (!cancelled) {
          setStatus({
            kind: "error",
            text: "โหลดการตั้งค่าไม่สำเร็จ ค่าที่เห็นอาจไม่ตรงกับที่บันทึกไว้",
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // บันทึกทันทีที่สลับสวิตช์ ผู้ใช้จะได้ไม่ต้องหาปุ่มบันทึก
  const toggle = async (key: keyof NotificationProfile) => {
    const next = { ...profile, [key]: !profile[key] };
    setProfile(next);
    setStatus(null);

    try {
      const token = localStorage.getItem("token");
      const email = localStorage.getItem("userEmail");
      const res = await fetch(`${BASE_URL}/api/user/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          notifyWeb: next.notifyWeb,
          notifyLine: next.notifyLine,
          notifyTelegram: next.notifyTelegram,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus({ kind: "ok", text: "บันทึกแล้ว" });
    } catch {
      // ย้อนสวิตช์กลับ ไม่งั้นหน้าเว็บจะโกหกว่าบันทึกสำเร็จ
      setProfile(profile);
      setStatus({ kind: "error", text: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
    }
  };

  const connectLine = () => {
    const clientId = process.env.NEXT_PUBLIC_LINE_CLIENT_ID;
    const redirectUri = encodeURIComponent(`${window.location.origin}/line-callback`);
    window.location.href =
      `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}` +
      `&redirect_uri=${redirectUri}&state=random_string_12345&scope=profile%20openid`;
  };

  const rows: {
    key: keyof NotificationProfile;
    title: string;
    detail: string;
    disabled?: boolean;
  }[] = [
    {
      key: "notifyWeb",
      title: "เปิดระบบเสียงเตือนภัยบนเว็บไซต์",
      detail: "ส่งเสียงไซเรนและหน้าต่าง Pop-up บนเบราว์เซอร์นี้แบบทันทีทันใด",
    },
    {
      key: "notifyLine",
      title: "ส่งการแจ้งเตือนไปยังแอปพลิเคชัน LINE",
      detail: "อนุญาตให้บอร์ด IoT ส่งสัญญาณพุชข้อความเข้าไลน์กลุ่ม/ส่วนตัว",
      disabled: !profile.isLineConnected,
    },
    {
      key: "notifyTelegram",
      title: "ส่งการแจ้งเตือนไปยังแอปพลิเคชัน Telegram",
      detail: "อนุญาตให้ระบบส่งข้อความแจ้งเหตุร้ายเข้าแชท Telegram ของเจ้าหน้าที่",
      disabled: !profile.isTelegramConnected,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold neu-text">ตั้งค่าการแจ้งเตือน</h1>
          <p className="text-sm neu-text-muted mt-1">
            เลือกช่องทางที่จะรับสัญญาณเมื่อ AI ตรวจพบเสียงร้องขอความช่วยเหลือ
          </p>
        </div>
        <Link href="/profile" className="neu-btn px-4 py-2.5 text-sm font-medium">
          กลับหน้าข้อมูลส่วนตัว
        </Link>
      </div>

      {status && (
        <div className="neu-inset p-4">
          <p
            className={`text-xs font-medium ${
              status.kind === "ok"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {status.text}
          </p>
        </div>
      )}

      {/* ---------- เชื่อมบัญชี ---------- */}
      <div className="neu-card p-6 space-y-4">
        <h2 className="text-base font-bold neu-text">การเชื่อมต่อบัญชี</h2>

        <div className="neu-inset p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold neu-text">LINE Notify</p>
            <p className="text-xs neu-text-muted mt-0.5">
              ส่งข้อความเตือนภัยและตำแหน่งห้องเข้า LINE ทันทีเมื่อเกิดเหตุ
            </p>
          </div>
          {profile.isLineConnected ? (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 px-3 py-2">
              เชื่อมต่อแล้ว
            </span>
          ) : (
            <button
              type="button"
              onClick={connectLine}
              className="neu-btn px-4 py-2.5 text-xs font-semibold shrink-0"
            >
              เชื่อมต่อ LINE Notify
            </button>
          )}
        </div>

        <div className="neu-inset p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold neu-text">Telegram</p>
            <p className="text-xs neu-text-muted mt-0.5">
              ส่งข้อความเตือนภัยและไฟล์เสียงเข้า Telegram ทันทีเมื่อเกิดเหตุ
            </p>
          </div>
          {profile.isTelegramConnected ? (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 px-3 py-2">
              เชื่อมต่อแล้ว
            </span>
          ) : (
            <Link
              href="/profile"
              className="neu-btn px-4 py-2.5 text-xs font-semibold shrink-0"
            >
              เชื่อมต่อ Telegram
            </Link>
          )}
        </div>
      </div>

      {/* ---------- สวิตช์ ---------- */}
      <div className="neu-card p-6 space-y-2">
        <h2 className="text-base font-bold neu-text mb-2">ช่องทางรับสัญญาณ</h2>

        {isLoading ? (
          <p className="text-sm neu-text-muted py-4">กำลังโหลดการตั้งค่า...</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-4 py-4 border-b border-[var(--neu-shadow-dark)]/20 last:border-0"
            >
              <div className={row.disabled ? "opacity-50" : ""}>
                <p className="text-sm font-semibold neu-text">{row.title}</p>
                <p className="text-xs neu-text-muted mt-0.5">{row.detail}</p>
                {row.disabled && (
                  <p className="text-[11px] neu-text-accent mt-1">
                    ต้องเชื่อมบัญชีก่อนถึงจะเปิดได้
                  </p>
                )}
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(profile[row.key])}
                  disabled={row.disabled}
                  onChange={() => toggle(row.key)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 neu-switch peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:rounded-full after:h-5 after:w-5 after:transition-all peer-disabled:opacity-40 peer-disabled:cursor-not-allowed"></div>
              </label>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
