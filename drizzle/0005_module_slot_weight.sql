-- Per-slot expected filament weight (grams) for a module.
-- Nullable: legacy modules without per-slot data fall back to print_modules.weight.
ALTER TABLE module_filament_slots ADD COLUMN weight INTEGER;
