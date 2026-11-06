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

  // คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า /patients
  const card =
    "rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]";
  const btnSecondary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const connectedBadge =
    "inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]";
  const channelIcon =
    "inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--tb-radius)] bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]";

  const checkIcon = (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      {/* ---------- หัวหน้า ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">ตั้งค่า</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">ตั้งค่าการแจ้งเตือน</h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            เลือกช่องทางที่จะรับสัญญาณเมื่อ AI ตรวจพบเสียงร้องขอความช่วยเหลือ
          </p>
        </div>
        <Link href="/profile" className={`${btnSecondary} self-start sm:self-auto`}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          กลับหน้าข้อมูลส่วนตัว
        </Link>
      </div>

      {status && (
        <div
          role={status.kind === "error" ? "alert" : "status"}
          className={`flex items-start gap-3 rounded-[var(--tb-radius-lg)] border p-4 text-sm font-medium ${
            status.kind === "ok"
              ? "border-[var(--tb-success)]/25 bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]"
              : "border-[var(--tb-danger)]/25 bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]"
          }`}
        >
          {status.kind === "ok" ? (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="16 9 10.5 15 8 12.5" />
            </svg>
          ) : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          <p>{status.text}</p>
        </div>
      )}

      {/* ---------- เชื่อมบัญชี ---------- */}
      <section className={card} aria-labelledby="notif-accounts-title">
        <div className="px-5 py-4 border-b border-[var(--tb-border)]">
          <h2 id="notif-accounts-title" className="text-base font-semibold text-[var(--tb-text)]">
            การเชื่อมต่อบัญชี
          </h2>
        </div>

        <div className="divide-y divide-[var(--tb-border)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className={channelIcon} aria-hidden="true">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--tb-text)]">LINE</p>
                <p className="mt-0.5 text-sm text-[var(--tb-muted)]">
                  ส่งข้อความเตือนภัยและตำแหน่งห้องเข้า LINE ทันทีเมื่อเกิดเหตุ
                </p>
              </div>
            </div>
            {profile.isLineConnected ? (
              <span className={connectedBadge}>
                {checkIcon}
                เชื่อมต่อแล้ว
              </span>
            ) : (
              <button
                type="button"
                onClick={connectLine}
                className={`${btnSecondary} shrink-0 self-start sm:self-auto`}
              >
                เชื่อมต่อ LINE
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className={channelIcon} aria-hidden="true">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--tb-text)]">Telegram</p>
                <p className="mt-0.5 text-sm text-[var(--tb-muted)]">
                  ส่งข้อความเตือนภัยและไฟล์เสียงเข้า Telegram ทันทีเมื่อเกิดเหตุ
                </p>
              </div>
            </div>
            {profile.isTelegramConnected ? (
              <span className={connectedBadge}>
                {checkIcon}
                เชื่อมต่อแล้ว
              </span>
            ) : (
              <button
                type="button"
                onClick={connectTelegram}
                disabled={isLinkingTelegram}
                className={`${btnSecondary} shrink-0 self-start sm:self-auto`}
              >
                {isLinkingTelegram && (
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin"
                  />
                )}
                {isLinkingTelegram ? "กำลังสร้างลิงก์..." : "เชื่อมต่อ Telegram"}
              </button>
            )}
          </div>

          {telegramLink && !profile.isTelegramConnected && (
            <div className="px-5 py-4">
              <div className="space-y-2 rounded-[var(--tb-radius)] border border-[var(--tb-primary)]/25 bg-[var(--tb-primary-tint)] p-4">
                {telegramLink.deepLink ? (
                  <p className="text-sm text-[var(--tb-text)]">
                    เปิดแท็บ Telegram ให้แล้ว กด <span className="font-semibold">Start</span> ในแชทกับบอทเพื่อผูกบัญชี
                    ถ้าแท็บไม่เปิด{" "}
                    <a
                      href={telegramLink.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline text-[var(--tb-primary-text)] rounded-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
                    >
                      คลิกที่นี่
                    </a>
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-[var(--tb-text)]">ส่งคำสั่งนี้ไปที่บอท Telegram ของระบบ:</p>
                    <code className="block text-xs font-mono text-[var(--tb-text)] break-all select-all p-2.5 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)]">
                      /start {telegramLink.token}
                    </code>
                  </>
                )}
                <p className="text-xs text-[var(--tb-muted)]">
                  ลิงก์/คำสั่งนี้ใช้ได้ครั้งเดียวและหมดอายุใน {Math.round(telegramLink.expiresIn / 60)} นาที
                  เมื่อเชื่อมต่อเสร็จแล้วให้รีโหลดหน้านี้
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------- สวิตช์ ---------- */}
      <section className={card} aria-labelledby="notif-channels-title">
        <div className="px-5 py-4 border-b border-[var(--tb-border)]">
          <h2 id="notif-channels-title" className="text-base font-semibold text-[var(--tb-text)]">
            ช่องทางรับสัญญาณ
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 px-5 py-6">
            <span
              aria-hidden="true"
              className="w-5 h-5 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin"
            />
            <p className="text-sm text-[var(--tb-muted)]">กำลังโหลดการตั้งค่า...</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--tb-border)]">
            {rows.map((row) => {
              const checked = Boolean(profile[row.key]);
              return (
                <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className={`min-w-0 ${row.disabled ? "opacity-60" : ""}`}>
                    <p id={`notif-${row.key}-title`} className="text-sm font-semibold text-[var(--tb-text)]">
                      {row.title}
                    </p>
                    <p id={`notif-${row.key}-detail`} className="mt-0.5 text-sm text-[var(--tb-muted)]">
                      {row.detail}
                    </p>
                    {row.disabled && (
                      <p className="mt-1 text-xs font-medium text-[var(--tb-primary-text)]">
                        ต้องเชื่อมบัญชีก่อนถึงจะเปิดได้
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-labelledby={`notif-${row.key}-title`}
                    aria-describedby={`notif-${row.key}-detail`}
                    disabled={row.disabled}
                    onClick={() => toggle(row.key)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${
                      checked
                        ? "border-transparent bg-[var(--tb-primary)]"
                        : "border-[var(--tb-border-strong)] bg-[var(--tb-surface-3)]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(24,36,51,0.3)] transition-transform ${
                        checked ? "translate-x-[21px]" : "translate-x-px"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
