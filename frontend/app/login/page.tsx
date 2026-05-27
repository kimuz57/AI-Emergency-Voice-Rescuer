"use client";
import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  
  // States สำหรับเก็บข้อมูลฟอร์ม
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState({
    name: "",
    email: "",
    password: "",
    general: "",
  });
  const [successMsg, setSuccessMsg] = useState("");

  const handleStandardAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setErrors({ name: "", email: "", password: "", general: "" });
    setSuccessMsg("");

    if (!isLogin) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name,
            email: email,
            password: password,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          setSuccessMsg("สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ");
          setIsLogin(true);
          setName("");
          setEmail("");
          setPassword("");
        } else {
          if (response.status === 409 || (data.error && data.error.toLowerCase().includes("email"))) {
            setErrors((prev) => ({
              ...prev,
              email: "มีอีเมลนี้ในระบบแล้ว กรุณาเข้าสู่ระบบ",
            }));
          } else {
            setErrors((prev) => ({
              ...prev,
              general: "เกิดข้อผิดพลาดในการสมัครสมาชิก",
            }));
          }
        }
      } catch (error) {
        console.error("Error:", error);
        setErrors((prev) => ({
          ...prev,
          general: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์",
        }));
      }
    } else {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: email, password: password }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          setErrors({ name: "", email: "", password: "", general: "" });
          setSuccessMsg(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับคุณ ${data.user?.name || "ผู้ใช้งาน"}`);
          
          const loggedInEmail = data.user?.email || email;
          localStorage.setItem("userEmail", loggedInEmail);
          
          setTimeout(() => {
             router.push("/dashboard");
          }, 500);

        } else {
          setErrors((prev) => ({
            ...prev,
            password: data.error || "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
          }));
        }
      } catch (error) {
        console.error("Error:", error);
        setErrors((prev) => ({
          ...prev,
          general: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์",
        }));
      }
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setErrors({ name: "", email: "", password: "", general: "" });
    setSuccessMsg("");
  };

  return (
    <div className="relative min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8 overflow-hidden font-sans">
      
      {/* 🌟 Background Glowing Orbs (เพิ่ม pointer-events-none เพื่อไม่ให้บังการกดปุ่ม) */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-pulse pointer-events-none" style={{ animationDelay: '2s' }}></div>

      {/* 📦 Main Container (เพิ่ม z-10 เพื่อยกระดับให้เหนือพื้นหลัง) */}
      <div className="relative z-10 w-full max-w-[900px] min-h-[600px] bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/50">
        
        {/* ========================================== */}
        {/* 🟢 1. SIGN UP FORM */}
        {/* ========================================== */}
        <div className={`absolute top-0 left-0 w-full md:w-1/2 h-full transition-all duration-700 ease-in-out flex flex-col justify-center px-8 md:px-12 py-8 overflow-y-auto
          ${isLogin ? 'opacity-0 z-10 md:translate-x-0 hidden md:flex' : 'opacity-100 z-20 md:translate-x-full flex'}`}>
          
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Guardian AI</h1>
            <h2 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">สร้างบัญชีใหม่</h2>
          </div>

          {errors.general && <div className="mb-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center font-medium">{errors.general}</div>}
          {successMsg && <div className="mb-3 p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 text-center font-medium">{successMsg}</div>}

          <form onSubmit={handleStandardAuth} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 ml-1">ชื่อผู้ใช้งาน</label>
              <input type="text" placeholder="กรอกชื่อของคุณ" required value={name} onChange={(e) => setName(e.target.value)} 
                className="w-full px-4 py-3 mt-1 rounded-xl bg-slate-100/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm" />
              {errors.name && <span className="text-red-500 text-xs ml-1 mt-1 block">{errors.name}</span>}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 ml-1">อีเมล</label>
              <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 mt-1 rounded-xl bg-slate-100/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm" />
              {errors.email && <span className="text-red-500 text-xs ml-1 mt-1 block">{errors.email}</span>}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 ml-1">รหัสผ่าน</label>
              <input type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 mt-1 rounded-xl bg-slate-100/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm" />
              {errors.password && <span className="text-red-500 text-xs ml-1 mt-1 block">{errors.password}</span>}
            </div>
            
            <button type="submit" className="w-full py-3 mt-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-purple-500/30 transition-all hover:-translate-y-0.5">
              สมัครสมาชิก
            </button>
          </form>

          <div className="flex items-center my-4">
            <hr className="flex-grow border-slate-200" />
            <span className="px-3 text-slate-400 text-xs">หรือ</span>
            <hr className="flex-grow border-slate-200" />
          </div>
          <button type="button" onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all font-semibold shadow-sm text-sm">
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google Logo" className="w-5 h-5" />
            ดำเนินการต่อด้วย Google
          </button>

          <p className="md:hidden text-center mt-5 text-sm text-slate-500">
            มีบัญชีอยู่แล้วใช่ไหม? <span onClick={toggleMode} className="text-purple-600 font-bold ml-1 cursor-pointer hover:underline">เข้าสู่ระบบที่นี่</span>
          </p>
        </div>

        {/* ========================================== */}
        {/* 🔵 2. SIGN IN FORM */}
        {/* ========================================== */}
        <div className={`absolute top-0 left-0 w-full md:w-1/2 h-full transition-all duration-700 ease-in-out flex flex-col justify-center px-8 md:px-12 py-8 overflow-y-auto
          ${isLogin ? 'opacity-100 z-20 md:translate-x-0 flex' : 'opacity-0 z-10 md:translate-x-full hidden md:flex'}`}>
          
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Guardian AI</h1>
            <h2 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">เข้าสู่ระบบ</h2>
          </div>

          {errors.general && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center font-medium">{errors.general}</div>}
          {successMsg && <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 text-center font-medium">{successMsg}</div>}

          <form onSubmit={handleStandardAuth} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 ml-1">อีเมล</label>
              <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 mt-1 rounded-xl bg-slate-100/50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
              {errors.email && <span className="text-red-500 text-xs ml-1 mt-1 block">{errors.email}</span>}
            </div>

            <div>
              <div className="flex justify-between items-center ml-1 mb-1">
                <label className="text-xs font-semibold text-slate-600">รหัสผ่าน</label>
              </div>
              <input type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-100/50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm" />
              {errors.password && <span className="text-red-500 text-xs ml-1 mt-1 block">{errors.password}</span>}
            </div>
            
            <button type="submit" className="w-full py-3 mt-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-blue-500/30 transition-all hover:-translate-y-0.5">
              เข้าสู่ระบบ
            </button>
          </form>

          <div className="flex items-center my-5">
            <hr className="flex-grow border-slate-200" />
            <span className="px-3 text-slate-400 text-xs">หรือ</span>
            <hr className="flex-grow border-slate-200" />
          </div>
          <button type="button" onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all font-semibold shadow-sm text-sm">
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google Logo" className="w-5 h-5" />
            ดำเนินการต่อด้วย Google
          </button>

          <p className="md:hidden text-center mt-6 text-sm text-slate-500">
            ยังไม่มีบัญชีใช่ไหม? <span onClick={toggleMode} className="text-blue-600 font-bold ml-1 cursor-pointer hover:underline">สมัครสมาชิกที่นี่</span>
          </p>
        </div>

        {/* ========================================== */}
        {/* ✨ 3. SLIDING OVERLAY PANEL (Desktop Only) */}
        {/* ========================================== */}
        <div className={`hidden md:block absolute top-0 left-1/2 w-1/2 h-full overflow-hidden transition-transform duration-700 ease-in-out z-50 
          ${isLogin ? 'translate-x-0' : '-translate-x-full'}`}>
          
          <div className={`relative -left-full w-[200%] h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white transition-transform duration-700 ease-in-out 
            ${isLogin ? 'translate-x-0' : 'translate-x-1/2'}`}>
            
            {/* ⬅️ Overlay ฝั่งซ้าย (คลิกเพื่อกลับไปเข้าสู่ระบบ) */}
            <div className={`absolute top-0 left-0 w-1/2 h-full flex flex-col justify-center items-center px-12 text-center transition-transform duration-700 ease-in-out 
              ${isLogin ? '-translate-x-[20%]' : 'translate-x-0'}`}>
              <h2 className="text-4xl font-extrabold mb-4 drop-shadow-md">Welcome Back!</h2>
              <p className="mb-8 text-indigo-100">มีบัญชีอยู่แล้วใช่ไหม? <br/>เข้าสู่ระบบเพื่อเฝ้าระวังคนที่คุณรักต่อได้เลย</p>
              
              {/* เปลี่ยนเป็น type="button" เผื่อความชัวร์ */}
              <button type="button" onClick={toggleMode} className="relative z-50 px-10 py-3 rounded-full border-2 border-white/50 hover:bg-white hover:text-indigo-600 transition-all font-bold tracking-wide">
                เข้าสู่ระบบ
              </button>
            </div>

            {/* ➡️ Overlay ฝั่งขวา (คลิกเพื่อไปสมัครสมาชิก) */}
            <div className={`absolute top-0 right-0 w-1/2 h-full flex flex-col justify-center items-center px-12 text-center transition-transform duration-700 ease-in-out 
              ${isLogin ? 'translate-x-0' : 'translate-x-[20%]'}`}>
              <h2 className="text-4xl font-extrabold mb-4 drop-shadow-md">Hello, Guardian!</h2>
              <p className="mb-8 text-indigo-100">เพิ่งเคยเข้ามาครั้งแรกหรือเปล่า? <br/>สมัครสมาชิกเพื่อเริ่มใช้งาน Guardian AI ของเรา</p>
              
              {/* เปลี่ยนเป็น type="button" เผื่อความชัวร์ */}
              <button type="button" onClick={toggleMode} className="relative z-50 px-10 py-3 rounded-full border-2 border-white/50 hover:bg-white hover:text-indigo-600 transition-all font-bold tracking-wide">
                สมัครสมาชิก
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}