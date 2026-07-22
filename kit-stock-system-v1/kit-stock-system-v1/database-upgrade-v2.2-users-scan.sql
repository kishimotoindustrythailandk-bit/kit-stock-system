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

CREATE TABLE IF NOT EXISTS `app_users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `employee_code` text NOT NULL,
  `display_name` text NOT NULL,
  `email` text DEFAULT '' NOT NULL,
  `role` text DEFAULT 'staff' NOT NULL,
  `pin_hash` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `app_users_employee_code_unique` ON `app_users` (`employee_code`);
