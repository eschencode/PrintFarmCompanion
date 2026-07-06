-- Phase 3 group 7: tenant-scope the Shopify tables. Fresh-DB dev (empty).
-- shopify_settings: one row per workspace (was a single id=1 singleton).
ALTER TABLE shopify_settings ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX uniq_shopify_settings_workspace ON shopify_settings (workspace_id);--> statement-breakpoint

ALTER TABLE shopify_sku_mapping ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
DROP INDEX IF EXISTS uniq_shopify_sku_mapping_sku_object;--> statement-breakpoint
CREATE UNIQUE INDEX uniq_shopify_sku_mapping_sku_object ON shopify_sku_mapping (workspace_id, shopify_sku, object_id);--> statement-breakpoint
CREATE INDEX idx_shopify_sku_mapping_workspace ON shopify_sku_mapping (workspace_id);--> statement-breakpoint

ALTER TABLE shopify_orders ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
DROP INDEX IF EXISTS uniq_shopify_orders_order_id;--> statement-breakpoint
CREATE UNIQUE INDEX uniq_shopify_orders_order_id ON shopify_orders (workspace_id, order_id);--> statement-breakpoint
CREATE INDEX idx_shopify_orders_workspace ON shopify_orders (workspace_id);--> statement-breakpoint

ALTER TABLE shopify_skus ADD COLUMN workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
DROP INDEX IF EXISTS uniq_shopify_skus_sku;--> statement-breakpoint
CREATE UNIQUE INDEX uniq_shopify_skus_sku ON shopify_skus (workspace_id, sku);--> statement-breakpoint
CREATE INDEX idx_shopify_skus_workspace ON shopify_skus (workspace_id);
