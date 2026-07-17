-- Affiliate Phase 3: broken-printer capture + spare-part catalog.
-- See docs/affiliate-monetization.md.

-- Why the printer was marked broken. Set by PATCH /api/printer/:id
-- {action:'broken'}; cleared on 'repaired'. hms_code is the canonical
-- "XXXX_XXXX_XXXX_XXXX" string (nullable — manual breakage has no code).
ALTER TABLE printers ADD COLUMN broken_reason text;--> statement-breakpoint
ALTER TABLE printers ADD COLUMN broken_hms_code text;--> statement-breakpoint
ALTER TABLE printers ADD COLUMN broken_at integer;--> statement-breakpoint

-- catalog_items grows beyond filament: kind 'filament' | 'part'.
-- part_category keys the HMS→part mapping ('hotend', 'heatbed', 'ams', ...).
-- name is the display label for parts (filament rows derive theirs from
-- brand+color+material and leave it NULL).
ALTER TABLE catalog_items ADD COLUMN kind text NOT NULL DEFAULT 'filament';--> statement-breakpoint
ALTER TABLE catalog_items ADD COLUMN part_category text;--> statement-breakpoint
ALTER TABLE catalog_items ADD COLUMN name text;
