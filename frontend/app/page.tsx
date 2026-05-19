"use client";
import React, { useState } from "react";
// 🟢 Import signIn จาก next-auth
import { signIn } from "next-auth/react";
import router from "next/dist/shared/lib/router/router";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
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
    
    // ล้างข้อความแจ้งเตือนเก่าก่อนเริ่มยิง API
    setErrors({ name: "", email: "", password: "", general: "" });
    setSuccessMsg("");

    if (!isLogin) {
      // 📍 กรณี "สมัครสมาชิก" (Register)
      try {
        const response = await fetch("http://localhost:8080/api/register", {
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
      // 📍 กรณี "เข้าสู่ระบบ" (Login)
      try {
        const response = await fetch("http://localhost:8080/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: email, password: password }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          // 🟢 1. เคลียร์ Error สีแดงทิ้งให้หมด เพื่อความชัวร์
          setErrors({ name: "", email: "", password: "", general: "" });
          
          // 🟢 2. โชว์ข้อความสีเขียว
          setSuccessMsg(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับคุณ ${data.user?.name || "ผู้ใช้งาน"}`);
          
          // 🟢 3. ดึงอีเมลชัวร์ๆ (จาก API หรือจากช่องกรอก) แล้วเซฟลงเครื่อง
          const loggedInEmail = data.user?.email || email;
          localStorage.setItem("userEmail", loggedInEmail);
          console.log("✅ ล็อกอินผ่าน เซฟอีเมลลงเครื่องแล้ว:", loggedInEmail);

          // 🟢 4. ย้ายหน้า (ใส่ setTimeout เล็กน้อยเพื่อให้ผู้ใช้เห็นข้อความสีเขียวแว๊บนึง)
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
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <br />
          <h1 style={styles.title}>Guardian AI</h1>
          <p style={styles.subtitle}>
            ระบบจัดการอุปกรณ์และวิเคราะห์เสียงอัจฉริยะ
          </p>
        </div>

        <form onSubmit={handleStandardAuth} style={styles.form}>
          <h2 style={styles.formTitle}>
            {isLogin ? "เข้าสู่ระบบ" : "สร้างบัญชีใหม่"}
          </h2>

          {!isLogin && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>ชื่อผู้ใช้งาน</label>
              <input
                type="text"
                placeholder="กรอกชื่อของคุณ"
                style={styles.input}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && <span style={styles.inlineError}>{errors.name}</span>}
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>อีเมล</label>
            <input
              type="email"
              placeholder="Email"
              style={styles.input}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && <span style={styles.inlineError}>{errors.email}</span>}
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>รหัสผ่าน</label>
            <input
              type="password"
              placeholder="Password"
              style={styles.input}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && <span style={styles.inlineError}>{errors.password}</span>}
          </div>

          {errors.general && <div style={styles.generalError}>{errors.general}</div>}
          {successMsg && <div style={styles.successMessage}>{successMsg}</div>}

          <button type="submit" style={styles.primaryButton}>
            {isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        </form>

        <p style={styles.toggleText}>
          {isLogin ? "ยังไม่มีบัญชีใช่ไหม? " : "มีบัญชีอยู่แล้วใช่ไหม? "}
          <span style={styles.toggleLink} onClick={toggleMode}>
            {isLogin ? "สมัครสมาชิกที่นี่" : "เข้าสู่ระบบที่นี่"}
          </span>
        </p>

        <div style={styles.dividerContainer}>
          <div style={styles.dividerLine}></div>
          <span style={styles.dividerText}>หรือ</span>
          <div style={styles.dividerLine}></div>
        </div>

        {/* 🟢 ปุ่ม Google Login แทนที่ Auth0 */}
        <button 
          type="button" 
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })} 
          style={styles.googleButton}
        >
          <img 
            src="https://www.svgrepo.com/show/475656/google-color.svg" 
            alt="Google Logo" 
            style={styles.googleIcon}
          />
          ดำเนินการต่อด้วย Google
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------
// ส่วนของสไตล์
// --------------------------------------------------------
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    background: "#f0f2f5",
    padding: "20px",
  },
  card: {
    background: "white",
    width: "100%",
    maxWidth: "400px",
    padding: "40px 30px",
    borderRadius: "12px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
    textAlign: "center",
  },
  header: { marginBottom: "30px" },
  title: { margin: "0 0 10px 0", color: "#1a1a1a", fontSize: "28px", fontWeight: "bold" },
  subtitle: { margin: "0", color: "#666", fontSize: "14px" },
  form: { display: "flex", flexDirection: "column", textAlign: "left" },
  formTitle: { fontSize: "18px", marginBottom: "20px", color: "#333" },
  inputGroup: { marginBottom: "15px" },
  label: { display: "block", marginBottom: "5px", fontSize: "14px", color: "#444", fontWeight: "500" },
  input: {
    width: "100%",
    padding: "12px",
    fontSize: "14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color 0.2s",
  },
  inlineError: {
    display: "block",
    color: "#d93025",
    fontSize: "12px",
    marginTop: "6px",
    fontWeight: "500",
  },
  generalError: {
    color: "#d93025",
    fontSize: "14px",
    textAlign: "center",
    marginBottom: "15px",
  },
  successMessage: {
    color: "#188038",
    backgroundColor: "#e6f4ea",
    padding: "10px",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "15px",
    textAlign: "center",
    border: "1px solid #81c995",
  },
  primaryButton: {
    width: "100%",
    padding: "14px",
    marginTop: "5px",
    backgroundColor: "#0070f3",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  toggleText: { marginTop: "20px", fontSize: "14px", color: "#666" },
  toggleLink: { color: "#0070f3", fontWeight: "bold", cursor: "pointer", textDecoration: "underline" },
  dividerContainer: { display: "flex", alignItems: "center", margin: "30px 0" },
  dividerLine: { flex: 1, height: "1px", backgroundColor: "#ddd" },
  dividerText: { padding: "0 15px", color: "#888", fontSize: "14px" },
  
  // 🟢 สไตล์ใหม่สำหรับปุ่ม Google ให้ดูสะอาดตาเข้ากับธีม
  googleButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "12px",
    backgroundColor: "#ffffff",
    color: "#3c4043",
    border: "1px solid #dadce0",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background-color 0.2s",
    boxShadow: "0 1px 2px 0 rgba(60,64,67,0.1)",
  },
  googleIcon: { width: "20px", height: "20px", marginRight: "12px" },
};