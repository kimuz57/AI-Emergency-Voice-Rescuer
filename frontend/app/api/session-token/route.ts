import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({ token: "" }));

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: "token",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 3,
  });

  return response;
}