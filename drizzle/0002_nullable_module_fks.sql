PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `print_modules_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`weight` integer NOT NULL DEFAULT 0,
	`expected_time_minutes` integer NOT NULL DEFAULT 0,
	`objects_per_print` integer NOT NULL DEFAULT 1,
	`plate_preset_id` integer,
	`printer_preset_id` integer,
	`object_id` integer,
	`nozzle_diameter` real,
	`filename` text NOT NULL,
	`thumbnail` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plate_preset_id`) REFERENCES `plate_presets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`printer_preset_id`) REFERENCES `printer_presets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `print_modules_new` SELECT * FROM `print_modules`;--> statement-breakpoint
DROP TABLE `print_modules`;--> statement-breakpoint
ALTER TABLE `print_modules_new` RENAME TO `print_modules`;--> statement-breakpoint
CREATE INDEX `idx_print_modules_object` ON `print_modules` (`object_id`);--> statement-breakpoint
CREATE INDEX `idx_print_modules_printer_preset` ON `print_modules` (`printer_preset_id`);--> statement-breakpoint
CREATE INDEX `idx_print_modules_plate_preset` ON `print_modules` (`plate_preset_id`);--> statement-breakpoint
CREATE INDEX `idx_print_modules_active` ON `print_modules` (`active`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
