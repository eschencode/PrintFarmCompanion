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
