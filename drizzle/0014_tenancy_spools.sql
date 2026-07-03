-- Phase 3 group 2: tenant-scope spool_presets + spools. Fresh-DB dev (empty),
-- so NOT NULL is safe with no default.
ALTER TABLE spool_presets ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_spool_presets_workspace ON spool_presets (workspace_id);--> statement-breakpoint
ALTER TABLE spools ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_spools_workspace ON spools (workspace_id);
