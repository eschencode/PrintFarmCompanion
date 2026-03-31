-- Migration 015: Unified print_modules table
-- Renames 'path' -> 'local_file_handler_path', makes expected_weight nullable,
-- adds .3mf metadata columns and pi_file_path for dual-system support.
-- Uses full table recreation (SQLite cannot drop NOT NULL in-place).

BEGIN TRANSACTION;

CREATE TABLE print_modules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  -- Workflow fields (optional until configured)
  expected_weight INTEGER,
  expected_time INTEGER,
  objects_per_print INTEGER DEFAULT 1,
  default_spool_preset_id INTEGER,
  inventory_slug TEXT,
  printer_model TEXT,
  printer_model_id INTEGER,
  -- Local file handler path (opens .3mf in Bambu Studio on local machine)
  local_file_handler_path TEXT,
  -- Legacy image path (for manually assigned images)
  image_path TEXT,
  -- .3mf upload metadata (extracted client-side from Bambu Studio exports)
  file_name TEXT,
  thumbnail TEXT,
  filament_type TEXT,
  filament_color TEXT,
  plate_type TEXT,
  nozzle_diameter REAL,
  -- Pi bridge path (set when .3mf has been pushed to the Raspberry Pi)
  pi_file_path TEXT,
  file_stored_on_pi INTEGER DEFAULT 0,
  FOREIGN KEY (default_spool_preset_id) REFERENCES spool_presets(id),
  FOREIGN KEY (inventory_slug) REFERENCES inventory(slug),
  FOREIGN KEY (printer_model_id) REFERENCES printer_models(id)
);

INSERT INTO print_modules_new (
  id, name, expected_weight, expected_time, objects_per_print,
  default_spool_preset_id, inventory_slug, printer_model, printer_model_id,
  local_file_handler_path, image_path,
  file_name, thumbnail, filament_type, filament_color, plate_type, nozzle_diameter,
  pi_file_path, file_stored_on_pi
)
SELECT
  id, name, expected_weight, expected_time, objects_per_print,
  default_spool_preset_id, inventory_slug, printer_model, printer_model_id,
  path, image_path,
  NULL, NULL, NULL, NULL, NULL, NULL,
  NULL, 0
FROM print_modules;

DROP TABLE print_modules;
ALTER TABLE print_modules_new RENAME TO print_modules;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_print_modules_inventory_slug ON print_modules(inventory_slug);

COMMIT;
