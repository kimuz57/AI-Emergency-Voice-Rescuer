import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-transparent transition-colors duration-300 pt-[76px] pb-[80px]">
      <Navbar />
      <main className="w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
}
