import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { cookies } from "next/headers"; // 🟢 1. Import ตัวจัดการ Cookie ของ Next.js

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,

      // 🟢 เพิ่มบล็อก authorization ตรงนี้เข้าไปครับ
      authorization: {
        params: {
          prompt: "select_account", // คำสั่งนี้คือตัวบังคับให้เด้งหน้าเลือกบัญชีทุกครั้ง
        },
      },
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // (ส่วนนี้ไว้เชื่อม API Login ปกติในอนาคต ตอนนี้ปล่อยไว้ก่อนได้ครับ)
        if (
          credentials?.email === "admin@test.com" &&
          credentials?.password === "1234"
        ) {
          return { id: "1", name: "Admin", email: "admin@test.com" };
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/",
  },

  // 🟢 2. เพิ่มส่วน Callbacks เพื่อเป็นสะพานเชื่อมไปหา Go Backend
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        try {
          // 🟢 2. ดึงรูปจาก profile ของ google โดยตรง (ชัวร์สุด)
          const imageUrl = user.image || (profile as any)?.picture || "";
          
          // 🟢 3. แอบปริ้นท์ดูว่าตกลงได้ URL รูปมาไหม?
          console.log("🔍 URL รูปที่หาได้:", imageUrl);

          const res = await fetch("http://localhost:8080/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              profile: imageUrl, // 🟢 4. ส่ง imageUrl ไปแทน
            }),
          });

          if (res.ok) {
            // 2.2 ล้วงเอา Cookie ที่ Go สร้างให้ (จาก Header ที่ Go ส่งกลับมา)
            const setCookieHeader = res.headers.get("set-cookie");
            if (setCookieHeader) {
              // ตัดเอาเฉพาะค่ารหัส token ออกมา
              const tokenMatch = setCookieHeader.match(/token=([^;]+)/);
              if (tokenMatch && tokenMatch[1]) {
                const tokenValue = tokenMatch[1];

                // 2.3 เอา Token มายัดใส่ Cookie ของเบราว์เซอร์ผู้ใช้ เพื่อให้ Middleware ยอมให้ผ่าน!
                const cookieStore = await cookies(); // 🟢 เพิ่ม await ตรงนี้
                cookieStore.set({
                  name: "token",
                  value: tokenValue,
                  httpOnly: true,
                  path: "/",
                  maxAge: 60 * 60 * 24, // อายุ 24 ชั่วโมง
                });
              }
            }
            return true; // ✅ อนุมัติให้ล็อกอินผ่าน!
          } else {
            const errorDetails = await res.text();
            console.error(
              "Go Backend ปฏิเสธการเข้าสู่ระบบ สาเหตุคือ:",
              res.status,
              errorDetails,
            );
            return false; // ❌ ปฏิเสธการเข้าสู่ระบบถ้า Go Backend ไม่โอเค
          }
        } catch (error) {
          console.error("เชื่อมต่อ Go Backend ไม่ได้:", error);
          return false;
        }
      }
      
      return true; // สำหรับ Provider อื่นๆ (เช่น กรอกอีเมล/รหัส) ให้ผ่านปกติ
      
    },
  },
});

export { handler as GET, handler as POST };
