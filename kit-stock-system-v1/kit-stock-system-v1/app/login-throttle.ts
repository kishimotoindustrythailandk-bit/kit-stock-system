/**
 * จำกัดจำนวนครั้งที่กรอก PIN ผิดต่อรหัสพนักงาน
 *
 * PIN เป็นตัวเลข 6 หลักพอดี = 1,000,000 ค่า เดิมไม่มีอะไรหยุดสคริปต์ที่ไล่เดา
 * การแฮชด้วย PBKDF2 120,000 รอบไม่ช่วยอะไรเลยถ้าเดาได้ไม่จำกัดครั้ง
 *
 * นับต่อ "รหัสพนักงาน" ไม่ใช่ต่อ IP เพราะทั้งโรงงานออกเน็ตผ่าน IP เดียวกัน
 * การล็อกตาม IP จะเตะพนักงานทั้งกะออกพร้อมกัน
 *
 * ข้อแลกเปลี่ยนที่ยอมรับ: คนที่รู้รหัสพนักงานคนอื่นสามารถกรอกผิดจนบัญชีนั้น
 * ถูกล็อก 15 นาทีได้ ในระบบภายในโรงงานถือว่ารับได้ เพราะแอดมินปลดล็อกให้ได้ทันที
 * และดีกว่าปล่อยให้เดา PIN ได้ไม่จำกัด
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/** แฮชหลอกที่ใช้เผาเวลาให้เท่ากับการตรวจ PIN จริง เมื่อไม่พบรหัสพนักงานในระบบ */
export const DUMMY_PIN_HASH = "pbkdf2$120000$RFWXtEExPfkLjbr6BGoKaQ$3jI5zZIH5eIjlmcgeXMap-vbNguLioQmhTkBI-u0hHI";

export type LockState = { locked: false } | { locked: true; minutesLeft: number };

/**
 * ทุกฟังก์ชันในไฟล์นี้ fail-open โดยตั้งใจ
 *
 * ถ้าตาราง app_login_attempts อ่านหรือเขียนไม่ได้ (เช่นยังไม่ได้รัน migration)
 * เราเลือกให้ "เข้าสู่ระบบได้ตามปกติ" แทนที่จะล็อกทุกคนออกจากระบบ
 * ปัญหาการนับพลาดไม่ควรทำให้ทั้งโรงงานทำงานไม่ได้
 */
export async function checkLock(db: D1Database, employeeCode: string): Promise<LockState> {
  try {
    const row = await db
      .prepare("SELECT locked_until AS lockedUntil FROM app_login_attempts WHERE employee_code = ?1 LIMIT 1")
      .bind(employeeCode)
      .first<{ lockedUntil: string | null }>();
    if (!row?.lockedUntil) return { locked: false };
    const until = Date.parse(row.lockedUntil);
    if (!Number.isFinite(until) || until <= Date.now()) return { locked: false };
    return { locked: true, minutesLeft: Math.max(1, Math.ceil((until - Date.now()) / 60_000)) };
  } catch {
    return { locked: false };
  }
}

/** นับความผิดพลาดเพิ่ม 1 ครั้ง แล้วล็อกเมื่อครบเพดาน คืนค่าจำนวนครั้งที่เหลือ */
export async function recordFailure(db: D1Database, employeeCode: string): Promise<number> {
  const now = new Date().toISOString();
  const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
  try {
    const row = await db
      .prepare(
        // เมื่อการล็อกรอบก่อนหมดอายุแล้ว ให้เริ่มนับใหม่จาก 1 มิฉะนั้นการกรอกผิด
        // อีกครั้งเดียวหลังพ้นโทษจะทำให้ถูกล็อกซ้ำทันที เพราะตัวนับยังค้างที่ 5
        `INSERT INTO app_login_attempts (employee_code, failed_count, locked_until, last_failed_at)
         VALUES (?1, 1, NULL, ?4)
         ON CONFLICT(employee_code) DO UPDATE SET
           failed_count = CASE
             WHEN app_login_attempts.locked_until IS NOT NULL AND app_login_attempts.locked_until <= ?4 THEN 1
             ELSE app_login_attempts.failed_count + 1
           END,
           locked_until = CASE
             WHEN app_login_attempts.locked_until IS NOT NULL AND app_login_attempts.locked_until <= ?4 THEN NULL
             WHEN app_login_attempts.failed_count + 1 >= ?2 THEN ?3
             ELSE app_login_attempts.locked_until
           END,
           last_failed_at = ?4
         RETURNING failed_count AS failedCount`,
      )
      .bind(employeeCode, MAX_FAILED_ATTEMPTS, lockedUntil, now)
      .first<{ failedCount: number }>();
    return Math.max(MAX_FAILED_ATTEMPTS - Number(row?.failedCount ?? 0), 0);
  } catch {
    return MAX_FAILED_ATTEMPTS;
  }
}

/** ล้างตัวนับเมื่อเข้าสู่ระบบสำเร็จ */
export async function clearFailures(db: D1Database, employeeCode: string): Promise<void> {
  try {
    await db.prepare("DELETE FROM app_login_attempts WHERE employee_code = ?1").bind(employeeCode).run();
  } catch {
    // ไม่เป็นไร ตัวนับจะถูกล้างเองเมื่อล็อกหมดอายุ
  }
}
