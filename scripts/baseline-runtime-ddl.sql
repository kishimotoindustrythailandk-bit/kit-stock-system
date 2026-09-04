-- รันไฟล์นี้ "ครั้งเดียว" กับฐานข้อมูลที่เคยรันโค้ด v2.9.0 มาแล้วเท่านั้น
--
--   npm run db:baseline:runtime-ddl
--
-- v2.9.0 มี CREATE TABLE / ALTER TABLE ฝังอยู่ใน route handler แล้วรันทุก request
-- ผลคือฐานได้ตารางและคอลัมน์เหล่านี้มาโดยไม่ผ่าน d1_migrations เลย:
--
--   ALTER TABLE stock_parts ADD COLUMN location   -> migration 0018
--
-- v2.9.1 ย้าย DDL ออกจาก route handler ทั้งหมด ตัว migration จึงกลายเป็น
-- แหล่งเดียวที่บอก schema ได้ แต่ ALTER TABLE ADD COLUMN ไม่มี IF NOT EXISTS
-- ให้ใช้ ถ้าปล่อยให้ 0018 รันบนฐานที่มีคอลัมน์อยู่แล้วจะ error ทันที
-- ไฟล์นี้จึงบอก wrangler ว่า 0018 มีอยู่ในฐานแล้ว
--
-- ตรวจก่อนรันว่าฐานมีคอลัมน์ location จริง:
--
--   npx wrangler d1 execute DB --remote --command "PRAGMA table_info(stock_parts)"
--
-- ถ้าไม่มีคอลัมน์ location: ห้ามรันไฟล์นี้ ให้ npm run db:migrate รัน 0018 ตามปกติ
--
-- 0014-0017 ไม่ต้องลงทะเบียน เพราะทุกไฟล์เขียนแบบ CREATE TABLE IF NOT EXISTS
-- อยู่แล้ว รันซ้ำบนฐานที่มีตารางแล้วไม่เกิดอะไรขึ้น
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0018_stock_parts_location.sql');
