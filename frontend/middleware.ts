import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 🟢 ลิสต์รายชื่อโฟลเดอร์ที่ต้อง Login ก่อนถึงจะเข้าได้ (เพิ่มตรงนี้ได้เรื่อยๆ ในอนาคต)
const protectedPaths = ["/dashboard", "/settings", "/patients"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { pathname } = request.nextUrl;

  // 1. ถ้ามี Token แล้ว แต่พยายามเข้าหน้าแรก (Login) ให้เตะไป Dashboard
  if (token && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. เช็คว่าหน้าที่กำลังจะเข้า อยู่ในหมวดหมู่ที่ต้องป้องกันหรือไม่
  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path),
  );

  // 3. ถ้าหน้าที่เข้าเป็นหน้า Protected แต่ "ไม่มี" Token ให้เตะกลับไปหน้าแรก
  if (!token && isProtectedPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/settings/:path*",
    "/patients/:path*", // ตอนนี้มันจะทำงานสอดคล้องกับเงื่อนไขข้างบนแล้วครับ
  ],
};
