-- v2.3: ทะเบียนรูปชิ้นงานที่เก็บไฟล์จริงไว้บน R2
-- ไฟล์นี้สร้างขึ้นใหม่จาก db/schema.ts เพราะ database-upgrade-v2.3-part-images.sql
-- หายไปจากรีโป ทำให้ติดตั้งใหม่จากศูนย์แล้วไม่มีตาราง part_images
CREATE TABLE IF NOT EXISTS `part_images` (
  `material_code` text PRIMARY KEY NOT NULL,
  `object_key` text NOT NULL,
  `original_name` text DEFAULT '' NOT NULL,
  `content_type` text DEFAULT 'image/jpeg' NOT NULL,
  `updated_by_name` text DEFAULT '' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
