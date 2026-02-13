-- Add storage_count column to spool_presets table
-- Tracks how many unopened spools of each type are in storage
ALTER TABLE spool_presets ADD COLUMN storage_count INTEGER DEFAULT 0;
