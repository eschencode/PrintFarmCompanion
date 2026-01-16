-- Sample Spool Presets
INSERT INTO spool_presets (name, brand, material, color, default_weight, cost) VALUES
  ('Bambu Blau', 'Generic', 'PLA', 'Blau', 1000, 10.99);


-- Sample Spools
INSERT INTO spools (preset_id, brand, material, color, initial_weight, remaining_weight, cost) VALUES
  (1, 'Generic', 'PLA', 'White', 1000, 850, 20.00),
  (1, 'Generic', 'PETG', 'Black', 1000, 1000, 25.00);

-- Sample Printers
INSERT INTO printers (name, model, status, loaded_spool_id, total_hours) VALUES
	('Mitarbeiter 01', 'P1s', 'IDLE', NULL, 0),
	('Mitarbeiter 02', 'P1s', 'IDLE', NULL, 0),
    ('Mitarbeiter 03', 'P1s', 'IDLE', NULL, 0),
	('Mitarbeiter 04', 'P1s', 'IDLE', NULL, 0),
	('Mitarbeiter 05', 'P1s', 'IDLE', NULL, 0),
	('Mitarbeiter 06', 'P1s', 'IDLE', NULL, 0),
	('Rentner 01', 'P1s', 'IDLE', NULL, 0);

-- Sample Print Modules
INSERT INTO print_modules (name, expected_weight, expected_time, objects_per_print, default_spool_preset_id, path) VALUES
  ('haken Blau', 175, 300, 19, 1, '/models/haken_blau.3mf');

