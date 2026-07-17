-- Affiliate monetization, Phase 1. See docs/affiliate-monetization.md.
-- catalog_items is a GLOBAL system catalog (no workspace_id) — your data,
-- hand-seeded from vendor product pages, not tenant data.
CREATE TABLE catalog_items (
  id integer PRIMARY KEY AUTOINCREMENT,
  vendor text NOT NULL,              -- 'bambu', 'amazon', ...
  brand text NOT NULL,
  material text NOT NULL,            -- PLA, PETG, ... (matches spool_presets.material)
  color text,                        -- representative color name (nullable)
  color_hex text,                    -- swatch for the UI
  weight integer,                    -- nominal grams
  sku text,
  url_us text,                       -- regional product-page URLs
  url_eu text,
  url_uk text,
  image text,
  active integer NOT NULL DEFAULT 1,
  created_at integer NOT NULL DEFAULT (unixepoch()),
  updated_at integer NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE INDEX idx_catalog_items_match ON catalog_items (brand, material);--> statement-breakpoint

-- Append-only click log for buy-link analytics.
CREATE TABLE affiliate_clicks (
  id integer PRIMARY KEY AUTOINCREMENT,
  workspace_id integer REFERENCES workspaces(id) ON DELETE cascade,
  catalog_item_id integer REFERENCES catalog_items(id) ON DELETE set null,
  preset_id integer,                 -- no FK: keep the click record if the preset is later deleted
  placement text NOT NULL,           -- 'reorder', 'preset_picker', 'broken_printer'
  region text,
  target_url text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE INDEX idx_affiliate_clicks_workspace ON affiliate_clicks (workspace_id);--> statement-breakpoint

-- Which regional store a workspace's links point to.
ALTER TABLE workspaces ADD COLUMN store_region text NOT NULL DEFAULT 'us';--> statement-breakpoint

-- Set when a preset is created from the catalog (Phase 2) → exact buy links.
ALTER TABLE spool_presets ADD COLUMN catalog_item_id integer REFERENCES catalog_items(id) ON DELETE set null;
