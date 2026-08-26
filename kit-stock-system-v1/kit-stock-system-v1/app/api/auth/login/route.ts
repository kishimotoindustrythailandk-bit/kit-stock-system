import { getRuntimeEnv } from "../../../../runtime/env";
import { SESSION_COOKIE } from "../../../cloudflare-auth";
import { checkLock, clearFailures, DUMMY_PIN_HASH, MAX_FAILED_ATTEMPTS, recordFailure } from "../../../login-throttle";
import { verifyHashedPin } from "../../../pin-security";

type LoginUser = {
  id: number;
  employeeCode: string;
  displayName: string;
  role: string;
  pinHash: string;
  mustChangePin: number;
};

const SESSION_HOURS = 12;

function secureEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function sessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { employeeCode?: string; pin?: string };
    const employeeCode = String(payload.employeeCode ?? "").trim().toUpperCase().slice(0, 40);
    const pin = String(payload.pin ?? "").trim().slice(0, 80);
    if (!employeeCode || !pin) return Response.json({ error: "กรุณากรอกรหัสพนักงานและ PIN" }, { status: 400 });

    const env = getRuntimeEnv();
    if (!env.DB) throw new Error("ไม่พบฐานข้อมูล D1");
    const db = env.DB;

    const lock = await checkLock(db, employeeCode);
    if (lock.locked) {
      return Response.json({
        error: `กรอก PIN ผิดเกิน ${MAX_FAILED_ATTEMPTS} ครั้ง บัญชีนี้ถูกล็อกชั่วคราว กรุณารออีก ${lock.minutesLeft} นาที หรือติดต่อผู้ดูแลระบบ`,
      }, { status: 429 });
    }

    const user = await db.prepare(`
      SELECT id, employee_code AS employeeCode, display_name AS displayName, role,
        pin_hash AS pinHash, must_change_pin AS mustChangePin
      FROM app_users WHERE employee_code = ?1 AND active = 1 LIMIT 1
    `).bind(employeeCode).first<LoginUser>();

    // ตรวจแฮชหลอกเมื่อไม่พบรหัสพนักงาน เพื่อให้เวลาตอบกลับเท่ากับกรณีที่มีบัญชีจริง
    // มิฉะนั้นคนที่ยิงลองจะจับเวลาแยกได้ว่ารหัสพนักงานไหนมีอยู่ในระบบ
    const storedHash = user?.pinHash ?? DUMMY_PIN_HASH;
    const legacyPin = storedHash === "ENV_INITIAL_ADMIN_PIN" ? env.INITIAL_ADMIN_PIN : "";
    const usedInitialPin = !storedHash.startsWith("pbkdf2$");
    const valid = usedInitialPin
      ? Boolean(user && legacyPin && secureEqual(pin, legacyPin))
      : await verifyHashedPin(pin, storedHash) && Boolean(user);

    if (!valid || !user) {
      const remaining = await recordFailure(db, employeeCode);
      return Response.json({
        error: remaining > 0
          ? `รหัสพนักงานหรือ PIN ไม่ถูกต้อง (เหลืออีก ${remaining} ครั้งก่อนถูกล็อก)`
          : "รหัสพนักงานหรือ PIN ไม่ถูกต้อง บัญชีนี้ถูกล็อกชั่วคราว",
      }, { status: 401 });
    }

    await clearFailures(db, employeeCode);

    // บัญชีที่ยัง login ด้วย PIN ตั้งต้นจาก environment variable จะถูกบังคับเปลี่ยน PIN
    // และเก็บเป็น PBKDF2 hash ทันทีในขั้นตอนถัดไป
    const mustChangePin = usedInitialPin || Number(user.mustChangePin) === 1;
    if (usedInitialPin) {
      await db.prepare("UPDATE app_users SET must_change_pin = 1 WHERE id = ?1").bind(user.id).run();
    }

    const id = sessionId();
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    await db.batch([
      db.prepare("INSERT INTO app_sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)")
        .bind(id, user.id, expiresAt.toISOString()),
      // เก็บกวาด session ที่หมดอายุไปพร้อมกัน เดิมไม่มีการล้างเลย ตารางจึงโตไม่หยุด
      db.prepare("DELETE FROM app_sessions WHERE expires_at <= ?1").bind(new Date().toISOString()),
    ]);

    return Response.json({ ok: true, mustChangePin, user: { displayName: user.displayName, role: user.role } }, {
      headers: {
        "set-cookie": `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`,
      },
    });
  } catch (error) {
    // ข้อความ error ดิบจาก D1 มีชื่อตารางและ constraint ติดมาด้วย จึงไม่ส่งกลับหาผู้ใช้
    console.error("login failed", error);
    return Response.json({ error: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
