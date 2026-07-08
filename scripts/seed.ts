/**
 * Test seed for multi-user development. Run with `bun run db:seed:test`.
 *
 * Creates several real, login-able users (via better-auth's own password hasher),
 * each with their own workspace and **isolated** inventory + history. Also seeds a
 * SHARED pool of printers / spool presets / modules / print jobs so the dashboard,
 * modules and stats pages are populated.
 *
 * ⚠️  Wipes ALL domain + auth data in the LOCAL D1 first, so it's re-runnable.
 *     Local only — never point this at a remote DB.
 *
 * Isolation status (Phase 3 complete): every domain table is workspace-scoped.
 * Each user gets a fully independent farm — catalog, hardware, inventory, queues,
 * Shopify data and print history — so cross-tenant isolation is testable and every
 * feature surface (dashboard live states, AMS, categories, queue, Shopify) is populated.
 */
import { Database } from "bun:sqlite";
import { hashPassword } from "better-auth/crypto";
import { readdirSync } from "node:fs";

const PASSWORD = "password123";

// ── locate the local miniflare D1 sqlite file ────────────────────────────────
const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
let file: string;
try {
  file = readdirSync(d1Dir).find((f) => f.endsWith(".sqlite"))!;
} catch {
  console.error(`No local D1 found in ${d1Dir}. Run \`bun run db:migrate:local\` first.`);
  process.exit(1);
}
const db = new Database(`${d1Dir}/${file}`);
db.exec("PRAGMA foreign_keys = OFF");

const run = (sql: string, params: unknown[] = []): number =>
  Number(db.query(sql).run(...(params as any[])).lastInsertRowid);

const now = Math.floor(Date.now() / 1000); // seconds (objects / inventory_log / created_at)
const sAgo = (days: number) => now - days * 86_400;
const msAgo = (days: number) => Date.now() - days * 86_400_000; // ms (print_jobs.start_time)
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ws";
const rand = () => Math.random().toString(36).slice(2, 7);

// ── wipe (FK-off, order-independent) ─────────────────────────────────────────
for (const t of [
  "shopify_orders", "shopify_skus", "shopify_sku_mapping", "shopify_settings",
  "printer_queued_jobs", "print_queue",
  "inventory_log", "print_job_spools", "print_jobs", "module_filament_slots",
  "print_modules", "printer_loaded_spools", "printer_secrets", "printers",
  "spools", "spool_presets", "plate_presets", "printer_presets", "objects",
  "categories", "grid_presets", "session", "account", "verification", "workspaces", "user",
]) {
  db.exec(`DELETE FROM ${t}`);
}
console.log("Wiped existing data.");

// ── SHARED catalog + hardware (global until Groups 2–5) ──────────────────────
const printerPresetId = run(
  `INSERT INTO printer_presets (model, brand, dimension_x, dimension_y, dimension_z, device_file_path, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?)`,
  ["P1S", "Bambu Lab", 256, 256, 256, "/cache", now, now],
);
const amsPresetId = run(
  `INSERT INTO printer_presets (model, brand, dimension_x, dimension_y, dimension_z, device_file_path, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?)`,
  ["X1C", "Bambu Lab", 256, 256, 256, "/cache", now, now],
);
const plateId = run(
  `INSERT INTO plate_presets (name, dimension_x, dimension_y, created_at, updated_at) VALUES (?,?,?,?,?)`,
  ["Textured PEI Plate", 256, 256, now, now],
);

// printer_presets + plate_presets are the shared hardware catalog. Everything
// else below is seeded per-workspace with coherent FKs.
console.log("Seeded shared catalog (2 printer presets, 1 plate).");

// ── PER-USER (isolated) ──────────────────────────────────────────────────────
const passwordHash = await hashPassword(PASSWORD);

const users = [
  { name: "Alice Anderson", email: "alice@test.dev", workspace: "Alice Prints" },
  { name: "Bob Baker",      email: "bob@test.dev",   workspace: "Bob's Farm" },
  { name: "Carol Chen",     email: "carol@test.dev", workspace: "Chen Studio" },
];

// Same product names in every workspace — proves per-workspace uniqueness + isolation.
// stock vs min gives one healthy, one low, one out, one healthy product.
const products = [
  { name: "Wall Hook",      stock: 42, min: 20, cat: "hooks" },   // healthy
  { name: "Phone Stand",    stock: 8,  min: 15, cat: "stands" },  // low
  { name: "Cable Clip",     stock: 0,  min: 10, cat: "cables" },  // out
  { name: "Desk Organizer", stock: 27, min: 5,  cat: "office" },  // healthy
];

for (const u of users) {
  const uid = crypto.randomUUID();
  run(`INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [uid, u.name, u.email, 1, null, now, now]);
  run(`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [crypto.randomUUID(), uid, "credential", uid, passwordHash, now, now]);
  const wsId = run(`INSERT INTO workspaces (name, slug, owner_user_id, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [u.workspace, `${slug(u.workspace)}-${rand()}`, uid, now, now]);

  // ── Category tree (nested: Office > Cable Management) ──────────────────────
  const cat = (name: string, parent: number | null, sort: number) =>
    run(`INSERT INTO categories (workspace_id, name, parent_id, sort_order, created_at) VALUES (?,?,?,?,?)`,
      [wsId, name, parent, sort, now]);
  const catHooks  = cat("Hooks & Mounts", null, 0);
  const catStands = cat("Stands", null, 1);
  const catOffice = cat("Office", null, 2);
  const catCables = cat("Cable Management", catOffice, 0); // child of Office
  const catByKey: Record<string, number> = {
    hooks: catHooks, stands: catStands, office: catOffice, cables: catCables,
  };

  // ── Filament library (5 presets) + physical spools at varied fill levels ──
  const presets = [
    { color: "Black",      hex: "#1a1a1a", brand: "Bambu",   material: "PLA",  w: 1000, cost: 2500, storage: 3 },
    { color: "White",      hex: "#f5f5f5", brand: "Bambu",   material: "PLA",  w: 1000, cost: 2500, storage: 2 },
    { color: "Ocean Blue", hex: "#1e6fd9", brand: "Bambu",   material: "PETG", w: 1000, cost: 2900, storage: 1 },
    { color: "Signal Red", hex: "#d92828", brand: "Polymaker", material: "PLA", w: 1000, cost: 2700, storage: 0 },
    { color: "Slate Grey", hex: "#6b7280", brand: "Bambu",   material: "PLA",  w: 1000, cost: 2500, storage: 4 },
  ].map((p) =>
    run(
      `INSERT INTO spool_presets (workspace_id, color, color_hex, brand, material, default_weight, cost, in_storage, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [wsId, p.color, p.hex, p.brand, p.material, p.w, p.cost, p.storage, now, now],
    ),
  );
  // Open spools — remaining weight spans full → nearly-empty for low-filament UI.
  const mkSpool = (presetIdx: number, remaining: number) =>
    run(`INSERT INTO spools (workspace_id, preset_id, initial_weight, remaining_weight, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [wsId, presets[presetIdx], 1000, remaining, now, now]);
  const spoolBlack = mkSpool(0, 640);
  const spoolWhite = mkSpool(1, 815);
  const spoolBlue  = mkSpool(2, 300);
  const spoolRed   = mkSpool(3, 45);  // nearly empty
  mkSpool(4, 1000);                    // fresh grey, unloaded

  // ── Objects (products) + Shopify SKU mapping ───────────────────────────────
  const objectIds: number[] = [];
  for (const p of products) {
    const oid = run(
      `INSERT INTO objects (workspace_id, name, in_stock, min_threshold, category_id, last_count_date, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [wsId, p.name, p.stock, p.min, catByKey[p.cat], sAgo(3), now, now],
    );
    objectIds.push(oid);
    run(`INSERT INTO shopify_sku_mapping (workspace_id, shopify_sku, object_id, quantity, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [wsId, `SKU-${p.name.replace(/\s+/g, "").toUpperCase()}`, oid, 1, now, now]);
    // Catalog cache row so the SKU picker in the mapping UI has entries.
    run(`INSERT INTO shopify_skus (workspace_id, sku, product_title, variant_title, product_id, variant_id, synced_at) VALUES (?,?,?,?,?,?,?)`,
      [wsId, `SKU-${p.name.replace(/\s+/g, "").toUpperCase()}`, p.name, "Default", `gid://p/${oid}`, `gid://v/${oid}`, now]);
  }

  // ── Shopify orders (b2c sales) — some inventory_log rows link back to these ──
  const orderIds: string[] = [];
  [[1001, 2, 6], [1002, 1, 12], [1003, 3, 24]].forEach(([n, items, d]) => {
    const oid = `ORD-${wsId}-${n}`;
    run(`INSERT INTO shopify_orders (workspace_id, order_id, order_number, processed_at, total_items, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [wsId, oid, `#${n}`, sAgo(d), items, now, now]);
    orderIds.push(oid);
  });

  // Rich per-object history over the last 30 days. b2c entries link to an order.
  objectIds.forEach((oid, idx) => {
    const history: [string, number, number, string | null][] = [
      ["+ printed", 20, 28, null], ["- sold b2c", 6, 24, orderIds[2]],
      ["+ printed", 15, 18, null], ["- sold b2c", 9, 12, orderIds[1]],
      ["- sold b2b", 12, 9, null], ["- sold b2c", 4, 5, orderIds[0]],
      ["+ stock count", 3, 2, null],
    ];
    for (const [type, qty, d, orderRef] of history) {
      run(
        `INSERT INTO inventory_log (workspace_id, object_id, change_type, quantity, print_job_id, shopify_order_id, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [wsId, oid, type, qty, null, orderRef, sAgo(d)],
      );
    }
  });

  // ── Printers: pi (single), direct (single), AMS (4-slot), manual (no serial) ─
  // Manual mode = a secret row with null serial/ip/access — no live transport.
  const printerIds: number[] = [];
  const loadSlot = (pid: number, slot: number, spool: number | null) =>
    run(`INSERT INTO printer_loaded_spools (workspace_id, printer_id, slot_index, spool_id, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [wsId, pid, slot, spool, now, now]);
  const mkPrinter = (
    name: string, presetId: number, slots: number, transport: string,
    serial: string | null, ip: string | null,
  ) => {
    const pid = run(
      `INSERT INTO printers (workspace_id, name, printer_preset_id, loaded_plate_id, loaded_nozzle_diameter, slot_count, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [wsId, name, presetId, plateId, 0.4, slots, 1, now, now],
    );
    printerIds.push(pid);
    run(
      `INSERT INTO printer_secrets (workspace_id, printer_id, printer_ip, serial, access_code, transport, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [wsId, pid, ip, serial, serial ? "12345678" : null, transport, now, now],
    );
    return pid;
  };
  const first = u.name.split(" ")[0];
  const printerPi     = mkPrinter(`${first} Printer A`, printerPresetId, 1, "pi",     `SER${wsId}1000`, `192.168.${wsId}.20`);
  const printerDirect = mkPrinter(`${first} Printer B`, printerPresetId, 1, "direct", `SER${wsId}1001`, `192.168.${wsId}.21`);
  const printerAms    = mkPrinter(`${first} Printer C (AMS)`, amsPresetId, 4, "pi",   `SER${wsId}1002`, `192.168.${wsId}.22`);
  const printerManual = mkPrinter(`${first} Printer D (Manual)`, printerPresetId, 1, "pi", null, null);
  loadSlot(printerPi, 0, spoolBlack);
  loadSlot(printerDirect, 0, spoolWhite);
  loadSlot(printerAms, 0, spoolBlack); // AMS: 4 slots, one empty
  loadSlot(printerAms, 1, spoolWhite);
  loadSlot(printerAms, 2, spoolBlue);
  loadSlot(printerAms, 3, null);
  loadSlot(printerManual, 0, spoolRed);

  // ── Modules: 2 single-colour + 1 multi-colour (2 slots) ────────────────────
  const modules = [
    { name: "Wall Hook v3",    weight: 24,  mins: 95,  per: 5, file: "wall_hook_v3.gcode.3mf",   oid: objectIds[0], slots: [[0, 24]] },
    { name: "Desk Organizer",  weight: 180, mins: 410, per: 1, file: "desk_organizer.gcode.3mf", oid: objectIds[3], slots: [[0, 180]] },
    { name: "Phone Stand Duo", weight: 60,  mins: 150, per: 2, file: "phone_stand_duo.gcode.3mf", oid: objectIds[1], slots: [[0, 40], [2, 20]] }, // black + blue
  ].map((m) => {
    const mid = run(
      `INSERT INTO print_modules (workspace_id, name, weight, expected_time_minutes, objects_per_print, plate_preset_id, printer_preset_id, object_id, nozzle_diameter, filename, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [wsId, m.name, m.weight, m.mins, m.per, plateId, printerPresetId, m.oid, 0.4, m.file, 1, now, now],
    );
    for (const [slotIdx, w] of m.slots)
      run(`INSERT INTO module_filament_slots (workspace_id, module_id, slot_index, spool_preset_id, weight) VALUES (?,?,?,?,?)`,
        [wsId, mid, slotIdx, presets[slotIdx], w]);
    return mid;
  });
  const [modHook, modOrg, modDuo] = modules;

  // ── Print jobs across every status the dashboard can render ────────────────
  // [status, moduleId, printerId, startMinAgo | null, durationMin, failReason, spoolSlots]
  type Job = [string, number, number, number | null, number, string | null, [number, number, number | null][]];
  const jobs: Job[] = [
    ["successful",     modHook, printerPi,     60 * 24 * 5, 90,  null,                  [[0, spoolBlack, 24]]],
    ["successful",     modOrg,  printerDirect, 60 * 24 * 3, 410, null,                  [[0, spoolWhite, 180]]],
    ["failed_confirmed", modHook, printerAms,  60 * 24 * 2, 90,  "Spaghetti / detach",  [[0, spoolBlack, 6]]],
    ["printing",       modDuo,  printerAms,    40,          150, null,                  [[0, spoolBlack, null], [2, spoolBlue, null]]], // live, multi-colour
    ["print_finished", modHook, printerPi,     100,         90,  null,                  [[0, spoolBlack, null]]], // awaiting confirm
    ["paused",         modOrg,  printerDirect, 30,          410, null,                  [[0, spoolWhite, null]]],
    ["queued",         modHook, printerManual, null,        90,  null,                  [[0, spoolRed, null]]],
  ];
  for (const [status, mid, pid, startMinAgo, durMin, fail, spools] of jobs) {
    const start = startMinAgo == null ? null : Date.now() - startMinAgo * 60_000;
    const jid = run(
      `INSERT INTO print_jobs (workspace_id, module_id, printer_id, external_task_id, start_time, expected_end_time, status, failure_reason, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [wsId, mid, pid, crypto.randomUUID(), start, start == null ? null : start + durMin * 60_000, status, fail, now, now],
    );
    for (const [slot, spool, used] of spools)
      run(`INSERT INTO print_job_spools (workspace_id, print_job_id, slot_index, spool_id, used_weight) VALUES (?,?,?,?,?)`,
        [wsId, jid, slot, spool, used]);
  }

  // ── Print queue (backlog): auto rows for low/out stock + one manual pin ─────
  run(`INSERT INTO print_queue (workspace_id, object_id, module_id, quantity, priority, reason, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [wsId, objectIds[2], modHook, 10, "CRITICAL", "Out of stock", "auto", "pending", now, now]);
  run(`INSERT INTO print_queue (workspace_id, object_id, module_id, quantity, priority, reason, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [wsId, objectIds[1], modDuo, 7, "HIGH", "Below minimum threshold", "auto", "pending", now, now]);
  run(`INSERT INTO print_queue (workspace_id, object_id, module_id, quantity, priority, reason, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [wsId, objectIds[0], modHook, 5, "MEDIUM", "Manual pin", "manual", "pending", now, now]);

  // ── Per-printer recommendation queue on the pi printer ─────────────────────
  run(`INSERT INTO printer_queued_jobs (workspace_id, printer_id, module_id, reason, sort_order, is_completed, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [wsId, printerPi, modHook, "Restock Cable Clip", 1, 0, now, now]);
  run(`INSERT INTO printer_queued_jobs (workspace_id, printer_id, module_id, reason, sort_order, is_completed, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [wsId, printerPi, modOrg, "Top up Desk Organizer", 2, 0, now, now]);

  // ── Default dashboard grid: 4 printers + widgets in a 3×3 layout ───────────
  const grid = [
    { type: "printer", printerId: printerPi },
    { type: "printer", printerId: printerDirect },
    { type: "printer", printerId: printerAms },
    { type: "printer", printerId: printerManual },
    { type: "stats" }, { type: "inventory" },
    { type: "products" }, { type: "spools" }, { type: "empty" },
  ];
  run(`INSERT INTO grid_presets (workspace_id, name, is_default, rows, cols, grid_config, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [wsId, "Default", 1, 3, 3, JSON.stringify(grid), now, now]);

  console.log(`  ${u.email}  (workspace #${wsId} "${u.workspace}") — 4 products, 4 categories, 4 printers (incl. AMS + manual), 3 modules, 7 jobs, queue + grid`);
}

db.close();
console.log(`\n✅ Done. ${users.length} users, password: "${PASSWORD}"`);
console.log("   Log in at /login with any of the emails above.");
