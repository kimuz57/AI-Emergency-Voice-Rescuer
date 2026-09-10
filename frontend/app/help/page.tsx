"use client";

import { useState } from "react";
import Link from "next/link";

type Faq = {
  q: string;
  a: React.ReactNode;
};

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
        <Link href="/patients" className="neu-text-accent font-semibold">
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
        แล้วต่อ WiFi ชื่อ SmartVoice_AP เพื่อตั้งค่าใหม่
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
          className="neu-text-accent font-semibold"
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
        <Link href="/history" className="neu-text-accent font-semibold">
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
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold neu-text">ช่วยเหลือ / คำถามที่พบบ่อย</h1>
        <p className="text-sm neu-text-muted mt-1">
          รวมคำถามที่ผู้ดูแลถามบ่อยเกี่ยวกับการใช้งานระบบแจ้งเตือนเหตุฉุกเฉิน
        </p>
      </div>

      <div className="space-y-3">
        {FAQS.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={item.q} className={open ? "neu-inset p-1" : "neu-card p-1"}>
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
              >
                <span className="text-sm font-semibold neu-text">
                  <span className="neu-text-accent mr-2">Q:</span>
                  {item.q}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`w-5 h-5 shrink-0 neu-text-muted transition-transform duration-300 ${
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
                <div className="px-5 pb-5 -mt-1 text-sm leading-relaxed neu-text-muted">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="neu-card p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <p className="text-sm font-semibold neu-text">ยังไม่เจอคำตอบที่ต้องการ?</p>
          <p className="text-xs neu-text-muted mt-0.5">
            ติดต่อผู้ดูแลระบบของหน่วยงาน พร้อมแจ้งเวลาที่เกิดปัญหาและหมายเลขห้อง
          </p>
        </div>
        <Link href="/dashboard" className="neu-btn px-5 py-2.5 text-sm font-medium">
          กลับหน้าแดชบอร์ด
        </Link>
      </div>
    </div>
  );
}
