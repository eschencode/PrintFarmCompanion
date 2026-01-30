-- Sample Spool Presets
INSERT INTO spool_presets (name, brand, material, color, default_weight, cost) VALUES
  ('Bambu Blau', 'Bambu lap', 'PLA', 'Blau', 1000, 10.99),
  ('Blau Jake', '3dJake','PLA', 'Blau', 1000, 20),
  ('Pink', '3dJake','PLA', 'Pink', 1000, 20),
  ('Orange', '3dJake','PLA', 'Orange', 5000, 20),
  ('Transparent', '3dJake','PLA', 'Transparent', 1000, 20),
  ('Lila', 'Bambu lap', 'PLA', 'Lila', 1000, 10.99),
  ('Rosa', 'Bambu lap', 'PLA', 'Rosa', 1000, 10.99),
  ('Green', 'Bambu lap', 'PLA', 'Green', 1000, 10.99);

-- Sample Printers
INSERT INTO printers (name, model, status, loaded_spool_id, total_hours) VALUES
  ('Mitarbeiter 01', 'P1s', 'IDLE', NULL, 145.5),
  ('Mitarbeiter 02', 'P1s', 'IDLE', NULL, 138.2),
  ('Mitarbeiter 03', 'P1s', 'IDLE', NULL, 152.7),
  ('Mitarbeiter 04', 'P1s', 'IDLE', NULL, 141.3),
  ('Mitarbeiter 05', 'P1s', 'IDLE', NULL, 136.8),
  ('Mitarbeiter 06', 'P1s', 'IDLE', NULL, 129.4),
  ('Rentner 01', 'P1s', 'IDLE', NULL, 95.2);

-- Print Modules
INSERT INTO print_modules (name, expected_weight, expected_time, objects_per_print, default_spool_preset_id, path, image_path) VALUES
  ('Kleben Haken Blau', 179, 256, 20, 2, '/Users/linus/Documents/3d-models/Haken/blau/Haken_blau_kleben.3mf', '/images/haken.JPG'),
  ('Schrauben Haken Blau', 181, 321, 20, 2, '/Users/linus/Documents/3d-models/Haken/blau/Haken_blau_schrauben.3mf', '/images/haken.JPG'),
  ('vase', 752, 1146, 4, 2, '/Users/linus/Documents/3d-models/Vasen/vase_Jakex4.3mf', '/images/vase.JPG'),
  ('vase', 752, 1146, 4, 3, '/Users/linus/Documents/3d-models/Vasen/vase_Jakex4.3mf', '/images/vase.JPG'),
  ('vase', 752, 1146, 4, 4, '/Users/linus/Documents/3d-models/Vasen/vase_Jakex4.3mf', '/images/vase.JPG'),
  ('vase', 801, 1146, 4, 1, '/Users/linus/Documents/3d-models/Vasen/vase_bambux4.3mf', '/images/vase.JPG'),
  ('vase', 801, 1146, 4, 6, '/Users/linus/Documents/3d-models/Vasen/vase_bambux4.3mf', '/images/vase.JPG'),
  ('vase', 801, 1146, 4, 7, '/Users/linus/Documents/3d-models/Vasen/vase_bambux4.3mf', '/images/vase.JPG'),
  ('vase', 801, 1146, 4, 8, '/Users/linus/Documents/3d-models/Vasen/vase_bambux4.3mf', '/images/vase.JPG'),
  ('Kleben Haken Pink', 179, 256, 20, 3, '/Users/linus/Documents/3d-models/Haken/pink/P1S_Haken_pink_kleben.3mf', '/images/haken.JPG'),
  ('schrauben Haken Pink', 181, 303, 20, 3, '/Users/linus/Documents/3d-models/Haken/pink/P1S_Haken_pink_schrauben.3mf', '/images/haken.JPG'),
  ('Kleben Haken Orange', 179, 256, 20, 4, '/Users/linus/Documents/3d-models/Haken/orange/P1S_Haken_pink_kleben.3mf', '/images/haken.JPG'),
  ('schrauben Haken Orange', 181, 303, 20, 4, '/Users/linus/Documents/3d-models/Haken/orange/P1S_Haken_pink_schrauben.3mf', '/images/haken.JPG'),
  ('schrauben Halter Oben', 16, 58, 10, 5, '/Users/linus/Documents/3d-models/Haken/Hakenhalter/oben_schrauben_hakenhalter.3mf', '/images/hakenhalter.JPG'),
  ('schrauben Halter unten', 18, 60, 10, 5, '/Users/linus/Documents/3d-models/Haken/Hakenhalter/unten_schrauben_hakenhalter.3mf', '/images/hakenhalter.JPG'),
  ('kleben Halter Oben', 22, 51, 20, 5, '/Users/linus/Documents/3d-models/Haken/Hakenhalter/oben_kleben_hakenhalter.3mf', '/images/hakenhalter.JPG'),
  ('kleben Halter unten', 22, 51, 20, 5, '/Users/linus/Documents/3d-models/Haken/Hakenhalter/unten_kleben_hakenhalter.3mf', '/images/hakenhalter.JPG'),
  ('Schrauben Haken lila', 192, 317, 20, 6, '/Users/linus/Documents/3d-models/Haken/lila/P1S_Haken_lila_schrauben_250216.3mf', '/images/haken.JPG'),
  ('kleben Haken lila', 193, 259, 20, 6, '/Users/linus/Documents/3d-models/Haken/lila/P1S_Haken_rosa_kleben.3mf', '/images/haken.JPG'),
  ('Schrauben Haken rosa', 192, 331, 20, 7, '/Users/linus/Documents/3d-models/Haken/rosa/P1S_Haken_rosa_schrauben_250216.3mf', '/images/haken.JPG'),
  ('kleben Haken rosa', 193, 259, 20, 7, '/Users/linus/Documents/3d-models/Haken/rosa/P1S_Haken_rosa_kleben.3mf', '/images/haken.JPG'),
  ('Schrauben Haken green', 192, 317, 20, 8, '/Users/linus/Documents/3d-models/Haken/green/P1S_Haken_lila_schrauben_250216.3mf', '/images/haken.JPG'),
  ('kleben Haken green', 190, 256, 20, 8, '/Users/linus/Documents/3d-models/Haken/green/P1S_Haken_mudgreen_kleben.3mf', '/images/haken.JPG'),
  ('klohalter', 323, 561, 2, 8, '/Users/linus/Documents/3d-models/Klorolle/Klorollenhalter_bambu.3mf', '/images/klohalter.JPG'),
  ('klohalter', 323, 561, 2, 7, '/Users/linus/Documents/3d-models/Klorolle/Klorollenhalter_bambu.3mf', '/images/klohalter.JPG'),
  ('klohalter', 303, 510, 2, 1, '/Users/linus/Documents/3d-models/Klorolle/Klorollenhalter_bambublau.3mf', '/images/klohalter.JPG'),
  ('klohalter', 302, 660, 2, 3, '/Users/linus/Documents/3d-models/Klorolle/Klorollenhalter_pink.3mf', '/images/klohalter.JPG'),
  ('stab', 387, 600, 12, 1, '/Users/linus/Documents/3d-models/Klorolle/stab.3mf', '/images/stab.JPG'),
  ('stab', 387, 600, 12, 7, '/Users/linus/Documents/3d-models/Klorolle/stab.3mf', '/images/stab.JPG'),
  ('stab', 387, 600, 12, 4, '/Users/linus/Documents/3d-models/Klorolle/stab.3mf', '/images/stab.JPG'),
  ('stöpsel', 308, 660, 62, 7, '/Users/linus/Documents/3d-models/Klorolle/stöpsel.3mf', '/images/stöpsel.JPG'),
  ('stöpsel', 308, 660, 62, 4, '/Users/linus/Documents/3d-models/Klorolle/stöpsel.3mf', '/images/stöpsel.JPG'),
  ('stöpsel', 308, 660, 62, 1, '/Users/linus/Documents/3d-models/Klorolle/stöpsel.3mf', '/images/stöpsel.JPG');

-- Sample Spools for test print jobs
INSERT INTO spools (preset_id, brand, material, color, initial_weight, remaining_weight, cost) VALUES
  (2, '3dJake', 'PLA', 'Blau', 1000, 250, 20.00),      -- Spool 1
  (3, '3dJake', 'PLA', 'Pink', 1000, 380, 20.00),      -- Spool 2
  (4, '3dJake', 'PLA', 'Orange', 5000, 3800, 20.00),   -- Spool 3
  (6, 'Bambu lap', 'PLA', 'Lila', 1000, 120, 10.99),   -- Spool 4
  (7, 'Bambu lap', 'PLA', 'Rosa', 1000, 340, 10.99),   -- Spool 5
  (8, 'Bambu lap', 'PLA', 'Green', 1000, 90, 10.99),   -- Spool 6
  (1, 'Bambu lap', 'PLA', 'Blau', 1000, 410, 10.99),   -- Spool 7
  (5, '3dJake', 'PLA', 'Transparent', 1000, 650, 20.00); -- Spool 8

-- ✅ MASSIVE TEST DATA SET (Last 90 days with ~150 prints including failures)

-- Last 7 days (35 prints, high activity)
INSERT INTO print_jobs (name, module_id, printer_id, spool_id, start_time, end_time, status, planned_weight, actual_weight, failure_reason, waste_weight) VALUES
  -- Day -1 (8 prints, 1 failure)
  ('Kleben Haken Blau', 1, 1, 1, strftime('%s', 'now', '-1 day') * 1000, strftime('%s', 'now', '-1 day', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('Kleben Haken Pink', 10, 2, 2, strftime('%s', 'now', '-1 day') * 1000, strftime('%s', 'now', '-1 day', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('klohalter', 24, 3, 6, strftime('%s', 'now', '-1 day') * 1000, strftime('%s', 'now', '-1 day', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  ('Schrauben Haken Blau', 2, 4, 1, strftime('%s', 'now', '-1 day') * 1000, strftime('%s', 'now', '-1 day', '+321 minutes') * 1000, 'success', 181, 181, NULL, 6),
  ('vase', 3, 5, 1, strftime('%s', 'now', '-1 day') * 1000, strftime('%s', 'now', '-1 day', '+145 minutes') * 1000, 'failed', 752, 156, 'Spaghetti detected', 0),
  ('stöpsel', 31, 6, 5, strftime('%s', 'now', '-1 day') * 1000, strftime('%s', 'now', '-1 day', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('kleben Halter Oben', 16, 7, 8, strftime('%s', 'now', '-1 day') * 1000, strftime('%s', 'now', '-1 day', '+51 minutes') * 1000, 'success', 22, 22, NULL, 2),
  ('Kleben Haken green', 23, 1, 6, strftime('%s', 'now', '-1 day', '+6 hours') * 1000, strftime('%s', 'now', '-1 day', '+6 hours', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5),
  
  -- Day -2 (7 prints, 2 failures)
  ('Schrauben Haken rosa', 20, 2, 5, strftime('%s', 'now', '-2 days') * 1000, strftime('%s', 'now', '-2 days', '+331 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('stab', 28, 3, 7, strftime('%s', 'now', '-2 days') * 1000, strftime('%s', 'now', '-2 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('Kleben Haken Blau', 1, 4, 1, strftime('%s', 'now', '-2 days') * 1000, strftime('%s', 'now', '-2 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('vase', 6, 5, 7, strftime('%s', 'now', '-2 days') * 1000, strftime('%s', 'now', '-2 days', '+380 minutes') * 1000, 'failed', 801, 289, 'First layer adhesion', 0),
  ('klohalter', 26, 6, 7, strftime('%s', 'now', '-2 days') * 1000, strftime('%s', 'now', '-2 days', '+510 minutes') * 1000, 'success', 303, 303, NULL, 9),
  ('Kleben Haken Orange', 12, 7, 3, strftime('%s', 'now', '-2 days') * 1000, strftime('%s', 'now', '-2 days', '+190 minutes') * 1000, 'failed', 179, 134, 'Nozzle clog', 0),
  ('schrauben Halter unten', 15, 1, 8, strftime('%s', 'now', '-2 days', '+8 hours') * 1000, strftime('%s', 'now', '-2 days', '+8 hours', '+60 minutes') * 1000, 'success', 18, 18, NULL, 2),
  
  -- Day -3 (6 prints)
  ('Kleben Haken Blau', 1, 2, 1, strftime('%s', 'now', '-3 days') * 1000, strftime('%s', 'now', '-3 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Haken lila', 19, 3, 4, strftime('%s', 'now', '-3 days') * 1000, strftime('%s', 'now', '-3 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('stöpsel', 32, 4, 3, strftime('%s', 'now', '-3 days') * 1000, strftime('%s', 'now', '-3 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('Kleben Haken Pink', 10, 5, 2, strftime('%s', 'now', '-3 days') * 1000, strftime('%s', 'now', '-3 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('Schrauben Haken green', 22, 6, 6, strftime('%s', 'now', '-3 days') * 1000, strftime('%s', 'now', '-3 days', '+317 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('klohalter', 24, 7, 6, strftime('%s', 'now', '-3 days') * 1000, strftime('%s', 'now', '-3 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  
  -- Day -4 (5 prints, 1 failure)
  ('kleben Haken rosa', 21, 1, 5, strftime('%s', 'now', '-4 days') * 1000, strftime('%s', 'now', '-4 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('Kleben Haken Blau', 1, 2, 1, strftime('%s', 'now', '-4 days') * 1000, strftime('%s', 'now', '-4 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stab', 29, 3, 5, strftime('%s', 'now', '-4 days') * 1000, strftime('%s', 'now', '-4 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('vase', 8, 4, 5, strftime('%s', 'now', '-4 days') * 1000, strftime('%s', 'now', '-4 days', '+420 minutes') * 1000, 'failed', 801, 312, 'Power outage', 0),
  ('schrauben Haken Pink', 11, 5, 2, strftime('%s', 'now', '-4 days') * 1000, strftime('%s', 'now', '-4 days', '+303 minutes') * 1000, 'success', 181, 181, NULL, 6),
  
  -- Day -5 (5 prints)
  ('Kleben Haken Blau', 1, 6, 1, strftime('%s', 'now', '-5 days') * 1000, strftime('%s', 'now', '-5 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('klohalter', 27, 7, 2, strftime('%s', 'now', '-5 days') * 1000, strftime('%s', 'now', '-5 days', '+660 minutes') * 1000, 'success', 302, 302, NULL, 9),
  ('Schrauben Haken lila', 18, 1, 4, strftime('%s', 'now', '-5 days') * 1000, strftime('%s', 'now', '-5 days', '+317 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('stöpsel', 33, 2, 7, strftime('%s', 'now', '-5 days') * 1000, strftime('%s', 'now', '-5 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('Kleben Haken green', 23, 3, 6, strftime('%s', 'now', '-5 days') * 1000, strftime('%s', 'now', '-5 days', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5),
  
  -- Day -6 (4 prints)
  ('Kleben Haken Orange', 12, 4, 3, strftime('%s', 'now', '-6 days') * 1000, strftime('%s', 'now', '-6 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Halter unten', 17, 5, 8, strftime('%s', 'now', '-6 days') * 1000, strftime('%s', 'now', '-6 days', '+51 minutes') * 1000, 'success', 22, 22, NULL, 2),
  ('Kleben Haken Blau', 1, 6, 1, strftime('%s', 'now', '-6 days') * 1000, strftime('%s', 'now', '-6 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('Kleben Haken Pink', 10, 7, 2, strftime('%s', 'now', '-6 days') * 1000, strftime('%s', 'now', '-6 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4);

-- Week 2 (days 8-14) - 28 prints
INSERT INTO print_jobs (name, module_id, printer_id, spool_id, start_time, end_time, status, planned_weight, actual_weight, failure_reason, waste_weight) VALUES
  ('Kleben Haken Blau', 1, 1, 1, strftime('%s', 'now', '-8 days') * 1000, strftime('%s', 'now', '-8 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('Kleben Haken Pink', 10, 2, 2, strftime('%s', 'now', '-8 days') * 1000, strftime('%s', 'now', '-8 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('klohalter', 24, 3, 6, strftime('%s', 'now', '-8 days') * 1000, strftime('%s', 'now', '-8 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  ('vase', 3, 4, 1, strftime('%s', 'now', '-8 days') * 1000, strftime('%s', 'now', '-8 days', '+1146 minutes') * 1000, 'success', 752, 752, NULL, 20),
  
  ('Schrauben Haken rosa', 20, 5, 5, strftime('%s', 'now', '-9 days') * 1000, strftime('%s', 'now', '-9 days', '+331 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('stab', 28, 6, 7, strftime('%s', 'now', '-9 days') * 1000, strftime('%s', 'now', '-9 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('Kleben Haken Blau', 1, 7, 1, strftime('%s', 'now', '-9 days') * 1000, strftime('%s', 'now', '-9 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stöpsel', 31, 1, 5, strftime('%s', 'now', '-9 days') * 1000, strftime('%s', 'now', '-9 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  
  ('klohalter', 26, 2, 7, strftime('%s', 'now', '-10 days') * 1000, strftime('%s', 'now', '-10 days', '+510 minutes') * 1000, 'success', 303, 303, NULL, 9),
  ('Kleben Haken Orange', 12, 3, 3, strftime('%s', 'now', '-10 days') * 1000, strftime('%s', 'now', '-10 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Haken lila', 19, 4, 4, strftime('%s', 'now', '-10 days') * 1000, strftime('%s', 'now', '-10 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('Schrauben Haken green', 22, 5, 6, strftime('%s', 'now', '-10 days') * 1000, strftime('%s', 'now', '-10 days', '+120 minutes') * 1000, 'failed', 192, 89, 'Warping', 0),
  
  ('Kleben Haken Blau', 1, 6, 1, strftime('%s', 'now', '-11 days') * 1000, strftime('%s', 'now', '-11 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Haken rosa', 21, 7, 5, strftime('%s', 'now', '-11 days') * 1000, strftime('%s', 'now', '-11 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('stab', 29, 1, 5, strftime('%s', 'now', '-11 days') * 1000, strftime('%s', 'now', '-11 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('schrauben Haken Pink', 11, 2, 2, strftime('%s', 'now', '-11 days') * 1000, strftime('%s', 'now', '-11 days', '+303 minutes') * 1000, 'success', 181, 181, NULL, 6),
  
  ('klohalter', 24, 3, 6, strftime('%s', 'now', '-12 days') * 1000, strftime('%s', 'now', '-12 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  ('Schrauben Haken lila', 18, 4, 4, strftime('%s', 'now', '-12 days') * 1000, strftime('%s', 'now', '-12 days', '+317 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('stöpsel', 32, 5, 3, strftime('%s', 'now', '-12 days') * 1000, strftime('%s', 'now', '-12 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('Kleben Haken green', 23, 6, 6, strftime('%s', 'now', '-12 days') * 1000, strftime('%s', 'now', '-12 days', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5),
  
  ('Kleben Haken Blau', 1, 7, 1, strftime('%s', 'now', '-13 days') * 1000, strftime('%s', 'now', '-13 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Halter Oben', 16, 1, 8, strftime('%s', 'now', '-13 days') * 1000, strftime('%s', 'now', '-13 days', '+51 minutes') * 1000, 'success', 22, 22, NULL, 2),
  ('Kleben Haken Pink', 10, 2, 2, strftime('%s', 'now', '-13 days') * 1000, strftime('%s', 'now', '-13 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('vase', 7, 3, 4, strftime('%s', 'now', '-13 days') * 1000, strftime('%s', 'now', '-13 days', '+890 minutes') * 1000, 'failed', 801, 567, 'Filament tangle', 0),
  
  ('klohalter', 27, 4, 2, strftime('%s', 'now', '-14 days') * 1000, strftime('%s', 'now', '-14 days', '+660 minutes') * 1000, 'success', 302, 302, NULL, 9),
  ('stab', 30, 5, 3, strftime('%s', 'now', '-14 days') * 1000, strftime('%s', 'now', '-14 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('Kleben Haken Blau', 1, 6, 1, strftime('%s', 'now', '-14 days') * 1000, strftime('%s', 'now', '-14 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('Schrauben Haken Blau', 2, 7, 1, strftime('%s', 'now', '-14 days') * 1000, strftime('%s', 'now', '-14 days', '+321 minutes') * 1000, 'success', 181, 181, NULL, 6);

-- Week 3 (days 15-21) - 28 prints
INSERT INTO print_jobs (name, module_id, printer_id, spool_id, start_time, end_time, status, planned_weight, actual_weight, failure_reason, waste_weight) VALUES
  ('Kleben Haken Blau', 1, 1, 1, strftime('%s', 'now', '-15 days') * 1000, strftime('%s', 'now', '-15 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stöpsel', 33, 2, 7, strftime('%s', 'now', '-15 days') * 1000, strftime('%s', 'now', '-15 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('Kleben Haken Pink', 10, 3, 2, strftime('%s', 'now', '-15 days') * 1000, strftime('%s', 'now', '-15 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('klohalter', 24, 4, 6, strftime('%s', 'now', '-15 days') * 1000, strftime('%s', 'now', '-15 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  
  ('Kleben Haken Blau', 1, 5, 1, strftime('%s', 'now', '-16 days') * 1000, strftime('%s', 'now', '-16 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Haken green', 23, 6, 6, strftime('%s', 'now', '-16 days') * 1000, strftime('%s', 'now', '-16 days', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5),
  ('Schrauben Haken green', 22, 7, 6, strftime('%s', 'now', '-16 days') * 1000, strftime('%s', 'now', '-16 days', '+317 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('stab', 28, 1, 7, strftime('%s', 'now', '-16 days') * 1000, strftime('%s', 'now', '-16 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  
  ('Kleben Haken Blau', 1, 2, 1, strftime('%s', 'now', '-17 days') * 1000, strftime('%s', 'now', '-17 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('Kleben Haken Orange', 12, 3, 3, strftime('%s', 'now', '-17 days') * 1000, strftime('%s', 'now', '-17 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('klohalter', 26, 4, 7, strftime('%s', 'now', '-17 days') * 1000, strftime('%s', 'now', '-17 days', '+510 minutes') * 1000, 'success', 303, 303, NULL, 9),
  ('vase', 4, 5, 2, strftime('%s', 'now', '-17 days') * 1000, strftime('%s', 'now', '-17 days', '+1146 minutes') * 1000, 'success', 752, 752, NULL, 20),
  
  ('schrauben Halter Oben', 14, 6, 8, strftime('%s', 'now', '-18 days') * 1000, strftime('%s', 'now', '-18 days', '+58 minutes') * 1000, 'success', 16, 16, NULL, 2),
  ('Kleben Haken Pink', 10, 7, 2, strftime('%s', 'now', '-18 days') * 1000, strftime('%s', 'now', '-18 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('kleben Haken lila', 19, 1, 4, strftime('%s', 'now', '-18 days') * 1000, strftime('%s', 'now', '-18 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('stöpsel', 31, 2, 5, strftime('%s', 'now', '-18 days') * 1000, strftime('%s', 'now', '-18 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  
  ('Kleben Haken Blau', 1, 3, 1, strftime('%s', 'now', '-19 days') * 1000, strftime('%s', 'now', '-19 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Haken rosa', 21, 4, 5, strftime('%s', 'now', '-19 days') * 1000, strftime('%s', 'now', '-19 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('Schrauben Haken rosa', 20, 5, 5, strftime('%s', 'now', '-19 days') * 1000, strftime('%s', 'now', '-19 days', '+331 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('klohalter', 24, 6, 6, strftime('%s', 'now', '-19 days') * 1000, strftime('%s', 'now', '-19 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  
  ('stab', 29, 7, 5, strftime('%s', 'now', '-20 days') * 1000, strftime('%s', 'now', '-20 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('Kleben Haken Blau', 1, 1, 1, strftime('%s', 'now', '-20 days') * 1000, strftime('%s', 'now', '-20 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('schrauben Haken Pink', 11, 2, 2, strftime('%s', 'now', '-20 days') * 1000, strftime('%s', 'now', '-20 days', '+303 minutes') * 1000, 'success', 181, 181, NULL, 6),
  ('stöpsel', 32, 3, 3, strftime('%s', 'now', '-20 days') * 1000, strftime('%s', 'now', '-20 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  
  ('Kleben Haken green', 23, 4, 6, strftime('%s', 'now', '-21 days') * 1000, strftime('%s', 'now', '-21 days', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5),
  ('Kleben Haken Blau', 1, 5, 1, strftime('%s', 'now', '-21 days') * 1000, strftime('%s', 'now', '-21 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Halter unten', 17, 6, 8, strftime('%s', 'now', '-21 days') * 1000, strftime('%s', 'now', '-21 days', '+51 minutes') * 1000, 'success', 22, 22, NULL, 2),
  ('Kleben Haken Pink', 10, 7, 2, strftime('%s', 'now', '-21 days') * 1000, strftime('%s', 'now', '-21 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4);

-- Week 4 (days 22-28) - 28 prints
INSERT INTO print_jobs (name, module_id, printer_id, spool_id, start_time, end_time, status, planned_weight, actual_weight, failure_reason, waste_weight) VALUES
  ('klohalter', 27, 1, 2, strftime('%s', 'now', '-22 days') * 1000, strftime('%s', 'now', '-22 days', '+660 minutes') * 1000, 'success', 302, 302, NULL, 9),
  ('Schrauben Haken green', 22, 2, 6, strftime('%s', 'now', '-22 days') * 1000, strftime('%s', 'now', '-22 days', '+317 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('Kleben Haken Blau', 1, 3, 1, strftime('%s', 'now', '-22 days') * 1000, strftime('%s', 'now', '-22 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stab', 30, 4, 3, strftime('%s', 'now', '-22 days') * 1000, strftime('%s', 'now', '-22 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  
  ('Kleben Haken Pink', 10, 5, 2, strftime('%s', 'now', '-23 days') * 1000, strftime('%s', 'now', '-23 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('kleben Haken rosa', 21, 6, 5, strftime('%s', 'now', '-23 days') * 1000, strftime('%s', 'now', '-23 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('Kleben Haken Blau', 1, 7, 1, strftime('%s', 'now', '-23 days') * 1000, strftime('%s', 'now', '-23 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('vase', 9, 1, 6, strftime('%s', 'now', '-23 days') * 1000, strftime('%s', 'now', '-23 days', '+670 minutes') * 1000, 'failed', 801, 445, 'Layer shift', 0),
  
  ('klohalter', 25, 2, 5, strftime('%s', 'now', '-24 days') * 1000, strftime('%s', 'now', '-24 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  ('Schrauben Haken lila', 18, 3, 4, strftime('%s', 'now', '-24 days') * 1000, strftime('%s', 'now', '-24 days', '+317 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('stöpsel', 33, 4, 7, strftime('%s', 'now', '-24 days') * 1000, strftime('%s', 'now', '-24 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('Kleben Haken Blau', 1, 5, 1, strftime('%s', 'now', '-24 days') * 1000, strftime('%s', 'now', '-24 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  
  ('Kleben Haken green', 23, 6, 6, strftime('%s', 'now', '-25 days') * 1000, strftime('%s', 'now', '-25 days', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5),
  ('schrauben Halter unten', 15, 7, 8, strftime('%s', 'now', '-25 days') * 1000, strftime('%s', 'now', '-25 days', '+60 minutes') * 1000, 'success', 18, 18, NULL, 2),
  ('Kleben Haken Pink', 10, 1, 2, strftime('%s', 'now', '-25 days') * 1000, strftime('%s', 'now', '-25 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('stab', 28, 2, 7, strftime('%s', 'now', '-25 days') * 1000, strftime('%s', 'now', '-25 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  
  ('Kleben Haken Blau', 1, 3, 1, strftime('%s', 'now', '-26 days') * 1000, strftime('%s', 'now', '-26 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Haken lila', 19, 4, 4, strftime('%s', 'now', '-26 days') * 1000, strftime('%s', 'now', '-26 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('Schrauben Haken rosa', 20, 5, 5, strftime('%s', 'now', '-26 days') * 1000, strftime('%s', 'now', '-26 days', '+331 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('klohalter', 24, 6, 6, strftime('%s', 'now', '-26 days') * 1000, strftime('%s', 'now', '-26 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  
  ('Kleben Haken Orange', 12, 7, 3, strftime('%s', 'now', '-27 days') * 1000, strftime('%s', 'now', '-27 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stöpsel', 31, 1, 5, strftime('%s', 'now', '-27 days') * 1000, strftime('%s', 'now', '-27 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('Kleben Haken Blau', 1, 2, 1, strftime('%s', 'now', '-27 days') * 1000, strftime('%s', 'now', '-27 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('schrauben Haken Pink', 11, 3, 2, strftime('%s', 'now', '-27 days') * 1000, strftime('%s', 'now', '-27 days', '+303 minutes') * 1000, 'success', 181, 181, NULL, 6),
  
  ('kleben Haken rosa', 21, 4, 5, strftime('%s', 'now', '-28 days') * 1000, strftime('%s', 'now', '-28 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('Kleben Haken Blau', 1, 5, 1, strftime('%s', 'now', '-28 days') * 1000, strftime('%s', 'now', '-28 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Halter Oben', 16, 6, 8, strftime('%s', 'now', '-28 days') * 1000, strftime('%s', 'now', '-28 days', '+51 minutes') * 1000, 'success', 22, 22, NULL, 2),
  ('Kleben Haken green', 23, 7, 6, strftime('%s', 'now', '-28 days') * 1000, strftime('%s', 'now', '-28 days', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5);

-- Days 30-90 (sparse older data) - 35 prints
INSERT INTO print_jobs (name, module_id, printer_id, spool_id, start_time, end_time, status, planned_weight, actual_weight, failure_reason, waste_weight) VALUES
  ('Kleben Haken Blau', 1, 1, 1, strftime('%s', 'now', '-35 days') * 1000, strftime('%s', 'now', '-35 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('Kleben Haken Orange', 12, 2, 3, strftime('%s', 'now', '-40 days') * 1000, strftime('%s', 'now', '-40 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stöpsel', 31, 3, 5, strftime('%s', 'now', '-42 days') * 1000, strftime('%s', 'now', '-42 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('vase', 8, 4, 5, strftime('%s', 'now', '-45 days') * 1000, strftime('%s', 'now', '-45 days', '+1146 minutes') * 1000, 'success', 801, 801, NULL, 20),
  ('Kleben Haken Blau', 1, 5, 1, strftime('%s', 'now', '-48 days') * 1000, strftime('%s', 'now', '-48 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('kleben Haken lila', 19, 1, 4, strftime('%s', 'now', '-50 days') * 1000, strftime('%s', 'now', '-50 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('Kleben Haken Pink', 10, 2, 2, strftime('%s', 'now', '-55 days') * 1000, strftime('%s', 'now', '-55 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('klohalter', 26, 3, 7, strftime('%s', 'now', '-58 days') * 1000, strftime('%s', 'now', '-58 days', '+510 minutes') * 1000, 'success', 303, 303, NULL, 9),
  ('Kleben Haken Blau', 1, 4, 1, strftime('%s', 'now', '-65 days') * 1000, strftime('%s', 'now', '-65 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stab', 28, 5, 7, strftime('%s', 'now', '-70 days') * 1000, strftime('%s', 'now', '-70 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('Kleben Haken Pink', 10, 1, 2, strftime('%s', 'now', '-72 days') * 1000, strftime('%s', 'now', '-72 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('kleben Haken green', 23, 2, 6, strftime('%s', 'now', '-75 days') * 1000, strftime('%s', 'now', '-75 days', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5),
  ('Schrauben Haken Blau', 2, 3, 1, strftime('%s', 'now', '-78 days') * 1000, strftime('%s', 'now', '-78 days', '+321 minutes') * 1000, 'success', 181, 181, NULL, 6),
  ('Kleben Haken Orange', 12, 4, 3, strftime('%s', 'now', '-80 days') * 1000, strftime('%s', 'now', '-80 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('klohalter', 24, 5, 6, strftime('%s', 'now', '-85 days') * 1000, strftime('%s', 'now', '-85 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  ('Kleben Haken Blau', 1, 1, 1, strftime('%s', 'now', '-88 days') * 1000, strftime('%s', 'now', '-88 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stöpsel', 32, 2, 3, strftime('%s', 'now', '-36 days') * 1000, strftime('%s', 'now', '-36 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('Kleben Haken Blau', 1, 3, 1, strftime('%s', 'now', '-38 days') * 1000, strftime('%s', 'now', '-38 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('Schrauben Haken green', 22, 4, 6, strftime('%s', 'now', '-43 days') * 1000, strftime('%s', 'now', '-43 days', '+317 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('kleben Haken rosa', 21, 5, 5, strftime('%s', 'now', '-47 days') * 1000, strftime('%s', 'now', '-47 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('stab', 29, 6, 5, strftime('%s', 'now', '-52 days') * 1000, strftime('%s', 'now', '-52 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('Kleben Haken Blau', 1, 7, 1, strftime('%s', 'now', '-56 days') * 1000, strftime('%s', 'now', '-56 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('klohalter', 27, 1, 2, strftime('%s', 'now', '-60 days') * 1000, strftime('%s', 'now', '-60 days', '+660 minutes') * 1000, 'success', 302, 302, NULL, 9),
  ('Schrauben Haken lila', 18, 2, 4, strftime('%s', 'now', '-63 days') * 1000, strftime('%s', 'now', '-63 days', '+317 minutes') * 1000, 'success', 192, 192, NULL, 7),
  ('Kleben Haken Pink', 10, 3, 2, strftime('%s', 'now', '-67 days') * 1000, strftime('%s', 'now', '-67 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 4),
  ('stöpsel', 33, 4, 7, strftime('%s', 'now', '-71 days') * 1000, strftime('%s', 'now', '-71 days', '+660 minutes') * 1000, 'success', 308, 308, NULL, 10),
  ('Kleben Haken green', 23, 5, 6, strftime('%s', 'now', '-74 days') * 1000, strftime('%s', 'now', '-74 days', '+256 minutes') * 1000, 'success', 190, 190, NULL, 5),
  ('Kleben Haken Blau', 1, 6, 1, strftime('%s', 'now', '-77 days') * 1000, strftime('%s', 'now', '-77 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('schrauben Haken Pink', 11, 7, 2, strftime('%s', 'now', '-81 days') * 1000, strftime('%s', 'now', '-81 days', '+303 minutes') * 1000, 'success', 181, 181, NULL, 6),
  ('Kleben Haken Orange', 12, 1, 3, strftime('%s', 'now', '-83 days') * 1000, strftime('%s', 'now', '-83 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('stab', 30, 2, 3, strftime('%s', 'now', '-86 days') * 1000, strftime('%s', 'now', '-86 days', '+600 minutes') * 1000, 'success', 387, 387, NULL, 12),
  ('kleben Haken lila', 19, 3, 4, strftime('%s', 'now', '-89 days') * 1000, strftime('%s', 'now', '-89 days', '+259 minutes') * 1000, 'success', 193, 193, NULL, 6),
  ('Kleben Haken Blau', 1, 4, 1, strftime('%s', 'now', '-32 days') * 1000, strftime('%s', 'now', '-32 days', '+256 minutes') * 1000, 'success', 179, 179, NULL, 5),
  ('klohalter', 25, 5, 5, strftime('%s', 'now', '-44 days') * 1000, strftime('%s', 'now', '-44 days', '+561 minutes') * 1000, 'success', 323, 323, NULL, 8),
  ('vase', 5, 6, 3, strftime('%s', 'now', '-62 days') * 1000, strftime('%s', 'now', '-62 days', '+950 minutes') * 1000, 'failed', 752, 623, 'Stringing', 0);