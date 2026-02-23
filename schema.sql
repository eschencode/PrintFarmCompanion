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

-- Finished Goods Inventory - tracks products ready for sale
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic Info
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sku TEXT UNIQUE,
  description TEXT,
  image_path TEXT,
  
  -- Stock Levels
  stock_count INTEGER NOT NULL DEFAULT 0,
  min_threshold INTEGER NOT NULL DEFAULT 5,
  
  -- Metrics
  total_added INTEGER DEFAULT 0,
  total_sold INTEGER DEFAULT 0,
  total_sold_b2c INTEGER DEFAULT 0,
  total_sold_b2b INTEGER DEFAULT 0,
  total_removed_manually INTEGER DEFAULT 0,
  
  -- Manual Count Tracking
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

-- Indexes for inventory
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_slug ON inventory(slug);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory(stock_count, min_threshold);
CREATE INDEX IF NOT EXISTS idx_inventory_log_inventory ON inventory_log(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_log_type ON inventory_log(change_type);

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
  model TEXT DEFAULT 'P1S',
  status TEXT DEFAULT 'WAITING',
  loaded_spool_id INTEGER,
  total_hours REAL DEFAULT 0,
  suggested_queue TEXT,
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
  inventory_slug TEXT,
  model TEXT DEFAULT 'P1S',
  path TEXT NOT NULL,
  image_path TEXT,
  FOREIGN KEY (default_spool_preset_id) REFERENCES spool_presets(id),
  FOREIGN KEY (inventory_slug) REFERENCES inventory(slug)
);

-- Index for print_modules inventory link
CREATE INDEX IF NOT EXISTS idx_print_modules_inventory_slug ON print_modules(inventory_slug);

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

-- ============================================
-- SHOPIFY INTEGRATION TABLES
-- ============================================

-- Shopify SKU to Inventory mapping (for bundles)
-- One Shopify SKU can map to multiple inventory items!
CREATE TABLE IF NOT EXISTS shopify_sku_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shopify_sku TEXT NOT NULL,
  inventory_slug TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (inventory_slug) REFERENCES inventory(slug)
);

-- Track sync state
CREATE TABLE IF NOT EXISTS shopify_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  last_order_id TEXT,
  last_sync_at INTEGER,
  orders_processed INTEGER DEFAULT 0,
  items_deducted INTEGER DEFAULT 0
);

-- Track which orders we've processed (avoid duplicates)
CREATE TABLE IF NOT EXISTS shopify_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shopify_order_id TEXT UNIQUE NOT NULL,
  shopify_order_number TEXT,
  processed_at INTEGER,
  total_items INTEGER,
  status TEXT DEFAULT 'processed'
);

-- Shopify indexes
CREATE INDEX IF NOT EXISTS idx_shopify_sku_mapping_sku ON shopify_sku_mapping(shopify_sku);
CREATE INDEX IF NOT EXISTS idx_shopify_sku_mapping_slug ON shopify_sku_mapping(inventory_slug);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_id ON shopify_orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_processed_at ON shopify_orders(processed_at);



-- AI RECOMMENDATIONS TABLE
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER,
  recommendation_type TEXT NOT NULL, -- 'spool_selection' | 'module_selection'
  context_hash TEXT, -- Hash of input data for caching
  input_context TEXT, -- JSON of data sent to AI
  ai_response TEXT, -- Raw AI response
  parsed_recommendations TEXT, -- JSON of parsed recommendations
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  expires_at INTEGER, -- Cache expiry
  FOREIGN KEY (printer_id) REFERENCES printers(id)
);

-- Aggregated sales velocity view for quick access
CREATE VIEW IF NOT EXISTS inventory_sales_velocity AS
SELECT 
  i.id,
  i.slug,
  i.name,
  i.stock_count,
  i.min_threshold,
  i.stock_count - i.min_threshold as stock_above_min,
  COALESCE(SUM(CASE 
    WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-7 days') * 1000 
    THEN ABS(l.quantity) ELSE 0 
  END), 0) as sold_7d,
  COALESCE(SUM(CASE 
    WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-14 days') * 1000 
    THEN ABS(l.quantity) ELSE 0 
  END), 0) as sold_14d,
  COALESCE(SUM(CASE 
    WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-30 days') * 1000 
    THEN ABS(l.quantity) ELSE 0 
  END), 0) as sold_30d,
  ROUND(COALESCE(SUM(CASE 
    WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-30 days') * 1000 
    THEN ABS(l.quantity) ELSE 0 
  END), 0) / 30.0, 2) as daily_velocity,
  CASE 
    WHEN COALESCE(SUM(CASE 
      WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-30 days') * 1000 
      THEN ABS(l.quantity) ELSE 0 
    END), 0) = 0 THEN 999
    ELSE ROUND(i.stock_count / (COALESCE(SUM(CASE 
      WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-30 days') * 1000 
      THEN ABS(l.quantity) ELSE 0 
    END), 0) / 30.0), 1)
  END as days_until_stockout
FROM inventory i
LEFT JOIN inventory_log l ON l.inventory_id = i.id
GROUP BY i.id;

CREATE INDEX IF NOT EXISTS idx_inventory_log_created_at ON inventory_log(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_log_change_type ON inventory_log(change_type);