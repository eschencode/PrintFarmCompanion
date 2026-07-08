/**
 * Static tenant-scoping gate. Fails (exit 1) if any raw `sql`…`` template that
 * touches a workspace-scoped table lacks a `workspace_id` predicate.
 *
 * Rationale (see docs/multi-tenancy.md §3): isolation is enforced by discipline,
 * not by the engine — one query missing `AND workspace_id = ?` is a silent
 * cross-tenant leak with no runtime error. This catches the common regression
 * mechanically so it can gate CI / pre-deploy.
 *
 * Heuristic, not a SQL parser: for every `sql`…`` block that references a scoped
 * table via FROM/JOIN/INTO/UPDATE, require the literal `workspace_id` to appear
 * somewhere in the same statement. That covers the real patterns here:
 *   - direct filter:      WHERE workspace_id = ${ctx.workspaceId}
 *   - join-scoped:        FROM print_jobs pj JOIN printers p … WHERE pj.workspace_id = …
 *   - hybrid catalog:     WHERE workspace_id IS NULL OR workspace_id = …
 *   - insert:             INSERT INTO objects (workspace_id, …) VALUES (…)
 *
 * Escape hatch for a genuinely global statement: put `scoping-ok` in a SQL
 * comment inside the block (and say why).
 *
 * Run: `bun run scripts/check-tenant-scoping.ts`
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Tables that carry workspace_id (NOT NULL) or the hybrid catalog (nullable,
// whose reads must still reference workspace_id). Auth/global tables excluded:
// user, session, account, verification, workspaces, d1_migrations.
const SCOPED = [
  "objects", "spools", "spool_presets", "printers", "printer_secrets",
  "printer_loaded_spools", "print_modules", "module_filament_slots",
  "print_jobs", "print_job_spools", "inventory_log", "print_queue",
  "printer_queued_jobs", "shopify_settings", "shopify_sku_mapping",
  "shopify_orders", "shopify_skus", "categories", "grid_presets",
  "printer_presets", "plate_presets",
];
// FROM/JOIN/INTO/UPDATE <table>, allowing optional backticks/quotes.
const refRe = new RegExp(
  `\\b(?:from|join|into|update)\\s+["\`']?(${SCOPED.join("|")})["\`']?\\b`,
  "gi",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

// Extract the FULL contents of every `sql`…`` tagged template, including nested
// `sql`…`` fragments inside ${…} interpolations (e.g. `sql.join(updates, sql`, `)`).
// A naive non-greedy regex stops at the first nested backtick and would miss a
// trailing `WHERE … workspace_id` clause — so we walk with matched-depth scanning.
function scanTemplate(s: string, open: number): { content: string; end: number } {
  // `open` points at the opening backtick. Returns [content, index-of-close-backtick].
  let i = open + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "`") return { content: s.slice(open + 1, i), end: i };
    if (c === "$" && s[i + 1] === "{") { i = skipExpr(s, i + 2); continue; }
    i++;
  }
  return { content: s.slice(open + 1), end: s.length };
}
function skipExpr(s: string, i: number): number {
  // `i` is just past `${`. Return index just past the matching `}`.
  let depth = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "`") { i = scanTemplate(s, i).end + 1; continue; } // skip nested template
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return i;
}
function sqlBlocks(src: string): string[] {
  const blocks: string[] = [];
  const re = /\bsql`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const { content, end } = scanTemplate(src, m.index + 3); // +3 = past `sql`
    blocks.push(content);
    re.lastIndex = end + 1;
  }
  return blocks;
}

const files = walk("src");
type Violation = { file: string; tables: string[]; snippet: string };
const violations: Violation[] = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const block of sqlBlocks(src)) {
    const lower = block.toLowerCase();
    if (lower.includes("scoping-ok")) continue; // explicit, justified opt-out
    const tables = [...block.matchAll(refRe)].map((m) => m[1].toLowerCase());
    if (tables.length === 0) continue; // touches no scoped table
    if (lower.includes("workspace_id")) continue; // has a scoping predicate
    violations.push({
      file,
      tables: [...new Set(tables)],
      snippet: block.trim().replace(/\s+/g, " ").slice(0, 120),
    });
  }
}

if (violations.length === 0) {
  console.log(`✅ tenant-scoping gate: ${files.length} files scanned, no unscoped domain queries.`);
  process.exit(0);
}

console.error(`❌ tenant-scoping gate: ${violations.length} query/queries touch a scoped table with no workspace_id predicate:\n`);
for (const v of violations) {
  console.error(`  ${v.file}`);
  console.error(`    tables: ${v.tables.join(", ")}`);
  console.error(`    sql:    ${v.snippet}…\n`);
}
console.error("Add `AND workspace_id = \\${ctx.workspaceId}` (or set it on INSERT), or, if truly global, add a `-- scoping-ok: <reason>` comment inside the sql block.");
process.exit(1);
