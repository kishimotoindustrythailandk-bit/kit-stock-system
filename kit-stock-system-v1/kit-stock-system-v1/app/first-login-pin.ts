// One-time repair for the two existing accounts reported on 2026-10-05.
// New accounts and HR resets set must_change_pin directly in the users API.
const AFFECTED_EMPLOYEE_CODES = new Set(["62043", "62052"]);
const REPAIR_ACTION = "first_login_pin_repair_20261005";

type PinUser = { id: number; employeeCode: string; mustChangePin: number };

export async function repairFirstLoginPin(db: D1Database, user: PinUser): Promise<boolean> {
  if (!AFFECTED_EMPLOYEE_CODES.has(user.employeeCode)) return Number(user.mustChangePin) === 1;

  // Persist a marker in the same transaction as the flag. Clearing the flag after
  // a successful PIN change must never trigger this repair again. The guard is
  // evaluated inside the transaction so concurrent logins cannot reapply it.
  await db.batch([
    db.prepare(`
      UPDATE app_users SET must_change_pin = 1
      WHERE id = ?1 AND employee_code = ?2
        AND NOT EXISTS (SELECT 1 FROM audit_logs
          WHERE action_key = ?3 AND entity_type = 'app_user' AND entity_id = ?4)
    `).bind(user.id, user.employeeCode, REPAIR_ACTION, String(user.id)),
    db.prepare(`
      INSERT INTO audit_logs
        (module_key, module_label, action_key, action_label, entity_type, entity_id, summary)
      SELECT 'security', 'ความปลอดภัย', ?1, 'บังคับเปลี่ยน PIN ครั้งแรก', 'app_user', ?2, ?3
      WHERE NOT EXISTS (SELECT 1 FROM audit_logs
        WHERE action_key = ?1 AND entity_type = 'app_user' AND entity_id = ?2)
    `).bind(REPAIR_ACTION, String(user.id), `เปิดการบังคับเปลี่ยน PIN สำหรับบัญชี ${user.employeeCode}`),
  ]);
  const current = await db.prepare("SELECT must_change_pin AS mustChangePin FROM app_users WHERE id = ?1")
    .bind(user.id).first<{ mustChangePin: number }>();
  return Number(current?.mustChangePin) === 1;
}
