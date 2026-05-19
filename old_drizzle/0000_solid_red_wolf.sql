CREATE TABLE `ai_recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printer_id` integer,
	`recommendation_type` text NOT NULL,
	`context_hash` text,
	`input_context` text,
	`ai_response` text,
	`parsed_recommendations` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`expires_at` integer,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `grid_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT 0,
	`grid_config` text NOT NULL,
	`rows` integer DEFAULT 3 NOT NULL,
	`cols` integer DEFAULT 3 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `idx_grid_presets_default` ON `grid_presets` (`is_default`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sku` text,
	`description` text,
	`image_path` text,
	`stock_count` integer DEFAULT 0 NOT NULL,
	`min_threshold` integer DEFAULT 5 NOT NULL,
	`total_added` integer DEFAULT 0,
	`total_sold` integer DEFAULT 0,
	`total_sold_b2c` integer DEFAULT 0,
	`total_sold_b2b` integer DEFAULT 0,
	`total_removed_manually` integer DEFAULT 0,
	`last_count_date` integer,
	`last_count_expected` integer,
	`last_count_actual` integer,
	`category` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_slug_unique` ON `inventory` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_sku_unique` ON `inventory` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_inventory_sku` ON `inventory` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_inventory_slug` ON `inventory` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_inventory_low_stock` ON `inventory` (`stock_count`,`min_threshold`);--> statement-breakpoint
CREATE TABLE `inventory_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inventory_id` integer NOT NULL,
	`change_type` text NOT NULL,
	`quantity` integer NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_log_inventory` ON `inventory_log` (`inventory_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_log_type` ON `inventory_log` (`change_type`);--> statement-breakpoint
CREATE INDEX `idx_inventory_log_created_at` ON `inventory_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_inventory_log_change_type` ON `inventory_log` (`change_type`);--> statement-breakpoint
CREATE TABLE `module_spool_presets` (
	`module_id` integer NOT NULL,
	`spool_preset_id` integer NOT NULL,
	PRIMARY KEY(`module_id`, `spool_preset_id`),
	FOREIGN KEY (`module_id`) REFERENCES `print_modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spool_preset_id`) REFERENCES `spool_presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `print_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`module_id` integer,
	`printer_id` integer,
	`spool_id` integer,
	`start_time` integer,
	`end_time` integer,
	`status` text DEFAULT 'printing',
	`failure_reason` text,
	`planned_weight` integer NOT NULL,
	`actual_weight` integer,
	`waste_weight` integer DEFAULT 0,
	`pi_task_id` text,
	FOREIGN KEY (`module_id`) REFERENCES `print_modules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_print_jobs_printer` ON `print_jobs` (`printer_id`);--> statement-breakpoint
CREATE INDEX `idx_print_jobs_spool` ON `print_jobs` (`spool_id`);--> statement-breakpoint
CREATE INDEX `idx_print_jobs_module` ON `print_jobs` (`module_id`);--> statement-breakpoint
CREATE TABLE `print_modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`expected_weight` integer,
	`expected_time` integer,
	`objects_per_print` integer DEFAULT 1,
	`default_spool_preset_id` integer,
	`inventory_slug` text,
	`printer_model` text,
	`printer_model_id` integer,
	`local_file_handler_path` text,
	`image_path` text,
	`file_name` text,
	`thumbnail` text,
	`filament_type` text,
	`filament_color` text,
	`plate_type` text,
	`nozzle_diameter` real,
	`pi_file_path` text,
	`file_stored_on_pi` integer DEFAULT 0,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`default_spool_preset_id`) REFERENCES `spool_presets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_slug`) REFERENCES `inventory`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`printer_model_id`) REFERENCES `printer_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_print_modules_inventory_slug` ON `print_modules` (`inventory_slug`);--> statement-breakpoint
CREATE TABLE `printer_downtime` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printer_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`note` text,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_printer_downtime_printer` ON `printer_downtime` (`printer_id`);--> statement-breakpoint
CREATE TABLE `printer_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`build_volume_x` real,
	`build_volume_y` real,
	`build_volume_z` real,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printer_models_name_unique` ON `printer_models` (`name`);--> statement-breakpoint
CREATE TABLE `printers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`model` text DEFAULT 'P1S',
	`printer_model_id` integer,
	`status` text DEFAULT 'WAITING',
	`loaded_spool_id` integer,
	`total_hours` real DEFAULT 0,
	`suggested_queue` text,
	`printer_ip` text,
	`printer_serial` text,
	`printer_access_code` text,
	`transport` text DEFAULT 'auto' NOT NULL,
	FOREIGN KEY (`printer_model_id`) REFERENCES `printer_models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loaded_spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_printers_spool` ON `printers` (`loaded_spool_id`);--> statement-breakpoint
CREATE TABLE `shopify_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopify_order_id` text NOT NULL,
	`shopify_order_number` text,
	`processed_at` integer,
	`total_items` integer,
	`status` text DEFAULT 'processed'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shopify_orders_shopify_order_id_unique` ON `shopify_orders` (`shopify_order_id`);--> statement-breakpoint
CREATE INDEX `idx_shopify_orders_order_id` ON `shopify_orders` (`shopify_order_id`);--> statement-breakpoint
CREATE INDEX `idx_shopify_orders_processed_at` ON `shopify_orders` (`processed_at`);--> statement-breakpoint
CREATE TABLE `shopify_sku_mapping` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopify_sku` text NOT NULL,
	`inventory_slug` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`source_type` text DEFAULT 'inventory' NOT NULL,
	`spool_preset_id` integer,
	FOREIGN KEY (`inventory_slug`) REFERENCES `inventory`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_shopify_sku_mapping_sku` ON `shopify_sku_mapping` (`shopify_sku`);--> statement-breakpoint
CREATE INDEX `idx_shopify_sku_mapping_slug` ON `shopify_sku_mapping` (`inventory_slug`);--> statement-breakpoint
CREATE TABLE `shopify_sync` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_order_id` text,
	`last_sync_at` integer,
	`orders_processed` integer DEFAULT 0,
	`items_deducted` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `spool_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`material` text,
	`color` text,
	`default_weight` integer NOT NULL,
	`cost` real,
	`storage_count` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `spools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preset_id` integer,
	`brand` text NOT NULL,
	`material` text NOT NULL,
	`color` text,
	`initial_weight` integer NOT NULL,
	`remaining_weight` integer NOT NULL,
	`cost` real,
	FOREIGN KEY (`preset_id`) REFERENCES `spool_presets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_spools_preset` ON `spools` (`preset_id`);