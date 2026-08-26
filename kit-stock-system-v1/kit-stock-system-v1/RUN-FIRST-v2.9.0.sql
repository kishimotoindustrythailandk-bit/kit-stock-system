-- ============================================================
-- KIT Delivery Due Control v2.9.0 — รันไฟล์นี้ "ก่อน" อัปโหลดโค้ดขึ้น GitHub
-- ============================================================
--
-- ทำไมต้องรันก่อน:
--   Cloudflare ต่อกับ GitHub อยู่ พอ push ปุ๊บมันจะ build/deploy อัตโนมัติทันที
--   โค้ด v2.9.0 ต้องการตาราง app_login_attempts และคอลัมน์ must_change_pin
--   ถ้า deploy ก่อนที่ฐานข้อมูลจะมีสองอย่างนี้ = ทุกคนเข้าระบบไม่ได้ จนกว่าจะรัน SQL
--
-- วิธีรัน เลือกทางใดทางหนึ่ง:
--   ก) Cloudflare Dashboard > Workers & Pages > D1 > kit-stock-db > Console
--      แล้ววางเนื้อหาไฟล์นี้ทั้งหมดลงไป กด Execute
--   ข) npx wrangler d1 execute kit-stock-db --remote --file=RUN-FIRST-v2.9.0.sql
--
-- ไฟล์นี้รันซ้ำได้ ยกเว้นบรรทัด ALTER TABLE ซึ่งจะแจ้ง duplicate column ถ้ารันรอบสอง
-- ถ้าเจอ error นั้นแปลว่ารันไปแล้ว ข้ามได้เลย ไม่ต้องกังวล
--
-- ข้อมูล Due, Stock, Tag และประวัติเดิม ไม่ถูกแตะทั้งหมด
-- ============================================================


-- ------------------------------------------------------------
-- ส่วนที่ 1: บอก wrangler ว่า migration เก่ามีอยู่ในฐานนี้แล้ว
-- (จาก scripts/baseline-existing-d1.sql)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0000_dark_nemesis.sql'),
  ('0001_organic_mongoose.sql'),
  ('0002_breezy_roxanne_simpson.sql'),
  ('0003_cloud_due_seed.sql'),
  ('0004_cloudflare_auth.sql'),
  ('0005_user_permissions.sql'),
  ('0006_split_workflow_permissions.sql'),
  ('0007_part_images.sql'),
  ('0008_stock_core.sql'),
  ('0009_stock_traceability.sql'),
  ('0012_delivery_tag_receipts.sql');


-- ------------------------------------------------------------
-- ส่วนที่ 2: ตารางนับการกรอก PIN ผิด
-- (จาก migrations/0010_login_throttle.sql)
-- ------------------------------------------------------------
-- v2.9: จำกัดจำนวนครั้งที่กรอก PIN ผิด
-- PIN เป็นตัวเลข 6 หลัก (1,000,000 ค่า) เดิมไม่มีอะไรหยุดการไล่เดา
-- นับความผิดพลาดต่อรหัสพนักงาน เพราะทั้งโรงงานออกอินเทอร์เน็ตผ่าน IP เดียวกัน
-- การล็อกตาม IP จึงจะเตะพนักงานทั้งกะออกพร้อมกัน
CREATE TABLE IF NOT EXISTS `app_login_attempts` (
  `employee_code` text PRIMARY KEY NOT NULL,
  `failed_count` integer DEFAULT 0 NOT NULL,
  `locked_until` text,
  `last_failed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0010_login_throttle.sql');


-- ------------------------------------------------------------
-- ส่วนที่ 3: คอลัมน์บังคับเปลี่ยน PIN
-- (จาก migrations/0011_pin_rotation.sql)
-- ------------------------------------------------------------
-- v2.9: บังคับเปลี่ยน PIN ครั้งแรก และเปิดทางให้ทุกบัญชีเปลี่ยน PIN ตัวเองได้
-- เดิมบัญชี ADMIN ถูก seed ด้วยค่า 'ENV_INITIAL_ADMIN_PIN' แล้วเทียบกับ
-- environment variable แบบข้อความล้วน จึงไม่เคยถูกแฮชและเปลี่ยนในแอปไม่ได้เลย
ALTER TABLE `app_users` ADD COLUMN `must_change_pin` integer DEFAULT 0 NOT NULL;

UPDATE `app_users` SET `must_change_pin` = 1 WHERE `pin_hash` = 'ENV_INITIAL_ADMIN_PIN';

INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0011_pin_rotation.sql');


-- ------------------------------------------------------------
-- ส่วนที่ 4: index บนคอลัมน์ที่ join จริง
-- (จาก migrations/0013_performance_indexes.sql)
-- ------------------------------------------------------------
-- v2.9: index บนคอลัมน์ที่ join จริงทุกครั้งที่โหลดหน้าหลัก
-- GET /api/due ทำ LEFT JOIN delivery_tag_scans + GROUP BY ทุกแถวโดยไม่มี index
CREATE INDEX IF NOT EXISTS `delivery_tag_scans_due_idx` ON `delivery_tag_scans` (`due_line_id`);
CREATE INDEX IF NOT EXISTS `delivery_tag_receipts_due_idx` ON `delivery_tag_receipts` (`due_line_id`);
CREATE INDEX IF NOT EXISTS `delivery_due_lines_import_idx` ON `delivery_due_lines` (`import_id`);
CREATE INDEX IF NOT EXISTS `delivery_due_lines_lookup_idx`
  ON `delivery_due_lines` (`delivery_date`, `fact`, `material_code`);
CREATE INDEX IF NOT EXISTS `app_sessions_user_idx` ON `app_sessions` (`user_id`);
CREATE INDEX IF NOT EXISTS `app_sessions_expiry_idx` ON `app_sessions` (`expires_at`);

INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0013_performance_indexes.sql');


-- ------------------------------------------------------------
-- เสร็จแล้ว — ตรวจผลด้วยคำสั่งนี้ (รันแยก)
--   SELECT name FROM d1_migrations ORDER BY name;
-- ต้องเห็นครบ 14 รายการ ตั้งแต่ 0000 ถึง 0013
-- ------------------------------------------------------------
