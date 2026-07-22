import { getRuntimeEnv } from "../../../../runtime/env";
import { SESSION_COOKIE } from "../../../cloudflare-auth";

type LoginUser = {
  id: number;
  employeeCode: string;
  displayName: string;
  role: string;
  pinHash: string;
};

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
    const user = await env.DB.prepare(`
      SELECT id, employee_code AS employeeCode, display_name AS displayName, role, pin_hash AS pinHash
      FROM app_users WHERE employee_code = ?1 AND active = 1 LIMIT 1
    `).bind(employeeCode).first<LoginUser>();
    if (!user) return Response.json({ error: "รหัสพนักงานหรือ PIN ไม่ถูกต้อง" }, { status: 401 });
    const expectedPin = user.pinHash === "ENV_INITIAL_ADMIN_PIN" ? env.INITIAL_ADMIN_PIN : "";
    if (!expectedPin || !secureEqual(pin, expectedPin)) {
      return Response.json({ error: "รหัสพนักงานหรือ PIN ไม่ถูกต้อง" }, { status: 401 });
    }
    const id = sessionId();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await env.DB.prepare("INSERT INTO app_sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)")
      .bind(id, user.id, expiresAt.toISOString()).run();
    return Response.json({ ok: true, user: { displayName: user.displayName, role: user.role } }, {
      headers: { "set-cookie": `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200` },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ" }, { status: 500 });
  }
}
