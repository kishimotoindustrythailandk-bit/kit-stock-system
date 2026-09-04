-- รันไฟล์นี้ "ครั้งเดียว" กับฐานข้อมูลที่ใช้งานอยู่แล้วเท่านั้น
-- (ฐานที่เคยรัน database-upgrade-*.sql ด้วยมือมาก่อน v2.9)
--
--   npx wrangler d1 execute DB --remote --file=scripts/baseline-existing-d1.sql
--
-- ก่อนหน้านี้ระบบไม่เคยใช้ `wrangler d1 migrations apply` เลย ตาราง d1_migrations
-- จึงว่างเปล่า ถ้ารัน migrations apply ทันทีโดยไม่ baseline ก่อน wrangler จะพยายาม
-- รัน 0000–0009 ซ้ำ และ 0000–0003 ไม่ได้เขียนแบบ idempotent (เป็น CREATE TABLE
-- และ ALTER TABLE ADD COLUMN ตรงๆ) จึงจะพังทันที
--
-- ไฟล์นี้บอก wrangler ว่า 0000–0009 กับ 0012 มีอยู่ในฐานแล้ว (0012 สร้างตาราง
-- delivery_tag_receipts ซึ่งฐานเดิมได้มาจาก database-upgrade-v2.2-users-scan.sql)
-- ที่เหลือ (0010, 0011, 0013–0018) ปล่อยให้ `npm run db:migrate` รันจริง
-- ทุกไฟล์เขียนแบบ CREATE TABLE / CREATE INDEX IF NOT EXISTS จึงรันซ้ำได้
--
-- ข้อยกเว้นเดียวคือ 0018 (ALTER TABLE stock_parts ADD COLUMN location) ซึ่ง
-- ไม่มี IF NOT EXISTS ให้ใช้ ถ้าฐานเคยรันโค้ด v2.9.0 มาแล้วจะมีคอลัมน์นี้อยู่
-- เพราะ route handler รุ่นนั้นสร้างให้เอง กรณีนั้นต้องรัน
-- `npm run db:baseline:runtime-ddl` เพิ่มอีกหนึ่งครั้ง ดูรายละเอียดใน
-- scripts/baseline-runtime-ddl.sql
--
-- ฐานข้อมูลใหม่ที่ยังว่าง: ห้ามรันไฟล์นี้ ให้รัน `npm run db:migrate` ตรงๆ ได้เลย

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
