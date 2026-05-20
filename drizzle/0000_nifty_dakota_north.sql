CREATE TABLE `grid_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`rows` integer NOT NULL,
	`cols` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_grid_presets_default` ON `grid_presets` (`is_default`);--> statement-breakpoint
CREATE TABLE `inventory_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`object_id` integer NOT NULL,
	`change_type` text NOT NULL,
	`quantity` integer NOT NULL,
	`print_job_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`print_job_id`) REFERENCES `print_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_log_object` ON `inventory_log` (`object_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_log_change_type` ON `inventory_log` (`change_type`);--> statement-breakpoint
CREATE INDEX `idx_inventory_log_print_job` ON `inventory_log` (`print_job_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_log_created_at` ON `inventory_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `module_filament_slots` (
	`module_id` integer NOT NULL,
	`slot_index` integer NOT NULL,
	`spool_preset_id` integer,
	PRIMARY KEY(`module_id`, `slot_index`),
	FOREIGN KEY (`module_id`) REFERENCES `print_modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spool_preset_id`) REFERENCES `spool_presets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_module_filament_slots_preset` ON `module_filament_slots` (`spool_preset_id`);--> statement-breakpoint
CREATE TABLE `objects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`in_stock` integer DEFAULT 0 NOT NULL,
	`min_threshold` integer DEFAULT 0 NOT NULL,
	`last_count_date` integer,
	`last_count_discrepancy` integer,
	`category` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_objects_sku` ON `objects` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_objects_category` ON `objects` (`category`);--> statement-breakpoint
CREATE INDEX `idx_objects_stock` ON `objects` (`in_stock`,`min_threshold`);--> statement-breakpoint
CREATE TABLE `plate_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`dimension_x` integer,
	`dimension_y` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_plate_presets_name` ON `plate_presets` (`name`);--> statement-breakpoint
CREATE TABLE `print_job_spools` (
	`print_job_id` integer NOT NULL,
	`slot_index` integer NOT NULL,
	`spool_id` integer,
	`used_weight` integer,
	PRIMARY KEY(`print_job_id`, `slot_index`),
	FOREIGN KEY (`print_job_id`) REFERENCES `print_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_print_job_spools_spool` ON `print_job_spools` (`spool_id`);--> statement-breakpoint
CREATE TABLE `print_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_id` integer,
	`printer_id` integer,
	`external_task_id` text,
	`start_time` integer,
	`expected_end_time` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`failure_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `print_modules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_print_jobs_external_task_id` ON `print_jobs` (`external_task_id`);--> statement-breakpoint
CREATE INDEX `idx_print_jobs_printer` ON `print_jobs` (`printer_id`);--> statement-breakpoint
CREATE INDEX `idx_print_jobs_module` ON `print_jobs` (`module_id`);--> statement-breakpoint
CREATE INDEX `idx_print_jobs_status` ON `print_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_print_jobs_created_at` ON `print_jobs` (`created_at`);--> statement-breakpoint
CREATE TABLE `print_modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`weight` integer NOT NULL,
	`expected_time_minutes` integer NOT NULL,
	`objects_per_print` integer NOT NULL,
	`plate_preset_id` integer NOT NULL,
	`printer_preset_id` integer NOT NULL,
	`object_id` integer,
	`nozzle_diameter` real,
	`filename` text NOT NULL,
	`thumbnail` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plate_preset_id`) REFERENCES `plate_presets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`printer_preset_id`) REFERENCES `printer_presets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_print_modules_object` ON `print_modules` (`object_id`);--> statement-breakpoint
CREATE INDEX `idx_print_modules_printer_preset` ON `print_modules` (`printer_preset_id`);--> statement-breakpoint
CREATE INDEX `idx_print_modules_plate_preset` ON `print_modules` (`plate_preset_id`);--> statement-breakpoint
CREATE INDEX `idx_print_modules_active` ON `print_modules` (`active`);--> statement-breakpoint
CREATE TABLE `printer_loaded_spools` (
	`printer_id` integer NOT NULL,
	`slot_index` integer NOT NULL,
	`spool_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`printer_id`, `slot_index`),
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_printer_loaded_spools_spool` ON `printer_loaded_spools` (`spool_id`);--> statement-breakpoint
CREATE TABLE `printer_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model` text NOT NULL,
	`brand` text NOT NULL,
	`dimension_x` integer,
	`dimension_y` integer,
	`dimension_z` integer,
	`device_file_path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_printer_presets_brand_model` ON `printer_presets` (`brand`,`model`);--> statement-breakpoint
CREATE TABLE `printer_queued_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printer_id` integer NOT NULL,
	`module_id` integer NOT NULL,
	`reason` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_completed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `print_modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_printer_queued_jobs_printer_sort` ON `printer_queued_jobs` (`printer_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_printer_queued_jobs_printer` ON `printer_queued_jobs` (`printer_id`);--> statement-breakpoint
CREATE TABLE `printer_secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printer_id` integer NOT NULL,
	`printer_ip` text,
	`serial` text,
	`access_code` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_printer_secrets_printer` ON `printer_secrets` (`printer_id`);--> statement-breakpoint
CREATE TABLE `printers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`printer_preset_id` integer NOT NULL,
	`loaded_plate_id` integer,
	`loaded_nozzle_diameter` real,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`printer_preset_id`) REFERENCES `printer_presets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`loaded_plate_id`) REFERENCES `plate_presets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_printers_preset` ON `printers` (`printer_preset_id`);--> statement-breakpoint
CREATE INDEX `idx_printers_active` ON `printers` (`active`);--> statement-breakpoint
CREATE TABLE `shopify_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`order_number` text,
	`processed_at` integer,
	`total_items` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_shopify_orders_order_id` ON `shopify_orders` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_shopify_orders_processed_at` ON `shopify_orders` (`processed_at`);--> statement-breakpoint
CREATE TABLE `shopify_sku_mapping` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopify_sku` text NOT NULL,
	`object_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_shopify_sku_mapping_sku_object` ON `shopify_sku_mapping` (`shopify_sku`,`object_id`);--> statement-breakpoint
CREATE INDEX `idx_shopify_sku_mapping_sku` ON `shopify_sku_mapping` (`shopify_sku`);--> statement-breakpoint
CREATE TABLE `spool_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`color` text NOT NULL,
	`brand` text NOT NULL,
	`material` text NOT NULL,
	`default_weight` integer NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`in_storage` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preset_id` integer,
	`initial_weight` integer NOT NULL,
	`remaining_weight` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `spool_presets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_spools_preset` ON `spools` (`preset_id`);