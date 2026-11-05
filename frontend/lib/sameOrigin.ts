/**
 * ตรวจว่า request มาจากหน้าเว็บของเราเอง (ใช้กับ route handler ที่ตั้ง/ลบ cookie)
 * กันเว็บอื่นสั่ง POST ข้ามโดเมนมาเปลี่ยน cookie ของผู้ใช้ (login CSRF)
 *
 * เทียบ Origin กับ host ที่เบราว์เซอร์เรียกจริง (X-Forwarded-Host ก่อน เพราะ production อยู่หลัง proxy)
 * ไม่ใช้ request.url เพราะหลัง proxy อาจเป็น http://localhost:3000
 */
export function isSameOrigin(request: Request): boolean {
  const headers = request.headers;

  // เบราว์เซอร์ใหม่ส่ง Sec-Fetch-Site มาเสมอ
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const origin = headers.get("origin");
  if (!origin) {
    // ไม่มี Origin: ยอมเฉพาะเมื่อเบราว์เซอร์ยืนยันแล้วว่าเป็น same-origin
    return fetchSite === "same-origin";
  }

  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  try {
    return host !== "" && new URL(origin).host === host;
  } catch {
    return false;
  }
}
