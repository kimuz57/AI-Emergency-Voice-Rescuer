"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

// กลุ่มเมนูที่พับ/กางได้ (ลูกไม่มีไอคอน ตามแบบ Tabler)
type NavGroup = {
  id: string;
  label: string;
  icon: React.ReactNode;
  children: { href: string; label: string }[];
};

const isGroup = (entry: NavItem | NavGroup): entry is NavGroup =>
  "children" in entry;

const icon = (paths: React.ReactNode) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="w-5 h-5 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);

// เมนูที่ทุก role เห็น — จัดกลุ่มใหม่แบบ Tabler แต่ href / label ชุดเดิมทั้งหมด
const MAIN_ITEMS: (NavItem | NavGroup)[] = [
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
    id: "patients",
    label: "ผู้ป่วย",
    icon: icon(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
    children: [
      { href: "/patients", label: "ข้อมูลผู้ป่วย" },
      { href: "/register-patient", label: "ลงทะเบียนเพิ่มผู้ป่วย" },
    ],
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
    id: "settings",
    label: "ตั้งค่า",
    icon: icon(
      <>
        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </>,
    ),
    children: [
      { href: "/profile", label: "ข้อมูลส่วนตัว" },
      { href: "/settings/notifications", label: "ตั้งค่าการแจ้งเตือน" },
    ],
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

// เมนูท้ายแถบ (เหนือแถวผู้ใช้)
const BOTTOM_ITEMS: NavItem[] = [
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
];

const chevronIcon = icon(<path d="m6 9 6 6 6-6" />);
const closeIcon = icon(
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>,
);
const logoutIcon = icon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </>,
);
// panel-left-close / panel-left-open
const collapseIcon = icon(
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </>,
);
const expandIcon = icon(
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m14 9 3 3-3 3" />
  </>,
);

const fallbackAvatar = (name?: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name || "U",
  )}&background=0D8ABC&color=fff&rounded=true`;

// โลโก้สามแท่ง (นิ่ง ไม่เด้ง) ในกรอบสีหลัก 36px — Navbar ใช้ตัวเดียวกัน
export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex w-9 h-9 shrink-0 items-center justify-center rounded-[var(--tb-radius)] bg-[var(--tb-primary)]"
    >
      <span className="flex h-[18px] items-end gap-1">
        <span className="w-1 h-2.5 rounded-full bg-[var(--tb-primary-contrast)]" />
        <span className="w-1 h-[18px] rounded-full bg-[var(--tb-primary-contrast)]" />
        <span className="w-1 h-3 rounded-full bg-[var(--tb-primary-contrast)]" />
      </span>
    </span>
  );
}

// ชื่อระบบสองบรรทัด — บรรทัดเดียวยาวเกินแถบกว้าง 256px
export function BrandName() {
  return (
    <span className="min-w-0 text-sm font-bold leading-[18px] text-[var(--tb-text)]">
      <span className="block truncate">Emergency Voice</span>
      <span className="block truncate">Rescuer</span>
    </span>
  );
}

// ---------- จอคอมหรือจอเล็ก ----------
// เซิร์ฟเวอร์ไม่รู้ขนาดจอ จึงคืน null — inert จะใส่เฉพาะตอนรู้แน่ว่าเป็นจอเล็ก
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;
const getDesktopServer = () => null;

// ---------- สถานะย่อ sidebar (จำไว้ใน localStorage) ----------
// เก็บค่าในตัวแปรด้วย เผื่อ localStorage ใช้ไม่ได้ (โหมดส่วนตัว) ปุ่มย่อก็ยังทำงาน
const COLLAPSE_KEY = "sidebarCollapsed";
let collapsedCache: boolean | null = null;
const collapseListeners = new Set<() => void>();

function subscribeCollapsed(onChange: () => void) {
  collapseListeners.add(onChange);
  return () => {
    collapseListeners.delete(onChange);
  };
}
function getCollapsed() {
  if (collapsedCache === null) {
    try {
      collapsedCache = localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      collapsedCache = false;
    }
  }
  return collapsedCache;
}
const getCollapsedServer = () => false;
function writeCollapsed(value: boolean) {
  collapsedCache = value;
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    // เก็บลงเครื่องไม่ได้ก็ไม่เป็นไร ค่าในตัวแปรยังใช้ได้จนกว่าจะรีเฟรช
  }
  collapseListeners.forEach((listener) => listener());
}

type TipHandlers = {
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: () => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: () => void;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

// ไม่ใส่ display ไว้ในนี้ — แต่ละปุ่มกำหนดเอง ไม่งั้น hidden กับ inline-flex จะชนกันที่ breakpoint เดียวกัน
const iconButton = `w-10 h-10 shrink-0 items-center justify-center rounded-[var(--tb-radius)] text-[var(--tb-muted)] transition-colors duration-150 hover:bg-[var(--tb-surface-2)] hover:text-[var(--tb-text)] ${focusRing}`;

export default function Sidebar({ open, onClose, user, onLogout }: Props) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const desktop = useSyncExternalStore(
    subscribeDesktop,
    getDesktop,
    getDesktopServer,
  );
  const isDesktop = desktop === true;
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsed,
    getCollapsedServer,
  );
  // แถบไอคอนแคบมีเฉพาะจอคอม — ลิ้นชักบนมือถือกางเต็มเสมอ
  const rail = isDesktop && collapsed;

  // กลุ่มที่ผู้ใช้กดพับ/กางเอง (ยังไม่เคยกด = กางถ้าหน้าปัจจุบันอยู่ในกลุ่ม)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // tooltip ของแถบไอคอน วาดนอก <nav> เพื่อไม่ให้ overflow ของ nav ตัดทิ้ง
  // เก็บ element ต้นทางไว้ด้วย เพื่อคำนวณตำแหน่งใหม่ตอนรายการเมนูเลื่อน
  const [tip, setTip] = useState<{
    label: string;
    top: number;
    el: HTMLElement;
  } | null>(null);

  // ปิดเองเมื่อเปลี่ยนหน้า ไม่งั้นแผงจะค้างทับหน้าใหม่
  useEffect(() => {
    onClose();
    // ตั้งใจ depend เฉพาะ pathname — ไม่ต้องปิดซ้ำตอน onClose เปลี่ยน identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ขยายจอเป็นจอคอมระหว่างลิ้นชักเปิด → ปิดลิ้นชัก ไม่งั้นย่อจอกลับมาจะค้างเปิดพร้อมล็อกการเลื่อน
  useEffect(() => {
    if (isDesktop) onClose();
  }, [isDesktop, onClose]);

  // ปิดด้วย Esc + ล็อกการเลื่อนหน้าหลังระหว่างเปิด (เฉพาะลิ้นชักบนจอเล็ก)
  useEffect(() => {
    if (!open || isDesktop) return;

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
  }, [open, onClose, isDesktop]);

  // ปุ่มที่กดจะหายไปตอนสลับย่อ/ขยาย → ย้ายโฟกัสไปปุ่มคู่กันในโครงใหม่ ไม่ให้หลุดไปที่ body
  const pendingFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const key = pendingFocusRef.current;
    if (!key) return;
    pendingFocusRef.current = null;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-focus-key="${key}"]`)
      ?.focus();
  }, [rail]);

  // .app-shell กับแถบบนอ่านความกว้างจาก --sidebar-w ซึ่งสลับด้วย <html data-sidebar>
  useEffect(() => {
    const root = document.documentElement;
    if (collapsed) root.dataset.sidebar = "collapsed";
    else delete root.dataset.sidebar;
  }, [collapsed]);

  // เมนู admin โผล่เฉพาะตอน role เป็น admin
  //
  // นี่เป็นแค่การซ่อน/แสดงเมนู ไม่ใช่การกันสิทธิ์ — ถ้าดึงโปรไฟล์ไม่สำเร็จ
  // Navbar จะ fallback เป็น role "User" เมนูก็จะไม่โผล่ (fail closed)
  // ด่านจริงคือ useAdminGuard ในแต่ละหน้า และ RequireAdmin ฝั่ง Go
  const isAdmin = user?.role?.toLowerCase() === "admin";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href) ?? false;

  const groupHasActive = (group: NavGroup) =>
    group.children.some((child) => isActive(child.href));
  const isGroupOpen = (group: NavGroup) =>
    openGroups[group.id] ?? groupHasActive(group);

  const toggleGroup = (group: NavGroup) =>
    setOpenGroups((prev) => ({
      ...prev,
      [group.id]: !(prev[group.id] ?? groupHasActive(group)),
    }));

  const setCollapsed = (value: boolean) => {
    hideTip();
    writeCollapsed(value);
  };

  // กดไอคอนกลุ่มตอนย่ออยู่ → กางแถบแล้วเปิดกลุ่มนั้นให้เลย
  const openGroupFromRail = (group: NavGroup) => {
    pendingFocusRef.current = `group-${group.id}`;
    setCollapsed(false);
    setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
  };

  const showTip = (el: HTMLElement, text: string) => {
    const panel = el.closest<HTMLElement>("#app-sidebar");
    if (!panel) return;
    const item = el.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    setTip({ label: text, top: item.top - box.top + item.height / 2, el });
  };
  const hideTip = () => setTip(null);

  // เลื่อนรายการเมนู → ให้ tooltip ขยับตามไอคอน (กด Tab ไปรายการที่ต้องเลื่อนก็ยังเห็น)
  const onNavScroll = (e: React.UIEvent<HTMLElement>) => {
    if (!tip) return;
    const nav = e.currentTarget.getBoundingClientRect();
    const item = tip.el.getBoundingClientRect();
    if (item.bottom < nav.top || item.top > nav.bottom) hideTip();
    else showTip(tip.el, tip.label);
  };

  const tipHandlers = (text: string): TipHandlers =>
    rail
      ? {
          onMouseEnter: (e) => showTip(e.currentTarget, text),
          onMouseLeave: hideTip,
          // โฟกัสจากคีย์บอร์ดเท่านั้น — คลิกเมาส์แล้วไม่ต้องเด้ง tooltip ซ้ำ
          onFocus: (e) => {
            if (e.currentTarget.matches(":focus-visible"))
              showTip(e.currentTarget, text);
          },
          onBlur: hideTip,
        }
      : {};

  const rowClass = (active: boolean) =>
    [
      "group flex items-center rounded-[var(--tb-radius)] text-sm transition-colors duration-150",
      focusRing,
      rail ? "w-11 h-11 mx-auto justify-center" : "w-full h-10 gap-3 px-3",
      active
        ? "bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)] font-semibold"
        : "font-medium text-[var(--tb-text)] hover:bg-[var(--tb-surface-2)]",
    ].join(" ");

  const iconClass = (active: boolean) =>
    active
      ? "flex text-[var(--tb-primary-text)]"
      : "flex text-[var(--tb-muted)] transition-colors duration-150 group-hover:text-[var(--tb-text)]";

  const itemLabel = (text: string) =>
    rail ? (
      <span className="sr-only">{text}</span>
    ) : (
      <span className="flex-1 min-w-0 truncate text-left">{text}</span>
    );

  const renderLink = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onClose}
          aria-current={active ? "page" : undefined}
          className={rowClass(active)}
          {...tipHandlers(item.label)}
        >
          <span className={iconClass(active)}>{item.icon}</span>
          {itemLabel(item.label)}
        </Link>
      </li>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const childActive = groupHasActive(group);
    const subId = `sidebar-group-${group.id}`;

    if (rail) {
      return (
        <li key={group.id}>
          <button
            type="button"
            onClick={() => openGroupFromRail(group)}
            className={rowClass(childActive)}
            {...tipHandlers(group.label)}
          >
            <span className={iconClass(childActive)}>{group.icon}</span>
            {itemLabel(group.label)}
          </button>
        </li>
      );
    }

    const expanded = isGroupOpen(group);
    return (
      <li key={group.id}>
        <button
          type="button"
          onClick={() => toggleGroup(group)}
          data-focus-key={`group-${group.id}`}
          aria-expanded={expanded}
          aria-controls={subId}
          className={rowClass(false)}
        >
          <span className={iconClass(childActive)}>{group.icon}</span>
          {itemLabel(group.label)}
          <span
            className={`flex text-[var(--tb-muted)] transition-transform duration-150 motion-reduce:transition-none ${
              expanded ? "rotate-180" : ""
            }`}
          >
            {chevronIcon}
          </span>
        </button>

        {/* ลูกของกลุ่ม: เยื้องเข้าไปพร้อมเส้นนำสายตาบาง ๆ ด้านซ้ายแบบ Tabler */}
        <ul
          id={subId}
          hidden={!expanded}
          className="mt-0.5 ml-[22px] pl-3 border-l border-[var(--tb-border)] space-y-0.5"
        >
          {group.children.map((child) => {
            const active = isActive(child.href);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center h-10 px-3 rounded-[var(--tb-radius)] text-sm transition-colors duration-150 ${focusRing} ${
                    active
                      ? "bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)] font-semibold"
                      : "font-medium text-[var(--tb-muted)] hover:bg-[var(--tb-surface-2)] hover:text-[var(--tb-text)]"
                  }`}
                >
                  <span className="min-w-0 truncate">{child.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </li>
    );
  };

  const displayName = user?.name || "ผู้ใช้งานระบบ";
  const displayRole = user?.role || "User";

  const avatar = (
    <img
      src={user?.profileImage || fallbackAvatar(user?.name)}
      referrerPolicy="no-referrer"
      alt=""
      className="w-9 h-9 rounded-full object-cover shrink-0 border border-[var(--tb-border)]"
      onError={(e) => {
        e.currentTarget.src = fallbackAvatar(user?.name);
      }}
    />
  );

  return (
    <>
      {/* ฉากหลังของลิ้นชัก (จอเล็กเท่านั้น) — คลิกที่ไหนก็ปิด */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* จอคอม: ติดซ้ายตลอด กว้างตาม --sidebar-w
          จอเล็ก: ลิ้นชักเลื่อนเข้า-ออก อยู่ใน DOM ตลอดเพื่อให้เลื่อนได้ลื่น
          ตอนปิดใช้ inert กันไม่ให้ Tab หลุดเข้าไปโฟกัสลิงก์ที่มองไม่เห็น (เฉพาะจอเล็ก) */}
      <aside
        ref={panelRef}
        id="app-sidebar"
        inert={desktop === false && !open}
        aria-label="เมนูหลัก"
        className={`fixed inset-y-0 left-0 z-[70] lg:z-40 flex flex-col w-[280px] max-w-[85vw] lg:w-[var(--sidebar-w)] lg:max-w-none bg-[var(--tb-surface)] border-r border-[var(--tb-border)] transition-[translate,width] duration-300 lg:duration-200 ease-out motion-reduce:transition-none lg:translate-x-0 lg:shadow-none ${
          open
            ? "translate-x-0 shadow-[var(--tb-shadow-pop)]"
            : "-translate-x-full"
        }`}
      >
        {/* หัวแถบ: โลโก้ + ปุ่มย่อ (จอคอม) / ปุ่มปิด (จอเล็ก) */}
        <div
          className={`shrink-0 h-[var(--topbar-h)] flex items-center border-b border-[var(--tb-border)] ${
            rail ? "justify-center px-2" : "justify-between gap-2 pl-4 pr-3"
          }`}
        >
          <Link
            href="/dashboard"
            onClick={onClose}
            className={`flex items-center gap-2.5 min-w-0 rounded-[var(--tb-radius)] ${focusRing}`}
          >
            <BrandMark />
            {rail ? (
              <span className="sr-only">Emergency Voice Rescuer</span>
            ) : (
              <BrandName />
            )}
          </Link>

          {!rail && (
            <>
              <button
                type="button"
                onClick={() => {
                  pendingFocusRef.current = "expand";
                  setCollapsed(true);
                }}
                data-focus-key="collapse"
                aria-label="ย่อเมนู"
                aria-expanded={true}
                aria-controls="app-sidebar"
                title="ย่อเมนู"
                className={`hidden lg:inline-flex ${iconButton}`}
              >
                {collapseIcon}
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="ปิดเมนู"
                className={`inline-flex lg:hidden ${iconButton}`}
              >
                {closeIcon}
              </button>
            </>
          )}
        </div>

        {/* ตอนย่อ ปุ่มขยายย้ายมาอยู่บนสุดของแถบไอคอน */}
        {rail && (
          <div className="shrink-0 px-2 pt-3">
            <button
              type="button"
              onClick={() => {
                pendingFocusRef.current = "collapse";
                setCollapsed(false);
              }}
              data-focus-key="expand"
              aria-label="ขยายเมนู"
              aria-expanded={false}
              aria-controls="app-sidebar"
              className={`flex w-11 h-11 mx-auto items-center justify-center rounded-[var(--tb-radius)] text-[var(--tb-muted)] transition-colors duration-150 hover:bg-[var(--tb-surface-2)] hover:text-[var(--tb-text)] ${focusRing}`}
              {...tipHandlers("ขยายเมนู")}
            >
              {expandIcon}
            </button>
          </div>
        )}

        {/* รายการเมนู — เลื่อนในตัวเองได้เมื่อจอเตี้ย
            scrollbar แบบบางสีจาง ไม่งั้นแถบเริ่มต้นของเบราว์เซอร์กินที่แถบไอคอน 72px จนดูรก */}
        <nav
          onScroll={onNavScroll}
          className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:var(--tb-border)_transparent] ${
            rail ? "px-2 py-2" : "px-3 py-3"
          }`}
        >
          <ul className="space-y-0.5">
            {MAIN_ITEMS.map((entry) =>
              isGroup(entry) ? renderGroup(entry) : renderLink(entry),
            )}
          </ul>

          {isAdmin && (
            <>
              {rail ? (
                <>
                  <p className="sr-only">ผู้ดูแลระบบ</p>
                  <div
                    aria-hidden="true"
                    className="mx-2 my-3 h-px bg-[var(--tb-border)]"
                  />
                </>
              ) : (
                <p className="px-3 pt-5 pb-2 text-xs font-semibold text-[var(--tb-muted)]">
                  ผู้ดูแลระบบ
                </p>
              )}
              <ul className="space-y-0.5">{ADMIN_ITEMS.map(renderLink)}</ul>
            </>
          )}
        </nav>

        {/* ท้ายแถบ: หน้าแรก / ช่วยเหลือ แล้วตามด้วยผู้ใช้ที่ล็อกอินอยู่ */}
        <div
          className={`shrink-0 mt-auto border-t border-[var(--tb-border)] ${
            rail ? "px-2 py-2" : "px-3 py-3"
          }`}
        >
          <nav aria-label="หน้าแรกและความช่วยเหลือ">
            <ul className="space-y-0.5">{BOTTOM_ITEMS.map(renderLink)}</ul>
          </nav>

          <div className="mt-2 pt-3 border-t border-[var(--tb-border)]">
            {rail ? (
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex w-11 h-11 items-center justify-center"
                  {...tipHandlers(displayName)}
                >
                  {avatar}
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="ออกจากระบบ"
                  className={`flex w-11 h-11 items-center justify-center rounded-[var(--tb-radius)] text-[var(--tb-muted)] transition-colors duration-150 hover:bg-[var(--tb-danger-tint)] hover:text-[var(--tb-danger-text)] ${focusRing}`}
                  {...tipHandlers("ออกจากระบบ")}
                >
                  {logoutIcon}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 pl-1.5">
                {avatar}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--tb-text)] truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-[var(--tb-muted)] truncate">
                    {displayRole}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="ออกจากระบบ"
                  title="ออกจากระบบ"
                  className={`inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-[var(--tb-radius)] text-[var(--tb-muted)] transition-colors duration-150 hover:bg-[var(--tb-danger-tint)] hover:text-[var(--tb-danger-text)] ${focusRing}`}
                >
                  {logoutIcon}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* tooltip ของแถบไอคอน — ลูกตรงของ aside จึงล้นออกขวาได้ ไม่โดน nav ตัด */}
        {rail && tip && (
          <div
            aria-hidden="true"
            style={{ top: tip.top }}
            className="pointer-events-none absolute left-full z-10 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-[var(--tb-text)] px-2 py-1 text-xs font-medium text-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)]"
          >
            <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-[var(--tb-text)]" />
            <span className="relative">{tip.label}</span>
          </div>
        )}
      </aside>
    </>
  );
}
