-- v2.2: บันทึกการรับ Tag ลูกค้าเข้าหน้างาน
-- ตารางนี้ถูกสร้างไว้ใน database-upgrade-v2.2-users-scan.sql เท่านั้น ไม่เคยมีใน
-- migration ชุดไหนเลย ทำให้ฐานข้อมูลที่ติดตั้งใหม่จากศูนย์ไม่มีตารางนี้
-- แล้ว GET /api/due จะพังทันทีเพราะ join กับ delivery_tag_receipts
CREATE TABLE IF NOT EXISTS `delivery_tag_receipts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `due_line_id` integer NOT NULL,
  `tag_id` text NOT NULL,
  `raw_payload` text NOT NULL,
  `qty` integer NOT NULL,
  `unit` text DEFAULT 'PC' NOT NULL,
  `location` text DEFAULT '' NOT NULL,
  `received_by_name` text NOT NULL,
  `received_by_code` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`due_line_id`) REFERENCES `delivery_due_lines`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `delivery_tag_receipts_tag_id_unique` ON `delivery_tag_receipts` (`tag_id`);
