CREATE TABLE `delivery_due_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`do_no` text NOT NULL,
	`seq` integer NOT NULL,
	`material_code` text NOT NULL,
	`material_description` text DEFAULT '' NOT NULL,
	`site` text DEFAULT '' NOT NULL,
	`fact` text NOT NULL,
	`line` text DEFAULT '' NOT NULL,
	`shop` text DEFAULT '' NOT NULL,
	`req_qty` integer NOT NULL,
	`delivery_date` text NOT NULL,
	`delivery_time` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `delivery_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_due_lines_source_key_unique` ON `delivery_due_lines` (`source_key`);--> statement-breakpoint
CREATE TABLE `delivery_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_token` text NOT NULL,
	`file_name` text NOT NULL,
	`row_count` integer NOT NULL,
	`total_qty` integer NOT NULL,
	`imported_by_name` text NOT NULL,
	`imported_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_imports_import_token_unique` ON `delivery_imports` (`import_token`);--> statement-breakpoint
CREATE TABLE `delivery_tag_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`due_line_id` integer NOT NULL,
	`tag_id` text NOT NULL,
	`raw_payload` text NOT NULL,
	`qty` integer NOT NULL,
	`unit` text DEFAULT 'PC' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`scanned_by_name` text NOT NULL,
	`scanned_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`due_line_id`) REFERENCES `delivery_due_lines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_tag_scans_tag_id_unique` ON `delivery_tag_scans` (`tag_id`);