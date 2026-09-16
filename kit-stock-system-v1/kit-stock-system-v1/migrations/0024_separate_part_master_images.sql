-- แยกรูปตัวอย่าง (Master) ออกจากรูปชิ้นงานในกล่องอย่างถาวร
--
-- part_images เป็นตารางรูปเดิม ซึ่งในระบบรุ่นแรกใช้เป็นรูปชิ้นงานในกล่อง
-- จึงคัดลอก metadata ไป part_actual_images เฉพาะ Part ที่ยังไม่มีรูป actual ชัดเจน
-- โดยไม่ย้ายหรือลบไฟล์ใน R2 เพื่อให้ข้อมูลเดิมยังเปิดดูได้ครบ

CREATE TABLE IF NOT EXISTS part_actual_images (
  material_code TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  updated_by_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS part_master_images (
  material_code TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  updated_by_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO part_actual_images (
  material_code, object_key, original_name, content_type, updated_by_name, updated_at
)
SELECT material_code, object_key, original_name, content_type, updated_by_name, updated_at
FROM part_images;
