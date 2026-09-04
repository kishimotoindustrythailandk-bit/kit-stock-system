PRAGMA foreign_keys = ON;

-- v2.8: งานที่ผู้จัดสแกนจาก Tag KIT จริงก่อนรอผู้ตรวจขายออก
CREATE TABLE IF NOT EXISTS `stock_picks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `due_line_id` integer NOT NULL,
  `stock_tag_id` integer NOT NULL,
  `picked_qty` integer NOT NULL,
  `dispatched_qty` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'staged' NOT NULL,
  `picked_by_name` text NOT NULL,
  `picked_by_code` text NOT NULL,
  `picked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`due_line_id`) REFERENCES `delivery_due_lines`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`stock_tag_id`) REFERENCES `stock_tags`(`id`) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS `stock_picks_due_status_idx`
  ON `stock_picks` (`due_line_id`, `status`, `picked_at`);
CREATE INDEX IF NOT EXISTS `stock_picks_tag_status_idx`
  ON `stock_picks` (`stock_tag_id`, `status`);

-- v2.8: หลักฐานว่า Tag ลูกค้าแต่ละใบตัดจาก Job/Tag Stock ใดบ้าง
CREATE TABLE IF NOT EXISTS `stock_dispatch_links` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `customer_tag_id` text NOT NULL,
  `pick_id` integer NOT NULL,
  `due_line_id` integer NOT NULL,
  `stock_tag_id` integer NOT NULL,
  `qty` integer NOT NULL,
  `dispatched_by_name` text NOT NULL,
  `dispatched_by_code` text NOT NULL,
  `dispatched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`pick_id`) REFERENCES `stock_picks`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`due_line_id`) REFERENCES `delivery_due_lines`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`stock_tag_id`) REFERENCES `stock_tags`(`id`) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS `stock_dispatch_links_customer_pick_unique`
  ON `stock_dispatch_links` (`customer_tag_id`, `pick_id`);
CREATE INDEX IF NOT EXISTS `stock_dispatch_links_due_idx`
  ON `stock_dispatch_links` (`due_line_id`, `dispatched_at`);
