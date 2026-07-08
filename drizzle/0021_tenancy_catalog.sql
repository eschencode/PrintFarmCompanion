-- Phase 3 group 9: hybrid catalog scope for printer_presets + plate_presets.
-- workspace_id is NULLABLE: NULL = shared system catalog, set = a workspace's
-- custom entry. Unique dedup uses COALESCE(workspace_id, 0) so all system rows
-- share scope 0 (SQLite treats NULLs as distinct in a plain unique index).
ALTER TABLE printer_presets ADD COLUMN workspace_id integer REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
DROP INDEX IF EXISTS uniq_printer_presets_brand_model;--> statement-breakpoint
CREATE UNIQUE INDEX uniq_printer_presets_brand_model ON printer_presets (COALESCE(workspace_id, 0), brand, model);--> statement-breakpoint
CREATE INDEX idx_printer_presets_workspace ON printer_presets (workspace_id);--> statement-breakpoint

ALTER TABLE plate_presets ADD COLUMN workspace_id integer REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
DROP INDEX IF EXISTS uniq_plate_presets_name;--> statement-breakpoint
CREATE UNIQUE INDEX uniq_plate_presets_name ON plate_presets (COALESCE(workspace_id, 0), name);--> statement-breakpoint
CREATE INDEX idx_plate_presets_workspace ON plate_presets (workspace_id);
