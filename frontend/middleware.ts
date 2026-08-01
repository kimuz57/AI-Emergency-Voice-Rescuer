import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = [
  "/dashboard",
  "/settings",
  "/patients",
  "/devices",
  "/register-patient",
  "/device", // เพิ่มพ่วงหน้าอุปกรณ์ตรงนี้เพื่อให้ระบบป้องกันทำงานร่วมกับ QR Code ได้
  "/profile",
  "/history",
  "/admin",
];

// 🔓 หน้าที่เข้าได้โดยไม่ต้อง Login (สำหรับลิงก์แจ้งเตือนฉุกเฉินจาก LINE / Telegram)
const publicPaths = ["/alert"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { pathname, search } = request.nextUrl;

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path),
  );

  const isPublicPath = publicPaths.some((path) =>
    pathname.startsWith(path),
  );

  if (!token && isProtectedPath && !isPublicPath) {
    // 🟢 ประกอบร่าง Path เดิมกับ Query Search (เช่น ?mac=...) แล้วทำ Encoding
    const originalUrl = pathname + search;
    const callbackUrl = encodeURIComponent(originalUrl);

    // 🟢 ส่งพ่วง callbackUrl ไปยังหน้า Login
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/settings/:path*",
    "/patients/:path*",
    "/devices/:path*",
    "/register-patient/:path*",
    "/device/:path*",
    "/device",
    "/profile/:path*",
    "/history/:path*",
    "/admin/:path*",
    // /alert ไม่ต้องใส่ใน matcher เพราะเป็น Public Path — ให้เข้าได้เสมอ
  ],
};