-- Finished Goods Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sku TEXT UNIQUE,
  description TEXT,
  image_path TEXT,
  stock_count INTEGER NOT NULL DEFAULT 0,
  min_threshold INTEGER NOT NULL DEFAULT 5,
  total_added INTEGER DEFAULT 0,
  total_sold INTEGER DEFAULT 0,
  total_sold_b2c INTEGER DEFAULT 0,
  total_sold_b2b INTEGER DEFAULT 0,
  total_removed_manually INTEGER DEFAULT 0,
  last_count_date INTEGER,
  last_count_expected INTEGER,
  last_count_actual INTEGER
);

-- Inventory Log - tracks all stock movements
CREATE TABLE IF NOT EXISTS inventory_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_slug ON inventory(slug);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory(stock_count, min_threshold);
CREATE INDEX IF NOT EXISTS idx_inventory_log_inventory ON inventory_log(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_log_type ON inventory_log(change_type);