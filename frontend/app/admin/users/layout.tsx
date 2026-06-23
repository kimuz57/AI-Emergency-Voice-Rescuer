import Navbar from "@//components/Navbar";
import Footer from "@//components/Footer";
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* 1. แสดงแถบเมนูด้านบน */}
      <Navbar />

      {/* 🔴 2. ตรงนี้แหละครับคือการใส่ {children} เพื่อเปิดพื้นที่ให้ไฟล์ page.tsx เข้ามาแสดงผลตรงกลาง */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
        {children}
      </main>

      {/* 3. ส่วนท้ายหน้าเว็บ (Footer) */}
      <Footer />

    </div>
  );
}