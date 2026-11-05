"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useAdminGuard } from "@/hooks/useAdminGuard";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// ไฟล์นี้เป็น client component → อ่านได้เฉพาะ env ที่ขึ้นต้นด้วย NEXT_PUBLIC_
// ถ้าไม่ได้ตั้งไว้ ให้ใช้ origin ของหน้าเว็บที่เปิดอยู่ (กัน SSR ที่ไม่มี window)
const getAppUrl = () =>
  process.env.NEXT_PUBLIC_FRONTEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://kws.wattanapong.com");
// ============================================================
// TAB 1: QR Code Generator Component
// ============================================================
function QRGeneratorTab() {
  const [macInput, setMacInput] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formatMAC = (value: string) => {
    const cleaned = value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    const parts = cleaned.match(/.{1,2}/g) || [];
    return parts.slice(0, 6).join(":");
  };

  const handleMacChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMacInput(formatMAC(e.target.value));
    setError("");
    setQrDataUrl("");
  };

  const isValidMAC = (mac: string) => {
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac);
  };

  const generateQR = useCallback(async () => {
    if (!isValidMAC(macInput)) {
      setError("MAC Address ไม่ถูกต้อง ตัวอย่าง: AA:BB:CC:DD:EE:FF");
      return;
    }
    setIsGenerating(true);
    setError("");
    try {
      const qrUrl = `${getAppUrl()}/register-patient?mac=${macInput}`;
      const dataUrl = await QRCode.toDataURL(qrUrl, {
        width: 400,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      setQrDataUrl(dataUrl);
    } catch {
      setError("ไม่สามารถสร้าง QR Code ได้ กรุณาลองใหม่");
    } finally {
      setIsGenerating(false);
    }
  }, [macInput]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    const filename = macInput.replace(/:/g, "") || "device";
    link.download = `qrcode_${filename}.png`;
    link.click();
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    // ชื่อที่แอดมินพิมพ์ถูกเขียนลง HTML ของหน้าต่างพิมพ์ — escape ก่อน
    const esc = (v: string) =>
      v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const label = esc(deviceLabel || macInput);
    const mac = esc(macInput);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code - ${mac}</title>
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
          <img src="${qrDataUrl}" alt="QR Code" />
          <div class="mac">${mac}</div>
          ${label !== mac ? `<div class="label">${label}</div>` : ""}
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Input Section */}
      <section aria-labelledby="qr-input-title" className={cardClass}>
        <div className={cardHeaderClass}>
          <span aria-hidden="true" className={`${headerIconClass} bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]`}>
            <QrIcon className="w-5 h-5" />
          </span>
          <h2 id="qr-input-title" className="text-base font-semibold text-[var(--tb-text)]">
            ข้อมูลอุปกรณ์
          </h2>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {/* MAC Address Input */}
            <div className="min-w-0">
              <label htmlFor="qr-mac" className={labelClass}>
                MAC Address{" "}
                <span className="text-[var(--tb-danger-text)]" aria-hidden="true">*</span>
              </label>
              <input
                id="qr-mac"
                type="text"
                value={macInput}
                onChange={handleMacChange}
                placeholder="เช่น AA:BB:CC:DD:EE:FF"
                maxLength={17}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "qr-mac-error" : isValidMAC(macInput) ? "qr-mac-ok" : undefined}
                className={`${inputBaseClass} font-mono uppercase tracking-wider ${
                  error
                    ? "border-[var(--tb-danger)] focus:border-[var(--tb-danger)] focus:ring-[var(--tb-danger)]/25"
                    : isValidMAC(macInput)
                      ? "border-[var(--tb-success)] focus:border-[var(--tb-success)] focus:ring-[var(--tb-success)]/25"
                      : "border-[var(--tb-border)] focus:border-[var(--tb-primary)] focus:ring-[var(--tb-primary-ring)]"
                }`}
              />
              {error && (
                <p id="qr-mac-error" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--tb-danger-text)]">
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                  {error}
                </p>
              )}
              {isValidMAC(macInput) && !error && (
                <p id="qr-mac-ok" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--tb-success-text)]">
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  รูปแบบถูกต้อง
                </p>
              )}
            </div>

            {/* Device Label */}
            <div className="min-w-0">
              <label htmlFor="qr-label" className={labelClass}>
                ชื่อ / Label อุปกรณ์ (ไม่บังคับ)
              </label>
              <input
                id="qr-label"
                type="text"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="เช่น ห้อง 101A, ไมค์หัวเตียง"
                className={`${inputBaseClass} border-[var(--tb-border)] focus:border-[var(--tb-primary)] focus:ring-[var(--tb-primary-ring)]`}
              />
            </div>
          </div>

          <div className="flex justify-end mt-5">
            <button
              type="button"
              onClick={generateQR}
              disabled={isGenerating || !macInput}
              className={`${btnPrimary} w-full sm:w-auto`}
            >
              {isGenerating ? (
                <>
                  <span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  กำลังสร้าง...
                </>
              ) : (
                <>
                  <QrIcon className="w-4 h-4" />
                  สร้าง QR Code
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* QR Code Preview */}
      {qrDataUrl && (
        <section aria-labelledby="qr-preview-title" className={`${cardClass} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
          <div className={cardHeaderClass}>
            <span aria-hidden="true" className={`${headerIconClass} bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <h2 id="qr-preview-title" className="text-base font-semibold text-[var(--tb-text)]">
              ตัวอย่าง QR Code
            </h2>
          </div>

          <div className="flex flex-col items-center gap-5 p-5 sm:p-6">
            {/* พื้นขาวเสมอ (แม้โหมดมืด) — รูป QR วาดสีเข้มบนพื้นขาว สแกนได้ทุกธีม */}
            <div className="rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-white p-4 shadow-[var(--tb-shadow-xs)]">
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-56 h-56 md:w-64 md:h-64"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="text-center min-w-0 w-full">
              <p className="font-mono text-lg sm:text-xl font-bold text-[var(--tb-text)] tracking-widest break-all">
                {macInput}
              </p>
              {deviceLabel && (
                <p className="mt-1 text-sm text-[var(--tb-muted)] break-words">
                  {deviceLabel}
                </p>
              )}
              <p className="mt-2 mx-auto max-w-xs text-xs text-[var(--tb-muted)] break-all">
                {getAppUrl()}/register-patient?mac={macInput}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button type="button" onClick={handleDownload} className={`${btnPrimary} w-full sm:w-auto`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
                ดาวน์โหลด PNG
              </button>
              <button type="button" onClick={handlePrint} className={`${btnSecondary} w-full sm:w-auto`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
                  <rect x="6" y="14" width="12" height="8" rx="1" />
                </svg>
                พิมพ์ QR Code
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// TAB 2: Register Device Form Component (REPLACED)
// ============================================================
function RegisterDeviceTab({ scannedMAC }: { scannedMAC: string }) {
  const [formData, setFormData] = useState({
    macAddress: scannedMAC,
    ipAddress: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync MAC Address ถ้า scannedMAC เปลี่ยน (เมื่อเปิดมาจากลิงก์ QR)
  useEffect(() => {
    if (scannedMAC) {
      setFormData((prev) => ({ ...prev, macAddress: scannedMAC }));
    }
  }, [scannedMAC]);

  const formatMAC = (value: string) => {
    const cleaned = value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    const parts = cleaned.match(/.{1,2}/g) || [];
    return parts.slice(0, 6).join(":");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // ดักการพิมพ์ MAC Address และบังคับจัดฟอร์แมตใส่ : อัตโนมัติ
    if (e.target.name === "macAddress") {
      value = formatMAC(value);
    }

    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // ดึง Token ด้วยวิธีเดียวกับหน้าอื่นๆ
      const getAuthToken = () => {
        if (typeof window === "undefined") return "";
        const fromStorage = localStorage.getItem("token");
        if (fromStorage) return fromStorage;
        const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
      };

      const token = getAuthToken();

      // ยิงไปที่ API สำหรับบันทึกบอร์ดใหม่
      // หมายเหตุ: ต้องแน่ใจว่าฝั่ง Go มี Route รับข้อมูลนี้ (เช่น POST /api/devices)
      const res = await fetch(`${API_BASE_URL}/api/devices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          mac_address: formData.macAddress,
          ip_address: formData.ipAddress,
          status: "offline", // ค่าเริ่มต้น
          is_verified: true, // บังคับตั้งค่าให้ Verify เลยตามที่รีเควส
          is_active: false, // บังคับตั้งค่าให้ยังไม่ทำงานตามที่รีเควส
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert("ลงทะเบียนบอร์ดสำเร็จ!");
        setFormData({
          macAddress: scannedMAC, // คง MAC ไว้ถ้าสแกนมา
          ipAddress: "",
        });
      } else {
        alert(
          "เกิดข้อผิดพลาด: " + (data.error || "ไม่สามารถลงทะเบียนบอร์ดได้"),
        );
      }
    } catch {
      alert("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Backend ได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <section aria-labelledby="board-form-title" className={cardClass}>
        <div className={cardHeaderClass}>
          <span aria-hidden="true" className={`${headerIconClass} bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]`}>
            <ChipIcon className="w-5 h-5" />
          </span>
          <h2 id="board-form-title" className="text-base font-semibold text-[var(--tb-text)]">
            ข้อมูลลงทะเบียนบอร์ด (ESP32)
          </h2>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {/* MAC Address */}
            <div className="min-w-0">
              <label
                htmlFor={scannedMAC ? undefined : "board-mac"}
                className={labelClass}
              >
                รหัสบอร์ด (MAC Address){" "}
                <span className="text-[var(--tb-danger-text)]" aria-hidden="true">*</span>
              </label>
              {scannedMAC ? (
                <div className="flex min-h-10 w-full flex-wrap items-center justify-between gap-2 rounded-[var(--tb-radius)] border border-[var(--tb-primary)]/40 bg-[var(--tb-primary-tint)] px-3 py-2">
                  <span className="font-mono text-sm font-bold tracking-wider uppercase text-[var(--tb-primary-text)] break-all">
                    {scannedMAC}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--tb-surface)] px-2 py-0.5 text-xs font-semibold text-[var(--tb-primary-text)]">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    สแกนแล้ว
                  </span>
                </div>
              ) : (
                <input
                  id="board-mac"
                  type="text"
                  name="macAddress"
                  value={formData.macAddress}
                  onChange={handleChange}
                  required
                  maxLength={17}
                  placeholder="เช่น AA:BB:CC:DD:EE:FF"
                  className={`${inputBaseClass} border-[var(--tb-border)] focus:border-[var(--tb-primary)] focus:ring-[var(--tb-primary-ring)] uppercase font-mono tracking-wider`}
                />
              )}
            </div>

            {/* IP Address */}
            <div className="min-w-0">
              <label htmlFor="board-ip" className={labelClass}>
                IP Address (ถ้ามี)
              </label>
              <input
                id="board-ip"
                type="text"
                name="ipAddress"
                value={formData.ipAddress}
                onChange={handleChange}
                placeholder="เช่น 192.168.1.10"
                className={`${inputBaseClass} border-[var(--tb-border)] focus:border-[var(--tb-primary)] focus:ring-[var(--tb-primary-ring)] font-mono`}
              />
            </div>
          </div>

          {/* Note Information */}
          <div className="mt-5 flex items-start gap-2.5 rounded-[var(--tb-radius)] border border-[var(--tb-primary)]/25 bg-[var(--tb-primary-tint)] p-3 sm:p-4">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-[var(--tb-primary-text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p className="min-w-0 text-xs sm:text-sm leading-relaxed text-[var(--tb-primary-text)]">
              <strong>หมายเหตุ:</strong>{" "}
              บอร์ดที่ลงทะเบียนผ่านหน้านี้จะถูกตั้งค่า{" "}
              <code className="font-mono font-semibold">is_verified = true</code> และ{" "}
              <code className="font-mono font-semibold">is_active = false</code> โดยอัตโนมัติ
              (รอการผูกกับผู้ป่วยเพื่อเปิดใช้งาน)
            </p>
          </div>
        </div>
      </section>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || (!scannedMAC && !formData.macAddress)}
          className={`${btnPrimary} w-full sm:w-auto h-11 px-5 text-base`}
        >
          {isSubmitting ? (
            <>
              <span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              กำลังบันทึก...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              ลงทะเบียนบอร์ดเข้าระบบ
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Main Page (Tabs Controller) — wrapped in Suspense
// ============================================================
function DevicesPageContent() {
  // หน้านี้เคยไม่มีด่านตรวจสิทธิ์เลย ใครล็อกอินก็พิมพ์ URL เข้ามาได้
  // ตอนนี้ใช้ตัวเดียวกับหน้า admin อื่น
  const { isAdmin, isChecking } = useAdminGuard();

  const searchParams = useSearchParams();
  // ?mac= มาได้ทั้งแบบมีและไม่มี ":" (เช่น AABBCCDDEEFF จากหน้าเว็บของบอร์ด) — จัดเป็น AA:BB:CC:DD:EE:FF
  const scannedMAC = ((searchParams.get("mac") || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase().match(/.{1,2}/g) || [])
    .slice(0, 6)
    .join(":");

  // ถ้ามี ?mac= → เปิด Tab ลงทะเบียนบอร์ด, ถ้าไม่มี → เปิด Tab สร้าง QR
  const [activeTab, setActiveTab] = useState<"qr" | "register">(
    scannedMAC ? "register" : "qr",
  );

  if (isChecking) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
        <p className="text-sm text-[var(--tb-muted)]">
          กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...
        </p>
      </div>
    );
  }

  // ไม่ผ่านด่าน — useAdminGuard สั่ง redirect ไปแล้ว
  if (!isAdmin) return null;

  const tabClass = (active: boolean) =>
    `flex-1 min-w-0 inline-flex items-center justify-center gap-2 h-9 px-3 rounded-[calc(var(--tb-radius)-2px)] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)] ${
      active
        ? "bg-[var(--tb-surface)] text-[var(--tb-primary-text)] shadow-[var(--tb-shadow-xs)] border border-[var(--tb-border)]"
        : "text-[var(--tb-muted)] hover:text-[var(--tb-text)] border border-transparent"
    }`;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="mb-6 min-w-0">
        <p className="text-xs font-semibold text-[var(--tb-muted)]">ผู้ดูแลระบบ</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">
          จัดการอุปกรณ์
        </h1>
        <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
          สร้าง QR Code หรือลงทะเบียนบอร์ด ESP32 ใหม่เข้าระบบ
        </p>
      </div>

      {/* ===== TABS ===== */}
      <div className="mb-6 flex w-full sm:w-fit gap-1 p-1 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
        {/* Tab: QR Code */}
        <button
          type="button"
          id="tab-qr"
          onClick={() => setActiveTab("qr")}
          aria-pressed={activeTab === "qr"}
          className={tabClass(activeTab === "qr")}
        >
          <QrIcon className="w-4 h-4 shrink-0" />
          <span className="truncate">สร้าง QR Code</span>
        </button>

        {/* Tab: ลงทะเบียนบอร์ด */}
        <button
          type="button"
          id="tab-register"
          onClick={() => setActiveTab("register")}
          aria-pressed={activeTab === "register"}
          className={tabClass(activeTab === "register")}
        >
          <ChipIcon className="w-4 h-4 shrink-0" />
          <span className="truncate">ลงทะเบียนบอร์ด</span>
          {scannedMAC && (
            <span className="shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-[var(--tb-success-tint)] text-[var(--tb-success-text)] animate-pulse">
              QR
            </span>
          )}
        </button>
      </div>

      {/* ===== TAB CONTENT ===== */}
      <div>
        {activeTab === "qr" && <QRGeneratorTab />}
        {activeTab === "register" && (
          <RegisterDeviceTab scannedMAC={scannedMAC} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// คลาสและไอคอนที่ใช้ซ้ำ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า patients
// ============================================================
const cardClass =
  "rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]";
const cardHeaderClass =
  "flex items-center gap-3 px-5 py-4 border-b border-[var(--tb-border)]";
const headerIconClass =
  "inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-[var(--tb-radius)]";
const labelClass = "block mb-1.5 text-sm font-semibold text-[var(--tb-text)]";
// สีขอบ/วงโฟกัสใส่แยกตามสถานะของแต่ละช่อง
const inputBaseClass =
  "block w-full h-10 px-3 rounded-[var(--tb-radius)] border bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] placeholder:text-[var(--tb-placeholder)] shadow-[var(--tb-shadow-xs)] transition-colors focus:outline-none focus:ring-4";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

function QrIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <path d="M15 15h2v2h-2z" />
      <path d="M21 15v.01" />
      <path d="M15 21h.01" />
      <path d="M18 18h3v3h-3" />
      <path d="M12 3v3" />
      <path d="M12 9v3h3" />
      <path d="M3 12h6" />
    </svg>
  );
}

function ChipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  );
}

// ============================================================
// Export default
// ============================================================
export default function DeviceRegistrationPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
          <p className="text-sm text-[var(--tb-muted)]">กำลังโหลด...</p>
        </div>
      }
    >
      <DevicesPageContent />
    </Suspense>
  );
}
