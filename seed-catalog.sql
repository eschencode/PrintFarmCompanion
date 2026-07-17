-- Affiliate catalog seed (global rows, no workspace_id). Touches ONLY
-- catalog_items — but the wipe nulls any spool_presets.catalog_item_id links
-- (FK is ON DELETE SET NULL), so re-running on a live DB downgrades existing
-- catalog-linked presets to fuzzy matching. Fine for initial load; for later
-- catalog updates prefer targeted INSERT/UPDATEs. Run after migrations 0023/0024:
--   npx wrangler d1 execute DB --remote --file=seed-catalog.sql
-- Keep in sync with the catalog block in scripts/seed.ts.
-- See docs/affiliate-monetization.md.
DELETE FROM catalog_items;

INSERT INTO catalog_items (vendor, kind, brand, material, color, color_hex, weight, url_us, url_eu, active, created_at, updated_at) VALUES
  ('bambu', 'filament', 'Bambu Lab', 'PLA',       'Black', '#1a1a1a', 1000, 'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 'https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 1, unixepoch(), unixepoch()),
  ('bambu', 'filament', 'Bambu Lab', 'PLA Matte', 'Black', '#1a1a1a', 1000, 'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 'https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 1, unixepoch(), unixepoch()),
  ('bambu', 'filament', 'Bambu Lab', 'PETG',      'Black', '#1a1a1a', 1000, 'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 'https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 1, unixepoch(), unixepoch()),
  ('bambu', 'filament', 'Bambu Lab', 'ABS',       'Black', '#1a1a1a', 1000, 'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 'https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 1, unixepoch(), unixepoch()),
  ('bambu', 'filament', 'Bambu Lab', 'ASA',       'Black', '#1a1a1a', 1000, 'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 'https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 1, unixepoch(), unixepoch()),
  ('bambu', 'filament', 'Bambu Lab', 'TPU',       'Black', '#1a1a1a', 1000, 'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 'https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 1, unixepoch(), unixepoch()),
  ('bambu', 'filament', 'Bambu Lab', 'PLA Silk',  'Gold',  '#d4af37', 1000, 'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 'https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 1, unixepoch(), unixepoch()),
  ('bambu', 'filament', 'Bambu Lab', 'PC',        'Black', '#1a1a1a', 1000, 'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 'https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament', 1, unixepoch(), unixepoch());

INSERT INTO catalog_items (vendor, kind, part_category, name, brand, material, url_us, url_eu, active, created_at, updated_at) VALUES
  ('bambu', 'part', 'hotend',        'Hotend / Nozzle Assembly',  'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'thermistor',    'Thermistor & Heating Kit',  'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'heatbed',       'Heatbed',                   'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'fan',           'Cooling Fan',               'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'ams',           'AMS Spare Parts',           'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'ams_desiccant', 'Desiccant Packs',           'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'ptfe_tube',     'PTFE Tube',                 'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'lidar',         'Micro Lidar',               'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'camera',        'Chamber Camera',            'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'door_sensor',   'Door & Cover Parts',        'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch()),
  ('bambu', 'part', 'general',       'All Spare Parts',           'Bambu Lab', '', 'https://us.store.bambulab.com/collections/spare-parts', 'https://eu.store.bambulab.com/collections/spare-parts', 1, unixepoch(), unixepoch());

INSERT INTO catalog_items (vendor, kind, part_category, name, brand, material, url_us, url_eu, active, created_at, updated_at) VALUES
  ('bambu',  'consumable', 'plate',           'Build Plates',              'Bambu Lab', '', 'https://us.store.bambulab.com/collections/build-plates', 'https://eu.store.bambulab.com/collections/build-plates', 1, unixepoch(), unixepoch()),
  ('bambu',  'consumable', 'accessory',       'Accessories & Tools',       'Bambu Lab', '', 'https://us.store.bambulab.com/collections/accessories',  'https://eu.store.bambulab.com/collections/accessories',  1, unixepoch(), unixepoch()),
  ('amazon', 'consumable', 'ipa',             'Isopropyl Alcohol (IPA)',   '',          '', 'https://www.amazon.com/s?k=isopropyl+alcohol+99%25',     'https://www.amazon.de/s?k=isopropanol+99%25',            1, unixepoch(), unixepoch()),
  ('amazon', 'consumable', 'glue',            'Glue Stick / Bed Adhesive', '',          '', 'https://www.amazon.com/s?k=3d+printer+glue+stick',       'https://www.amazon.de/s?k=3d+drucker+kleber',            1, unixepoch(), unixepoch()),
  ('amazon', 'consumable', 'nozzle_cleaning', 'Nozzle Cleaning Kit',       '',          '', 'https://www.amazon.com/s?k=3d+printer+nozzle+cleaning+kit', 'https://www.amazon.de/s?k=3d+drucker+d%C3%BCsen+reinigung', 1, unixepoch(), unixepoch()),
  ('amazon', 'consumable', 'lubricant',       'Rail & Rod Lubricant',      '',          '', 'https://www.amazon.com/s?k=3d+printer+lubricant',        'https://www.amazon.de/s?k=3d+drucker+schmiermittel',     1, unixepoch(), unixepoch());
