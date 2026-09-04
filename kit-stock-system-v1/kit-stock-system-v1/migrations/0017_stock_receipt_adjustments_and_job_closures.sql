-- v2.9.1: เก็บตารางที่เดิม "ไม่มี migration รองรับเลย" เข้ามาในชุด migration
--
-- stock_receipt_adjustments กับ stock_job_closures ถูกสร้างจาก CREATE TABLE
-- ที่ฝังอยู่ใน app/api/stock/route.ts แล้วรันซ้ำทุก request ไม่มีทั้งใน migrations/
-- และใน db/schema.ts จึงไม่มีใครรู้จากรีโปได้เลยว่าฐานจริงมีตารางอะไรอยู่
--
-- ไฟล์นี้ idempotent ทั้งไฟล์ รันซ้ำบนฐานที่มีตารางแล้วได้ ไม่ต้อง baseline
--
-- DDL คัดลอกให้ตรงกับฐาน production ตัวจริง (ตรวจจาก sqlite_master) โดยเจตนา
-- จึงยังไม่มี FOREIGN KEY เหมือนที่ควรเป็น เพราะ CREATE TABLE IF NOT EXISTS
-- จะไม่ทำอะไรกับฐานที่มีตารางอยู่แล้ว ถ้าใส่ FK ไว้ในนี้ ฐาน production กับฐาน
-- ที่ติดตั้งใหม่จะมี schema ไม่เหมือนกัน การเพิ่ม FK ต้อง rebuild ตารางบน
-- production ซึ่งแยกเป็นงานอีกชุด
CREATE TABLE IF NOT EXISTS stock_receipt_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_tag_id INTEGER NOT NULL,
  tag_id TEXT NOT NULL,
  original_qty INTEGER NOT NULL,
  received_qty INTEGER NOT NULL,
  ng_qty INTEGER NOT NULL,
  received_by_name TEXT NOT NULL,
  received_by_code TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_stock_receipt_adjustments_tag
ON stock_receipt_adjustments(stock_tag_id, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS stock_job_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_no TEXT NOT NULL,
  material_code TEXT NOT NULL,
  total_qty INTEGER NOT NULL,
  received_qty INTEGER NOT NULL,
  ng_qty INTEGER NOT NULL,
  ng_tag_count INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  closed_by_name TEXT NOT NULL,
  closed_by_code TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
-- โค้ดที่สร้างตารางนี้ไม่ได้สร้าง index ให้ ฐาน production จึงไม่มี
-- แต่ action close_job อ่านด้วย job_no + material_code ทุกครั้ง
CREATE INDEX IF NOT EXISTS idx_stock_job_closures_job_material
ON stock_job_closures(job_no, material_code, id);
