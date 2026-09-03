-- v2.19: รูป "ตัวอย่างจริง" ของชิ้นงาน 1 รูปต่อ Part เก็บไฟล์จริงไว้บน R2
-- แยกตารางจาก part_images (รูป master) เพื่อไม่ต้อง rebuild ตารางเดิม
-- ตอนสแกนขายออกจะโชว์รูป master คู่กับรูปตัวอย่างจริงให้ผู้ตรวจเทียบ
CREATE TABLE IF NOT EXISTS `part_actual_images` (
  `material_code` text PRIMARY KEY NOT NULL,
  `object_key` text NOT NULL,
  `original_name` text DEFAULT '' NOT NULL,
  `content_type` text DEFAULT 'image/jpeg' NOT NULL,
  `updated_by_name` text DEFAULT '' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
