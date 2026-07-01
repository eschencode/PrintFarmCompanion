-- Phase 3 group 1: tenant-scope objects + inventory_log.
-- Fresh-DB dev workflow (tables are empty), so NOT NULL is safe with no default.
-- objects.name uniqueness moves from global to per-workspace.
ALTER TABLE objects ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
DROP INDEX IF EXISTS uniq_objects_name;--> statement-breakpoint
CREATE UNIQUE INDEX uniq_objects_workspace_name ON objects (workspace_id, name);--> statement-breakpoint
CREATE INDEX idx_objects_workspace ON objects (workspace_id);--> statement-breakpoint
ALTER TABLE inventory_log ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_inventory_log_workspace ON inventory_log (workspace_id);
