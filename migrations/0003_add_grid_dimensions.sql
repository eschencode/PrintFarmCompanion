-- Add rows and cols columns to grid_presets for configurable grid dimensions
ALTER TABLE grid_presets ADD COLUMN rows INTEGER NOT NULL DEFAULT 3;
ALTER TABLE grid_presets ADD COLUMN cols INTEGER NOT NULL DEFAULT 3;
