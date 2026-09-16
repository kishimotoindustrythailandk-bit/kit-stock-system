import type { CloudUser } from "./cloudflare-auth";
import { getRuntimeEnv } from "../runtime/env";

type AuditValue = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

export type AuditEvent = {
  module: string;
  moduleLabel: string;
  action: string;
  actionLabel: string;
  entityType?: string;
  entityId?: string | number;
  summary: string;
  details?: AuditValue;
  before?: AuditValue;
  after?: AuditValue;
};

const PRIVATE_KEYS = /pin|password|secret|token|hash|rawpayload|cookie|authorization/i;

function safeValue(value: AuditValue, depth = 0): unknown {
  if (depth > 4) return "[ข้อมูลซ้อนลึก]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value ?? null;
  if (typeof value === "string") return value.slice(0, 1000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeValue(item as AuditValue, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_KEYS.test(key)).slice(0, 100)
    .map(([key, item]) => [key, safeValue(item as AuditValue, depth + 1)]));
}

function json(value: AuditValue, empty = "{}") {
  if (value === undefined) return empty;
  try { return JSON.stringify(safeValue(value)).slice(0, 20000); } catch { return empty; }
}

function requestMeta(request?: Request) {
  if (!request) return { ip: "", userAgent: "" };
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  return { ip: ip.slice(0, 80), userAgent: (request.headers.get("user-agent") || "").slice(0, 500) };
}

export async function writeAuditLog(user: Pick<CloudUser, "id" | "employeeCode" | "displayName" | "email" | "role">, event: AuditEvent, request?: Request) {
  const { DB } = getRuntimeEnv();
  if (!DB) return;
  const meta = requestMeta(request);
  try {
    await DB.prepare(`
      INSERT INTO audit_logs (
        module_key, module_label, action_key, action_label, entity_type, entity_id,
        summary, detail_json, before_json, after_json,
        actor_id, actor_code, actor_name, actor_email, actor_role,
        ip_address, user_agent, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, CURRENT_TIMESTAMP)
    `).bind(
      event.module.slice(0, 60), event.moduleLabel.slice(0, 100), event.action.slice(0, 60), event.actionLabel.slice(0, 100),
      String(event.entityType || "").slice(0, 80), String(event.entityId ?? "").slice(0, 180), event.summary.slice(0, 1000),
      json(event.details), json(event.before, ""), json(event.after, ""),
      user.id, user.employeeCode.slice(0, 60), user.displayName.slice(0, 120), user.email.slice(0, 180), user.role.slice(0, 60),
      meta.ip, meta.userAgent,
    ).run();
  } catch (error) {
    // Audit ต้องไม่ทำให้ธุรกรรมหลักที่สำเร็จแล้วกลับกลายเป็น error
    console.error("audit log write failed", error);
  }
}
