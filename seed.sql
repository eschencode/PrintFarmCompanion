-- Sample Spool Presets
INSERT INTO spool_presets (name, brand, material, color, default_weight, cost) VALUES
  ('Bambu Blau', 'Bambu lap', 'PLA', 'Blau', 1000, 10.99),
  ('Blau Jake', '3dJake','PLA', 'Blau', 1000, 20),
  ('Pink', '3dJake','PLA', 'Pink', 1000, 20),
  ('Orange', '3dJake','PLA', 'Blau', 5000, 20),
  ('Transparent', '3dJake','PLA', 'Transparent', 1000, 20),
  ('Lila', 'Bambu lap', 'PLA', 'lila', 1000, 10.99),
  ('Rosa', 'Bambu lap', 'PLA', 'Rosa', 1000, 10.99),
  ('Green', 'Bambu lap', 'PLA', 'Green', 1000, 10.99),

-- Sample Printers
INSERT INTO printers (name, model, status, loaded_spool_id, total_hours) VALUES
	('Mitarbeiter 01', 'P1s', 'IDLE', NULL, 0),
	('Mitarbeiter 02', 'P1s', 'IDLE', NULL, 0),
    ('Mitarbeiter 03', 'P1s', 'IDLE', NULL, 0),
	('Mitarbeiter 04', 'P1s', 'IDLE', NULL, 0),
	('Mitarbeiter 05', 'P1s', 'IDLE', NULL, 0),
	('Mitarbeiter 06', 'P1s', 'IDLE', NULL, 0),
	('Rentner 01', 'P1s', 'IDLE', NULL, 0);

INSERT INTO print_modules (name, expected_weight, expected_time, objects_per_print, default_spool_preset_id, path, image_path) VALUES
  ('Kleben Haken Blau ', 179, 256, 20, 2, '/Users/linus/Documents/3d-models/Haken/blau/Haken_blau_kleben.3mf', '/images/haken.JPG'),
  ('Kleben Haken Blau ', 181, 321, 20, 2, '/Users/linus/Documents/3d-models/Haken/blau/Haken_blau_schrauben.3mf', '/images/haken.JPG'),
