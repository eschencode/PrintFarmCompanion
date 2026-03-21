-- Extend SKU mappings to support both inventory items and spool presets (storage)
-- source_type: 'inventory' (default) or 'storage'
-- For 'storage' type, spool_preset_id references the spool preset
ALTER TABLE shopify_sku_mapping ADD COLUMN source_type TEXT NOT NULL DEFAULT 'inventory';
ALTER TABLE shopify_sku_mapping ADD COLUMN spool_preset_id INTEGER;
