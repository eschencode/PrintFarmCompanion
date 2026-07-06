-- Phase 3 group 5: tenant-scope print_jobs + print_job_spools.
-- Fresh-DB dev (empty), so NOT NULL is safe with no default.
ALTER TABLE print_jobs ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_print_jobs_workspace ON print_jobs (workspace_id);--> statement-breakpoint
ALTER TABLE print_job_spools ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_print_job_spools_workspace ON print_job_spools (workspace_id);
