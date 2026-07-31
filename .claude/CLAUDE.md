# Print Farm Companion

Web app + Tauri desktop app for managing a 3D print farm. SvelteKit on Cloudflare Workers + D1.
Sole developer is Linus. Currently mid-migration from old schema to a normalized one (branch `db-structurecleanup`).

---

## Knowledge graph (use before grepping)

A graphify knowledge graph of this codebase lives in `graphify-out/`. **Before broad code exploration, check the graph first** — it's faster than grep for cross-file questions ("where is X used?", "what calls Y?", "what does this flow look like?").

- `graphify-out/graph.json` — machine-readable nodes + edges
- `graphify-out/GRAPH_REPORT.md` — human-readable summary
- `graphify-out/graph.html` — interactive viewer

Treat any open-ended codebase question as a `/graphify` query unless the file is already known.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | SvelteKit 2.x + **Svelte 5 (legacy/compat mode, not runes)**, TailwindCSS 4 |
| Backend | SvelteKit server routes on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) via **Drizzle ORM** (mostly raw `sql\`...\`` templates, not the builder) |
| Desktop | Tauri 2 (Rust) for direct MQTT to Bambu printers |
| Charts | Apache ECharts 6 |
| Package manager | **Bun** (not npm — `bun.lock` is the lockfile) |

---

## Commands

```bash
bun run dev               # Vite dev server
bun run check             # svelte-check (typecheck)
bun run lint              # ESLint
bun run build             # Production build
bun run desktop:dev       # Tauri desktop dev

# Database (Drizzle + wrangler D1)
bun run db:generate       # Generate migration from schema.ts
bun run db:migrate:local  # Apply migrations to local D1
bun run db:migrate:remote # Apply migrations to remote D1
bun run db:reset          # Wipe local D1 + re-migrate + seed
bun run db:pull           # Pull remote D1 down to local
bun run db:seed:test      # Seed 3 test workspaces (alice/bob/carol, pw password123)
bun run test:isolation    # Tenant-isolation leak test (needs dev server on :5173 + seed)
```

---

## Architecture & conventions

### Printer transport modes

The Pi bridge was removed (2026-07-31). Two-and-a-half user modes remain:
**standalone** (browser or desktop — inspect data, upload, time-based tracking),
**desktop default** (opens the local file into the slicer), and **desktop + direct
MQTT beta** (live status + control). Every control flow branches on the transport
resolved by `effectiveTransport(printer)` in `+page.svelte`.

| Mode | Path | When |
|---|---|---|
| `manual` | DB-only, time-based progress | `manualModeEnabled` toggle on |
| `local` | DB job + open the local file (desktop) or legacy `:3001` handler (browser) | default when not direct/manual |
| `direct` | Tauri Rust → Bambu MQTT directly | Desktop app + `directPrinterEnabled` beta toggle + IP/serial/access code set |

See `docs/print-start-flow.md` for the full start-print logic.

### Schema design

`src/lib/db/schema.ts` is the source of truth. See `docs/database-design.md` for the design philosophy (preset vs. instance pattern, append-only inventory logs, multi-tenancy readiness).

Key idea: **counters live on the row, history lives in log tables**. Don't add `total_*` columns — derive from logs.

### Drizzle, but raw SQL

Connection layer is Drizzle (parameter safety, schema-as-source). Queries are mostly `drizzleDb.run(sql\`...\`)` raw templates, not the builder DSL. **Don't refactor existing raw SQL to the builder** — explicit decision, see `docs/handoff-2026-05-23.md §9`.

### Server lib structure

`src/lib/server/` is split by domain — `jobs.ts`, `printers.ts`, `spools.ts`, `modules.ts`, `grid.ts`. Re-exported from `src/lib/server.ts`. New server-side functions go in the right domain file, not in `server.ts`.

### Types live in `src/lib/types.ts`

Two recurring shapes:
- `*Full` — the row + joined preset/related data (e.g. `PrintJobFull`, `PrinterFull`)
- `DashboardPrinter` — `PrinterFull` flattened for the UI with derived fields (`status`, `loaded_spool`, `printer_serial` from secrets)

---

## Conventions that matter

### Use `printer.id` for Sets/keys, never `printer.printer_serial`

Manual-mode printers have `printer_serial === null`. A `Set` keyed on serial will match every manual printer at once. Always key on numeric `printer.id`.

### `invalidateAll()` over `window.location.reload()`

For refreshing dashboard data after mutations (e.g. starting a print), use `invalidateAll()` from `$app/navigation`. Reasons:
- Preserves component state (start queue, polling intervals, modal state).
- No flicker / jank.
- Only re-runs `load()`, not the whole page.

`window.location.reload()` is reserved for print **completion** (deliberate hard refresh for success animation + clean state).

### Svelte 5 legacy mode `{@const}` reactivity

We're in legacy/compat mode (no runes). `{@const}` tracks dependencies via static analysis, so a function call that reads `data` via closure won't track `data` as a dep. Inline the access:

```svelte
<!-- bad — data dep hidden in closure -->
{@const printer = getPrinterForPosition(cell.printerId)}

<!-- good — data.printers is statically visible -->
{@const printer = data.printers.find(p => Number(p.id) === Number(cell.printerId))}
```

### Number coercion on IDs

IDs sometimes come back as strings from JSON. Always `Number(x) === Number(y)` when comparing IDs across boundaries.

### Form actions vs. API routes

- SvelteKit form actions (`?/action`) — domain mutations that the UI initiates (`startPrint`, `loadSpool`, `completePrint`).
- API routes (`/api/...`) — anything cross-cutting (AI recommendations, printer control, webhooks).

---

## Schema migration gotchas

The new schema rolled out recently. Watch for these in older code or AI suggestions:

| Old | New |
|---|---|
| `module.expected_time` | `module.expected_time_minutes` |
| `module.expected_weight` | `module.weight` |
| `module.image_path` | `module.thumbnail` |
| `module.inventory_slug` | `module.object_id` |
| `printer.loaded_spool_id` | `printer.loaded_spool` (joined object) |
| `printer.model` | `printer.preset?.model` |
| `printer.status === 'BROKEN'` | `printer.status === 'inactive'` (lowercase!) |
| `job.status === 'success'` | `job.status === 'successful'` |
| `loadedSpool.brand/material/color` | `loadedSpool.preset?.brand/...` |
| `FROM inventory` | `FROM objects` |

Full catalog with grep commands: see the user's `schema-migration-patterns.md` memory.

### Live status is client-only

Live state lives in `liveBySerial` (client, keyed on serial), populated from direct
Tauri MQTT events — never persisted. Don't write `progress`/`layer_num`/etc. to the DB.

---

## Where to look first

| Question | File |
|---|---|
| Dashboard rendering, queue logic | `src/routes/(main)/+page.svelte` |
| Dashboard data loading | `src/routes/(main)/+page.server.ts` |
| DB schema | `src/lib/db/schema.ts` |
| Server-side queries by domain | `src/lib/server/{jobs,printers,spools,modules,grid}.ts` |
| Type definitions | `src/lib/types.ts` |
| Direct MQTT (Rust) | `desktop/src-tauri/src/bambu.rs` |
| Auth (config, guard, flows) | `src/lib/auth.ts`, `src/hooks.server.ts`, `src/routes/(auth)/*` — see `docs/authentication.md` |

---

## Project state docs

Real-time context (read these for "where is the project right now?"):

- `docs/saas-migration-plan.md` — phased migration plan, locked-in decisions, what's done
- `docs/database-design.md` — schema philosophy + table map
- `docs/dashboard-migration-plan.md` — dashboard-specific schema fixes inventory
- `docs/handoff-2026-05-23.md` — latest session handoff (multi-spool, stats rewrite, dashboard fixes)
- `docs/print-start-flow.md` — full start-print flow (transports, queue, UI states)
- `docs/authentication.md` — Phase 2 auth (better-auth, per-request factory, route guard, signup→workspace, deploy steps)
- `docs/multi-tenancy.md` — how tenant isolation works, the rules for adding scoped tables/queries, secrets-at-rest, and verification (`bun run test:isolation`)

---

## Tone & collaboration

- Be terse. Linus reads diffs — don't summarize what just changed.
- Don't add comments that just restate code. Only comment non-obvious *why*.
- Don't add backwards-compat shims or feature flags unless asked.
- Confirm before destructive actions (`db:reset`, `db:delete`, force pushes, `git reset --hard`).
- For UI changes, verify in the browser before claiming done.
- Don't introduce new abstractions for a fix — three similar lines is fine.
