-- Per-printer append-only event log for the dashboard history modal.
-- Emitted from spool load/unload, job start, Pi print_finished, job
-- completion, and retroactive outcome changes. Jobs predating this table
-- get a derived timeline in the UI (start_time/updated_at) — no backfill.
CREATE TABLE printer_events (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
	printer_id integer NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
	print_job_id integer REFERENCES print_jobs(id) ON DELETE SET NULL,
	event_type text NOT NULL,
	detail text,
	created_at integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE INDEX idx_printer_events_printer ON printer_events (workspace_id, printer_id, created_at);--> statement-breakpoint
CREATE INDEX idx_printer_events_job ON printer_events (print_job_id);
