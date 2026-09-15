-- v2.24: เก็บรูปฉลากต้นฉบับ (ถ่ายตอนรับเข้า/อ่านด้วย OCR) ไว้กับ lot วัตถุดิบ
-- ไฟล์รูปจริงอยู่บน R2 ตารางเก็บแค่ object_key ไว้เปิดดูย้อนหลัง
ALTER TABLE `material_lots` ADD COLUMN `label_image_key` text NOT NULL DEFAULT '';
