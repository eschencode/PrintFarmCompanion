CREATE TABLE `grid_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`is_default` integer DEFAULT false,
	`rows` integer,
	`cols` integer
);
--> statement-breakpoint
CREATE TABLE `inventory_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`object_id` integer,
	`change_type` text,
	`quantity` integer,
	`date` integer,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `objects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`created_by_module_id` integer,
	`included_in_sku_id` integer,
	`in_stock` integer,
	`min_threshold` integer,
	`last_count_date` integer,
	`last_count_discrepancy` integer,
	`category` text,
	FOREIGN KEY (`created_by_module_id`) REFERENCES `print_modules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`included_in_sku_id`) REFERENCES `shopify_sku_mapping`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plate_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE TABLE `print_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_id` integer,
	`printer_id` integer,
	`spool_id` integer,
	`start_time` integer,
	`expected_end_time` integer,
	`status` text,
	`failure_reason` text,
	`used_weight` integer,
	FOREIGN KEY (`module_id`) REFERENCES `print_modules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `print_modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`weight` integer,
	`time` integer,
	`objects_per_print` integer,
	`default_spool_preset_id` integer,
	`plate_preset_id` integer,
	`printer_preset_id` integer,
	`object_id` integer,
	`nozzle_diameter` text,
	`filename` text,
	`file_path` text,
	`thumbnail` text,
	FOREIGN KEY (`default_spool_preset_id`) REFERENCES `spool_presets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plate_preset_id`) REFERENCES `plate_presets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`printer_preset_id`) REFERENCES `printer_presets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `printer_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model` text,
	`brand` text,
	`dimension_x` integer,
	`dimension_y` integer,
	`dimension_z` integer
);
--> statement-breakpoint
CREATE TABLE `printer_secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printer_id` integer,
	`printer_ip` text,
	`serial` text,
	`access_code` text,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `printers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`printer_preset_id` integer,
	`loaded_spool_id` integer,
	`loaded_plate_id` integer,
	`current_print_job_id` integer,
	`last_print_job_id` integer,
	`suggested_queue_id` integer,
	FOREIGN KEY (`printer_preset_id`) REFERENCES `printer_presets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loaded_spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loaded_plate_id`) REFERENCES `plate_presets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_print_job_id`) REFERENCES `print_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_print_job_id`) REFERENCES `print_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggested_queue_id`) REFERENCES `print_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shopify_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text,
	`order_number` integer,
	`processed_at` integer,
	`total_items` integer
);
--> statement-breakpoint
CREATE TABLE `shopify_sku_mapping` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopify_sku` text,
	`object_id` integer,
	`quantity` integer,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `spool_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`color` text,
	`brand` text,
	`default_weight` integer,
	`cost` integer,
	`in_storage` integer
);
--> statement-breakpoint
CREATE TABLE `spools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preset_id` integer,
	`remaining_weight` integer,
	FOREIGN KEY (`preset_id`) REFERENCES `spool_presets`(`id`) ON UPDATE no action ON DELETE no action
);
