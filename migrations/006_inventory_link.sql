ALTER TABLE print_modules ADD COLUMN inventory_id INTEGER REFERENCES inventory(id);

-- Index for the new column
CREATE INDEX IF NOT EXISTS idx_print_modules_inventory ON print_modules(inventory_id);