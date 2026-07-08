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

// defer_foreign_keys lets rows load regardless of insert order within the txn.
const out = `PRAGMA defer_foreign_keys = true;\n${inserts.join("\n")}\n`;
await Bun.write(".wrangler/seed-remote.sql", out);
console.log(`✅ Wrote ${inserts.length} INSERT statements → .wrangler/seed-remote.sql`);
console.log("   Apply to the new staging DB (via preview slot):");
console.log("   wrangler d1 execute DB --remote --preview --file .wrangler/seed-remote.sql");
