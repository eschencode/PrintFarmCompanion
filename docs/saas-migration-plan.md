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

## Phase 3 — Tenancy: `workspace_id` on every domain table

**Goal:** every domain row belongs to exactly one workspace; every query is scoped to
the caller's workspace. Two separately-signed-up users use the app with fully isolated data.

> **Rewritten 2026-06-30** to match the current schema and these confirmed decisions.
> The old "auto-inject `WHERE` proxy" idea is **dropped** — impossible against ~280
> raw `sql\`…\`` templates. Enforcement is explicit threading instead.

### Confirmed decisions (Linus, 2026-06-30)

1. **Denormalize `workspace_id` onto EVERY per-workspace table, including the
   "inherited" ones** (`printer_loaded_spools`, `printer_secrets`,
   `module_filament_slots`, `print_job_spools`, `printer_queued_jobs`). With ~280
   hand-written SQL queries the only safe, checkable rule is "every domain table has
   the column; every query filters it" — too easy to forget a parent join otherwise.
2. **Thread a `ctx: { db, workspaceId }` object, built in the hook**, not a bare param.
   `hooks.server.ts` sets `locals.ctx = { db: getDb(env.DB), workspaceId: workspace.id }`.
   Every domain server fn takes `ctx`; loaders/actions pass `locals.ctx`. Phase 4
   extends `ctx` with `userId`/`role` instead of re-refactoring 95 signatures.
3. **`workspace_id INTEGER NOT NULL` from the start** — no nullable/backfill compromise.
   Enabled by the fresh-DB dev workflow (below) + shipping schema and code per group.
4. **Incremental rollout, one table-group at a time, schema + code together.** Because
   the column is `NOT NULL` with no default, a table breaks all inserts the moment it
   has the column — so each group's migration only adds the column to tables whose
   queries the same step fixes. App stays runnable and testable at every step.

### Dev workflow change: fresh DB, no backfill

Develop Phase 3 against an **empty local D1**. `bun run db:reset` → sign up → everything
you create is already tagged with your workspace. No data-migration logic in the schema.
Existing real data is handled once, at production cutover (runbook at the end of this phase).

- [ ] **Pre-req:** fix `seed.sql` (currently stale → `db:reset` gives an empty DB). A
  minimal seed (catalog presets + one demo object) makes resets usable for dev.

### Table scope (current schema)

**Global — no `workspace_id`:** `user`, `session`, `account`, `verification`, `workspaces`.

**Hybrid catalog — `workspace_id` NULLable** (NULL = system row, set = user-defined),
unique constraints become `UNIQUE(COALESCE(workspace_id,0), …)`:
`printer_presets`, `plate_presets`.

**Per-workspace — `workspace_id INTEGER NOT NULL REFERENCES workspaces(id)`** (+ index
`idx_<table>_workspace`):
`spool_presets`, `categories`, `objects`, `spools`, `printers`, `printer_secrets`,
`printer_loaded_spools`, `print_modules`, `module_filament_slots`, `print_jobs`,
`print_job_spools`, `printer_queued_jobs`, `grid_presets`, `inventory_log`,
`shopify_settings`, `shopify_sku_mapping`, `shopify_orders`, `shopify_skus`, `print_queue`.

**Unique constraints to re-scope to the workspace:** `objects.name`, `objects.sku`,
`categories.name`, `shopify_skus` identity, `shopify_sku_mapping (shopify_sku, object_id)`,
`grid_presets.is_default` → partial unique `UNIQUE(workspace_id) WHERE is_default=1`,
catalog dedup on presets via `COALESCE(workspace_id,0)`.

### Step 0 — wiring (before any table is scoped) ✅ DONE 2026-07-01

- [x] `TenantContext = { db: AppDB; workspaceId: number }` + `requireCtx(locals)` in `src/lib/server/context.ts` (re-exported from `$lib/server`).
- [x] `hooks.server.ts` sets `locals.ctx` when a session resolves; typed in `app.d.ts`. Non-null wherever `locals.user` is.

### Group 1 — objects + inventory_log ✅ DONE 2026-07-01

- [x] Migration `0013_tenancy_objects.sql`: `workspace_id NOT NULL` on both; `objects.name` unique → `(workspace_id, name)`; workspace indexes.
- [x] `inventory_handler.ts`: all 16 fns take `ctx`, every query scoped.
- [x] Callers updated to pass `locals.ctx`: `api/objects`, `inventory/`, `inventory/b2b-sell`, `inventory/stock-count`, `modules`, `products`, `settings/integrations`, `stats`, dashboard `completePrint`.
- [x] Cross-group object writes scoped via threaded `workspaceId`: `completePrintJob` (jobs.ts), `assignObjectCategory` (categories.ts), `ShopifySyncService` (constructor now takes workspaceId; cron-sync resolves first workspace with a `TODO(group 7)`).
- [x] In-loader helper queries scoped (getSetDefinitions/getUnitWeights/getSalesWindows + stats velocity/stockflow raw SQL).
- [x] **Leak test passed:** two workspaces, each sees only its own objects; same object name allowed in both; all inventory/stats/products/modules pages render 200. svelte-check clean.
- [ ] **DEFERRED to their groups (no visible leak on single-workspace dev; annotate-by-unique-id):** `AIContextBuilder` primary reads of objects/inventory_log (6 call sites) → group 6 (queue) / recommendation; `LEFT JOIN objects` module-name reads in `modules.ts`/`printQueue.ts`/`api/print-modules` → group 4 (modules get workspace_id, join self-scopes); `shopify_sku_mapping` reads → group 7.

**Remaining groups (2–9): not started.**

### Step N — per table-group (repeat for each group, in this order)

Order = low→high blast radius:
1. `objects` + `inventory_log`
2. `spool_presets` + `spools`
3. `printers` + `printer_secrets` + `printer_loaded_spools`
4. `print_modules` + `module_filament_slots`
5. `print_jobs` + `print_job_spools`
6. `print_queue` + `printer_queued_jobs`
7. `shopify_settings` + `shopify_sku_mapping` + `shopify_orders` + `shopify_skus`
8. `grid_presets` + `categories`
9. catalog (`printer_presets`, `plate_presets`) — nullable workspace_id + COALESCE unique

For each group:
- [ ] Hand-write migration `00NN_tenancy_<group>.sql`: add `workspace_id` (+ index, +
  re-scoped unique constraints for that group's tables). NOT NULL for per-workspace tables.
- [ ] Update that group's server fns to take `ctx` and add `AND workspace_id = ?` to every
  SELECT/UPDATE/DELETE and set `workspace_id` on every INSERT.
- [ ] Update call sites (loaders, actions, API routes) to pass `locals.ctx`.
- [ ] `bun run db:reset` + smoke-test the affected pages.
- [ ] **Leak test** for the group: two workspaces seeded, assert each list/detail query
  returns only its own rows (see "Leak test" below).

### External paths (no session → resolve workspace from data)

- [ ] **`/api/pi/webhook`** — no user. Resolve workspace from the printer: look up
  `printers.workspace_id` by serial, build `ctx` from that, then scope writes.
- [ ] **`/api/cron-sync`** — iterate **all** workspaces' `shopify_settings` and sync each
  (today a single `id=1` row). Per-workspace `ctx` inside the loop.

### Secrets encryption (finish what was started early)

The crypto helper (`src/lib/server/crypto.ts`, AES-256-GCM) and Shopify-token-at-rest
encryption already shipped (2026-06-03). Remaining:
- [ ] Encrypt `printer_secrets.access_code` (store ciphertext, decrypt on use).
- [ ] Move Shopify creds from the single shared `shopify_settings` row (`id=1`) to
  per-workspace rows (`shopify_settings.workspace_id`, upsert keyed on workspace).
  Code sites tagged `MULTI-USER (Phase 3)`: `schema.ts`, `server/shopifyConfig.ts`,
  `settings/integrations/+page.server.ts`.

### Leak test (the real safety net, replaces the dropped dev-assertion)

- [ ] Integration test (or scripted curl run): sign up workspace A and B, create
  overlapping data in each, then assert every list endpoint/loader returns only the
  caller's rows and no detail route resolves another workspace's id. Run after each group.

### Production cutover runbook (one-time, at the end of Phase 3)

Existing real remote data has no `workspace_id`. Don't backfill in-schema — copy it in
after the fact:

1. **Back up** current prod: `wrangler d1 export DB --remote --output prod-backup.sql`.
2. **Rebuild prod fresh** on the Phase 3 schema (apply all migrations to an empty remote DB).
3. **Sign up in prod** → your workspace gets id `1` (fresh DB, predictable).
4. **Transform** `prod-backup.sql` → keep only your domain `INSERT`s, drop old schema/auth
   rows, inject `workspace_id = 1` into each. (Write a small sed/python script then.)
   Keep original integer PKs so FKs line up; order inserts by FK dependency (D1 does NOT
   persist `PRAGMA foreign_keys=OFF` across statements — see migration 0003 lesson).
5. **Import**: `wrangler d1 execute DB --remote --file prod-data-tenanted.sql`.
6. Spot-check: counts match the backup, dashboard renders your printers/objects/jobs.

**Done when:** two separately-signed-up users use the app simultaneously with fully
isolated data, all groups pass the leak test, secrets encrypted, prod data copied in.

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

### 2026-06-30 — Phase 2 kicked off (multi-user work resumes)

State check on `main`: Phases 0–1 done, migrations through `0011`. No `hooks.server.ts`,
no `src/lib/auth.ts`, no auth dep — Phase 2 fully unstarted.

**Decisions confirmed (Linus):**
- D2 stands — **better-auth** (`better-auth@1.6.23` installed via bun).
- Signup model — **open email+password signup → auto-create one workspace per user**. OAuth later.
- Existing data — **backfill all current rows into a default workspace** in Phase 3 (NOT wipe; supersedes D5). He has real Shopify data to keep.

**Verified wiring for our stack (Workers + D1 + Drizzle):**
- **Per-request auth instance, no module-level singleton.** D1 binding only exists per-request
  via `platform.env.DB`, so `src/lib/auth.ts` is a `createAuth(d1)` factory, not an exported `auth`.
- Pass `ctx.waitUntil` so better-auth's post-response background tasks (session writes, token
  cleanup) complete before the Worker exits — otherwise "Network connection lost".
- Use the **Drizzle adapter** (`drizzleAdapter(getDb(d1), { provider: 'sqlite', schema })`) so
  `schema.ts` stays the single source of truth; auth tables generated into our schema + a drizzle migration.
- Import paths (1.6.23): `better-auth/adapters/drizzle` → `drizzleAdapter`;
  `better-auth/svelte-kit` → `sveltekitCookies(getRequestEvent)`, `svelteKitHandler`;
  `better-auth/svelte` → `createAuthClient`.
- `svelteKitHandler({ event, resolve, auth, building })` mounts the API catch-all automatically — no manual `/api/auth/[...all]` route needed.

**Phase 2 checklist (one step at a time):**
1. [x] Install better-auth + verify current Drizzle/D1/SvelteKit wiring.
2. [x] Add auth tables (`user`, `session`, `account`, `verification`) + `workspaces` to `schema.ts`; migration `0012_auth.sql` applied locally. NOTE: migrations are **hand-written** here (drizzle-kit `_journal.json` stale at 0001; `generate` prompts interactively and is unused) — write SQL by hand, apply via `db:migrate:local`.
3. [x] `src/lib/auth.ts` — `createAuth(d1, {secret, baseURL})` factory, email+password, drizzle adapter, sveltekitCookies plugin. `auth-client.ts` (browser). `BETTER_AUTH_SECRET` in `.dev.vars` + `Platform.env`. Runtime-untested until signup exists (step 5/6).
4. [x] `createWorkspaceForUser()` helper (`server/workspaces.ts`). Name = optional form `requestedName` else "<name> Printfarm" (fallback email local-part); slug = slugify+random, retried on collision. Wired into signup action in step 5.
5. [x] `(auth)/login` + `(auth)/signup` form actions, `POST /logout` endpoint, `getAuth(platform)` helper. Runtime-tested: signup creates user+account+session+workspace, dup-email/wrong-pw error paths, logout clears cookies. Signup uses optional `workspaceName` field → `createWorkspaceForUser`. (Test user `linus@test.dev` left in local D1.)
6. [x] `src/hooks.server.ts` — per-request `getAuth` → `getSession` → populate `locals.user/session/workspace` (+ `getWorkspaceForUser` helper), then `svelteKitHandler` mounts `/api/auth/*`. `App.Locals` typed via `Auth['$Infer']['Session']`. Runtime-verified: get-session returns user, app still renders, unauthed still 200 (guard is step 7).
7. [x] **Guard in `hooks.server.ts`** (single choke point, pages + API). Unauth page → `303 /login?redirectTo=`; unauth `/api/*` → `401 json`. Authed user on `/login`/`/signup` → `303 /`. Public allowlist: pages `/login /signup /landing`; API `/api/cron-sync`, `/api/pi/webhook` (own incoming secrets); `/api/auth/*` bypasses via null `route.id`. Login action honors same-site `redirectTo`. **Logout UI:** button in dashboard header + new `/settings/account` page (login/workspace info + logout) + Account card in settings grid. Runtime-verified all paths.

**✅ PHASE 2 COMPLETE (2026-06-30).** App is now gated — no unauthenticated access except the public allowlist. Domain data is still shared across users (single-tenant) — that's Phase 3.

**Before remote deploy:** (a) `wrangler secret put BETTER_AUTH_SECRET` on the remote Worker; (b) `bun run db:migrate:remote` to apply `0012_auth.sql`; (c) optionally set `BETTER_AUTH_URL` to the deploy origin. Local test user `linus@test.dev` / `supersecret123` exists in local D1 only.

### Phase 3 entry notes (next session)
- Backfill (not wipe): create a default workspace row, set `workspace_id = <that id>` on all existing domain rows in the same migration that adds the column.
- `getWorkspaceForUser` already resolves `locals.workspace`; Phase 3 builds `forWorkspace(id)` and threads `locals.workspace.id` into queries.
- Reminder from `MULTI-USER (Phase 3)` code markers: `shopify_settings` single-row (`id=1`) → per-workspace; encrypt `printer_secrets.access_code`.

### 2026-06-03 — ⚠️ PUBLIC DEPLOY GATE (read before exposing this app)

The app has **no authentication** (no `hooks.server.ts`, no `(main)` route guard).
Every settings route + form action is open to anyone who can reach the URL.

**Do not put this on an open public URL with a real Shopify token until either:**
- **Cloudflare Access (Zero Trust)** sits in front of the Pages project (fast path —
  gates the whole app behind a login, free ≤50 users), **or**
- **Phase 2 auth** (better-auth + route guard) lands.

Why it matters even though the token is encrypted at rest: the app *decrypts and
uses* the token. Without auth, an attacker could previously set the store domain to
a host they control, leave the token blank (reusing the stored one), trigger a sync,
and have the Worker POST the decrypted token to them in the `X-Shopify-Access-Token`
header. **Mitigated** now by strict `*.myshopify.com` domain validation
(`normalizeShopifyDomain` in `src/lib/shopify/client.ts`, enforced in the client
constructor + `saveShopifyConfig`), which closes the exfiltration path — but auth is
still required to stop overwrite/vandalism of the integration. Encryption protects
data at rest; it is not a substitute for auth.

### 2026-06-03 — Shopify integration + secret encryption pulled forward

DB-backed Shopify credentials added (with env fallback) to fix broken cron/manual
sync, plus a settings UI to save them. Reviewed for multi-user + security before
touching real credentials. Changes made:

- **Encryption now (ahead of Phase 3):** `src/lib/server/crypto.ts` (AES-256-GCM,
  WebCrypto, key = SHA-256 of `ENCRYPTION_KEY` Worker secret). `shopify_settings.access_token`
  stores `v1:<iv>:<ciphertext>`. `saveShopifyConfig` encrypts on write and **fails
  if `ENCRYPTION_KEY` is unset** (won't silently store plaintext). `getShopifyConfig`
  decrypts on read; legacy unprefixed values pass through. Page `load()` swallows
  decryption errors so a bad/missing key can't lock you out of the settings page.
- **cron-sync hardened:** rejects when `CRON_SECRET` is unset (closed the
  `Bearer undefined` bypass) and uses a constant-time compare.
- **`ENCRYPTION_KEY` + `CRON_SECRET`** documented in `.dev.vars.example`.

**Still open — the real multi-user blockers (not done):**

1. **No auth layer at all.** No `hooks.server.ts`, no `(main)` route guard. Every
   settings route + form action is unauthenticated — anyone reaching the URL can
   overwrite the token, trigger syncs, edit SKU mappings. This is Phase 2 work and
   is the hard gate before multi-user. Search marker: grep `MULTI-USER (Phase 3)`.
2. **`shopify_settings` is a single shared row (`id=1`).** Once >1 user exists they
   share one Shopify credential, and the "leave token blank to keep" path would
   reuse another tenant's token. Needs `workspace_id` + per-workspace upsert. Code
   sites tagged with `MULTI-USER (Phase 3)` comments:
   - `src/lib/db/schema.ts` — `shopifySettings` table
   - `src/lib/server/shopifyConfig.ts` — `getShopifyConfig` / `getShopifyConfigSummary` queries
   - `src/routes/(main)/settings/integrations/+page.server.ts` — `saveShopifyConfig` upsert
3. DB config silently overrides env creds — fine once auth gates writes; revisit then.

### 2026-05-18 — Plan drafted
Schema reviewed (`schema.sql`, 278 lines). 159 `.prepare()` call sites across 18 files surveyed. Locked decisions D1–D6. Phase 0 is next session's first task — start with `src/lib/server.ts` since it's the biggest file and gating the rest.

---

## Quick reference

- Current schema: `schema.sql` (will be deleted at end of Phase 0)
- Future schema: `src/lib/db/schema.ts` (Drizzle, source of truth from Phase 0 onward)
- Migrations: `migrations/` (existing) → `drizzle/` (new, generated by drizzle-kit) — confirm directory during Phase 0
- Auth config: `src/lib/auth.ts` (Phase 2)
- DB request scope: `event.locals.db` (Phase 3)

FOR LATER make module page multicolor /ams also in gcode parsing 
my testing report 

settings printers:
adding printer preset works 
adding printers works 
need to add a way to switch aktive and inactive stage for printers 

settings materials:
works

dashboard settings:
dont like the ui way to set each place to printer or other thing by like clicking thrugh not intuitive and confusing
but works
maybe for later i should make it so new printers automatically get added to the dashboard on creation as a option that i set true by default

coneections and intigration  i will test later

modules:
spool selection should show the color and name of the spool for the dropdown
local filehandeler path we should switch to filename and under there put the external path but not as changable 
keep the plate passing but add a code where we try to match it to the pressets and if not possible like a easy way to add as a new preset
printer selection should be dropdown of printerpresets 
inventory should be object and a easy way idk dropdown or somehow like searchable idk easy way to match to the objects more by selecting then typin the exect name but we have to keep in mind that there will be many objects 
and the upload fails for now we have to check why maybe because no conection to pi but that should be ok just use local if no pi conection and a way/button to later upload a module to pi/external with a ui way of showing wether a file is uploaded locally or externally

missing/need to add a ui way to add plate presets
