import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { cookies } from "next/headers";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        params: {
          prompt: "select_account",
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
  
  // 🟢 1. ประกาศ Secret ตรงๆ เพื่อกัน Error บน Production
  secret: process.env.NEXTAUTH_SECRET, 

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        try {
          const imageUrl = user.image || (profile as any)?.picture || "";
          console.log("🔍 URL รูปที่หาได้:", imageUrl);
          
          const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
          const res = await fetch(`${backendUrl}/api/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              profile: imageUrl,
            }),
          });

          if (res.ok) {
            const setCookieHeader = res.headers.get("set-cookie");
            if (setCookieHeader) {
              const tokenMatch = setCookieHeader.match(/token=([^;]+)/);
              if (tokenMatch && tokenMatch[1]) {
                const tokenValue = tokenMatch[1];
                const cookieStore = await cookies();
                
                cookieStore.set({
                  name: "token",
                  value: tokenValue,
                  httpOnly: true,
                  // 🟢 2. เปิดโหมด Secure เมื่อรันบนเซิร์ฟเวอร์จริง (HTTPS)
                  secure: process.env.NODE_ENV === "production", 
                  path: "/",
                  maxAge: 60 * 60 * 24,
                });
              }
            }
            return true;
          } else {
            const errorDetails = await res.text();
            console.error(
              "Go Backend ปฏิเสธการเข้าสู่ระบบ สาเหตุคือ:",
              res.status,
              errorDetails,
            );
            return false;
          }
        } catch (error) {
          console.error("เชื่อมต่อ Go Backend ไม่ได้:", error);
          return false;
        }
      }
      return true;
    },
  },
});

export { handler as GET, handler as POST };