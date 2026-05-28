-- Catalog cache of Shopify product variants, refreshed (wipe + reinsert) on
-- demand. Powers the SKU picker in the mapping UI. Not user data —
-- shopify_sku_mapping references the sku string, not a row here.
CREATE TABLE shopify_skus (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	sku text NOT NULL,
	product_title text,
	variant_title text,
	product_id text,
	variant_id text,
	synced_at integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX uniq_shopify_skus_sku ON shopify_skus (sku);
