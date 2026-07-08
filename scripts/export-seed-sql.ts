/**
 * Export the LOCAL seeded D1 as a data-only SQL file that can be replayed into a
 * freshly-migrated REMOTE D1 (e.g. a new staging DB). Bridges the gap that
 * `scripts/seed.ts` writes only to the local Miniflare SQLite and can't reach
 * remote D1.
 *
 * Flow:
 *   bun run db:seed:test            # populate local D1
 *   bun run scripts/export-seed-sql.ts   # → .wrangler/seed-remote.sql (INSERTs only)
 *   wrangler d1 execute DB --remote --preview --file .wrangler/seed-remote.sql
 *
 * Emits INSERTs only (the remote schema already exists from migrations) and skips
 * d1_migrations (remote tracks its own) and sqlite_sequence (SQLite bumps the
 * AUTOINCREMENT counter automatically when we insert explicit ids).
 */
import { readdirSync } from "node:fs";

const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
let file: string;
try {
  file = readdirSync(d1Dir).find((f) => f.endsWith(".sqlite"))!;
} catch {
  console.error(`No local D1 in ${d1Dir}. Run \`bun run db:migrate:local && bun run db:seed:test\` first.`);
  process.exit(1);
}

const dump = Bun.spawnSync(["sqlite3", `${d1Dir}/${file}`, ".dump"]);
if (dump.exitCode !== 0) {
  console.error("sqlite3 .dump failed:", dump.stderr.toString());
  process.exit(1);
}

const lines = dump.stdout.toString().split("\n");
// Skip bookkeeping tables: d1_migrations (remote tracks its own), sqlite_sequence
// (auto-bumped on explicit-id insert), and Miniflare-internal _cf_* tables (which
// don't exist on remote D1).
const SKIP = /^INSERT INTO "?(d1_migrations|sqlite_sequence|_cf_[a-z_]*)"?\b/i;
const inserts = lines.filter((l) => l.startsWith("INSERT INTO") && !SKIP.test(l));

if (inserts.length === 0) {
  console.error("No INSERT rows found — did you run `bun run db:seed:test` first?");
  process.exit(1);
}

// D1 enforces FKs per-statement and doesn't honor PRAGMA defer_foreign_keys via
// `d1 execute --file`, so a child inserted before its parent fails even when the
// full snapshot is consistent. Emit tables in FK-dependency order (parents first);
// row order within a table is preserved (categories.parent_id is satisfied because
// a parent is seeded — and thus has a lower id — before its child).
const ORDER = [
  "user", "verification", "account", "session",
  "workspaces",
  "printer_presets", "plate_presets",
  "categories", "objects",
  "spool_presets", "spools",
  "printers", "printer_secrets", "printer_loaded_spools",
  "print_modules", "module_filament_slots",
  "print_jobs", "print_job_spools",
  "inventory_log",
  "print_queue", "printer_queued_jobs",
  "shopify_settings", "shopify_skus", "shopify_sku_mapping", "shopify_orders",
  "grid_presets",
];
const tableOf = (l: string) => l.match(/^INSERT INTO "?([a-z_]+)"?/i)?.[1] ?? "";
const rank = (t: string) => {
  const i = ORDER.indexOf(t);
  return i === -1 ? ORDER.length : i; // unknown tables sort last (and are flagged)
};
const unknown = [...new Set(inserts.map(tableOf).filter((t) => !ORDER.includes(t)))];
if (unknown.length) console.warn(`⚠️  tables not in dependency order (appended last): ${unknown.join(", ")}`);

// Stable sort by table rank — preserves original per-table row order.
const ordered = inserts
  .map((l, i) => ({ l, i, r: rank(tableOf(l)) }))
  .sort((a, b) => a.r - b.r || a.i - b.i)
  .map((x) => x.l);

const out = `PRAGMA defer_foreign_keys = true;\n${ordered.join("\n")}\n`;
await Bun.write(".wrangler/seed-remote.sql", out);
console.log(`✅ Wrote ${inserts.length} INSERT statements → .wrangler/seed-remote.sql`);
console.log("   Apply to the new staging DB (via preview slot):");
console.log("   wrangler d1 execute DB --remote --preview --file .wrangler/seed-remote.sql");
