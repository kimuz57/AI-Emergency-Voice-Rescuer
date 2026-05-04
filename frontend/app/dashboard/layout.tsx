import Navbar from "@/components/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col bg-background">
      
      {/* 1. ส่วนหัว: เรียกใช้ Navbar Component ที่เราแยกไฟล์ไว้ */}
      <Navbar />

      {/* 2. ส่วนเนื้อหา: ตรงนี้คือที่อยู่ของหน้า page.tsx ของเราครับ */}
      {children}

      {/* 3. ส่วนท้าย (Footer): ใส่ไว้ใน Layout เลย จะได้มีทุกหน้าใน Dashboard */}
      <footer className="py-12 mt-auto border-t border-black/10">
        <div className="max-w-7xl mx-auto px-10 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold">
          <p>© 2024 Guardian AI</p>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">lock</span>
            <p>สภาพแวดล้อมที่เป็นส่วนตัวและปลอดภัย</p>
          </div>
        </div>
      </footer>

    </div>
  );
}