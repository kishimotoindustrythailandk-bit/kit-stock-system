CREATE TABLE `employee_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_hash` text NOT NULL,
	`employee_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_sessions_session_hash_unique` ON `employee_sessions` (`session_hash`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_code` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`pin_hash` text NOT NULL,
	`pin_salt` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`must_change_pin` integer DEFAULT false NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_code_unique` ON `employees` (`employee_code`);