-- Junction table: one module can have multiple spool presets
CREATE TABLE IF NOT EXISTS module_spool_presets (
  module_id       INTEGER NOT NULL,
  spool_preset_id INTEGER NOT NULL,
  PRIMARY KEY (module_id, spool_preset_id),
  FOREIGN KEY (module_id)       REFERENCES print_modules(id)  ON DELETE CASCADE,
  FOREIGN KEY (spool_preset_id) REFERENCES spool_presets(id)  ON DELETE CASCADE
);

-- Migrate existing single-preset assignments into the new table
INSERT OR IGNORE INTO module_spool_presets (module_id, spool_preset_id)
SELECT id, default_spool_preset_id
FROM   print_modules
WHERE  default_spool_preset_id IS NOT NULL;
