import { sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";
import { getRuntimeEnv } from "../../../../runtime/env";
import { hashPin } from "../../../employee-auth";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { setupKey?: string; employeeCode?: string; fullName?: string; pin?: string };
    const expectedKey = getRuntimeEnv().SETUP_KEY;
    if (!expectedKey || payload.setupKey !== expectedKey) {
      return Response.json({ error: "Setup Key ไม่ถูกต้อง" }, { status: 403 });
    }
    const db = getDb();
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(employees);
    if (Number(countRow?.count ?? 0) > 0) {
      return Response.json({ error: "ระบบมีผู้ดูแลอยู่แล้ว" }, { status: 409 });
    }
    const employeeCode = payload.employeeCode?.trim().toUpperCase() ?? "";
    const fullName = payload.fullName?.trim() ?? "";
    const pin = payload.pin ?? "";
    if (!employeeCode || !fullName || !/^\d{6}$/.test(pin)) {
      return Response.json({ error: "กรุณากรอกข้อมูลให้ครบและใช้ PIN 6 หลัก" }, { status: 400 });
    }
    const secured = await hashPin(pin);
    await db.insert(employees).values({ employeeCode, fullName, role: "admin", pinHash: secured.hash, pinSalt: secured.salt });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ตั้งค่าระบบไม่สำเร็จ" }, { status: 500 });
  }
}
