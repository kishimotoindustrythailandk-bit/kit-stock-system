CREATE TABLE `box_scans` (
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
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `box_scans_tag_id_unique` ON `box_scans` (`tag_id`);--> statement-breakpoint
CREATE TABLE `parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`part_no` text NOT NULL,
	`part_name` text NOT NULL,
	`standard_qty` integer NOT NULL,
	`container_type` text DEFAULT 'บ๊อค' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parts_part_no_unique` ON `parts` (`part_no`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_no` text NOT NULL,
	`part_id` integer NOT NULL,
	`lot_no` text NOT NULL,
	`target_qty` integer NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_orders_order_no_unique` ON `work_orders` (`order_no`);