-- Phase 3 group 3: tenant-scope printers + printer_secrets + printer_loaded_spools.
-- Fresh-DB dev (empty), so NOT NULL is safe with no default.
ALTER TABLE printers ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_printers_workspace ON printers (workspace_id);--> statement-breakpoint
ALTER TABLE printer_secrets ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_printer_secrets_workspace ON printer_secrets (workspace_id);--> statement-breakpoint
ALTER TABLE printer_loaded_spools ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_printer_loaded_spools_workspace ON printer_loaded_spools (workspace_id);
