-- v2.7: ทะเบียน Part, Tag Stock และการจองของรุ่นเดิม
-- ไฟล์นี้สร้างขึ้นใหม่จาก db/schema.ts เพราะ database-upgrade-v2.7-stock.sql
-- หายไปจากรีโป ทำให้ติดตั้งใหม่จากศูนย์แล้วไม่มีตาราง stock ทั้งหมด
-- และ 0009 (traceability) สร้างไม่ได้เพราะอ้างถึง stock_tags

CREATE TABLE IF NOT EXISTS `stock_parts` (
  `material_code` text PRIMARY KEY NOT NULL,
  `part_name` text DEFAULT '' NOT NULL,
  `customer` text DEFAULT '' NOT NULL,
  `standard_qty` integer DEFAULT 0 NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `stock_tags` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tag_id` text NOT NULL,
  `material_code` text NOT NULL,
  `qty` integer NOT NULL,
  `remaining_qty` integer NOT NULL,
  `job_no` text NOT NULL,
  `production_date` text NOT NULL,
  `status` text DEFAULT 'printed' NOT NULL,
  `printed_by_name` text NOT NULL,
  `received_by_name` text DEFAULT '' NOT NULL,
  `received_by_code` text DEFAULT '' NOT NULL,
  `received_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`material_code`) REFERENCES `stock_parts`(`material_code`)
);
CREATE UNIQUE INDEX IF NOT EXISTS `stock_tags_tag_id_unique` ON `stock_tags` (`tag_id`);
CREATE INDEX IF NOT EXISTS `stock_tags_material_status_idx` ON `stock_tags` (`material_code`, `status`);
CREATE INDEX IF NOT EXISTS `stock_tags_job_idx` ON `stock_tags` (`job_no`);

-- ตารางรุ่นเดิม ยังถูกอ่านคู่กับ stock_picks เพื่อรวมยอดที่จองค้างไว้ก่อน v2.8
CREATE TABLE IF NOT EXISTS `stock_allocations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `customer_tag_id` text NOT NULL,
  `stock_tag_id` integer NOT NULL,
  `due_line_id` integer NOT NULL,
  `qty` integer NOT NULL,
  `status` text DEFAULT 'reserved' NOT NULL,
  `reserved_by_name` text NOT NULL,
  `reserved_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `dispatched_by_name` text DEFAULT '' NOT NULL,
  `dispatched_at` text,
  FOREIGN KEY (`stock_tag_id`) REFERENCES `stock_tags`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`due_line_id`) REFERENCES `delivery_due_lines`(`id`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS `stock_allocations_tag_status_idx` ON `stock_allocations` (`stock_tag_id`, `status`);
CREATE INDEX IF NOT EXISTS `stock_allocations_due_idx` ON `stock_allocations` (`due_line_id`);
