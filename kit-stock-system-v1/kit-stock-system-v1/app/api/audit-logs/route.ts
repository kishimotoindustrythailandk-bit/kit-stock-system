import { getCurrentUser, hasPermission } from "../../cloudflare-auth";
import { getRuntimeEnv } from "../../../runtime/env";
import { writeAuditLog } from "../../audit-log";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!hasPermission(user, "history")) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดูประวัติ" }, { status: 403 });
    const { DB } = getRuntimeEnv();
    if (!DB) throw new Error("ไม่พบการเชื่อมต่อ D1");
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 1000);
    const limit = Math.min(Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 1000, 1), 2000);
    const result = await DB.prepare(`
      SELECT id, module_key AS moduleKey, module_label AS moduleLabel,
        action_key AS actionKey, action_label AS actionLabel,
        entity_type AS entityType, entity_id AS entityId, summary,
        detail_json AS detailJson, before_json AS beforeJson, after_json AS afterJson,
        actor_code AS actorCode, actor_name AS actorName, actor_email AS actorEmail,
        actor_role AS actorRole, ip_address AS ipAddress, created_at AS createdAt
      FROM audit_logs ORDER BY id DESC LIMIT ?1
    `).bind(limit).all();
    return Response.json({ logs: result.results || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดประวัติไม่สำเร็จ";
    if (/no such table.*audit_logs/i.test(message)) return Response.json({ logs: [], migrationRequired: true });
    return Response.json({ error: message }, { status: 500 });
  }
}

const CLIENT_EVENTS: Record<string, { module: string; moduleLabel: string; actionLabel: string }> = {
  save_settings: { module: "settings", moduleLabel: "ตั้งค่า", actionLabel: "บันทึกการตั้งค่า" },
  export_history: { module: "history", moduleLabel: "ประวัติ", actionLabel: "ส่งออกประวัติ Excel" },
  export_report_excel: { module: "reports", moduleLabel: "รายงาน", actionLabel: "ส่งออกรายงาน Excel" },
  export_report_csv: { module: "reports", moduleLabel: "รายงาน", actionLabel: "ส่งออกรายงาน CSV" },
  export_report_pdf: { module: "reports", moduleLabel: "รายงาน", actionLabel: "พิมพ์/ส่งออกรายงาน PDF" },
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const body = await request.json() as { action?: string; summary?: string; details?: Record<string, unknown> };
    const key = String(body.action || "");
    const definition = CLIENT_EVENTS[key];
    if (!definition) return Response.json({ error: "ไม่รู้จักกิจกรรมที่ต้องการบันทึก" }, { status: 400 });
    await writeAuditLog(user, {
      ...definition, action: key, summary: String(body.summary || definition.actionLabel).slice(0, 1000), details: body.details,
    }, request);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึกประวัติไม่สำเร็จ" }, { status: 500 });
  }
}
