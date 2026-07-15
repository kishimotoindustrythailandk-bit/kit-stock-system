PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS `parts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `part_no` text NOT NULL,
  `part_name` text NOT NULL,
  `standard_qty` integer NOT NULL,
  `container_type` text DEFAULT 'บ๊อค' NOT NULL,
  `customer` text DEFAULT '' NOT NULL,
  `image_key` text,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `parts_part_no_unique` ON `parts` (`part_no`);

CREATE TABLE IF NOT EXISTS `work_orders` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_no` text NOT NULL,
  `part_id` integer NOT NULL,
  `lot_no` text NOT NULL,
  `target_qty` integer NOT NULL,
  `customer` text DEFAULT '' NOT NULL,
  `delivery_date` text DEFAULT '' NOT NULL,
  `delivery_time` text DEFAULT '' NOT NULL,
  `sender_name` text DEFAULT '' NOT NULL,
  `packing_standard` integer DEFAULT 0 NOT NULL,
  `packing_count` integer DEFAULT 0 NOT NULL,
  `full_packing_qty` integer DEFAULT 0 NOT NULL,
  `partial_qty` integer DEFAULT 0 NOT NULL,
  `total_packing_qty` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'in_progress' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`part_id`) REFERENCES `parts` (`id`)
);
CREATE UNIQUE INDEX IF NOT EXISTS `work_orders_order_no_unique` ON `work_orders` (`order_no`);

CREATE TABLE IF NOT EXISTS `box_scans` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `work_order_id` integer NOT NULL,
  `tag_id` text NOT NULL,
  `box_type` text NOT NULL,
  `actual_qty` integer NOT NULL,
  `photo_key` text NOT NULL,
  `photo_name` text NOT NULL,
  `photo_type` text NOT NULL,
  `inspector_name` text NOT NULL,
  `inspector_email` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`)
);
CREATE UNIQUE INDEX IF NOT EXISTS `box_scans_tag_id_unique` ON `box_scans` (`tag_id`);

CREATE TABLE IF NOT EXISTS `receipts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `work_order_id` integer NOT NULL,
  `receiver_name` text NOT NULL,
  `receiver_email` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`)
);
CREATE UNIQUE INDEX IF NOT EXISTS `receipts_work_order_id_unique` ON `receipts` (`work_order_id`);

CREATE TABLE IF NOT EXISTS `employees` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `employee_code` text NOT NULL,
  `full_name` text NOT NULL,
  `role` text DEFAULT 'viewer' NOT NULL,
  `pin_hash` text NOT NULL,
  `pin_salt` text NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `must_change_pin` integer DEFAULT 0 NOT NULL,
  `failed_attempts` integer DEFAULT 0 NOT NULL,
  `locked_until` text,
  `last_login_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `employees_employee_code_unique` ON `employees` (`employee_code`);

CREATE TABLE IF NOT EXISTS `employee_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `session_hash` text NOT NULL,
  `employee_id` integer NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS `employee_sessions_session_hash_unique` ON `employee_sessions` (`session_hash`);
