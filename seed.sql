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

-- ============================================
-- INVENTORY ITEMS (with slugs for easy reference)
-- ============================================

INSERT INTO inventory (name, slug, sku, description, stock_count, min_threshold) VALUES
  -- ========== HAKEN KLEBEN ==========
  ('Haken Kleben Blau', 'haken-kleben-blau', 'HAK/K/BL', 'Wandhaken zum Kleben - Royal Blau', 0, 50),
  ('Haken Kleben Pink', 'haken-kleben-pink', 'HAK/K/PI', 'Wandhaken zum Kleben - Neon Pink', 0, 50),
  ('Haken Kleben Orange', 'haken-kleben-orange', 'HAK/K/OR', 'Wandhaken zum Kleben - Neon Orange', 0, 50),
  ('Haken Kleben Lila', 'haken-kleben-lila', 'HAK/K/LI', 'Wandhaken zum Kleben - Flieder', 0, 50),
  ('Haken Kleben Grün', 'haken-kleben-gruen', 'HAK/K/GR', 'Wandhaken zum Kleben - Mud Green', 0, 50),
  ('Haken Kleben Rosa', 'haken-kleben-rosa', 'HAK/K/RO', 'Wandhaken zum Kleben - Rosa', 0, 50),
  
  -- ========== HAKEN SCHRAUBEN ==========
  ('Haken Schrauben Blau', 'haken-schrauben-blau', 'HAK/S/BL', 'Wandhaken zum Schrauben - Royal Blau', 0, 50),
  ('Haken Schrauben Pink', 'haken-schrauben-pink', 'HAK/S/PI', 'Wandhaken zum Schrauben - Neon Pink', 0, 50),
  ('Haken Schrauben Orange', 'haken-schrauben-orange', 'HAK/S/OR', 'Wandhaken zum Schrauben - Neon Orange', 0, 50),
  ('Haken Schrauben Lila', 'haken-schrauben-lila', 'HAK/S/LI', 'Wandhaken zum Schrauben - Flieder', 0, 50),
  ('Haken Schrauben Grün', 'haken-schrauben-gruen', 'HAK/S/GR', 'Wandhaken zum Schrauben - Mud Green', 0, 50),
  ('Haken Schrauben Rosa', 'haken-schrauben-rosa', 'HAK/S/RO', 'Wandhaken zum Schrauben - Rosa', 0, 50),
  
  -- ========== HAKENHALTER (Transparent) ==========
  ('Hakenhalter Oben Kleben', 'hakenhalter-oben-kleben', 'HKH/OK', 'Hakenhalter Oben - Kleben', 0, 20),
  ('Hakenhalter Unten Kleben', 'hakenhalter-unten-kleben', 'HKH/UK', 'Hakenhalter Unten - Kleben', 0, 20),
  ('Hakenhalter Oben Schrauben', 'hakenhalter-oben-schrauben', 'HKH/OS', 'Hakenhalter Oben - Schrauben', 0, 20),
  ('Hakenhalter Unten Schrauben', 'hakenhalter-unten-schrauben', 'HKH/US', 'Hakenhalter Unten - Schrauben', 0, 20),
  
  -- ========== VASE FLUID ==========
  ('Vase Fluid Blau', 'vase-fluid-blau', 'VAS/FL/BL', 'Vase Fluid - Royal Blau', 0, 20),
  ('Vase Fluid Pink', 'vase-fluid-pink', 'VAS/FL/PI', 'Vase Fluid - Neon Pink', 0, 20),
  ('Vase Fluid Orange', 'vase-fluid-orange', 'VAS/FL/OR', 'Vase Fluid - Neon Orange', 0, 20),
  ('Vase Fluid Lila', 'vase-fluid-lila', 'VAS/FL/LI', 'Vase Fluid - Flieder', 0, 20),
  ('Vase Fluid Grün', 'vase-fluid-gruen', 'VAS/FL/GR', 'Vase Fluid - Mud Green', 0, 20),
  ('Vase Fluid Rosa', 'vase-fluid-rosa', 'VAS/FL/RO', 'Vase Fluid - Rosa', 0, 20),
  ('Vase Fluid Schwarz', 'vase-fluid-schwarz', 'VAS/FL/SW', 'Vase Fluid - Schwarz', 0, 5),
  
  -- ========== VASE SHRUNK ==========
  ('Vase Shrunk Blau', 'vase-shrunk-blau', 'VAS/SH/BL', 'Vase Shrunk - Royal Blau', 0, 20),
  ('Vase Shrunk Pink', 'vase-shrunk-pink', 'VAS/SH/PI', 'Vase Shrunk - Neon Pink', 0, 20),
  ('Vase Shrunk Orange', 'vase-shrunk-orange', 'VAS/SH/OR', 'Vase Shrunk - Neon Orange', 0, 20),
  ('Vase Shrunk Lila', 'vase-shrunk-lila', 'VAS/SH/LI', 'Vase Shrunk - Flieder', 0, 20),
  ('Vase Shrunk Grün', 'vase-shrunk-gruen', 'VAS/SH/GR', 'Vase Shrunk - Mud Green', 0, 20),
  ('Vase Shrunk Rosa', 'vase-shrunk-rosa', 'VAS/SH/RO', 'Vase Shrunk - Rosa', 0, 20),
  ('Vase Shrunk Schwarz', 'vase-shrunk-schwarz', 'VAS/SH/SW', 'Vase Shrunk - Schwarz', 0, 5),
  
  -- ========== KLOROLLE PARTS ==========
  ('Klohalter Blau', 'klohalter-blau', 'KLO/H/BL', 'Klopapierhalter Halterung - Blau', 0, 20),
  ('Klohalter Pink', 'klohalter-pink', 'KLO/H/PI', 'Klopapierhalter Halterung - Pink', 0, 20),
  ('Klohalter Grün', 'klohalter-gruen', 'KLO/H/GR', 'Klopapierhalter Halterung - Grün', 0, 20),
  ('Klohalter Lila', 'klohalter-lila', 'KLO/H/LI', 'Klopapierhalter Halterung - Lila', 0, 20),
  ('Klohalter Rosa', 'klohalter-rosa', 'KLO/H/RO', 'Klopapierhalter Halterung - Rosa', 0, 20),
  
  ('Stab Blau', 'stab-blau', 'KLO/S/BL', 'Klopapierhalter Stab - Blau', 0, 20),
  ('Stab Orange', 'stab-orange', 'KLO/S/OR', 'Klopapierhalter Stab - Orange', 0, 20),
  ('Stab Rosa', 'stab-rosa', 'KLO/S/RO', 'Klopapierhalter Stab - Rosa', 0, 20),
  
  ('Stöpsel Blau', 'stoepsel-blau', 'KLO/P/BL', 'Klopapierhalter Stöpsel - Blau', 0, 40),
  ('Stöpsel Orange', 'stoepsel-orange', 'KLO/P/OR', 'Klopapierhalter Stöpsel - Orange', 0, 40),
  ('Stöpsel Rosa', 'stoepsel-rosa', 'KLO/P/RO', 'Klopapierhalter Stöpsel - Rosa', 0, 40);

-- Print Modules (with inventory_slug reference)
INSERT INTO print_modules (name, expected_weight, expected_time, objects_per_print, default_spool_preset_id, inventory_slug, path, image_path) VALUES
  -- Haken Kleben
  ('Kleben Haken Blau', 179, 256, 20, 2, 'haken-kleben-blau', '/Users/linus/Documents/3d-models/Haken/blau/Haken_blau_kleben.3mf', '/images/haken.JPG'),
  ('Kleben Haken Pink', 179, 256, 20, 3, 'haken-kleben-pink', '/Users/linus/Documents/3d-models/Haken/pink/P1S_Haken_pink_kleben.3mf', '/images/haken.JPG'),
  ('Kleben Haken Orange', 179, 256, 20, 4, 'haken-kleben-orange', '/Users/linus/Documents/3d-models/Haken/orange/P1S_Haken_pink_kleben.3mf', '/images/haken.JPG'),
  ('kleben Haken lila', 193, 259, 20, 6, 'haken-kleben-lila', '/Users/linus/Documents/3d-models/Haken/lila/P1S_Haken_rosa_kleben.3mf', '/images/haken.JPG'),
  ('kleben Haken green', 190, 256, 20, 8, 'haken-kleben-gruen', '/Users/linus/Documents/3d-models/Haken/green/P1S_Haken_mudgreen_kleben.3mf', '/images/haken.JPG'),
  ('kleben Haken rosa', 193, 259, 20, 7, 'haken-kleben-rosa', '/Users/linus/Documents/3d-models/Haken/rosa/P1S_Haken_rosa_kleben.3mf', '/images/haken.JPG'),
  
  -- Haken Schrauben
  ('Schrauben Haken Blau', 181, 321, 20, 2, 'haken-schrauben-blau', '/Users/linus/Documents/3d-models/Haken/blau/Haken_blau_schrauben.3mf', '/images/haken.JPG'),
  ('schrauben Haken Pink', 181, 303, 20, 3, 'haken-schrauben-pink', '/Users/linus/Documents/3d-models/Haken/pink/P1S_Haken_pink_schrauben.3mf', '/images/haken.JPG'),
  ('schrauben Haken Orange', 181, 303, 20, 4, 'haken-schrauben-orange', '/Users/linus/Documents/3d-models/Haken/orange/P1S_Haken_pink_schrauben.3mf', '/images/haken.JPG'),
  ('Schrauben Haken lila', 192, 317, 20, 6, 'haken-schrauben-lila', '/Users/linus/Documents/3d-models/Haken/lila/P1S_Haken_lila_schrauben_250216.3mf', '/images/haken.JPG'),
  ('Schrauben Haken green', 192, 317, 20, 8, 'haken-schrauben-gruen', '/Users/linus/Documents/3d-models/Haken/green/P1S_Haken_lila_schrauben_250216.3mf', '/images/haken.JPG'),
  ('Schrauben Haken rosa', 192, 331, 20, 7, 'haken-schrauben-rosa', '/Users/linus/Documents/3d-models/Haken/rosa/P1S_Haken_rosa_schrauben_250216.3mf', '/images/haken.JPG'),
  
  -- Hakenhalter
  ('kleben Halter Oben', 22, 51, 20, 5, 'hakenhalter-oben-kleben', '/Users/linus/Documents/3d-models/Haken/Hakenhalter/oben_kleben_hakenhalter.3mf', '/images/hakenhalter.JPG'),
  ('kleben Halter unten', 22, 51, 20, 5, 'hakenhalter-unten-kleben', '/Users/linus/Documents/3d-models/Haken/Hakenhalter/unten_kleben_hakenhalter.3mf', '/images/hakenhalter.JPG'),
  ('schrauben Halter Oben', 16, 58, 10, 5, 'hakenhalter-oben-schrauben', '/Users/linus/Documents/3d-models/Haken/Hakenhalter/oben_schrauben_hakenhalter.3mf', '/images/hakenhalter.JPG'),
  ('schrauben Halter unten', 18, 60, 10, 5, 'hakenhalter-unten-schrauben', '/Users/linus/Documents/3d-models/Haken/Hakenhalter/unten_schrauben_hakenhalter.3mf', '/images/hakenhalter.JPG'),
  
  -- Vases (using fluid for now - you can add shrunk variants later)
  ('vase Blau', 752, 1146, 4, 2, 'vase-fluid-blau', '/Users/linus/Documents/3d-models/Vasen/vase_Jakex4.3mf', '/images/vase.JPG'),
  ('vase Pink', 752, 1146, 4, 3, 'vase-fluid-pink', '/Users/linus/Documents/3d-models/Vasen/vase_Jakex4.3mf', '/images/vase.JPG'),
  ('vase Orange', 752, 1146, 4, 4, 'vase-fluid-orange', '/Users/linus/Documents/3d-models/Vasen/vase_Jakex4.3mf', '/images/vase.JPG'),
  ('vase Bambu Blau', 801, 1146, 4, 1, 'vase-fluid-blau', '/Users/linus/Documents/3d-models/Vasen/vase_bambux4.3mf', '/images/vase.JPG'),
  ('vase Lila', 801, 1146, 4, 6, 'vase-fluid-lila', '/Users/linus/Documents/3d-models/Vasen/vase_bambux4.3mf', '/images/vase.JPG'),
  ('vase Rosa', 801, 1146, 4, 7, 'vase-fluid-rosa', '/Users/linus/Documents/3d-models/Vasen/vase_bambux4.3mf', '/images/vase.JPG'),
  ('vase Green', 801, 1146, 4, 8, 'vase-fluid-gruen', '/Users/linus/Documents/3d-models/Vasen/vase_bambux4.3mf', '/images/vase.JPG'),
  
  -- Klohalter
  ('klohalter Green', 323, 561, 2, 8, 'klohalter-gruen', '/Users/linus/Documents/3d-models/Klorolle/Klorollenhalter_bambu.3mf', '/images/klohalter.JPG'),
  ('klohalter Rosa', 323, 561, 2, 7, 'klohalter-rosa', '/Users/linus/Documents/3d-models/Klorolle/Klorollenhalter_bambu.3mf', '/images/klohalter.JPG'),
  ('klohalter Blau', 303, 510, 2, 1, 'klohalter-blau', '/Users/linus/Documents/3d-models/Klorolle/Klorollenhalter_bambublau.3mf', '/images/klohalter.JPG'),
  ('klohalter Pink', 302, 660, 2, 3, 'klohalter-pink', '/Users/linus/Documents/3d-models/Klorolle/Klorollenhalter_pink.3mf', '/images/klohalter.JPG'),
  
  -- Stab
  ('stab Blau', 387, 600, 12, 1, 'stab-blau', '/Users/linus/Documents/3d-models/Klorolle/stab.3mf', '/images/stab.JPG'),
  ('stab Rosa', 387, 600, 12, 7, 'stab-rosa', '/Users/linus/Documents/3d-models/Klorolle/stab.3mf', '/images/stab.JPG'),
  ('stab Orange', 387, 600, 12, 4, 'stab-orange', '/Users/linus/Documents/3d-models/Klorolle/stab.3mf', '/images/stab.JPG'),
  
  -- Stöpsel
  ('stöpsel Rosa', 308, 660, 62, 7, 'stoepsel-rosa', '/Users/linus/Documents/3d-models/Klorolle/stöpsel.3mf', '/images/stöpsel.JPG'),
  ('stöpsel Orange', 308, 660, 62, 4, 'stoepsel-orange', '/Users/linus/Documents/3d-models/Klorolle/stöpsel.3mf', '/images/stöpsel.JPG'),
  ('stöpsel Blau', 308, 660, 62, 1, 'stoepsel-blau', '/Users/linus/Documents/3d-models/Klorolle/stöpsel.3mf', '/images/stöpsel.JPG');

-- Sample Spools for test print jobs
INSERT INTO spools (preset_id, brand, material, color, initial_weight, remaining_weight, cost) VALUES
  (2, '3dJake', 'PLA', 'Blau', 1000, 250, 20.00),
  (3, '3dJake', 'PLA', 'Pink', 1000, 380, 20.00),
  (4, '3dJake', 'PLA', 'Orange', 5000, 3800, 20.00),
  (6, 'Bambu lap', 'PLA', 'Lila', 1000, 120, 10.99),
  (7, 'Bambu lap', 'PLA', 'Rosa', 1000, 340, 10.99),
  (8, 'Bambu lap', 'PLA', 'Green', 1000, 90, 10.99),
  (1, 'Bambu lap', 'PLA', 'Blau', 1000, 410, 10.99),
  (5, '3dJake', 'PLA', 'Transparent', 1000, 650, 20.00);

-- ============================================
-- SHOPIFY INTEGRATION SEED DATA
-- ============================================

-- Initialize sync state
INSERT INTO shopify_sync (last_order_id, last_sync_at, orders_processed, items_deducted) 
VALUES (NULL, NULL, 0, 0);

-- ========== WANDHAKEN EINZELN (K1/S1 - OLD SKU FORMAT) ==========
-- These are single hooks from older orders
-- WH/K1 = Kleben single, WH/S1 = Schrauben single

INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  -- Kleben einzeln (old format)
  ('WH/K1/BL', 'haken-kleben-blau', 1),
  ('WH/K1/PI', 'haken-kleben-pink', 1),
  ('WH/K1/OR', 'haken-kleben-orange', 1),
  ('WH/K1/LI', 'haken-kleben-lila', 1),
  ('WH/K1/GR', 'haken-kleben-gruen', 1),
  ('WH/K1/RO', 'haken-kleben-rosa', 1),
  
  -- Schrauben einzeln (old format)
  ('WH/S1/BL', 'haken-schrauben-blau', 1),
  ('WH/S1/PI', 'haken-schrauben-pink', 1),
  ('WH/S1/OR', 'haken-schrauben-orange', 1),
  ('WH/S1/LI', 'haken-schrauben-lila', 1),
  ('WH/S1/GR', 'haken-schrauben-gruen', 1),
  ('WH/S1/RO', 'haken-schrauben-rosa', 1);

-- ========== WANDHAKEN EINZELN (MIX PACK SINGLES) ==========
-- These are single hooks from the "individuelles 5er pack" product
-- WH/MXK = Mix Kleben, WH/MXS = Mix Schrauben
-- NOTE: These are SINGLE hooks, no Hakenhalter included (halter only in 5-packs)

INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  -- Kleben einzeln
  ('WH/MXK/BL', 'haken-kleben-blau', 1),
  ('WH/MXK/PI', 'haken-kleben-pink', 1),
  ('WH/MXK/OR', 'haken-kleben-orange', 1),
  ('WH/MXK/LI', 'haken-kleben-lila', 1),
  ('WH/MXK/GR', 'haken-kleben-gruen', 1),
  ('WH/MXK/RO', 'haken-kleben-rosa', 1),
  
  -- Schrauben einzeln
  ('WH/MXS/BL', 'haken-schrauben-blau', 1),
  ('WH/MXS/PI', 'haken-schrauben-pink', 1),
  ('WH/MXS/OR', 'haken-schrauben-orange', 1),
  ('WH/MXS/LI', 'haken-schrauben-lila', 1),
  ('WH/MXS/GR', 'haken-schrauben-gruen', 1),
  ('WH/MXS/RO', 'haken-schrauben-rosa', 1);

-- ========== WANDHAKEN 5ER PACK KLEBEN (SAME COLOR) ==========
-- WH/K5 = Kleben 5er pack
-- Each includes: 5x hooks + 1x Hakenhalter Oben Kleben + 1x Hakenhalter Unten Kleben

INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  -- Blau
  ('WH/K5/BL', 'haken-kleben-blau', 5),
  ('WH/K5/BL', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/BL', 'hakenhalter-unten-kleben', 1),
  
  -- Pink
  ('WH/K5/PI', 'haken-kleben-pink', 5),
  ('WH/K5/PI', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/PI', 'hakenhalter-unten-kleben', 1),
  
  -- Orange
  ('WH/K5/OR', 'haken-kleben-orange', 5),
  ('WH/K5/OR', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/OR', 'hakenhalter-unten-kleben', 1),
  
  -- Lila
  ('WH/K5/LI', 'haken-kleben-lila', 5),
  ('WH/K5/LI', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/LI', 'hakenhalter-unten-kleben', 1),
  
  -- Grün
  ('WH/K5/GR', 'haken-kleben-gruen', 5),
  ('WH/K5/GR', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/GR', 'hakenhalter-unten-kleben', 1),
  
  -- Rosa
  ('WH/K5/RO', 'haken-kleben-rosa', 5),
  ('WH/K5/RO', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/RO', 'hakenhalter-unten-kleben', 1);

-- ========== WANDHAKEN 5ER PACK SCHRAUBEN (SAME COLOR) ==========
-- WH/S5 = Schrauben 5er pack
-- Each includes: 5x hooks + 1x Hakenhalter Oben Schrauben + 1x Hakenhalter Unten Schrauben

INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  -- Blau
  ('WH/S5/BL', 'haken-schrauben-blau', 5),
  ('WH/S5/BL', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/BL', 'hakenhalter-unten-schrauben', 1),
  
  -- Pink
  ('WH/S5/PI', 'haken-schrauben-pink', 5),
  ('WH/S5/PI', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/PI', 'hakenhalter-unten-schrauben', 1),
  
  -- Orange
  ('WH/S5/OR', 'haken-schrauben-orange', 5),
  ('WH/S5/OR', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/OR', 'hakenhalter-unten-schrauben', 1),
  
  -- Lila
  ('WH/S5/LI', 'haken-schrauben-lila', 5),
  ('WH/S5/LI', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/LI', 'hakenhalter-unten-schrauben', 1),
  
  -- Grün
  ('WH/S5/GR', 'haken-schrauben-gruen', 5),
  ('WH/S5/GR', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/GR', 'hakenhalter-unten-schrauben', 1),
  
  -- Rosa
  ('WH/S5/RO', 'haken-schrauben-rosa', 5),
  ('WH/S5/RO', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/RO', 'hakenhalter-unten-schrauben', 1);

-- ========== WANDHAKEN 5ER PACK KLEBEN (MIXED COLORS) ==========
-- These bundles map to multiple hook colors + hakenhalter

-- Blau (3) / Lila (2) - Kleben
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('WH/K5/BLLI', 'haken-kleben-blau', 3),
  ('WH/K5/BLLI', 'haken-kleben-lila', 2),
  ('WH/K5/BLLI', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/BLLI', 'hakenhalter-unten-kleben', 1);

-- Lila (3) / Rosa (2) - Kleben
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('WH/K5/LIRO', 'haken-kleben-lila', 3),
  ('WH/K5/LIRO', 'haken-kleben-rosa', 2),
  ('WH/K5/LIRO', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/LIRO', 'hakenhalter-unten-kleben', 1);

-- Pink (3) / Blau (2) - Kleben
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('WH/K5/PIBL', 'haken-kleben-pink', 3),
  ('WH/K5/PIBL', 'haken-kleben-blau', 2),
  ('WH/K5/PIBL', 'hakenhalter-oben-kleben', 1),
  ('WH/K5/PIBL', 'hakenhalter-unten-kleben', 1);

-- ========== WANDHAKEN 5ER PACK SCHRAUBEN (MIXED COLORS) ==========

-- Blau (3) / Lila (2) - Schrauben
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('WH/S5/BLLI', 'haken-schrauben-blau', 3),
  ('WH/S5/BLLI', 'haken-schrauben-lila', 2),
  ('WH/S5/BLLI', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/BLLI', 'hakenhalter-unten-schrauben', 1);

-- Lila (3) / Rosa (2) - Schrauben
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('WH/S5/LIRO', 'haken-schrauben-lila', 3),
  ('WH/S5/LIRO', 'haken-schrauben-rosa', 2),
  ('WH/S5/LIRO', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/LIRO', 'hakenhalter-unten-schrauben', 1);

-- Pink (3) / Blau (2) - Schrauben
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('WH/S5/PIBL', 'haken-schrauben-pink', 3),
  ('WH/S5/PIBL', 'haken-schrauben-blau', 2),
  ('WH/S5/PIBL', 'hakenhalter-oben-schrauben', 1),
  ('WH/S5/PIBL', 'hakenhalter-unten-schrauben', 1);

-- ========== KLOPAPIERHALTER BUNDLES ==========
-- Format: KLH/{HALTER_COLOR}{STAB_COLOR}
-- Each contains: 1x Klohalter, 1x Stab, 2x Stöpsel (Stöpsel color matches Stab)

-- KLH/GRRO = Grün Halter, Rosa Stab/Stöpsel
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('KLH/GRRO', 'klohalter-gruen', 1),
  ('KLH/GRRO', 'stab-rosa', 1),
  ('KLH/GRRO', 'stoepsel-rosa', 2);

-- KLH/LIRO = Lila Halter, Rosa Stab/Stöpsel
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('KLH/LIRO', 'klohalter-lila', 1),
  ('KLH/LIRO', 'stab-rosa', 1),
  ('KLH/LIRO', 'stoepsel-rosa', 2);

-- KLH/PIBL = Pink Halter, Blau Stab/Stöpsel
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('KLH/PIBL', 'klohalter-pink', 1),
  ('KLH/PIBL', 'stab-blau', 1),
  ('KLH/PIBL', 'stoepsel-blau', 2);

-- KLH/ROBL = Rosa Halter, Blau Stab/Stöpsel
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('KLH/ROBL', 'klohalter-rosa', 1),
  ('KLH/ROBL', 'stab-blau', 1),
  ('KLH/ROBL', 'stoepsel-blau', 2);

-- KLH/BLOR = Blau Halter, Orange Stab/Stöpsel
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('KLH/BLOR', 'klohalter-blau', 1),
  ('KLH/BLOR', 'stab-orange', 1),
  ('KLH/BLOR', 'stoepsel-orange', 2);

-- ========== VASEN FLUID (Simple 1:1) ==========
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('VAS/FL/BL', 'vase-fluid-blau', 1),
  ('VAS/FL/PI', 'vase-fluid-pink', 1),
  ('VAS/FL/OR', 'vase-fluid-orange', 1),
  ('VAS/FL/LI', 'vase-fluid-lila', 1),
  ('VAS/FL/GR', 'vase-fluid-gruen', 1),
  ('VAS/FL/RO', 'vase-fluid-rosa', 1),
  ('VAS/FL/SW', 'vase-fluid-schwarz', 1);

-- ========== VASEN SHRUNK (Simple 1:1) ==========
INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity) VALUES
  ('VAS/SH/BL', 'vase-shrunk-blau', 1),
  ('VAS/SH/PI', 'vase-shrunk-pink', 1),
  ('VAS/SH/OR', 'vase-shrunk-orange', 1),
  ('VAS/SH/LI', 'vase-shrunk-lila', 1),
  ('VAS/SH/GR', 'vase-shrunk-gruen', 1),
  ('VAS/SH/RO', 'vase-shrunk-rosa', 1),
  ('VAS/SH/SW', 'vase-shrunk-schwarz', 1);

