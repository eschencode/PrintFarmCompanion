-- Add category field to inventory items
-- Replaces hard-coded slug-pattern categorisation in the UI
ALTER TABLE inventory ADD COLUMN category TEXT NOT NULL DEFAULT '';
