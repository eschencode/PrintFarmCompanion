-- Migration 022: Add active flag to print_modules
-- When active = 0, the module is saved but excluded from AI/queue recommendations.
ALTER TABLE print_modules ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
