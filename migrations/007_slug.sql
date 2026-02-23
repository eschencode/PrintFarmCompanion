-- Link modules to inventory items by slug (text reference)
ALTER TABLE print_modules ADD COLUMN inventory_slug TEXT REFERENCES inventory(slug);

-- Index for the new column
CREATE INDEX IF NOT EXISTS idx_print_modules_inventory_slug ON print_modules(inventory_slug);