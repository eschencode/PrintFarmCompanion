-- Global, printer-agnostic print backlog. `source='auto'` rows are rebuilt by
-- regenerateGlobalQueue() from demand/stock; `source='manual'` rows are user pins
-- left untouched by regeneration. Per-printer assignment stays in
-- printer_queued_jobs, derived from this backlog by knapsack at spool-load.
CREATE TABLE print_queue (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	object_id integer NOT NULL,
	module_id integer,
	quantity integer DEFAULT 0 NOT NULL,
	priority text NOT NULL,
	reason text DEFAULT '' NOT NULL,
	source text DEFAULT 'auto' NOT NULL,
	status text DEFAULT 'pending' NOT NULL,
	assigned_printer_id integer,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE cascade,
	FOREIGN KEY (module_id) REFERENCES print_modules(id) ON DELETE SET NULL,
	FOREIGN KEY (assigned_printer_id) REFERENCES printers(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX uniq_print_queue_object_source ON print_queue (object_id, source);--> statement-breakpoint
CREATE INDEX idx_print_queue_status ON print_queue (status);--> statement-breakpoint
CREATE INDEX idx_print_queue_source ON print_queue (source);
