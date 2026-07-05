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
 * Isolation status (Phase 3): objects + inventory_log are per-workspace TODAY.
 * printers / spools / modules / print_jobs are still SHARED across all users
 * until Groups 2–5 add workspace_id — this seed will grow to split them then.
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
  "inventory_log", "print_job_spools", "print_jobs", "module_filament_slots",
  "print_modules", "printer_loaded_spools", "printer_secrets", "printers",
  "spools", "spool_presets", "plate_presets", "printer_presets", "objects",
  "grid_presets", "session", "account", "verification", "workspaces", "user",
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
const plateId = run(
  `INSERT INTO plate_presets (name, dimension_x, dimension_y, created_at, updated_at) VALUES (?,?,?,?,?)`,
  ["Textured PEI Plate", 256, 256, now, now],
);

// NOTE: spool_presets + spools + printers (+secrets, +loaded slots) are
// per-workspace as of Groups 2–3 — seeded in the per-user loop below. Shared
// modules/jobs therefore reference NULL for spool/preset/printer FKs until
// modules/jobs are scoped (Groups 4–5).

// Two shared modules (object_id null; slot preset null until modules are scoped)
const moduleIds: number[] = [];
[
  { name: "Wall Hook v3", weight: 24, mins: 95, per: 5, file: "wall_hook_v3.gcode.3mf" },
  { name: "Desk Organizer", weight: 180, mins: 410, per: 1, file: "desk_organizer.gcode.3mf" },
].forEach((m) => {
  const mid = run(
    `INSERT INTO print_modules (name, weight, expected_time_minutes, objects_per_print, plate_preset_id, printer_preset_id, object_id, nozzle_diameter, filename, active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [m.name, m.weight, m.mins, m.per, plateId, printerPresetId, null, 0.4, m.file, 1, now, now],
  );
  run(
    `INSERT INTO module_filament_slots (module_id, slot_index, spool_preset_id, weight) VALUES (?,?,?,?)`,
    [mid, 0, null, m.weight],
  );
  moduleIds.push(mid);
});

// A handful of shared print jobs (start_time in ms to match the stats page)
["successful", "successful", "failed", "successful"].forEach((status, i) => {
  const jid = run(
    `INSERT INTO print_jobs (module_id, printer_id, external_task_id, start_time, expected_end_time, status, failure_reason, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      moduleIds[i % moduleIds.length], null,
      crypto.randomUUID(), msAgo(i + 1), msAgo(i + 1) + 90 * 60_000,
      status, status === "failed" ? "Spaghetti / detach" : null, now, now,
    ],
  );
  run(`INSERT INTO print_job_spools (print_job_id, slot_index, spool_id, used_weight) VALUES (?,?,?,?)`,
    [jid, 0, null, status === "successful" ? 24 : 5]);
});

console.log("Seeded shared catalog + 2 modules + 4 jobs.");

// ── PER-USER (isolated) ──────────────────────────────────────────────────────
const passwordHash = await hashPassword(PASSWORD);

const users = [
  { name: "Alice Anderson", email: "alice@test.dev", workspace: "Alice Prints" },
  { name: "Bob Baker",      email: "bob@test.dev",   workspace: "Bob's Farm" },
  { name: "Carol Chen",     email: "carol@test.dev", workspace: "Chen Studio" },
];

// Same product names in every workspace — proves per-workspace uniqueness + isolation.
const products = [
  { name: "Wall Hook",     stock: 42, min: 20 },
  { name: "Phone Stand",   stock: 8,  min: 15 }, // low
  { name: "Cable Clip",    stock: 0,  min: 10 }, // out
  { name: "Desk Organizer",stock: 27, min: 5 },
];

for (const u of users) {
  const uid = crypto.randomUUID();
  run(`INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [uid, u.name, u.email, 1, null, now, now]);
  run(`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [crypto.randomUUID(), uid, "credential", uid, passwordHash, now, now]);
  const wsId = run(`INSERT INTO workspaces (name, slug, owner_user_id, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [u.workspace, `${slug(u.workspace)}-${rand()}`, uid, now, now]);

  // Per-workspace filament library + a couple of open spools
  const presets = [
    { color: "Black", hex: "#1a1a1a", brand: "Bambu", material: "PLA", w: 1000, cost: 2500 },
    { color: "White", hex: "#f5f5f5", brand: "Bambu", material: "PLA", w: 1000, cost: 2500 },
    { color: "Ocean Blue", hex: "#1e6fd9", brand: "Bambu", material: "PETG", w: 1000, cost: 2900 },
  ].map((p) =>
    run(
      `INSERT INTO spool_presets (workspace_id, color, color_hex, brand, material, default_weight, cost, in_storage, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [wsId, p.color, p.hex, p.brand, p.material, p.w, p.cost, 3, now, now],
    ),
  );
  const spoolA = run(`INSERT INTO spools (workspace_id, preset_id, initial_weight, remaining_weight, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [wsId, presets[0], 1000, 640, now, now]);
  run(`INSERT INTO spools (workspace_id, preset_id, initial_weight, remaining_weight, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [wsId, presets[1], 1000, 815, now, now]);

  // Two printers per workspace, each with a secret row + one loaded slot.
  ["Printer A", "Printer B"].forEach((pname, i) => {
    const pid = run(
      `INSERT INTO printers (workspace_id, name, printer_preset_id, loaded_plate_id, loaded_nozzle_diameter, slot_count, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [wsId, `${u.name.split(" ")[0]} ${pname}`, printerPresetId, plateId, 0.4, 1, 1, now, now],
    );
    run(
      `INSERT INTO printer_secrets (workspace_id, printer_id, printer_ip, serial, access_code, transport, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [wsId, pid, `192.168.${wsId}.${20 + i}`, `SER${wsId}${1000 + i}`, "12345678", "pi", now, now],
    );
    // Slot 0 loads the first printer with the workspace's black spool.
    run(
      `INSERT INTO printer_loaded_spools (workspace_id, printer_id, slot_index, spool_id, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [wsId, pid, 0, i === 0 ? spoolA : null, now, now],
    );
  });

  for (const p of products) {
    const oid = run(
      `INSERT INTO objects (workspace_id, name, in_stock, min_threshold, category, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [wsId, p.name, p.stock, p.min, null, now, now],
    );
    // Rich history spread over the last 30 days: printed + sold (b2c/b2b) + a count.
    const history: [string, number, number][] = [
      ["+ printed", 20, 28], ["- sold b2c", 6, 24], ["+ printed", 15, 18],
      ["- sold b2c", 9, 12], ["- sold b2b", 12, 9], ["- sold b2c", 4, 5],
      ["+ stock count", 3, 2],
    ];
    for (const [type, qty, d] of history) {
      run(
        `INSERT INTO inventory_log (workspace_id, object_id, change_type, quantity, print_job_id, shopify_order_id, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [wsId, oid, type, qty, null, null, sAgo(d)],
      );
    }
  }
  console.log(`  ${u.email}  (workspace #${wsId} "${u.workspace}") — 4 products + history`);
}

db.close();
console.log(`\n✅ Done. ${users.length} users, password: "${PASSWORD}"`);
console.log("   Log in at /login with any of the emails above.");
