import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../../../../db";
import { employees, employeeSessions } from "../../../../db/schema";
import { createSessionToken, SESSION_COOKIE, SESSION_SECONDS, sha256, verifyPin } from "../../../employee-auth";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { employeeCode?: string; pin?: string; remember?: boolean };
    const employeeCode = payload.employeeCode?.trim().toUpperCase() ?? "";
    const pin = payload.pin ?? "";
    if (!employeeCode || !/^\d{6}$/.test(pin)) {
      return Response.json({ error: "กรุณากรอกรหัสพนักงานและ PIN 6 หลัก" }, { status: 400 });
    }

    const db = getDb();
    const [employee] = await db.select().from(employees).where(eq(employees.employeeCode, employeeCode)).limit(1);
    if (!employee || !employee.active) {
      await delay();
      return Response.json({ error: "รหัสพนักงานหรือ PIN ไม่ถูกต้อง" }, { status: 401 });
    }
    if (employee.lockedUntil && new Date(employee.lockedUntil).getTime() > Date.now()) {
      return Response.json({ error: "บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลังหรือติดต่อ Admin" }, { status: 423 });
    }

    const valid = await verifyPin(pin, employee.pinHash, employee.pinSalt);
    if (!valid) {
      const attempts = employee.failedAttempts + 1;
      const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : null;
      await db.update(employees).set({ failedAttempts: attempts >= MAX_FAILED_ATTEMPTS ? 0 : attempts, lockedUntil }).where(eq(employees.id, employee.id));
      return Response.json({ error: lockedUntil ? "ใส่ PIN ผิดครบ 5 ครั้ง บัญชีถูกล็อก 15 นาที" : "รหัสพนักงานหรือ PIN ไม่ถูกต้อง" }, { status: 401 });
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
    await db.batch([
      db.update(employees).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: sql`CURRENT_TIMESTAMP` }).where(eq(employees.id, employee.id)),
      db.insert(employeeSessions).values({ sessionHash: await sha256(token), employeeId: employee.id, expiresAt }),
    ]);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: payload.remember ? SESSION_SECONDS : undefined,
    });
    return Response.json({ ok: true, user: { employeeCode, fullName: employee.fullName, role: employee.role } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ" }, { status: 500 });
  }
}

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 250));
}
