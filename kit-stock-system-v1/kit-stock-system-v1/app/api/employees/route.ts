import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { employees } from "../../../db/schema";
import { getEmployeeUser, hashPin } from "../../employee-auth";

const ROLES = ["admin", "sender", "inspector", "receiver", "viewer"];

async function requireAdmin() {
  const user = await getEmployeeUser();
  if (!user) return { error: Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  if (user.role !== "admin") return { error: Response.json({ error: "เฉพาะ Admin เท่านั้น" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const rows = await getDb().select({ id: employees.id, employeeCode: employees.employeeCode, fullName: employees.fullName, role: employees.role, active: employees.active, lastLoginAt: employees.lastLoginAt, createdAt: employees.createdAt }).from(employees).orderBy(asc(employees.employeeCode));
  return Response.json({ employees: rows });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  try {
    const payload = await request.json() as { employeeCode?: string; fullName?: string; role?: string; pin?: string };
    const employeeCode = payload.employeeCode?.trim().toUpperCase() ?? "";
    const fullName = payload.fullName?.trim() ?? "";
    const role = payload.role ?? "viewer";
    if (!employeeCode || !fullName || !ROLES.includes(role) || !/^\d{6}$/.test(payload.pin ?? "")) return Response.json({ error: "กรุณากรอกข้อมูลให้ครบและใช้ PIN 6 หลัก" }, { status: 400 });
    const exists = await getDb().select({ id: employees.id }).from(employees).where(eq(employees.employeeCode, employeeCode)).limit(1);
    if (exists.length) return Response.json({ error: "รหัสพนักงานนี้มีอยู่แล้ว" }, { status: 409 });
    const secured = await hashPin(payload.pin!);
    const [employee] = await getDb().insert(employees).values({ employeeCode, fullName, role, pinHash: secured.hash, pinSalt: secured.salt }).returning();
    return Response.json({ employee }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "เพิ่มพนักงานไม่สำเร็จ" }, { status: 500 }); }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  try {
    const payload = await request.json() as { id?: number; active?: boolean; pin?: string; role?: string };
    const id = Number(payload.id); if (!id) return Response.json({ error: "ไม่พบบัญชี" }, { status: 400 });
    const changes: { active?: boolean; pinHash?: string; pinSalt?: string; failedAttempts?: number; lockedUntil?: null; role?: string } = {};
    if (typeof payload.active === "boolean") changes.active = payload.active;
    if (payload.role && ROLES.includes(payload.role)) changes.role = payload.role;
    if (payload.pin !== undefined) { if (!/^\d{6}$/.test(payload.pin)) return Response.json({ error: "PIN ต้องเป็นตัวเลข 6 หลัก" }, { status: 400 }); const secured = await hashPin(payload.pin); changes.pinHash = secured.hash; changes.pinSalt = secured.salt; changes.failedAttempts = 0; changes.lockedUntil = null; }
    const [employee] = await getDb().update(employees).set(changes).where(eq(employees.id, id)).returning();
    if (!employee) return Response.json({ error: "ไม่พบบัญชี" }, { status: 404 });
    return Response.json({ employee });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "แก้ไขบัญชีไม่สำเร็จ" }, { status: 500 }); }
}
