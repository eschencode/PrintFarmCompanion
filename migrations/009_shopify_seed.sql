-- ============================================
-- SHOPIFY SKU MAPPINGS SEED DATA
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
