-- Add missing columns to print_modules without recreating the table
-- (avoids FK constraint issues with print_jobs referencing print_modules)
ALTER TABLE print_modules ADD COLUMN local_file_handler_path TEXT;
ALTER TABLE print_modules ADD COLUMN file_name TEXT;
ALTER TABLE print_modules ADD COLUMN thumbnail TEXT;
ALTER TABLE print_modules ADD COLUMN filament_type TEXT;
ALTER TABLE print_modules ADD COLUMN filament_color TEXT;
ALTER TABLE print_modules ADD COLUMN plate_type TEXT;
ALTER TABLE print_modules ADD COLUMN nozzle_diameter REAL;
ALTER TABLE print_modules ADD COLUMN pi_file_path TEXT;
ALTER TABLE print_modules ADD COLUMN file_stored_on_pi INTEGER DEFAULT 0;
