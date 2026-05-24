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
      // เปลี่ยนจาก Hard code เป็นการเรียกไปที่ Go Backend
      async authorize(credentials) {
        try {
          const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
          const res = await fetch(`${backendUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials?.email,
              password: credentials?.password,
            }),
          });

          if (res.ok) {
            const user = await res.json();
            return user; // ต้องคืนค่าเป็น Object User (id, name, email)
          }
          return null;
        } catch (error) {
          console.error("Login Credentials Error:", error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  
  secret: process.env.NEXTAUTH_SECRET, 

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        try {
          const imageUrl = user.image || (profile as any)?.picture || "";
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
                  secure: process.env.NODE_ENV === "production", 
                  path: "/",
                  maxAge: 60 * 60 * 24,
                });
              }
            }
            return true;
          }
          return false;
        } catch (error) {
          console.error("Google Auth Error:", error);
          return false;
        }
      }
      return true;
    },
  },
});

export { handler as GET, handler as POST };