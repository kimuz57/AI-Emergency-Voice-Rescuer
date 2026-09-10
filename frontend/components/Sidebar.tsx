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

// รายการเมนูชุดเดียวกับ dropdown เดิมที่อยู่ใต้รูปโปรไฟล์
const NAV_ITEMS: NavItem[] = [
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

  const linkClass = (href: string) => {
    const active =
      href === "/" ? pathname === "/" : pathname?.startsWith(href) ?? false;
    return [
      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
      active
        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
        : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/60 hover:text-blue-600 dark:hover:text-blue-400",
    ].join(" ");
  };

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
        className={`fixed top-0 left-0 z-[70] h-full w-[280px] max-w-[85vw] flex flex-col bg-white dark:bg-slate-800 border-r border-gray-100 dark:border-slate-700 shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* หัวแผง: ข้อมูลผู้ใช้ */}
        <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-700 bg-blue-50/40 dark:bg-slate-700/40">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={user?.profileImage || fallbackAvatar(user?.name)}
                referrerPolicy="no-referrer"
                alt=""
                className="w-11 h-11 rounded-full border border-gray-200 dark:border-slate-600 object-cover shadow-sm bg-white dark:bg-slate-700 shrink-0"
                onError={(e) => {
                  e.currentTarget.src = fallbackAvatar(user?.name);
                }}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-slate-100 truncate">
                  {user?.name || "ผู้ใช้งานระบบ"}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate mb-1">
                  {user?.email || "ไม่มีข้อมูลอีเมล"}
                </p>
                <span className="dark:bg-slate-800 bg-blue-100 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {user?.role || "User"}
                </span>
              </div>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="ปิดเมนู"
              className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700 transition-colors"
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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={linkClass(item.href)}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        {/* ออกจากระบบ */}
        <div className="border-t border-gray-100 dark:border-slate-700 p-3 bg-gray-50 dark:bg-slate-700/50">
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
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
