-- Printer Models preset table
CREATE TABLE IF NOT EXISTS printer_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  build_volume_x REAL,
  build_volume_y REAL,
  build_volume_z REAL,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Add printer_model_id to printers
ALTER TABLE printers ADD COLUMN printer_model_id INTEGER REFERENCES printer_models(id);

-- Add printer_model_id to print_modules
ALTER TABLE print_modules ADD COLUMN printer_model_id INTEGER REFERENCES printer_models(id);

-- Migrate existing text-based model values into printer_models table
-- and link them back via printer_model_id
INSERT OR IGNORE INTO printer_models (name)
  SELECT DISTINCT model FROM printers WHERE model IS NOT NULL AND model != '';

INSERT OR IGNORE INTO printer_models (name)
  SELECT DISTINCT printer_model FROM print_modules
  WHERE printer_model IS NOT NULL AND printer_model != ''
    AND printer_model NOT IN (SELECT name FROM printer_models);

-- Update printers to reference the new table
UPDATE printers SET printer_model_id = (
  SELECT pm.id FROM printer_models pm WHERE pm.name = printers.model
) WHERE model IS NOT NULL AND model != '';

-- Update print_modules to reference the new table
UPDATE print_modules SET printer_model_id = (
  SELECT pm.id FROM printer_models pm WHERE pm.name = print_modules.printer_model
) WHERE printer_model IS NOT NULL AND printer_model != '';
