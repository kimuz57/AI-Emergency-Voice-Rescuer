"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavKey = "dashboard" | "history" | "settings";

type MobileNavProps = {
  current?: NavKey;
};

const items: Array<{ key: NavKey; href: string; icon: string; label: string }> = [
  { key: "dashboard", href: "/dashboard", icon: "home", label: "หน้าหลัก" },
  { key: "history", href: "/history", icon: "notifications", label: "การแจ้งเตือน" },
  { key: "settings", href: "/settings", icon: "person", label: "โปรไฟล์" },
];

function inferCurrent(pathname: string): NavKey {
  if (pathname.startsWith("/history") || pathname.startsWith("/event-details")) {
    return "history";
  }

  if (pathname.startsWith("/settings") || pathname.startsWith("/devices") || pathname.startsWith("/add-patient")) {
    return "settings";
  }

  return "dashboard";
}

export default function MobileNav({ current }: MobileNavProps) {
  const pathname = usePathname();
  const active = current ?? inferCurrent(pathname);

  return (
    <nav className="mobile-bottom-nav">
      <div className="nav-items mx-auto max-w-md px-4">
        {items.map((item) => {
          const isActive = item.key === active;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`nav-item ${isActive ? "active bg-white/60 shadow-[0_8px_20px_rgba(0,0,0,0.06)]" : ""}`.trim()}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ fontVariationSettings: `'FILL' ${isActive ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' 24` }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}