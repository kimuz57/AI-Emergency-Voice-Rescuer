"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { connectSSE } from "@/lib/auth";
import { nameInitial } from "@/lib/initials";

interface DeviceData {
  id: number;
  mac_address: string;
  patient_name: string | null;
  device_name: string | null;
  status: string;
  is_active: boolean;
  is_verified: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type UserProfile = {
  name: string;
  email: string;
  role: string;
};

// แยกฟังก์ชันดึง Token ออกมาด้านนอก เพื่อให้ใช้ร่วมกันได้ทั้ง Fetch และ SSE
const getAuthToken = () => {
  if (typeof window === "undefined") return "";
  const fromStorage = localStorage.getItem("token");
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

export default function DevicesPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // สถานะเพื่อแสดงว่า SSE เชื่อมต่ออยู่หรือไม่ (เผื่อนำไปทำ UI ไฟกระพริบมุมจอ)
  const [isLive, setIsLive] = useState(false);

  const [wifiModalDevice, setWifiModalDevice] = useState<DeviceData | null>(
    null,
  );
  const [wifiQrUrl, setWifiQrUrl] = useState<string>("");
  const [wifiInfo, setWifiInfo] = useState({ ssid: "", pass: "" });

  const handleOpenWifiQr = async (device: DeviceData) => {
    const cleanMac = device.mac_address.replace(/:/g, "").toUpperCase();
    if (cleanMac.length !== 12) {
      alert("MAC Address ไม่ถูกต้อง");
      return;
    }

    const first6 = cleanMac.substring(0, 6);
    const last6 = cleanMac.substring(6, 12);

    const ssid = `Smartvoice-${last6}`;
    // ต้องตรงกับ firmwareV2/main/main.c: SSID "Smartvoice-%02X%02X%02X" (mac[3..5]),
    // password "SV_%02X%02X%02X" (mac[0..2]) — ใช้ขีดล่าง ไม่ใช่ขีดกลาง
    const pass = `SV_${first6}`;
    const wifiString = `WIFI:T:WPA;S:${ssid};P:${pass};;`;

    setWifiInfo({ ssid, pass });

    try {
      const url = await QRCode.toDataURL(wifiString, {
        width: 300,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
      });
      setWifiQrUrl(url);
      setWifiModalDevice(device);
    } catch (err) {
      console.error("QR Gen Error", err);
      alert("ไม่สามารถสร้าง QR Code ได้");
    }
  };

  const handleDownloadWifiQr = () => {
    if (!wifiQrUrl || !wifiModalDevice) return;
    const link = document.createElement("a");
    link.href = wifiQrUrl;
    const cleanMac = wifiModalDevice.mac_address.replace(/:/g, "");
    link.download = `wifi_setup_${cleanMac}.png`;
    link.click();
  };

  const handlePrintWifiQr = () => {
    if (!wifiQrUrl || !wifiModalDevice) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    // S28: ค่าจาก DB/อุปกรณ์ต้อง escape ก่อนเขียนลง HTML ไม่งั้นแทรกสคริปต์ได้
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"']/g, (ch) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
      );
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WiFi QR - ${esc(wifiModalDevice.mac_address)}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: white; }
          .card { text-align: center; padding: 24px; border: 2px solid #e2e8f0; border-radius: 16px; display: inline-block; }
          img { width: 280px; height: 280px; display: block; margin: 0 auto; }
          .mac { font-family: monospace; font-size: 18px; font-weight: bold; color: #1e293b; margin-top: 12px; letter-spacing: 2px; }
          .label { font-size: 14px; color: #64748b; margin-top: 6px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="card">
          <img src="${esc(wifiQrUrl)}" alt="WiFi QR Code" />
          <div class="mac">SSID: ${esc(wifiInfo.ssid)}</div>
          <div class="label">Password: ${esc(wifiInfo.pass)}</div>
          <div class="label" style="font-size: 12px; margin-top: 12px;">MAC: ${esc(wifiModalDevice.mac_address)}</div>
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ดึงข้อมูลครั้งแรก (Initial Fetch)
  const fetchData = async () => {
    setIsLoading(true);
    setError("");

    try {
      let targetEmail = localStorage.getItem("userEmail");

      if (!targetEmail || targetEmail === "null") {
        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();
        if (session?.user?.email) {
          targetEmail = session.user.email;
          localStorage.setItem("userEmail", targetEmail || "");
        }
      }

      if (!targetEmail) {
        throw new Error("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
      }

      const token = getAuthToken();

      const userRes = await fetch(
        `${API_BASE_URL}/api/user/profile?email=${encodeURIComponent(targetEmail)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
        },
      );
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }

      const deviceRes = await fetch(`${API_BASE_URL}/api/devices`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });

      if (!deviceRes.ok) {
        throw new Error("ไม่สามารถดึงข้อมูลอุปกรณ์ได้");
      }

      const deviceData = await deviceRes.json();
      setDevices(deviceData.data || deviceData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // ระบบ Initialize ข้อมูล & SSE Connection
  // ==========================================
  useEffect(() => {
    fetchData(); // ดึงข้อมูลก้อนแรกก่อน

    const targetEmail = localStorage.getItem("userEmail");
    if (!targetEmail || targetEmail === "null") return;

    const token = getAuthToken();

    // เลียนแบบ Dashboard เป๊ะๆ: ส่งทั้ง email และ token ไปใน URL
    const sseUrl = `${API_BASE_URL}/api/device/stream?email=${encodeURIComponent(targetEmail)}&token=${encodeURIComponent(token)}`;
    // connectSSE ต่อใหม่เองแบบ backoff เมื่อ browser ยอมแพ้ (readyState = CLOSED เช่น backend ตอบ 401/5xx)
    const closeStream = connectSSE(sseUrl, {
      onOpen: () => {
        setIsLive(true);
        console.log("SSE Connected: Ready for real-time device updates");
      },
      onMessage: (event) => {
        if (!event.data) return;

        try {
          const data = JSON.parse(event.data);

          setDevices((prevDevices) => {
            if (Array.isArray(data)) return data;

            const exists = prevDevices.find(
              (d) => d.mac_address === data.mac_address,
            );
            if (exists) {
              return prevDevices.map((d) =>
                d.mac_address === data.mac_address ? { ...d, ...data } : d,
              );
            }
            return [...prevDevices, data];
          });
        } catch (err) {
          console.error("SSE JSON Parse Error:", err);
        }
      },
      onError: (err) => {
        console.error("SSE Connection Error:", err);
        setIsLive(false);
      },
    });

    return closeStream;
  }, []);

  const isAdmin = user?.role?.toLowerCase() === "admin";

  // ==========================================
  // ค้นหา + ตัวกรอง
  // ==========================================
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<
    "all" | "online" | "offline" | "inactive" | "unassigned"
  >("all");

  const isOnline = (d: DeviceData) => d.status?.toLowerCase() === "online";

  // สรุปภาพรวม — เปิดหน้ามาต้องรู้ทันทีว่ามีอะไรผิดปกติไหม ไม่ต้องไล่นับการ์ดเอง
  const stats = {
    total: devices.length,
    online: devices.filter((d) => d.is_active && isOnline(d)).length,
    offline: devices.filter((d) => d.is_active && !isOnline(d)).length,
    inactive: devices.filter((d) => !d.is_active).length,
    unassigned: devices.filter((d) => !d.patient_name).length,
  };

  const matchesQuery = (d: DeviceData) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [d.mac_address, d.patient_name, d.device_name]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  };

  const matchesFilter = (d: DeviceData) => {
    if (filter === "online") return d.is_active && isOnline(d);
    if (filter === "offline") return d.is_active && !isOnline(d);
    if (filter === "inactive") return !d.is_active;
    if (filter === "unassigned") return !d.patient_name;
    return true;
  };

  const visible = devices.filter((d) => matchesQuery(d) && matchesFilter(d));

  // จัดกลุ่มตาม "สุขภาพของอุปกรณ์" ไม่ใช่ตามแฟล็ก is_active เฉยๆ
  // เพราะบอร์ดที่เปิดใช้งานแล้วแต่ออฟไลน์ = ผู้ป่วยรายนั้นไม่มีใครเฝ้าอยู่
  // ต้องเห็นก่อนเป็นอันดับแรก
  const groups = [
    {
      key: "needsAttention",
      title: "ต้องตรวจสอบ — เปิดใช้งานแล้วแต่ออฟไลน์",
      hint: "ผู้ป่วยที่ผูกกับบอร์ดเหล่านี้ไม่มีระบบเฝ้าอยู่ในขณะนี้",
      dot: "bg-[var(--tb-danger)]",
      items: visible.filter((d) => d.is_active && !isOnline(d)),
    },
    {
      key: "healthy",
      title: "ทำงานปกติ",
      hint: "",
      dot: "bg-[var(--tb-success)]",
      items: visible.filter((d) => d.is_active && isOnline(d)),
    },
    {
      key: "inactive",
      title: "ยังไม่เปิดใช้งาน",
      hint: "บอร์ดที่ลงทะเบียนไว้แล้วแต่ยังไม่ได้เริ่มใช้งาน",
      dot: "bg-[var(--tb-warning)]",
      items: visible.filter((d) => !d.is_active),
    },
  ];

  const FILTERS: { key: typeof filter; label: string; count: number }[] = [
    { key: "all", label: "ทั้งหมด", count: stats.total },
    { key: "online", label: "ออนไลน์", count: stats.online },
    { key: "offline", label: "ออฟไลน์", count: stats.offline },
    { key: "inactive", label: "ยังไม่เปิดใช้งาน", count: stats.inactive },
    { key: "unassigned", label: "ยังไม่ผูกผู้ป่วย", count: stats.unassigned },
  ];

  // คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า patients
  const card =
    "rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]";
  const btnSecondary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const btnPrimary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const pill =
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";
  const fieldLabel = "text-xs font-semibold text-[var(--tb-muted)] mb-1";

  const renderDeviceCard = (device: DeviceData, index: number) => {
    const online = isOnline(device);
    // บอร์ดที่เปิดใช้งานแล้วแต่ติดต่อไม่ได้ ต้องเด่นกว่าใบอื่น
    const alarming = device.is_active && !online;

    return (
      <article
        key={device.id || index}
        className={`flex flex-col rounded-[var(--tb-radius-lg)] border bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] transition-shadow hover:shadow-[var(--tb-shadow-pop)] ${
          alarming
            ? "border-[var(--tb-danger)]/50 ring-1 ring-[var(--tb-danger)]/30"
            : "border-[var(--tb-border)]"
        }`}
      >
        {/* แถบบน: สถานะการเชื่อมต่อ + สถานะการเปิดใช้งาน */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--tb-border)]">
          {online ? (
            <span className={`${pill} bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]`}>
              <span aria-hidden="true" className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--tb-success)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--tb-success)]"></span>
              </span>
              ออนไลน์
            </span>
          ) : (
            <span
              className={`${pill} ${
                alarming
                  ? "bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]"
                  : "bg-[var(--tb-surface-2)] text-[var(--tb-muted)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  alarming ? "bg-[var(--tb-danger)]" : "bg-[var(--tb-border-strong)]"
                }`}
              ></span>
              ออฟไลน์
            </span>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            {device.is_verified && (
              <span
                className={`${pill} bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]`}
                title="บอร์ดผ่านการยืนยันตัวตนกับระบบแล้ว"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                ยืนยันแล้ว
              </span>
            )}
            <span
              className={`${pill} ${
                device.is_active
                  ? "bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]"
                  : "bg-[var(--tb-warning-tint)] text-[var(--tb-warning-text)]"
              }`}
            >
              {device.is_active ? "เปิดใช้งาน" : "ยังไม่เปิด"}
            </span>
          </div>
        </div>

        <div className="flex-1 px-4 py-4">
          {/* ชื่อจุดติดตั้ง — ข้อมูลที่ API ส่งมาอยู่แล้วแต่หน้าเดิมไม่เคยแสดง */}
          <p className={fieldLabel}>จุดติดตั้ง</p>
          <p className="font-semibold text-[var(--tb-text)] mb-3 break-words">
            {device.device_name || (
              <span className="font-medium text-[var(--tb-muted)]">ยังไม่ได้ตั้งชื่อ</span>
            )}
          </p>

          <p className={fieldLabel}>MAC Address</p>
          <p className="font-mono text-sm font-semibold text-[var(--tb-text)] break-all">
            {device.mac_address}
          </p>

          <button
            type="button"
            onClick={() => handleOpenWifiQr(device)}
            className={`${btnSecondary} h-9 px-3 mt-4`}
            title="สร้าง QR สำหรับสแกนต่อ WiFi ของบอร์ด"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3z" />
              <path d="M20 14v.01" />
              <path d="M14 20h.01" />
              <path d="M17 20h4v-3" />
            </svg>
            QR ตั้งค่า WiFi
          </button>
        </div>

        <div className="px-4 py-3 border-t border-[var(--tb-border)] bg-[var(--tb-surface-2)] rounded-b-[var(--tb-radius-lg)]">
          <p className={`${fieldLabel} mb-2`}>ผู้ป่วยที่ผูกกับบอร์ดนี้</p>
          {device.patient_name ? (
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)] font-bold text-xs shrink-0"
              >
                {nameInitial(device.patient_name)}
              </span>
              <p className="font-medium text-sm text-[var(--tb-text)] truncate">
                {device.patient_name}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[var(--tb-radius)] bg-[var(--tb-warning-tint)] px-3 py-2">
              <svg className="w-4 h-4 shrink-0 text-[var(--tb-warning-text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <span className="text-xs font-semibold text-[var(--tb-warning-text)]">
                ยังไม่ได้ผูกกับผู้ป่วย
              </span>
            </div>
          )}
        </div>
      </article>
    );
  };

  const statTile = (
    label: string,
    value: number,
    tone: string,
    hint?: string,
  ) => (
    <div className={`${card} p-4 sm:p-5`} title={hint}>
      <p className="text-sm font-medium text-[var(--tb-muted)]">{label}</p>
      <p className={`mt-1 text-2xl sm:text-3xl font-bold leading-tight tabular-nums ${tone}`}>
        {value}
      </p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* ---------- หัวหน้า ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">อุปกรณ์</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)] flex items-center gap-3">
            จัดการอุปกรณ์รับเสียง
            {isLive && (
              <span
                className="relative flex h-2.5 w-2.5"
                title="กำลังรับข้อมูลสถานะแบบเรียลไทม์"
              >
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--tb-success)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--tb-success)]"></span>
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            {isLive
              ? "สถานะอัปเดตอัตโนมัติเมื่อบอร์ดมีการเปลี่ยนแปลง"
              : "แสดงสถานะอุปกรณ์ที่ผูกกับผู้ป่วย"}
          </p>
        </div>

        <button type="button" onClick={fetchData} className={`${btnSecondary} self-start sm:self-auto`}>
          <svg className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          รีเฟรชข้อมูล
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          {[1, 2, 3].map((skeleton) => (
            <div
              key={skeleton}
              className={`${card} p-5 h-36 animate-pulse flex flex-col justify-between`}
            >
              <div className="h-4 w-1/3 rounded bg-[var(--tb-surface-3)]"></div>
              <div className="h-6 w-2/3 rounded bg-[var(--tb-surface-3)]"></div>
              <div className="h-4 w-1/2 rounded bg-[var(--tb-surface-3)]"></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className={`${card} flex flex-col items-center text-center px-6 py-12`}>
          <span className="inline-flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>
          <h3 className="text-base font-semibold text-[var(--tb-text)]">เกิดข้อผิดพลาด</h3>
          <p role="alert" className="mt-1 text-sm text-[var(--tb-danger-text)]">{error}</p>
          <button type="button" onClick={fetchData} className={`${btnSecondary} mt-5`}>
            ลองใหม่อีกครั้ง
          </button>
        </div>
      ) : devices.length === 0 ? (
        <div className={`${card} flex flex-col items-center text-center px-6 py-12`}>
          <span className="inline-flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </span>
          <h3 className="text-base font-semibold text-[var(--tb-text)]">ยังไม่มีอุปกรณ์ในระบบ</h3>
          <p className="mt-1 text-sm text-[var(--tb-muted)]">
            {isAdmin
              ? "ยังไม่มีการลงทะเบียนอุปกรณ์ใดๆ ในระบบ"
              : "ยังไม่มีอุปกรณ์ของผู้ป่วยที่อยู่ภายใต้การดูแลของคุณ"}
          </p>
        </div>
      ) : (
        <>
          {/* ---------- สรุปภาพรวม ---------- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {statTile("ทั้งหมด", stats.total, "text-[var(--tb-text)]")}
            {statTile("ออนไลน์", stats.online, "text-[var(--tb-success-text)]")}
            {statTile(
              "ออฟไลน์",
              stats.offline,
              stats.offline > 0
                ? "text-[var(--tb-danger-text)]"
                : "text-[var(--tb-muted)]",
              "บอร์ดที่เปิดใช้งานแล้วแต่ติดต่อไม่ได้",
            )}
            {statTile("ยังไม่เปิดใช้งาน", stats.inactive, "text-[var(--tb-warning-text)]")}
          </div>

          {/* ---------- แถบเตือนเมื่อมีบอร์ดหลุด ---------- */}
          {stats.offline > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-[var(--tb-radius-lg)] border border-[var(--tb-danger)]/25 bg-[var(--tb-danger-tint)] p-4">
              <svg className="w-5 h-5 shrink-0 mt-0.5 text-[var(--tb-danger-text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <div className="text-sm leading-relaxed text-[var(--tb-danger-text)]">
                <p className="font-semibold">
                  มี {stats.offline} บอร์ดที่เปิดใช้งานแล้วแต่ติดต่อไม่ได้
                </p>
                <p className="mt-0.5">
                  ผู้ป่วยที่ผูกกับบอร์ดเหล่านี้จะไม่ได้รับการเฝ้าระวัง
                  กรุณาตรวจสอบไฟเลี้ยงและสัญญาณ WiFi
                </p>
              </div>
            </div>
          )}

          {/* ---------- ค้นหา + ตัวกรอง ---------- */}
          <div className={`${card} p-4 mb-6 space-y-3`}>
            <label className="sr-only" htmlFor="device-search">
              ค้นหาอุปกรณ์
            </label>
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tb-placeholder)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                id="device-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาจาก MAC Address, ชื่อจุดติดตั้ง หรือชื่อผู้ป่วย"
                className="w-full h-10 pl-9 pr-3 rounded-[var(--tb-radius)] border border-[var(--tb-border-strong)] bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] placeholder:text-[var(--tb-placeholder)] shadow-[var(--tb-shadow-xs)] transition-colors focus:outline-none focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)] ${
                    filter === f.key
                      ? "border-[var(--tb-primary)]/40 bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]"
                      : "border-[var(--tb-border)] bg-[var(--tb-surface)] text-[var(--tb-muted)] hover:bg-[var(--tb-surface-2)] hover:text-[var(--tb-text)]"
                  }`}
                >
                  {f.label}
                  <span className="tabular-nums opacity-80">({f.count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* ---------- รายการอุปกรณ์ ---------- */}
          {visible.length === 0 ? (
            <div className={`${card} px-6 py-10 text-center`}>
              <p className="text-base font-semibold text-[var(--tb-text)]">ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข</p>
              <p className="mt-1 text-sm text-[var(--tb-muted)]">
                ลองแก้คำค้นหา หรือเลือกตัวกรองอื่น
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {groups
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <section key={g.key}>
                    <h2 className="text-base font-semibold text-[var(--tb-text)] flex items-center gap-2">
                      <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${g.dot}`}></span>
                      {g.title}
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums bg-[var(--tb-surface-2)] border border-[var(--tb-border)] text-[var(--tb-muted)]">
                        {g.items.length}
                      </span>
                    </h2>
                    {g.hint && (
                      <p className="mt-1 ml-[18px] text-xs text-[var(--tb-muted)]">
                        {g.hint}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                      {g.items.map(renderDeviceCard)}
                    </div>
                  </section>
                ))}
            </div>
          )}
        </>
      )}

      {wifiModalDevice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wifi-qr-title"
            className="relative w-full max-w-md max-h-full overflow-y-auto rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)]"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--tb-border)]">
              <h2 id="wifi-qr-title" className="text-lg font-bold text-[var(--tb-text)] flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-[var(--tb-radius)] bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <line x1="12" y1="20" x2="12.01" y2="20" />
                  </svg>
                </span>
                WiFi Setup QR Code
              </h2>
              <button
                type="button"
                onClick={() => setWifiModalDevice(null)}
                aria-label="ปิด"
                className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--tb-radius)] text-[var(--tb-muted)] hover:bg-[var(--tb-surface-2)] hover:text-[var(--tb-text)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col items-center gap-5 p-5 sm:p-6">
              {/* QR ต้องอยู่บนพื้นขาวเสมอเพื่อให้สแกนได้ทั้งโหมดสว่างและมืด */}
              <div className="rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-white p-3">
                {wifiQrUrl ? (
                  <img
                    src={wifiQrUrl}
                    alt="WiFi QR Code"
                    className="w-56 h-56 md:w-64 md:h-64"
                  />
                ) : (
                  <div className="w-56 h-56 md:w-64 md:h-64 flex items-center justify-center text-sm text-[var(--tb-muted)]">
                    กำลังสร้าง...
                  </div>
                )}
              </div>

              <div className="text-center w-full">
                <p className="font-mono text-lg font-bold text-[var(--tb-text)] tracking-widest break-all">
                  {wifiModalDevice.mac_address}
                </p>
                <p className="mt-2 text-sm text-[var(--tb-muted)]">
                  SSID:{" "}
                  <span className="font-semibold text-[var(--tb-primary-text)]">
                    {wifiInfo.ssid}
                  </span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button type="button" onClick={handleDownloadWifiQr} className={`${btnPrimary} w-full sm:flex-1`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  ดาวน์โหลด PNG
                </button>
                <button type="button" onClick={handlePrintWifiQr} className={`${btnSecondary} w-full sm:flex-1`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  พิมพ์ QR Code
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
