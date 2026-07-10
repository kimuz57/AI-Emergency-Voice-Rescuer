import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = [
  "/dashboard",
  "/settings",
  "/patients",
  "/devices",
  "/profile",
  "/history",
  "/admin",
];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { pathname } = request.nextUrl;

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path),
  );

  if (!token && isProtectedPath) {
    return NextResponse.redirect(new URL("/login", request.url));
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
    "/profile/:path*",
    "/history/:path*",
    "/admin/:path*",
  ],
};
