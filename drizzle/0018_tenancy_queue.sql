-- Phase 3 group 6: tenant-scope print_queue + printer_queued_jobs.
-- Fresh-DB dev (empty), so NOT NULL is safe with no default.
ALTER TABLE printer_queued_jobs ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_printer_queued_jobs_workspace ON printer_queued_jobs (workspace_id);--> statement-breakpoint
ALTER TABLE print_queue ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_print_queue_workspace ON print_queue (workspace_id);
