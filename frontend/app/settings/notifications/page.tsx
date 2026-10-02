"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authHeaders, LINE_OAUTH_STATE_KEY } from "@/lib/auth";

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

type TelegramLink = { token: string; deepLink: string; expiresIn: number };

export default function NotificationSettingsPage() {
  const [profile, setProfile] = useState<NotificationProfile>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [telegramLink, setTelegramLink] = useState<TelegramLink | null>(null);
  const [isLinkingTelegram, setIsLinkingTelegram] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const email = localStorage.getItem("userEmail");
        if (!email) throw new Error("no-email");

        const res = await fetch(
          `${BASE_URL}/api/user/profile?email=${encodeURIComponent(email)}`,
          {
            headers: authHeaders({ "Content-Type": "application/json" }),
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
      const email = localStorage.getItem("userEmail");
      const res = await fetch(`${BASE_URL}/api/user/profile`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
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

    // S27: state สุ่มต่อครั้ง เก็บไว้ใน sessionStorage แล้ว /line-callback ต้องตรวจให้ตรง
    // กันคนอื่นส่งลิงก์ callback ที่มี code ของ LINE เขามาผูกเข้าบัญชีเรา (CSRF)
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    try {
      sessionStorage.setItem(LINE_OAUTH_STATE_KEY, state);
    } catch {
      setStatus({ kind: "error", text: "เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูลชั่วคราว จึงเชื่อมต่อ LINE ไม่ได้" });
      return;
    }

    window.location.href =
      `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${encodeURIComponent(clientId || "")}` +
      `&redirect_uri=${redirectUri}&state=${state}&scope=profile%20openid`;
  };

  // ขอ token ผูก Telegram แบบใช้ครั้งเดียว (อายุ 15 นาที) แล้วเปิดลิงก์ไปที่บอท
  // บอทจะรับ "/start <token>" แล้วผูก chat_id เข้ากับบัญชีที่ login อยู่
  const connectTelegram = async () => {
    setStatus(null);
    setIsLinkingTelegram(true);
    // เปิดแท็บไว้ก่อนตั้งแต่ตอนคลิก ไม่งั้น popup blocker จะบล็อกหลัง await
    const popup = window.open("", "_blank");
    try {
      const res = await fetch(`${BASE_URL}/api/user/telegram/link-token`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const link: TelegramLink = {
        token: String(data.token || ""),
        // เปิด/แสดงเฉพาะลิงก์ของ Telegram เท่านั้น — กัน javascript:/โดเมนอื่นถ้า response ถูกแก้
        deepLink: /^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=[A-Za-z0-9_-]+$/.test(String(data.deep_link || ""))
          ? String(data.deep_link)
          : "",
        expiresIn: Number(data.expires_in) || 900,
      };
      if (!link.token) throw new Error("no-token");
      setTelegramLink(link);

      if (link.deepLink && popup) {
        popup.opener = null;
        popup.location.href = link.deepLink;
      } else {
        popup?.close();
      }
    } catch {
      popup?.close();
      setStatus({ kind: "error", text: "สร้างลิงก์เชื่อมต่อ Telegram ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
    } finally {
      setIsLinkingTelegram(false);
    }
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
            <button
              type="button"
              onClick={connectTelegram}
              disabled={isLinkingTelegram}
              className="neu-btn px-4 py-2.5 text-xs font-semibold shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLinkingTelegram ? "กำลังสร้างลิงก์..." : "เชื่อมต่อ Telegram"}
            </button>
          )}
        </div>

        {telegramLink && !profile.isTelegramConnected && (
          <div className="neu-inset p-4 rounded-2xl space-y-2">
            {telegramLink.deepLink ? (
              <p className="text-xs neu-text">
                เปิดแท็บ Telegram ให้แล้ว กด <span className="font-bold">Start</span> ในแชทกับบอทเพื่อผูกบัญชี
                ถ้าแท็บไม่เปิด{" "}
                <a
                  href={telegramLink.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline neu-text-accent"
                >
                  คลิกที่นี่
                </a>
              </p>
            ) : (
              <>
                <p className="text-xs neu-text">ส่งคำสั่งนี้ไปที่บอท Telegram ของระบบ:</p>
                <code className="block text-xs font-mono neu-text break-all select-all p-2 rounded-lg bg-black/5 dark:bg-white/5">
                  /start {telegramLink.token}
                </code>
              </>
            )}
            <p className="text-[11px] neu-text-muted">
              ลิงก์/คำสั่งนี้ใช้ได้ครั้งเดียวและหมดอายุใน {Math.round(telegramLink.expiresIn / 60)} นาที
              เมื่อเชื่อมต่อเสร็จแล้วให้รีโหลดหน้านี้
            </p>
          </div>
        )}
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
