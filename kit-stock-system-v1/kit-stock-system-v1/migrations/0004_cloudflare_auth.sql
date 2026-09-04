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

CREATE TABLE IF NOT EXISTS `app_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` integer NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE cascade
);

INSERT OR IGNORE INTO `app_users`
  (`employee_code`, `display_name`, `email`, `role`, `pin_hash`, `active`)
VALUES
  ('ADMIN', 'Admin', '', 'admin', 'ENV_INITIAL_ADMIN_PIN', true);
