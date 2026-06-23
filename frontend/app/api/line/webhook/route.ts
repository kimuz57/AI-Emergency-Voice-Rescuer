// app/api/line/webhook/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 1. อ่านข้อมูลที่ LINE ส่งมา (เผื่อนำไปใช้ประมวลผลต่อ)
    const body = await req.json();
    console.log("LINE Webhook Data:", body);

    // 2. ตอบกลับ LINE ทันทีด้วย Status 200 (สำคัญมาก บอทจะผ่านการ Verify เพราะบรรทัดนี้)
    return NextResponse.json({ message: "OK" }, { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ error: "Invalid Request" }, { status: 400 });
  }
}