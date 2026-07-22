import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeEnv } from "../runtime/env";

export type CloudUser = {
  id: number;
  employeeCode: string;
  displayName: string;
  email: string;
  role: string;
};

export const SESSION_COOKIE = "kit_session";

export async function getCurrentUser(): Promise<CloudUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getRuntimeEnv().DB;
  if (!db) throw new Error("ไม่พบการเชื่อมต่อฐานข้อมูล D1");
  const row = await db.prepare(`
    SELECT u.id, u.employee_code AS employeeCode, u.display_name AS displayName,
      u.email, u.role
    FROM app_sessions s
    INNER JOIN app_users u ON u.id = s.user_id
    WHERE s.id = ?1 AND s.expires_at > ?2 AND u.active = 1
    LIMIT 1
  `).bind(token, new Date().toISOString()).first<CloudUser>();
  return row ?? null;
}

export async function requireCloudUser(): Promise<CloudUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
