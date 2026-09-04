import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeEnv } from "../runtime/env";

export type CloudUser = {
  id: number;
  employeeCode: string;
  displayName: string;
  email: string;
  role: string;
  permissions: PermissionKey[];
  mustChangePin: boolean;
};

export const SESSION_COOKIE = "kit_session";
export const PERMISSION_KEYS = ["dashboard", "stock", "parts", "tags", "plan", "arrange", "replacement", "dispatch", "exports", "reports", "history", "settings", "users"] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  admin: [...PERMISSION_KEYS],
  dispatcher: ["dashboard", "stock", "parts", "tags", "arrange", "replacement", "history"],
  inspector: ["dashboard", "replacement", "dispatch", "history"],
};

export function defaultPermissions(role: string): PermissionKey[] {
  return [...(ROLE_DEFAULTS[role] || ["dashboard"])];
}

export function normalizePermissions(value: unknown, role: string): PermissionKey[] {
  if (role === "admin") return [...PERMISSION_KEYS];
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const allowed = new Set<string>(PERMISSION_KEYS);
  const normalized = source.map((item) => String(item).trim()).filter((item): item is PermissionKey => allowed.has(item));
  if (!normalized.includes("dashboard")) normalized.unshift("dashboard");
  return [...new Set(normalized)];
}

export function hasPermission(user: Pick<CloudUser, "role" | "permissions">, permission: PermissionKey) {
  return user.role === "admin" || user.permissions.includes(permission);
}

type CloudUserRow = Omit<CloudUser, "permissions" | "mustChangePin"> & {
  permissionCsv?: string;
  mustChangePin: number;
};

export async function getCurrentUser(): Promise<CloudUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getRuntimeEnv().DB;
  if (!db) throw new Error("ไม่พบการเชื่อมต่อฐานข้อมูล D1");
  const expires = new Date().toISOString();
  // เดิมตรงนี้มี try/catch ที่ดักด้วยการอ่านข้อความ error ว่ามีคำว่า
  // "app_user_permissions" หรือไม่ เพื่อชดเชยกรณีที่ตารางยังไม่ถูกสร้าง
  // ตอนนี้ migration ครบทั้ง 0000–0012 อยู่ในชุดเดียวและ deploy รันหลัง db:migrate
  // เสมอ จึงไม่ต้องเดาจากข้อความ error อีก
  const row = await db.prepare(`
    SELECT u.id, u.employee_code AS employeeCode, u.display_name AS displayName,
      u.email, u.role, u.must_change_pin AS mustChangePin,
      coalesce((SELECT group_concat(p.permission_key)
        FROM app_user_permissions p WHERE p.user_id = u.id), '') AS permissionCsv
    FROM app_sessions s
    INNER JOIN app_users u ON u.id = s.user_id
    WHERE s.id = ?1 AND s.expires_at > ?2 AND u.active = 1
    LIMIT 1
  `).bind(token, expires).first<CloudUserRow>();
  if (!row) return null;
  const permissions = row.permissionCsv
    ? normalizePermissions(row.permissionCsv, row.role)
    : defaultPermissions(row.role);
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    displayName: row.displayName,
    email: row.email,
    role: row.role,
    permissions,
    mustChangePin: Number(row.mustChangePin) === 1,
  };
}

export async function requireCloudUser(): Promise<CloudUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // บัญชีที่ยังใช้ PIN ตั้งต้นเข้าหน้าอื่นไม่ได้จนกว่าจะตั้ง PIN ของตัวเอง
  if (user.mustChangePin) redirect("/change-pin");
  return user;
}
