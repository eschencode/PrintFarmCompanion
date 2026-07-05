-- Phase 3 group 4: tenant-scope print_modules + module_filament_slots.
-- Fresh-DB dev (empty), so NOT NULL is safe with no default.
ALTER TABLE print_modules ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_print_modules_workspace ON print_modules (workspace_id);--> statement-breakpoint
ALTER TABLE module_filament_slots ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX idx_module_filament_slots_workspace ON module_filament_slots (workspace_id);
