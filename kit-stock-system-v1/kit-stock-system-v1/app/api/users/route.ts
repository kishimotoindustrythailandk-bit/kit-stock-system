import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "../../cloudflare-auth";
import { hashPin } from "../../pin-security";
import { getDb } from "../../../db";
import { appSessions, appUsers } from "../../../db/schema";

const ROLES = new Set(["dispatcher", "inspector"]);

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  if (user.role !== "admin") return { error: Response.json({ error: "เฉพาะ Admin เท่านั้นที่จัดการผู้ใช้งานได้" }, { status: 403 }) };
  return { user };
}

function cleanCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function validate(code: string, name: string, role: string, pin?: string) {
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return "รหัสพนักงานต้องมี 3–30 ตัว ใช้ A-Z, 0-9, _ หรือ -";
  if (name.length < 2 || name.length > 80) return "กรุณาระบุชื่อผู้ใช้งาน 2–80 ตัวอักษร";
  if (!ROLES.has(role)) return "กรุณาเลือกบทบาทผู้จัดงานหรือผู้ตรวจงาน";
  if (pin !== undefined && !/^\d{6}$/.test(pin)) return "PIN ต้องเป็นตัวเลข 6 หลัก";
  return "";
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const users = await getDb().select({
    id: appUsers.id, employeeCode: appUsers.employeeCode, displayName: appUsers.displayName,
    email: appUsers.email, role: appUsers.role, active: appUsers.active, createdAt: appUsers.createdAt,
  }).from(appUsers).orderBy(desc(appUsers.id));
  return Response.json({ users });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    const employeeCode = cleanCode(body.employeeCode);
    const displayName = String(body.displayName ?? "").trim();
    const email = String(body.email ?? "").trim().slice(0, 120);
    const role = String(body.role ?? "");
    const pin = String(body.pin ?? "").trim();
    const invalid = validate(employeeCode, displayName, role, pin);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    const [created] = await getDb().insert(appUsers).values({ employeeCode, displayName, email, role, pinHash: await hashPin(pin), active: true }).returning({
      id: appUsers.id, employeeCode: appUsers.employeeCode, displayName: appUsers.displayName, email: appUsers.email, role: appUsers.role, active: appUsers.active,
    });
    return Response.json({ user: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เพิ่มผู้ใช้งานไม่สำเร็จ";
    return Response.json({ error: message.includes("UNIQUE") ? "รหัสพนักงานนี้มีในระบบแล้ว" : message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 400 });
    const [target] = await getDb().select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
    if (!target) return Response.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
    if (target.role === "admin") return Response.json({ error: "ไม่อนุญาตให้แก้ไขบัญชี Admin จากหน้านี้" }, { status: 400 });
    const employeeCode = cleanCode(body.employeeCode ?? target.employeeCode);
    const displayName = String(body.displayName ?? target.displayName).trim();
    const email = String(body.email ?? target.email).trim().slice(0, 120);
    const role = String(body.role ?? target.role);
    const pin = body.pin ? String(body.pin).trim() : undefined;
    const invalid = validate(employeeCode, displayName, role, pin);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    const values: { employeeCode: string; displayName: string; email: string; role: string; active: boolean; pinHash?: string } = {
      employeeCode, displayName, email, role, active: body.active === undefined ? target.active : Boolean(body.active),
    };
    if (pin) values.pinHash = await hashPin(pin);
    const [updated] = await getDb().update(appUsers).set(values).where(eq(appUsers.id, id)).returning({
      id: appUsers.id, employeeCode: appUsers.employeeCode, displayName: appUsers.displayName, email: appUsers.email, role: appUsers.role, active: appUsers.active,
    });
    if (!updated.active) await getDb().delete(appSessions).where(eq(appSessions.userId, id));
    return Response.json({ user: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึกผู้ใช้งานไม่สำเร็จ";
    return Response.json({ error: message.includes("UNIQUE") ? "รหัสพนักงานนี้มีในระบบแล้ว" : message }, { status: 400 });
  }
}
