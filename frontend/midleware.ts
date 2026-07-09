import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 🟢 ลิสต์รายชื่อโฟลเดอร์ที่ต้อง Login ก่อนถึงจะเข้าได้
const protectedPaths = ["/dashboard", "/settings", "/patients"];

// 🌟 ต้องชื่อฟังก์ชัน middleware เท่านั้น! Next.js ถึงจะทำงาน
export function middleware(request: NextRequest) {
  // ดึง Token จาก Cookie ที่ Go Backend (หรือ API เรา) เป็นคนสร้างไว้
  const token = request.cookies.get("token")?.value;
  const { pathname } = request.nextUrl;

  // 1. ถ้ามี Token (ล็อกอินแล้ว) แต่พยายามเข้าหน้า Login หรือหน้าแรก 
  // ให้เตะไปหน้า Dashboard เลย (ไม่ต้องล็อกอินซ้ำ)
  if (token && (pathname === "/login" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. เช็คว่าหน้าที่กำลังจะเข้า อยู่ในหมวดหมู่ที่ต้องป้องกันหรือไม่
  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path),
  );

  // 3. ถ้าหน้าที่เข้าเป็นหน้า Protected แต่ "ไม่มี" Token 
  // ให้เตะกลับไปหน้าแรก (หน้าล็อกอิน)
  if (!token && isProtectedPath) {
    return NextResponse.redirect(new URL("/", request.url)); 
    // 💡 (ถ้าหน้าล็อกอินของคุณคือ /login ก็เปลี่ยนเป็น "/login" ได้เลยครับ)
  }

  // ถ้าเงื่อนไขปกติ (มีบัตรเข้าถูกหน้า หรือเข้าหน้าทั่วไป) ให้ผ่านได้!
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/settings/:path*",
    "/patients/:path*", 
  ],
};