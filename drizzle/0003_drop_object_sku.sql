-- Drop the old unique index on sku, then remove the column.
-- ALTER TABLE DROP COLUMN is cleaner than recreate and avoids FK issues in D1.
DROP INDEX IF EXISTS uniq_objects_sku;
ALTER TABLE objects DROP COLUMN sku;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_objects_name ON objects (name);
