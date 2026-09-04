import { desc, eq } from "drizzle-orm";
import { defaultPermissions, getCurrentUser, normalizePermissions, PERMISSION_KEYS, PermissionKey } from "../../cloudflare-auth";
import { hashPin } from "../../pin-security";
import { getDb } from "../../../db";
import { appSessions, appUsers } from "../../../db/schema";
import { getRuntimeEnv } from "../../../runtime/env";

const CANONICAL_ROLES = new Set(["production", "stock", "qc", "delivery"]);
const LEGACY_ROLES = new Set(["dispatcher", "inspector"]);

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  if (user.role !== "admin") return { error: Response.json({ error: "เฉพาะ Admin เท่านั้นที่จัดการผู้ใช้งานได้" }, { status: 403 }) };
  return { user };
}

function cleanCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function validate(code: string, name: string, role: string, roleAllowed: boolean, pin?: string) {
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return "รหัสพนักงานต้องมี 3–30 ตัว ใช้ A-Z, 0-9, _ หรือ -";
  if (name.length < 2 || name.length > 80) return "กรุณาระบุชื่อผู้ใช้งาน 2–80 ตัวอักษร";
  if (!roleAllowed) return `กรุณาเลือกบทบาท ${[...CANONICAL_ROLES].map((item) => item === "qc" ? "QC" : item[0].toUpperCase() + item.slice(1)).join(", ")}`;
  if (pin !== undefined && !/^\d{6}$/.test(pin)) return "PIN ต้องเป็นตัวเลข 6 หลัก";
  return "";
}

function permissionsFromBody(value: unknown, role: string): { permissions?: PermissionKey[]; error?: string } {
  if (!Array.isArray(value)) return { error: "กรุณาเลือกสิทธิ์เข้าใช้งานอย่างน้อย 1 หน้า" };
  const permissions = normalizePermissions(value, role);
  if (!permissions.length) return { error: "กรุณาเลือกสิทธิ์เข้าใช้งานอย่างน้อย 1 หน้า" };
  return { permissions };
}

async function permissionMap() {
  const map = new Map<number, PermissionKey[]>();
  const { DB } = getRuntimeEnv();
  if (!DB) return map;
  try {
    const rows = await DB.prepare("SELECT user_id AS userId, permission_key AS permissionKey FROM app_user_permissions ORDER BY id")
      .all<{ userId: number; permissionKey: string }>();
    for (const row of rows.results) {
      const list = map.get(row.userId) || [];
      if ((PERMISSION_KEYS as readonly string[]).includes(row.permissionKey)) list.push(row.permissionKey as PermissionKey);
      map.set(row.userId, list);
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("app_user_permissions")) throw error;
  }
  return map;
}

async function replacePermissions(userId: number, permissions: PermissionKey[]) {
  const { DB } = getRuntimeEnv();
  if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
  try {
    await DB.batch([
      DB.prepare("DELETE FROM app_user_permissions WHERE user_id = ?1").bind(userId),
      ...permissions.map((key) => DB.prepare(
        "INSERT INTO app_user_permissions (user_id, permission_key) VALUES (?1, ?2)",
      ).bind(userId, key)),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("app_user_permissions")) {
      throw new Error("กรุณารันไฟล์ database-upgrade-v2.8.8-user-permissions.sql ใน D1 ก่อนบันทึกสิทธิ์");
    }
    throw error;
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const users = await getDb().select({
    id: appUsers.id, employeeCode: appUsers.employeeCode, displayName: appUsers.displayName,
    email: appUsers.email, role: appUsers.role, active: appUsers.active, createdAt: appUsers.createdAt,
  }).from(appUsers).orderBy(desc(appUsers.id));
  const permissions = await permissionMap();
  return Response.json({
    users: users.map((item) => ({
      ...item,
      permissions: item.role === "admin"
        ? [...PERMISSION_KEYS]
        : permissions.get(item.id)?.length ? normalizePermissions(permissions.get(item.id), item.role) : defaultPermissions(item.role),
    })),
  });
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
    const invalid = validate(employeeCode, displayName, role, CANONICAL_ROLES.has(role), pin);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    const permissionResult = permissionsFromBody(body.permissions, role);
    if (permissionResult.error || !permissionResult.permissions) {
      return Response.json({ error: permissionResult.error }, { status: 400 });
    }
    const permissions = permissionResult.permissions;
    const [created] = await getDb().insert(appUsers).values({ employeeCode, displayName, email, role, pinHash: await hashPin(pin), active: true }).returning({
      id: appUsers.id, employeeCode: appUsers.employeeCode, displayName: appUsers.displayName, email: appUsers.email, role: appUsers.role, active: appUsers.active,
    });
    await replacePermissions(created.id, permissions);
    return Response.json({ user: { ...created, permissions } }, { status: 201 });
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
    const roleUnchanged = role === target.role;
    const roleAllowed = CANONICAL_ROLES.has(role) || (roleUnchanged && LEGACY_ROLES.has(role));
    const invalid = validate(employeeCode, displayName, role, roleAllowed, pin);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });

    let permissions: PermissionKey[] | undefined;
    if (body.permissions !== undefined) {
      const permissionResult = permissionsFromBody(body.permissions, role);
      if (permissionResult.error || !permissionResult.permissions) {
        return Response.json({ error: permissionResult.error }, { status: 400 });
      }
      permissions = permissionResult.permissions;
    } else if (!roleUnchanged) {
      // เปลี่ยนบทบาทโดยไม่ส่ง permission ต้องรักษาสิทธิ์เดิม ไม่ปล่อยให้บัญชี legacy
      // ที่ยังไม่มี rows สูญเสีย role fallback เมื่อถูกย้ายมาใช้บทบาท canonical
      const stored = await permissionMap();
      permissions = stored.get(id)?.length
        ? normalizePermissions(stored.get(id), target.role)
        : defaultPermissions(target.role);
      if (!permissions.length) {
        return Response.json({ error: "กรุณาเลือกสิทธิ์เข้าใช้งานอย่างน้อย 1 หน้าเมื่อเปลี่ยนบทบาท" }, { status: 400 });
      }
    }

    const values: { employeeCode: string; displayName: string; email: string; role: string; active: boolean; pinHash?: string } = {
      employeeCode, displayName, email, role, active: body.active === undefined ? target.active : Boolean(body.active),
    };
    if (pin) values.pinHash = await hashPin(pin);
    const [updated] = await getDb().update(appUsers).set(values).where(eq(appUsers.id, id)).returning({
      id: appUsers.id, employeeCode: appUsers.employeeCode, displayName: appUsers.displayName, email: appUsers.email, role: appUsers.role, active: appUsers.active,
    });
    if (!updated.active) await getDb().delete(appSessions).where(eq(appSessions.userId, id));
    if (permissions) await replacePermissions(id, permissions);

    let effectivePermissions = permissions;
    if (!effectivePermissions) {
      const stored = await permissionMap();
      effectivePermissions = stored.get(id)?.length
        ? normalizePermissions(stored.get(id), updated.role)
        : defaultPermissions(updated.role);
    }
    return Response.json({ user: { ...updated, permissions: effectivePermissions } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึกผู้ใช้งานไม่สำเร็จ";
    return Response.json({ error: message.includes("UNIQUE") ? "รหัสพนักงานนี้มีในระบบแล้ว" : message }, { status: 400 });
  }
}
