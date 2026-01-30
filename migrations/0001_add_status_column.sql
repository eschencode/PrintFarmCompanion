-- Step 1: Add the new status column with default value
ALTER TABLE print_jobs ADD COLUMN status TEXT DEFAULT 'printing';

-- Step 2: Migrate existing data from success (INTEGER) to status (TEXT)
UPDATE print_jobs 
SET status = CASE 
  WHEN success = 1 THEN 'success'
  WHEN success = 0 THEN 'failed'
  WHEN success IS NULL OR end_time IS NULL THEN 'printing'
  ELSE 'printing'
END;

-- Step 3: We keep the old 'success' column for now as backup
-- You can drop it later after verifying everything works:
-- ALTER TABLE print_jobs DROP COLUMN success;