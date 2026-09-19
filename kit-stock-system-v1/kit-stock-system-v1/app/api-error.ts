// ตัวช่วยกลางสำหรับ catch ของ API route:
// - log error จริงไว้ที่ Workers Logs (ผ่าน console.error ในตัว route)
// - คืนข้อความที่ "ปลอดภัย" ให้ผู้ใช้: ยังคงข้อความที่ระบบตั้งใจโยนเอง (ภาษาไทย เช่น
//   QR ผิดรูปแบบ) แต่ซ่อนข้อความจาก D1/SQLite ที่มีชื่อตาราง/คอลัมน์/constraint ติดมา
export function safeErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  return raw && !/D1_|SQLITE|no such|constraint|syntax error|UNIQUE|NOT NULL/i.test(raw)
    ? raw
    : fallback;
}
