import { getRuntimeEnv } from "../../../../runtime/env";
import { getCurrentUser, SESSION_COOKIE } from "../../../cloudflare-auth";
import { writeAuditLog } from "../../../audit-log";

function sessionTokenFrom(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

/**
 * ออกจากระบบต้องเป็น POST เท่านั้น
 *
 * เดิมเส้นทางนี้รับ GET ซึ่งแปลว่าหน้าเว็บใดก็ตามที่ฝัง
 * <img src="https://…/api/auth/logout"> ไว้ จะเตะพนักงานออกจากระบบได้ทันที
 * โดยที่เจ้าตัวไม่รู้ตัว (CSRF) — น่ารำคาญมากถ้าเกิดตอนกำลังสแกนของอยู่หน้างาน
 */
export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  const token = sessionTokenFrom(request);
  if (user) await writeAuditLog(user, {
    module: "security", moduleLabel: "ความปลอดภัย", action: "logout", actionLabel: "ออกจากระบบ",
    entityType: "app_user", entityId: user.id, summary: `ออกจากระบบบัญชี ${user.displayName} (${user.employeeCode})`,
  }, request);
  if (token) {
    await getRuntimeEnv().DB
      ?.prepare("DELETE FROM app_sessions WHERE id = ?1")
      .bind(token)
      .run()
      .catch(() => undefined);
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: "/login",
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}
