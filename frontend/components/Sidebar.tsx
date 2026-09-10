"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarUser = {
  name: string;
  email: string;
  role: string;
  profileImage: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  user: SidebarUser | null;
  onLogout: () => void;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const icon = (paths: React.ReactNode) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="w-5 h-5 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);

// เมนูที่ทุก role เห็น (ชุดเดียวกับ dropdown เดิมที่อยู่ใต้รูปโปรไฟล์)
const MAIN_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "หน้าแรก",
    icon: icon(
      <>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>,
    ),
  },
  {
    href: "/dashboard",
    label: "แดชบอร์ด",
    icon: icon(
      <>
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </>,
    ),
  },
  {
    href: "/profile",
    label: "ข้อมูลส่วนตัว",
    icon: icon(
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>,
    ),
  },
  {
    href: "/register-patient",
    label: "ลงทะเบียนเพิ่มผู้ป่วย",
    icon: icon(
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" x2="19" y1="8" y2="14" />
        <line x1="22" x2="16" y1="11" y2="11" />
      </>,
    ),
  },
  {
    href: "/patients",
    label: "ข้อมูลผู้ป่วย",
    icon: icon(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  },
  {
    href: "/history",
    label: "ประวัติและสถิติ",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>,
    ),
  },
  {
    href: "/calendar",
    label: "ปฏิทินเหตุการณ์",
    icon: icon(
      <>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
      </>,
    ),
  },
  {
    href: "/settings/notifications",
    label: "ตั้งค่าการแจ้งเตือน",
    icon: icon(
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>,
    ),
  },
  {
    href: "/help",
    label: "ช่วยเหลือ / FAQ",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" x2="12.01" y1="17" y2="17" />
      </>,
    ),
  },
  {
    href: "/device",
    label: "จัดการอุปกรณ์รับเสียง",
    icon: icon(
      <>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </>,
    ),
  },
];

// เมนูเฉพาะ admin — ชุดเดียวกับกล่อง "ส่วนจัดการผู้ดูแลระบบ" ในหน้า /profile
const ADMIN_ITEMS: NavItem[] = [
  {
    href: "/admin/patients",
    label: "จัดการข้อมูลผู้ป่วย",
    icon: icon(
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
    ),
  },
  {
    href: "/admin/users",
    label: "จัดการผู้ใช้งาน",
    icon: icon(
      <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    ),
  },
  {
    href: "/admin/register-device",
    label: "ลงทะเบียนเพิ่มบอร์ด",
    icon: icon(
      <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />,
    ),
  },
  {
    href: "/admin/audio-diagnostics",
    label: "วิเคราะห์สัญญาณเสียง",
    icon: icon(
      <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />,
    ),
  },
];

const fallbackAvatar = (name?: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name || "U",
  )}&background=0D8ABC&color=fff&rounded=true`;

export default function Sidebar({ open, onClose, user, onLogout }: Props) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // ปิดเองเมื่อเปลี่ยนหน้า ไม่งั้นแผงจะค้างทับหน้าใหม่
  useEffect(() => {
    onClose();
    // ตั้งใจ depend เฉพาะ pathname — ไม่ต้องปิดซ้ำตอน onClose เปลี่ยน identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ปิดด้วย Esc + ล็อกการเลื่อนหน้าหลังระหว่างเปิด
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // ย้ายโฟกัสเข้ามาในแผง เพื่อให้กด Tab แล้ววนอยู่ในเมนู ไม่หลุดไปหน้าหลัง
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // เมนู admin โผล่เฉพาะตอน role เป็น admin
  //
  // นี่เป็นแค่การซ่อน/แสดงเมนู ไม่ใช่การกันสิทธิ์ — ถ้าดึงโปรไฟล์ไม่สำเร็จ
  // Navbar จะ fallback เป็น role "User" เมนูก็จะไม่โผล่ (fail closed)
  // ด่านจริงคือ useAdminGuard ในแต่ละหน้า และ RequireAdmin ฝั่ง Go
  const isAdmin = user?.role?.toLowerCase() === "admin";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href) ?? false;

  // หน้าที่กำลังอยู่ = ปุ่มจมลงไป (inset) ตามภาษา neumorphism
  // สถานะทั้งหมดคุมอยู่ใน .neu-nav-item โดยอ่านจาก aria-current

  return (
    <>
      {/* ฉากหลัง — คลิกที่ไหนก็ปิด */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* แผงเมนู — อยู่ใน DOM ตลอดเพื่อให้เลื่อนเข้า-ออกได้ลื่น
          ตอนปิดใช้ inert กันไม่ให้ Tab หลุดเข้าไปโฟกัสลิงก์ที่มองไม่เห็น */}
      <aside
        ref={panelRef}
        id="app-sidebar"
        inert={!open}
        aria-label="เมนูหลัก"
        className={`neu-surface fixed top-0 left-0 z-[70] h-full w-[280px] max-w-[85vw] flex flex-col shadow-[10px_0_24px_-10px_var(--neu-shadow-dark)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* หัวแผง: ข้อมูลผู้ใช้ */}
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={user?.profileImage || fallbackAvatar(user?.name)}
                referrerPolicy="no-referrer"
                alt=""
                className="w-11 h-11 rounded-full object-cover shrink-0 neu-card-sm"
                onError={(e) => {
                  e.currentTarget.src = fallbackAvatar(user?.name);
                }}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold neu-text truncate">
                  {user?.name || "ผู้ใช้งานระบบ"}
                </p>
                <p className="text-xs neu-text-muted truncate mb-1">
                  {user?.email || "ไม่มีข้อมูลอีเมล"}
                </p>
                <span className="neu-inset-sm neu-text-accent inline-block text-[10px] px-2.5 py-1 rounded-full font-bold">
                  {user?.role || "User"}
                </span>
              </div>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="ปิดเมนู"
              className="neu-icon-btn shrink-0 p-2"
            >
              {icon(
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>,
              )}
            </button>
          </div>
        </div>

        {/* รายการเมนู */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {MAIN_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="neu-nav-item"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}

          {isAdmin && (
            <div className="pt-4 mt-3 border-t border-[var(--neu-shadow-dark)]/40 space-y-1">
              <p className="px-2 pt-1 pb-2 text-[11px] font-bold neu-text-muted uppercase tracking-widest flex items-center gap-2">
                <span className="neu-inset-sm p-1.5 neu-text-accent rounded-lg">
                  {icon(
                    <>
                      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </>,
                  )}
                </span>
                ผู้ดูแลระบบ
              </p>
              {ADMIN_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="neu-nav-item"
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        {/* ออกจากระบบ */}
        <div className="p-3">
          <button
            type="button"
            onClick={onLogout}
            className="neu-btn flex items-center gap-3 w-full px-4 py-3 text-sm font-medium !text-red-500 hover:!text-red-600"
          >
            {icon(
              <>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </>,
            )}
            ออกจากระบบ
          </button>
        </div>
      </aside>
    </>
  );
}
