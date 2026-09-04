CREATE TABLE `receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_order_id` integer NOT NULL,
	`receiver_name` text NOT NULL,
	`receiver_email` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_work_order_id_unique` ON `receipts` (`work_order_id`);--> statement-breakpoint
ALTER TABLE `parts` ADD `customer` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `parts` ADD `image_key` text;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `customer` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `delivery_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `delivery_time` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `sender_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `packing_standard` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `packing_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `full_packing_qty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `partial_qty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_orders` ADD `total_packing_qty` integer DEFAULT 0 NOT NULL;