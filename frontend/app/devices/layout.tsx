import Navbar from "@/components/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col bg-slate-50">
      
      {/* 1. แสดงแถบเมนูด้านบน */}
      <Navbar />

      {/* 🔴 2. ตรงนี้แหละครับคือการใส่ {children} เพื่อเปิดพื้นที่ให้ไฟล์ page.tsx เข้ามาแสดงผลตรงกลาง */}
      <main className="flex-1 w-full">
        {children}
      </main>

      {/* 3. ส่วนท้ายหน้าเว็บ (Footer) */}
      <footer className="py-8 mt-auto border-t border-gray-200 bg-white dark:bg-slate-800 ">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold">
          <p>© 2026 Emergency Voice Rescuer</p>
          <div className="flex items-center gap-2">
            <span className="text-sm">🔒</span>
            <p>สภาพแวดล้อมที่เป็นส่วนตัวและปลอดภัย</p>
          </div>
        </div>
      </footer>

    </div>
  );
}