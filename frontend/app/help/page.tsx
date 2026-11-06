"use client";

import { useState } from "react";
import Link from "next/link";

type Faq = {
  q: string;
  a: React.ReactNode;
};

// ลิงก์ในคำตอบ — สีหลักของธีม Tabler
const faqLink =
  "font-semibold text-[var(--tb-primary-text)] underline-offset-2 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

// เนื้อหาอิงจากระบบจริง ไม่ใช่ข้อความตัวอย่าง — ถ้าพฤติกรรมระบบเปลี่ยน
// ต้องมาแก้ตรงนี้ด้วย
const FAQS: Faq[] = [
  {
    q: "ระบบตรวจจับเสียงขอความช่วยเหลือได้อย่างไร",
    a: (
      <>
        บอร์ด ESP32 ที่ติดตั้งไว้ในห้องผู้ป่วยจะบันทึกเสียงตลอดเวลาและส่งเข้าเซิร์ฟเวอร์
        AI ผ่าน MQTT เมื่อโมเดลตัดสินว่าเป็นเสียงขอความช่วยเหลือ
        ระบบจะบันทึกเหตุการณ์และแจ้งเตือนขึ้นหน้าแดชบอร์ดทันที
        พร้อมส่งแจ้งเตือนเข้า LINE และ Telegram ตามช่องทางที่เปิดไว้
      </>
    ),
  },
  {
    q: "ทำไมแดชบอร์ดขึ้นว่ายังไม่มีผู้ป่วย ทั้งที่ลงทะเบียนไปแล้ว",
    a: (
      <>
        ผู้ป่วยจะปรากฏบนแดชบอร์ดเฉพาะรายที่ผูกกับบัญชีผู้ดูแลของคุณเท่านั้น
        ถ้าคนอื่นเป็นคนลงทะเบียนไว้ คุณจะยังไม่เห็น ให้ตรวจสอบที่หน้า{" "}
        <Link href="/patients" className={faqLink}>
          ข้อมูลผู้ป่วย
        </Link>{" "}
        ว่ามีรายชื่ออยู่หรือไม่
      </>
    ),
  },
  {
    q: "ลงทะเบียนบอร์ดใหม่ต้องทำอย่างไร",
    a: (
      <>
        ผู้ดูแลระบบจะสร้าง QR Code ของบอร์ดจากหน้าลงทะเบียนเพิ่มบอร์ด
        เมื่อสแกน QR จะพาไปหน้าลงทะเบียนผู้ป่วยพร้อมกรอกหมายเลข MAC ให้อัตโนมัติ
        จากนั้นกรอกข้อมูลผู้ป่วยและกดบันทึกเพื่อผูกบอร์ดกับผู้ป่วยรายนั้น
      </>
    ),
  },
  {
    q: "บอร์ดขึ้นสถานะออฟไลน์ ต้องแก้อย่างไร",
    a: (
      <>
        ระบบถือว่าบอร์ดออฟไลน์เมื่อไม่ได้รับสัญญาณติดต่อกันเกิน 10 วินาที
        ให้ตรวจสอบตามลำดับนี้ — ไฟเลี้ยงบอร์ดติดหรือไม่, บอร์ดเชื่อม WiFi
        ได้หรือยัง (ไฟสถานะสีแดง), และเราเตอร์ที่ใช้ยังทำงานปกติหรือไม่
        ถ้าบอร์ดหลุด WiFi ให้กดปุ่มรีเซ็ตค้างเพื่อเข้าโหมดตั้งค่า
        แล้วต่อ WiFi ชื่อ Smartvoice-XXXXXX (XXXXXX คือ 6 ตัวท้ายของ MAC บนบอร์ด) เพื่อตั้งค่าใหม่
      </>
    ),
  },
  {
    q: "กดฟังเสียงแล้วขึ้นว่าโหลดไฟล์เสียงไม่สำเร็จ",
    a: (
      <>
        แปลว่าไฟล์เสียงของเหตุการณ์นั้นหาไม่เจอบนเซิร์ฟเวอร์
        มักเกิดจากไฟล์ถูกลบไปแล้วหรือเซิร์ฟเวอร์กำลังมีปัญหา
        ตัวเหตุการณ์และเวลายังถูกบันทึกไว้ครบ
        กรุณาแจ้งผู้ดูแลระบบพร้อมบอกเวลาที่เกิดเหตุ
      </>
    ),
  },
  {
    q: "จะเปิด-ปิดการแจ้งเตือน LINE หรือ Telegram ได้ที่ไหน",
    a: (
      <>
        ไปที่หน้า{" "}
        <Link
          href="/settings/notifications"
          className={faqLink}
        >
          ตั้งค่าการแจ้งเตือน
        </Link>{" "}
        เชื่อมบัญชีก่อนหนึ่งครั้ง จากนั้นเปิด-ปิดสวิตช์ได้ตามต้องการ
        การปิดสวิตช์ไม่ได้ยกเลิกการเชื่อมบัญชี เปิดกลับได้ทุกเมื่อ
      </>
    ),
  },
  {
    q: "กดรับทราบเหตุการณ์ไปแล้ว ข้อมูลหายไปไหน",
    a: (
      <>
        เหตุการณ์ที่กดรับทราบจะถูกย้ายออกจากแดชบอร์ดเพื่อให้เหลือเฉพาะเหตุที่ยังไม่มีคนดูแล
        แต่ยังดูย้อนหลังได้ทั้งหมดที่หน้า{" "}
        <Link href="/history" className={faqLink}>
          ประวัติและสถิติ
        </Link>
      </>
    ),
  },
  {
    q: "ลืมรหัสผ่านต้องทำอย่างไร",
    a: (
      <>
        กดลิงก์ &quot;ลืมรหัสผ่านใช่ไหม?&quot; ที่หน้าเข้าสู่ระบบ
        ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลที่ลงทะเบียนไว้
        ถ้าไม่พบอีเมลให้ตรวจสอบในกล่องจดหมายขยะด้วย
      </>
    ),
  },
];

export default function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* ---------- หัวหน้า ---------- */}
      <div className="mb-6 min-w-0">
        <p className="text-xs font-semibold text-[var(--tb-muted)]">ช่วยเหลือ</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">ช่วยเหลือ / คำถามที่พบบ่อย</h1>
        <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
          รวมคำถามที่ผู้ดูแลถามบ่อยเกี่ยวกับการใช้งานระบบแจ้งเตือนเหตุฉุกเฉิน
        </p>
      </div>

      {/* ---------- คำถาม (accordion) ---------- */}
      <div className="rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] divide-y divide-[var(--tb-border)] overflow-hidden">
        {FAQS.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={item.q}>
              <button
                type="button"
                id={`faq-q-${i}`}
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
                aria-controls={`faq-a-${i}`}
                className={`w-full flex items-center justify-between gap-4 text-left px-5 py-4 transition-colors hover:bg-[var(--tb-surface-2)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--tb-primary-ring)] ${
                  open ? "bg-[var(--tb-surface-2)]" : ""
                }`}
              >
                <span className="flex items-start gap-3 text-sm font-semibold text-[var(--tb-text)]">
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-[var(--tb-primary-tint)] text-xs font-bold text-[var(--tb-primary-text)]"
                  >
                    Q
                  </span>
                  <span className="pt-0.5">{item.q}</span>
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`w-5 h-5 shrink-0 text-[var(--tb-muted)] transition-transform duration-300 ${
                    open ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {open && (
                <div
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  className="pt-1 pb-5 pr-5 pl-14 text-sm leading-relaxed text-[var(--tb-muted)] bg-[var(--tb-surface-2)]"
                >
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---------- ติดต่อเพิ่มเติม ---------- */}
      <div className="mt-6 rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--tb-radius)] bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--tb-text)]">ยังไม่เจอคำตอบที่ต้องการ?</p>
            <p className="text-sm text-[var(--tb-muted)] mt-0.5">
              ติดต่อผู้ดูแลระบบของหน่วยงาน พร้อมแจ้งเวลาที่เกิดปัญหาและหมายเลขห้อง
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 h-10 px-4 shrink-0 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
        >
          กลับหน้าแดชบอร์ด
        </Link>
      </div>
    </div>
  );
}
