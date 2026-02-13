CREATE TABLE IF NOT EXISTS spool_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT,
  material TEXT,
  color TEXT,
  default_weight INTEGER NOT NULL,
  cost REAL,
  storage_count INTEGER DEFAULT 0
);

-- Spools table
CREATE TABLE IF NOT EXISTS spools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER,
  brand TEXT NOT NULL,
  material TEXT NOT NULL,
  color TEXT,
  initial_weight INTEGER NOT NULL,
  remaining_weight INTEGER NOT NULL,
  cost REAL,
  FOREIGN KEY (preset_id) REFERENCES spool_presets(id)
);

-- Printers table
CREATE TABLE IF NOT EXISTS printers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT,
  status TEXT DEFAULT 'WAITING',
  loaded_spool_id INTEGER,
  total_hours REAL DEFAULT 0,
  FOREIGN KEY (loaded_spool_id) REFERENCES spools(id)
);

-- Print Modules table
CREATE TABLE IF NOT EXISTS print_modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  expected_weight INTEGER NOT NULL,
  expected_time INTEGER,
  objects_per_print INTEGER DEFAULT 1,
  default_spool_preset_id INTEGER,
  path TEXT NOT NULL,
  image_path TEXT,
  FOREIGN KEY (default_spool_preset_id) REFERENCES spool_presets(id)
);

-- Print Jobs table
CREATE TABLE IF NOT EXISTS print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  module_id INTEGER,
  printer_id INTEGER,
  spool_id INTEGER,
  start_time INTEGER,
  end_time INTEGER,
  status TEXT DEFAULT 'printing',
  failure_reason TEXT,
  planned_weight INTEGER NOT NULL,
  actual_weight INTEGER,
  waste_weight INTEGER DEFAULT 0,
  FOREIGN KEY (module_id) REFERENCES print_modules(id),
  FOREIGN KEY (printer_id) REFERENCES printers(id),
  FOREIGN KEY (spool_id) REFERENCES spools(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_spools_preset ON spools(preset_id);
CREATE INDEX IF NOT EXISTS idx_printers_spool ON printers(loaded_spool_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_printer ON print_jobs(printer_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_spool ON print_jobs(spool_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_module ON print_jobs(module_id);

-- Grid Presets table - stores configurable grid layouts
CREATE TABLE IF NOT EXISTS grid_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  grid_config TEXT NOT NULL,  -- JSON array of cells
  rows INTEGER NOT NULL DEFAULT 3,
  cols INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);

-- Index for quick default lookup
CREATE INDEX IF NOT EXISTS idx_grid_presets_default ON grid_presets(is_default);