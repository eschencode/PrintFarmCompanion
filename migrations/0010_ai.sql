-- Store AI recommendation context and results for debugging/caching
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER,
  recommendation_type TEXT NOT NULL, -- 'spool_selection' | 'module_selection'
  context_hash TEXT, -- Hash of input data for caching
  input_context TEXT, -- JSON of data sent to AI
  ai_response TEXT, -- Raw AI response
  parsed_recommendations TEXT, -- JSON of parsed recommendations
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
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
  -- Sales in different time periods
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
  -- Calculate velocity (items per day)
  ROUND(COALESCE(SUM(CASE 
    WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-30 days') * 1000 
    THEN ABS(l.quantity) ELSE 0 
  END), 0) / 30.0, 2) as daily_velocity,
  -- Estimate days until stockout
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

-- Index for faster log queries
CREATE INDEX IF NOT EXISTS idx_inventory_log_created_at ON inventory_log(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_log_change_type ON inventory_log(change_type);