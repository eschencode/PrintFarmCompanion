ALTER TABLE `grid_presets` ADD `grid_config` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `printer_secrets` ADD `transport` text DEFAULT 'auto' NOT NULL;