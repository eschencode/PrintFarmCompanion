# PrintFarmCompanion → SaaS Migration Plan

Living document. Add notes, mark phases done, append decisions as we go.
Maintained across sessions between Linus and Claude.

---

## Locked-in decisions

| # | Decision | Date |
|---|---|---|
| D1 | ORM: **Drizzle** (D1 native, zero runtime cost, types from schema, `drizzle-kit` migrations) | 2026-05-18 |
| D2 | Auth: **better-auth** (Workers-compatible, D1 adapter, has org primitives we can ignore for now) | 2026-05-18 |
| D3 | Tenancy model: **one user per account** for now. Schema designed so `memberships` can be added later without rewriting domain tables. | 2026-05-18 |
| D4 | Order of work: **schema cleanup BEFORE tenancy**. Phase 1 ships clean single-tenant; Phase 2+ adds multi-tenant on top. | 2026-05-18 |
| D5 | Existing data: **wipe-and-rebuild is acceptable**. No prod migration scripts needed. Local + remote D1 will be reset. | 2026-05-18 |
| D6 | Inventory counters: **keep `stock_count`, drop `total_*` analytics columns**. Derive analytics from `inventory_log`. | 2026-05-18 |

## Open questions (resolve as they come up)

- [ ] Roles inside an account when we add memberships later — owner/admin/operator? Define when we get there, not now.
- [ ] Billing — Stripe vs. Cloudflare's billing primitives. Out of scope until post-Phase 4.
- [ ] Account onboarding flow — invite-only beta or open signup? Decide before Phase 2 ships to real users.
- [ ] Encryption key management — single Worker secret for now (envelope encryption); rotate strategy later.

---

## Phase 0 — Drizzle adoption (no schema changes)

**Goal:** swap raw `.prepare()` calls for Drizzle, change nothing else. Pure refactor, behavior-identical, fully reversible.

**Why first:** validates Drizzle works on D1 in production. Makes Phase 1+ migrations dramatically easier (typed schema, generated migrations). De-risks the whole project.

### Tasks

- [ ] Install `drizzle-orm` and `drizzle-kit` as deps
- [ ] Create `src/lib/db/schema.ts` mirroring current `schema.sql` 1:1 (no design changes yet)
- [ ] Create `src/lib/db/index.ts` exporting a `getDb(platform)` helper that wraps `platform.env.DB` with `drizzle()`
- [ ] Configure `drizzle.config.ts` with `dialect: 'sqlite'`, driver: `d1-http` for remote, local D1 SQLite path for dev
- [ ] Generate initial migration `0000_init.sql` from the Drizzle schema; verify it produces the same DDL as current `schema.sql`
- [ ] Update `package.json` scripts:
  - `db:generate` → `drizzle-kit generate`
  - `db:migrate:local` → `wrangler d1 migrations apply DB --local`
  - `db:migrate:remote` → `wrangler d1 migrations apply DB --remote`
  - Keep `db:reset` working (now runs migrations + `seed.sql`)
- [ ] Port query sites file-by-file. Order by size — get the big ones done first:
  - [ ] `src/lib/server.ts` (71 prepare calls — biggest lift)
  - [ ] `src/lib/inventory_handler.ts` (18)
  - [ ] `src/routes/(main)/products/+page.server.ts` (11)
  - [ ] `src/routes/(main)/stats/+page.server.ts` (9)
  - [ ] `src/lib/shopify/sync.ts` (9)
  - [ ] `src/routes/(main)/api/print-modules/+server.ts` (8)
  - [ ] `src/routes/(main)/api/pi/status/+server.ts` (6)
  - [ ] `src/routes/(main)/api/pi/print/+server.ts` (4)
  - [ ] `src/lib/ai/context-builder.ts` (4)
  - [ ] `src/routes/(main)/inventory/+page.server.ts` (4)
  - [ ] `src/routes/(main)/settings/integrations/+page.server.ts` (4)
  - [ ] `src/routes/(main)/api/pi/webhook/+server.ts` (2)
  - [ ] `src/routes/(main)/api/pi/cancel/+server.ts` (2)
  - [ ] `src/routes/(main)/inventory/stock-count/+page.server.ts` (2)
  - [ ] `src/routes/(main)/inventory/b2b-sell/+page.server.ts` (2)
  - [ ] `src/routes/(main)/api/printer-models/+server.ts` (1)
  - [ ] `src/routes/(main)/api/pi/pause/+server.ts` (1)
  - [ ] `src/routes/(main)/api/pi/resume/+server.ts` (1)
- [ ] For the `inventory_sales_velocity` view — keep as raw SQL via `db.run(sql\`…\`)`. Drizzle can query views; defining them lives in a migration file, not `schema.ts`.
- [ ] Delete `schema.sql` once migration 0000 supersedes it (keep `seed.sql`)
- [ ] Smoke test every page and API route locally

**Done when:** `git grep "\.prepare("` returns zero hits in `src/`, app behaves identically.

---

## Phase 1 — Schema cleanup (still single-tenant)

**Goal:** fix the source-of-truth problems before they multiply across tenants.

### Schema changes

#### `printers`
- DROP `model TEXT` column (redundant with `printer_model_id`)
- MAKE `printer_model_id` NOT NULL
- Move `printer_ip`, `printer_serial`, `printer_access_code` → new `printer_credentials` table (so we can encrypt without touching the hot printer record). Sketch:
  ```
  printer_credentials(printer_id PK, ip, serial, access_code_encrypted, updated_at)
  ```

#### `print_modules`
- DROP `printer_model TEXT`
- CHANGE `inventory_slug TEXT FK` → `inventory_id INTEGER FK` (FK by id, not slug)
- DROP `image_path` if `thumbnail` covers it (confirm during implementation)

#### `inventory`
- DROP `total_added`, `total_sold`, `total_sold_b2c`, `total_sold_b2b`, `total_removed_manually`
- KEEP `stock_count` (operational state)
- KEEP `last_count_*` (manual count audit trail — not derivable)
- Update stats page to compute analytics from `inventory_log`

#### `spools`
- DROP `brand`, `material`, `color`, `cost` when `preset_id` is set (denorm of preset)
- KEEP them as nullable for ad-hoc spools without a preset
- OR: require `preset_id NOT NULL`, drop those columns entirely. **Decision needed** — leaning toward "require preset" for simplicity.
  - [ ] Decide: ad-hoc spools allowed or preset-required?

#### `shopify_sku_mapping`
- CHANGE `inventory_slug TEXT FK` → `inventory_id INTEGER FK`

#### `shopify_sync`
- Will become per-tenant in Phase 3. For now leave as-is.

#### Universal additions
- Add `created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)` to every table missing it
- Add `updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)` to mutable tables; update via app code (no SQLite trigger sugar without complexity)

### Tasks

- [ ] Write the new Drizzle schema in `src/lib/db/schema.ts`
- [ ] Generate migration `0001_schema_cleanup.sql`
- [ ] Update all query call sites to use new column names / FK columns
- [ ] Update inventory stats page to compute totals from `inventory_log`
- [ ] Update inventory-write paths to ensure `stock_count` stays correctly maintained alongside log inserts (transactional)
- [ ] Smoke-test full app

**Done when:** schema is normalized, no duplicate-truth columns, all queries pass through `inventory_id` not `inventory_slug`.

---

## Phase 2 — Auth tables + better-auth wiring (no domain changes)

**Goal:** add auth identity layer. Domain tables stay single-tenant in this phase.

### New tables (managed by better-auth + our additions)

Better-auth ships these (names may differ slightly per version — verify when implementing):
- `user(id, email, name, image, email_verified, created_at, updated_at)`
- `session(id, user_id, expires_at, token, ip, user_agent, created_at, updated_at)`
- `account(id, user_id, provider, ...)` — OAuth identities. **Note:** better-auth calls this `account`, which collides with *our* concept of a tenant account. Rename ours to `workspace` to avoid confusion, OR namespace better-auth's table. **Decision needed.**
  - [ ] Pick naming: `workspace` for tenants, or rename better-auth's `account` table
- `verification(id, identifier, value, expires_at)`

Our additions:
- `workspace(id, name, slug UNIQUE, owner_user_id FK user, created_at, updated_at)` — the tenant
- (Future) `workspace_members(workspace_id, user_id, role, created_at, PK(workspace_id, user_id))` — defer to post-MVP, single-user-per-account for now means `owner_user_id` is sufficient

### Tasks

- [ ] Install `better-auth` + D1 adapter
- [ ] Add tables to Drizzle schema, generate migration `0002_auth.sql`
- [ ] Set up `src/lib/auth.ts` with better-auth config (email/password to start; OAuth later)
- [ ] Create signup → auto-create workspace flow (one workspace per signup)
- [ ] Build login / signup / logout routes
- [ ] Create SvelteKit hook (`src/hooks.server.ts`) that resolves the current session and exposes `locals.user` + `locals.workspace`
- [ ] Add a route guard pattern for `(main)` routes that requires auth
- [ ] No domain tables touched yet — every existing route still works the same way

**Done when:** can sign up, log in, log out. Logged-in users land in the existing app. Unauthenticated users hit a login page.

---

## Phase 3 — Tenancy: add `workspace_id` to domain tables

**Goal:** every domain row belongs to exactly one workspace. Queries automatically scoped.

### Schema changes

Add `workspace_id INTEGER NOT NULL REFERENCES workspace(id)` to:
- `inventory`, `inventory_log`
- `spools`, `spool_presets`
- `printers`, `printer_credentials`
- `print_modules`, `module_spool_presets` (via module)
- `print_jobs`
- `grid_presets`
- `shopify_sku_mapping`, `shopify_sync`, `shopify_orders`
- `ai_recommendations`

Stays **global** (no `workspace_id`):
- `printer_models` (P1S, H2S, etc. — shared catalog)
- All better-auth tables

Constraint changes:
- `inventory.slug UNIQUE` → `UNIQUE(workspace_id, slug)`
- `inventory.sku UNIQUE` → `UNIQUE(workspace_id, sku)`
- Any other globally-unique business identifier → scope to workspace

Index additions:
- `idx_<table>_workspace` on every table with `workspace_id`

### Tenancy enforcement strategy

Two layers:

1. **Typed DB helper** — `getDb(platform).forWorkspace(workspaceId)` returns a proxy where queries auto-inject `where workspace_id = ?`. Implementation: thin wrapper around Drizzle that pre-binds the filter. Reduces forget-to-scope bugs.
2. **Convention + review** — direct Drizzle access available for joins/admin queries that intentionally cross workspaces.

Hook-level: `hooks.server.ts` reads `locals.workspace.id` and passes it into a request-scoped `event.locals.db`.

### Secrets encryption

- Add `printer_credentials.access_code_encrypted` (replace plaintext column)
- Add `workspace_integrations(workspace_id, type, config_encrypted, created_at, updated_at)` for Shopify tokens etc.
- Use a Worker secret (`ENCRYPTION_KEY`) + WebCrypto AES-GCM for envelope encryption
- Helper: `src/lib/crypto.ts` with `encrypt(plaintext)` / `decrypt(ciphertext)` using the KEK

### Tasks

- [ ] Generate migration `0003_tenancy.sql` adding `workspace_id` columns + indexes + unique constraint updates
- [ ] Build `forWorkspace()` DB helper
- [ ] Update `hooks.server.ts` to attach scoped db to `event.locals`
- [ ] Refactor every query site to use `locals.db` instead of `getDb(platform)` directly
- [ ] Add `src/lib/crypto.ts`; migrate `printer_access_code` and Shopify token to encrypted storage
- [ ] Add a dev-mode assertion that fails loud if a domain query is missing `workspace_id` (catch regressions)
- [ ] Smoke test: create two workspaces, verify zero data leak between them

**Done when:** two separately-signed-up users can use the app simultaneously with fully isolated data.

---

## Phase 4 — SaaS polish (out of scope for now, capture ideas here)

Backlog for later:
- Workspace invitations + `workspace_members` table
- Roles (owner / admin / operator)
- Stripe billing + subscription tiers
- Account deletion / GDPR data export
- Audit log table
- Rate limiting per workspace
- Email notifications (low stock, print failures)
- Magic link / OAuth providers via better-auth
- Admin / impersonation flow for support

---

## Working notes & log

Append entries as we go. Most recent on top.

### 2026-05-18 — Plan drafted
Schema reviewed (`schema.sql`, 278 lines). 159 `.prepare()` call sites across 18 files surveyed. Locked decisions D1–D6. Phase 0 is next session's first task — start with `src/lib/server.ts` since it's the biggest file and gating the rest.

---

## Quick reference

- Current schema: `schema.sql` (will be deleted at end of Phase 0)
- Future schema: `src/lib/db/schema.ts` (Drizzle, source of truth from Phase 0 onward)
- Migrations: `migrations/` (existing) → `drizzle/` (new, generated by drizzle-kit) — confirm directory during Phase 0
- Auth config: `src/lib/auth.ts` (Phase 2)
- DB request scope: `event.locals.db` (Phase 3)
