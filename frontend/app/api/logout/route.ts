import { NextResponse } from "next/server";

export async function POST() {
  // 1. สร้างแพ็กเกจ Response เตรียมไว้ก่อน
  const response = NextResponse.json({ message: "ลบคุกกี้สำเร็จ!" }, { status: 200 });

  // 2. 🌟 สั่ง Set/Delete คุกกี้ผ่านตัวแปร response แทน
  response.cookies.set({
    name: "token",
    value: "",
    maxAge: 0,
    path: "/",
  });
  
  // (หรือจะใช้คำสั่ง response.cookies.delete("token") ตรงๆ เลยก็ได้เหมือนกันครับบน NextResponse)

  // 3. ส่งกลับไปหาเบราว์เซอร์
  return response;
}