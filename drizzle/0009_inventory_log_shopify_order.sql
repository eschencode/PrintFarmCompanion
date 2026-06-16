-- Link "- sold b2c" inventory_log entries back to the Shopify order that caused
-- them, so the activity feed can group line items under their order.
ALTER TABLE inventory_log ADD shopify_order_id text;--> statement-breakpoint
CREATE INDEX idx_inventory_log_shopify_order ON inventory_log (shopify_order_id);
