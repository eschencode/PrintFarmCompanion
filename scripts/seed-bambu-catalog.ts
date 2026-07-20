/**
 * Generates SQL to seed a full Bambu Lab catalog into `printer_presets` and
 * `catalog_items` (kind='filament'). Emits SQL to stdout.
 *
 *   bun run scripts/seed-bambu-catalog.ts > scripts/seed-bambu-catalog.sql
 *   wrangler d1 execute DB --remote --preview --file=scripts/seed-bambu-catalog.sql
 *
 * Notes:
 * - Buy links point at the regional Bambu store *filament collection* (valid,
 *   non-broken) rather than fabricated per-SKU URLs. sku stays NULL.
 * - color_hex values are approximate UI swatch tints, not authoritative brand hex.
 * - Printer build volumes are the well-established Bambu specs.
 */

const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);

// ---------------------------------------------------------------------------
// Printers
// ---------------------------------------------------------------------------
type Printer = { model: string; x: number; y: number; z: number };
const printers: Printer[] = [
  { model: "A1 mini", x: 180, y: 180, z: 180 },
  { model: "A1", x: 256, y: 256, z: 256 },
  { model: "P1P", x: 256, y: 256, z: 256 },
  { model: "P1S", x: 256, y: 256, z: 256 },
  { model: "X1", x: 256, y: 256, z: 256 },
  { model: "X1C", x: 256, y: 256, z: 256 },
  { model: "X1E", x: 256, y: 256, z: 256 },
  { model: "H2D", x: 350, y: 320, z: 325 },
  { model: "H2S", x: 350, y: 320, z: 325 },
];

// ---------------------------------------------------------------------------
// Filament color palettes (name -> approximate swatch hex)
// ---------------------------------------------------------------------------
const C: Record<string, string> = {
  Black: "#161616",
  White: "#F7F7F7",
  "Jade White": "#F5F5F0",
  "Bone White": "#E7E1D2",
  Beige: "#F0E0C8",
  Gray: "#8E9089",
  "Ash Gray": "#9EA1A2",
  "Nardo Gray": "#63666A",
  Silver: "#A6A9AA",
  Gold: "#E4BD68",
  Bronze: "#847645",
  "Bambu Green": "#00AE42",
  "Grass Green": "#61C680",
  "Apple Green": "#8FC742",
  "Mistletoe Green": "#3F8E43",
  Cyan: "#0086D6",
  Turquoise: "#00B1B7",
  "Sky Blue": "#56B7E6",
  Blue: "#0A2989",
  "Cobalt Blue": "#0056B8",
  "Marine Blue": "#0078BF",
  "Blue Gray": "#5B6579",
  Purple: "#5E43B7",
  "Iris Purple": "#8671CB",
  Indigo: "#3D3D6B",
  Pink: "#F55A74",
  "Sakura Pink": "#F5B6C4",
  Magenta: "#EC008C",
  Red: "#C12E1F",
  "Scarlet Red": "#DE4343",
  "Maroon Red": "#9D2235",
  "Dark Red": "#792128",
  Orange: "#FF6A13",
  "Pumpkin Orange": "#FF9016",
  "Mandarin Orange": "#F99963",
  Yellow: "#F4EE2A",
  "Sunflower Yellow": "#FEC600",
  "Lemon Yellow": "#F7D959",
  Brown: "#9D432C",
  "Cocoa Brown": "#6F5034",
  "Dark Brown": "#4D3324",
  Latte: "#D3B7A7",
  Caramel: "#AE835B",
  Terracotta: "#B65C43",
  "Desert Tan": "#C8AD7F",
  Natural: "#E8E4D8",
  Clear: "#EDEDED",
};

const wide = [
  "Black", "White", "Beige", "Gold", "Silver", "Gray", "Bronze",
  "Bambu Green", "Grass Green", "Cyan", "Turquoise", "Sky Blue", "Blue",
  "Cobalt Blue", "Blue Gray", "Purple", "Pink", "Magenta", "Red",
  "Scarlet Red", "Maroon Red", "Orange", "Pumpkin Orange", "Yellow",
  "Sunflower Yellow", "Brown", "Cocoa Brown",
];
const matte = [
  "Ivory White", "Bone White", "Ash Gray", "Nardo Gray", "Black",
  "Charcoal", "Lemon Yellow", "Mandarin Orange", "Sakura Pink", "Dark Red",
  "Scarlet Red", "Grass Green", "Apple Green", "Mistletoe Green", "Sky Blue",
  "Marine Blue", "Ice Blue", "Iris Purple", "Latte", "Caramel", "Terracotta",
  "Dark Brown", "Desert Tan",
].filter((n) => C[n] || true);
const basicEng = ["Black", "White", "Gray", "Silver", "Blue", "Red", "Green", "Orange", "Yellow"];
const small = ["Black", "White", "Gray"];
const supportColors = ["Natural"];

// materials -> palette + weight + kind grouping
type Mat = { material: string; colors: string[]; weight?: number };
const filaments: Mat[] = [
  { material: "PLA Basic", colors: wide },
  { material: "PLA Matte", colors: matte },
  { material: "PLA Silk+", colors: ["Gold", "Silver", "Blue", "Purple", "Pink", "Red", "Green", "Candy Green", "Candy Red"] },
  { material: "PLA Galaxy", colors: ["Purple", "Green", "Nebulae", "Brown"] },
  { material: "PLA Sparkle", colors: ["Onyx Black", "Crimson Red", "Slate Gray", "Alpine Green", "Royal Purple"] },
  { material: "PLA Marble", colors: ["White Marble", "Red Granite"] },
  { material: "PLA Glow", colors: ["Green", "Blue", "Pink", "Orange", "Yellow"] },
  { material: "PLA Aero", colors: ["White", "Black", "Gray"] },
  { material: "PLA Lite", colors: ["Black", "White", "Gray", "Red", "Blue", "Yellow", "Green", "Orange"] },
  { material: "PLA-CF", colors: ["Black", "Iron Gray", "Matcha Green", "Lava Gray", "Jeans Blue", "Burgundy Red"] },
  { material: "PETG HF", colors: ["Black", "White", "Gray", "Silver", "Blue", "Green", "Red", "Orange", "Yellow", "Lime Green", "Peanut Brown", "Cream", "Forest Green"] },
  { material: "PETG Basic", colors: basicEng },
  { material: "PETG Translucent", colors: ["Clear", "Teal", "Olive", "Gray", "Brown", "Light Blue", "Pink", "Purple"] },
  { material: "PETG-CF", colors: ["Black", "Brick Red", "Indigo Blue", "Malachite Green", "Titan Gray", "Violet Purple"] },
  { material: "ABS", colors: ["Black", "White", "Gray", "Silver", "Blue", "Navy Blue", "Red", "Orange", "Yellow", "Green", "Bambu Green", "Tangerine Yellow"] },
  { material: "ABS-GF", colors: ["Black", "White", "Gray", "Blue", "Green", "Orange", "Yellow", "Red"] },
  { material: "ASA", colors: ["Black", "White", "Gray", "Blue", "Green", "Red", "Yellow", "Orange"] },
  { material: "ASA Aero", colors: ["White", "Black"] },
  { material: "ASA-CF", colors: ["Black"] },
  { material: "TPU 95A HF", colors: ["Black", "White", "Gray", "Blue", "Red", "Yellow", "Neon Green"], weight: 1000 },
  { material: "TPU 95A", colors: ["Black", "White", "Gray", "Blue", "Red", "Yellow"], weight: 1000 },
  { material: "TPU for AMS", colors: ["Black", "White", "Gray", "Blue", "Red", "Yellow", "Green", "Orange"], weight: 1000 },
  { material: "PC", colors: ["Black", "White", "Clear", "Transparent"] },
  { material: "PC FR", colors: ["Black", "White", "Gray"] },
  { material: "PAHT-CF", colors: ["Black"] },
  { material: "PA6-CF", colors: ["Black"] },
  { material: "PA6-GF", colors: ["Black"] },
  { material: "PET-CF", colors: ["Black"] },
  { material: "PPA-CF", colors: ["Black"] },
  { material: "PPS-CF", colors: ["Black"] },
  { material: "Support for PLA/PETG", colors: supportColors },
  { material: "Support for ABS", colors: supportColors },
  { material: "Support W", colors: ["White"] },
  { material: "Support G", colors: ["Green"] },
  { material: "PVA", colors: ["Natural"] },
];

// ---------------------------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------------------------
const URL_US = "https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament";
const URL_EU = "https://eu.store.bambulab.com/collections/bambu-lab-3d-printer-filament";
const URL_UK = "https://uk.store.bambulab.com/collections/bambu-lab-3d-printer-filament";

const lines: string[] = [];
lines.push("-- Auto-generated by scripts/seed-bambu-catalog.ts — full Bambu Lab catalog.");

// Printers: upsert on (COALESCE(workspace_id,0), brand, model) via the unique index.
lines.push("-- Printer presets (system catalog: workspace_id NULL)");
for (const p of printers) {
  lines.push(
    `INSERT INTO printer_presets (workspace_id, brand, model, dimension_x, dimension_y, dimension_z, device_file_path)\n` +
      `VALUES (NULL, 'Bambu Lab', ${q(p.model)}, ${p.x}, ${p.y}, ${p.z}, '/cache')\n` +
      `ON CONFLICT DO NOTHING;`,
  );
}

// Filaments: wipe existing Bambu filament rows, then insert fresh.
lines.push("-- Filament catalog items");
lines.push(`DELETE FROM catalog_items WHERE vendor = 'bambu' AND kind = 'filament';`);
let n = 0;
for (const m of filaments) {
  const weight = m.weight ?? 1000;
  for (const color of m.colors) {
    const hex = C[color] ?? null;
    lines.push(
      `INSERT INTO catalog_items (vendor, kind, brand, material, color, color_hex, weight, sku, url_us, url_eu, url_uk, active)\n` +
        `VALUES ('bambu', 'filament', 'Bambu Lab', ${q(m.material)}, ${q(color)}, ${q(hex)}, ${weight}, NULL, ${q(URL_US)}, ${q(URL_EU)}, ${q(URL_UK)}, 1);`,
    );
    n++;
  }
}

lines.push(`-- ${printers.length} printers, ${n} filament rows`);
console.log(lines.join("\n"));
