-- Add slot_count to printers (1 = single-colour, 4 = AMS, etc.)
ALTER TABLE printers ADD COLUMN slot_count INTEGER NOT NULL DEFAULT 1;

-- Seed one empty slot-0 row for every existing printer that has no slot row yet.
-- Uses INSERT OR IGNORE because the PK (printer_id, slot_index) prevents duplicates.
INSERT OR IGNORE INTO printer_loaded_spools (printer_id, slot_index, spool_id, created_at, updated_at)
SELECT id, 0, NULL, unixepoch(), unixepoch()
FROM printers;
