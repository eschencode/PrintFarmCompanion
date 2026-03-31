-- Migration 016: Pi bridge support
-- Adds per-printer Bambu Lab credentials (Pi receives these per-request, no Pi-side config needed)
-- Adds pi_task_id to print_jobs for webhook status matching

ALTER TABLE printers ADD COLUMN printer_ip TEXT;
ALTER TABLE printers ADD COLUMN printer_serial TEXT;
ALTER TABLE printers ADD COLUMN printer_access_code TEXT;

ALTER TABLE print_jobs ADD COLUMN pi_task_id TEXT;
