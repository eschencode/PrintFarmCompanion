-- Convert expected_time from seconds to minutes for all existing records.
-- Bambu's prediction field is in seconds; everything else should now use minutes.
UPDATE print_modules
SET expected_time = ROUND(expected_time / 60.0)
WHERE expected_time IS NOT NULL AND expected_time > 0;
