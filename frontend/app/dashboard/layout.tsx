import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-transparent transition-colors duration-300 pt-[76px]">
      <Navbar />
      <main className="w-full flex-1">{children}</main>
      <Footer />
    </div>
  );
}
