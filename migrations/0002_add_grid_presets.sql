-- Grid Presets table - stores configurable 3x3 grid layouts
CREATE TABLE IF NOT EXISTS grid_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  grid_config TEXT NOT NULL,  -- JSON array of 9 cells
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);

-- Index for quick default lookup
CREATE INDEX IF NOT EXISTS idx_grid_presets_default ON grid_presets(is_default);
