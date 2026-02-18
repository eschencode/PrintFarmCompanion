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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shopify_sku_mapping_sku ON shopify_sku_mapping(shopify_sku);
CREATE INDEX IF NOT EXISTS idx_shopify_sku_mapping_slug ON shopify_sku_mapping(inventory_slug);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_id ON shopify_orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_processed_at ON shopify_orders(processed_at);
