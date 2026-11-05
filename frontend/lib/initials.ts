/** ตัวอักษรแรกของชื่อสำหรับวงกลม avatar — ตัดคำนำหน้าออกก่อน ไม่งั้นผู้ป่วยทุกคนได้ "น" จาก นาย/นาง */
export function nameInitial(name: string | null | undefined, fallback = "ผ"): string {
  const firstName = (name || "").trim().replace(/^(นางสาว|นาง|นาย|ด\.ช\.|ด\.ญ\.)\s*/, "");
  return firstName ? firstName.substring(0, 1) : fallback;
}
