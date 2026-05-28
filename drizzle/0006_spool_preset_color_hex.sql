-- Hex colour for spool presets, used for UI swatches and the spool gauges.
-- `color` remains the human-readable name; this is the visual value.
ALTER TABLE spool_presets ADD COLUMN color_hex TEXT;
