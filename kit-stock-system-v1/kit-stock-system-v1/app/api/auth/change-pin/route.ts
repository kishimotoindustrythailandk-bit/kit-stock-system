import { cookies } from "next/headers";
import { getCurrentUser, SESSION_COOKIE } from "../../../cloudflare-auth";
import { hashPin, verifyHashedPin } from "../../../pin-security";
import { getRuntimeEnv } from "../../../../runtime/env";

/**
 * เปลี่ยน PIN ของบัญชีตัวเอง ใช้ได้กับทุก role รวมถึง admin
 *
 * เดิมไม่มีเส้นทางนี้เลย บัญชี admin ถูก seed ด้วยค่า 'ENV_INITIAL_ADMIN_PIN'
 * แล้วเทียบกับ environment variable แบบข้อความล้วน ส่วน PATCH /api/users
 * ก็ปฏิเสธการแก้ไขทุกบัญชีที่ role = admin ทำให้ PIN แอดมินเปลี่ยนไม่ได้เลย
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

    const body = await request.json() as { currentPin?: string; newPin?: string };
    const currentPin = String(body.currentPin ?? "").trim().slice(0, 80);
    const newPin = String(body.newPin ?? "").trim();

    if (!/^\d{6}$/.test(newPin)) return Response.json({ error: "PIN ใหม่ต้องเป็นตัวเลข 6 หลัก" }, { status: 400 });
    if (/^(\d)\1{5}$/.test(newPin)) return Response.json({ error: "PIN ใหม่ต้องไม่ใช่ตัวเลขซ้ำกันทั้ง 6 หลัก" }, { status: 400 });
    if (newPin === "123456" || newPin === "654321") return Response.json({ error: "PIN ใหม่ต้องไม่ใช่ตัวเลขเรียงกัน" }, { status: 400 });
    if (currentPin === newPin) return Response.json({ error: "PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม" }, { status: 400 });

    const env = getRuntimeEnv();
    if (!env.DB) throw new Error("ไม่พบฐานข้อมูล D1");
    const db = env.DB;

    const row = await db.prepare("SELECT pin_hash AS pinHash FROM app_users WHERE id = ?1 LIMIT 1")
      .bind(user.id).first<{ pinHash: string }>();
    if (!row) return Response.json({ error: "ไม่พบบัญชีผู้ใช้งาน" }, { status: 404 });

    const currentValid = row.pinHash.startsWith("pbkdf2$")
      ? await verifyHashedPin(currentPin, row.pinHash)
      : Boolean(env.INITIAL_ADMIN_PIN && currentPin === env.INITIAL_ADMIN_PIN);
    if (!currentValid) return Response.json({ error: "PIN เดิมไม่ถูกต้อง" }, { status: 403 });

    const sessionId = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    const newHash = await hashPin(newPin);

    // แยกเป็นคนละคำสั่งแทน batch เดียว เพื่อให้รู้ว่าพังขั้นไหนถ้ามีปัญหา
    // และเพื่อไม่ให้การเก็บกวาดที่ไม่สำคัญทำให้การเปลี่ยน PIN ทั้งอันล้มเหลว
    await db.prepare("UPDATE app_users SET pin_hash = ?1, must_change_pin = 0 WHERE id = ?2")
      .bind(newHash, user.id).run();

    // ตั้งแต่บรรทัดนี้ลงไปคือการเก็บกวาด PIN ใหม่ถูกบันทึกเรียบร้อยแล้ว
    // ถ้าล้มเหลวก็ไม่ควรบอกผู้ใช้ว่าเปลี่ยนไม่สำเร็จ เพราะมันสำเร็จไปแล้วจริงๆ
    try {
      // เตะ session อื่นของบัญชีนี้ออกทั้งหมด เก็บไว้เฉพาะเครื่องที่กำลังเปลี่ยน PIN
      await db.prepare("DELETE FROM app_sessions WHERE user_id = ?1 AND id <> ?2")
        .bind(user.id, sessionId).run();
    } catch (error) {
      console.error("change-pin: ล้าง session อื่นไม่สำเร็จ", error);
    }
    try {
      await db.prepare("DELETE FROM app_login_attempts WHERE employee_code = ?1")
        .bind(user.employeeCode).run();
    } catch (error) {
      console.error("change-pin: ล้างตัวนับ login ไม่สำเร็จ", error);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("change-pin failed", error);
    // ใส่ข้อความจริงสั้นๆ ต่อท้ายเพื่อให้หน้างานอ่านออกและแจ้งได้ตรงจุด
    // ไม่มีข้อมูลผู้ใช้หรือ PIN อยู่ในข้อความเหล่านี้
    const hint = error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160);
    return Response.json({ error: `เปลี่ยน PIN ไม่สำเร็จ (${hint})` }, { status: 500 });
  }
}
