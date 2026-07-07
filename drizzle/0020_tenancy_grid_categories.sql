-- Phase 3 group 8: tenant-scope grid_presets + categories. Fresh-DB dev (empty).
ALTER TABLE grid_presets ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_grid_presets_workspace ON grid_presets (workspace_id);--> statement-breakpoint
ALTER TABLE categories ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_categories_workspace ON categories (workspace_id);
