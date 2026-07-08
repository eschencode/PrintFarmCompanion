# Authentication & Multi-User (Phase 2)

Reference for the auth layer added in Phase 2 of the SaaS migration. Covers
architecture, every file involved, the request lifecycle, configuration,
deployment, and the seams left open for Phase 3 (tenant data isolation).

> **Status:** Phase 2 complete (2026-06-30). The app is gated — unauthenticated
> visitors hit a login wall. **Domain data is still shared across users**
> (single-tenant). Per-workspace isolation is Phase 3. See
> `docs/saas-migration-plan.md` for the phase roadmap.

---

## TL;DR

- Library: **better-auth** (`better-auth@1.6.x`), email + password.
- **Per-request auth instance**, never a module-level singleton — the D1 binding
  only exists per request on Cloudflare Workers.
- Identity tables (`user`, `session`, `account`, `verification`) live in our own
  Drizzle `schema.ts`; better-auth talks to them through the Drizzle adapter.
- A **`workspaces`** table is the tenant container. Signup auto-creates one
  workspace per user (one user per workspace for now).
- `hooks.server.ts` resolves the session into `locals.user / session / workspace`
  and enforces a **central route guard**.
- Logout is a `POST /logout` endpoint; UI entry points on the dashboard header
  and the new `/settings/account` page.

---

## Why a per-request factory (the core constraint)

better-auth's docs show a module-level singleton:

```ts
// ❌ Does NOT work on Cloudflare Workers
export const auth = betterAuth({ database: drizzleAdapter(db, …) });
```

That assumes a global `db`. On Workers there is no global DB — the D1 binding is
handed to you per request via `event.platform.env.DB`. So we expose a **factory**
and build the instance inside the request:

```ts
// src/lib/auth.ts
export function createAuth(d1, { secret, baseURL }) { … }   // builds a fresh instance
export function getAuth(platform) { … }                     // pulls d1 + secret off platform.env
```

`getAuth(event.platform)` is called once per request inside `hooks.server.ts`
(and inside the auth form actions / logout endpoint). It throws loudly if the DB
binding or `BETTER_AUTH_SECRET` is missing — misconfiguration should fail fast,
not silently run without auth.

---

## File map

| File | Role |
|---|---|
| `src/lib/auth.ts` | `createAuth(d1, opts)` factory + `getAuth(platform)` helper. better-auth config (drizzle adapter, email/password, `sveltekitCookies` plugin). |
| `src/lib/auth-client.ts` | Browser client (`createAuthClient`). Currently unused by the server-action flow, available for client-side calls (`authClient.useSession()`, etc.). |
| `src/lib/db/schema.ts` | Drizzle definitions for `user`, `session`, `account`, `verification`, `workspaces`. |
| `drizzle/0012_auth.sql` | Hand-written migration creating the five tables + indexes. |
| `src/lib/server/workspaces.ts` | `createWorkspaceForUser`, `getWorkspaceForUser`, `slugify`. Re-exported from `src/lib/server.ts`. |
| `src/hooks.server.ts` | Per-request session resolution → `locals`, route guard, mounts better-auth API routes. |
| `src/app.d.ts` | `App.Locals` types (`user/session/workspace`) + `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` on `Platform.env`. |
| `src/routes/(auth)/login/` | Login page + form action. Honors `?redirectTo=`. |
| `src/routes/(auth)/signup/` | Signup page + form action. Auto-creates the workspace. |
| `src/routes/logout/+server.ts` | `POST /logout` — clears the session, redirects to `/login`. |
| `src/routes/(main)/settings/account/` | Account page: login + workspace info, logout button. |
| `src/routes/(main)/+page.svelte` | Dashboard — logout button added to the header. |
| `src/routes/(main)/settings/+page.svelte` | Settings grid — Account card added. |

---

## Database schema

All five tables are defined in `src/lib/db/schema.ts` and created by
`drizzle/0012_auth.sql`. The four auth tables mirror **better-auth's canonical
1.6.x schema exactly** — the Drizzle property keys (camelCase) are the field
names the adapter resolves by, so **do not rename them**. SQL column names are
snake_case per our convention.

```
user           id(text,pk) name email(unique) email_verified(bool)
               image created_at updated_at
session        id(text,pk) expires_at token(unique) ip_address user_agent
               user_id→user.id(cascade) created_at updated_at
account        id(text,pk) account_id provider_id user_id→user.id(cascade)
               access_token refresh_token id_token access_token_expires_at
               refresh_token_expires_at scope password created_at updated_at
verification   id(text,pk) identifier value expires_at created_at updated_at
workspaces     id(int,pk,autoinc) name slug(unique)
               owner_user_id→user.id(cascade) created_at updated_at
```

Notes:
- **Auth table IDs are `text`** — better-auth generates them. This differs from
  our domain tables (integer autoincrement). `workspaces.id` is **integer** on
  purpose, because Phase 3 adds `workspace_id INTEGER REFERENCES workspaces.id`
  to the domain tables and they expect integer FKs.
- For email+password, the **password hash lives in `account.password`** (provider
  `credential`), not on `user`. Verified: signup stores a hash, never plaintext.
- `email_verified` / timestamps are stored as `integer` (`mode: 'boolean'` /
  `mode: 'timestamp'`, Unix seconds) to match the rest of the schema.

### Migration workflow ⚠️

Migrations in this project are **hand-written SQL**, not `drizzle-kit generate`d.
`drizzle/meta/_journal.json` only tracks `0000`/`0001` while migration files run
through `0012+`, so `generate` produces a huge spurious diff and prompts
interactively. Edit `schema.ts` (source of truth for types), then hand-write the
matching `drizzle/NNNN_name.sql`, then:

```bash
bun run db:migrate:local     # apply to local D1
bun run db:migrate:remote    # apply to remote D1 (do before remote deploy)
```

---

## Request lifecycle (`hooks.server.ts`)

Every request flows through `handle`:

1. **Build skip:** during `building` (prerender/build) there's no DB — set
   `locals` to nulls and pass through.
2. **`getAuth(event.platform)`** — per-request instance.
3. **`auth.api.getSession({ headers })`** — reads the session cookie, hits the DB.
   - If a session exists: populate `locals.user`, `locals.session`, and
     `locals.workspace` (via `getWorkspaceForUser(db, user.id)`).
   - Else: all three are `null`.
4. **Route guard** (see below).
5. **`svelteKitHandler({ event, resolve, auth, building })`** — mounts
   better-auth's `/api/auth/*` endpoints and resolves everything else.

`locals.user / session / workspace` are then available in every `load`, form
action, and endpoint downstream.

> **Note:** `getSession` hits the DB on every request. better-auth supports a
> cookie cache to avoid this; not enabled yet. Add it if request latency matters.

---

## Route guard

Centralized in `hooks.server.ts` — one choke point covering both pages and API,
rather than per-route guards. Logic:

- **Authed user on `/login` or `/signup`** → `303` to `/`.
- **Unauthenticated + a real route (`event.route.id` is non-null) + not public:**
  - path starts with `/api/` → **`401 {"error":"Unauthorized"}`**
  - otherwise → **`303 /login?redirectTo=<path>`**

### Public allowlist

```
Pages:  /login   /signup   /landing
API:    /api/cron-sync       (verifies its own  Authorization: Bearer CRON_SECRET)
        /api/pi/webhook      (verifies its own  x-webhook-secret)
```

`/api/auth/*` is **not** in the allowlist and doesn't need to be: those routes
have no SvelteKit route file (better-auth handles them via `svelteKitHandler`),
so `event.route.id` is `null` and the guard skips them.

### Why only those two API routes are public

An audit of the 15 `(main)/api/*` endpoints found only two that verify an
*incoming* shared secret and are called by external systems (cron + the Pi
webhook). The rest are browser-triggered and must require a session. The Pi
control endpoints (`/api/pi/status`, `/print`, `/control`, …) forward a secret
**outbound** to the Pi but do not authenticate the inbound caller — so they sit
behind the session guard like any other app API.

> If you later discover the Pi calls an app endpoint directly (e.g.
> `/api/printer/[id]/finished`), add its path to `PUBLIC_API_PREFIXES` in
> `hooks.server.ts` and give it its own incoming-secret check.

### Open-redirect safety

The login action only honors `redirectTo` when it starts with `/` (same-site
relative path), so the guard's `?redirectTo=` can't be abused to bounce users to
an external origin.

---

## Auth flows

### Signup (`(auth)/signup`)

Server form action (`+page.server.ts`):

1. Read `name`, `email`, `password`, `workspaceName` (optional) from the form.
2. Validate: email + password required, password ≥ 8 chars.
3. `finalName = name || email.split('@')[0]` (better-auth requires a name).
4. `auth.api.signUpEmail({ body: { email, password, name: finalName }, headers })`
   — creates the `user` + `account` (hashed password) + `session`, and sets the
   session cookie via the `sveltekitCookies` plugin.
5. `createWorkspaceForUser(...)` — creates the workspace. If this fails after the
   user was created, the action returns a 500 (the user exists but has no
   workspace — a broken state we surface rather than swallow).
6. `redirect(303, '/')`.

**Workspace naming:** `requestedName` (the optional company-name field) if
provided, else `"<finalName> Printfarm"`. Slug = `slugify(name) + '-' + random`,
retried on the (astronomically unlikely) unique collision. Example: user "Linus",
no company name → workspace **"Linus Printfarm"**, slug `linus-printfarm-161lj`.

### Login (`(auth)/login`)

1. Validate email + password present.
2. `auth.api.signInEmail({ body, headers })`. On failure, return a generic
   "Invalid email or password." (don't leak which field was wrong).
3. Redirect to `redirectTo` (if same-site) else `/`.

### Logout (`POST /logout`)

`auth.api.signOut({ headers })` then `redirect(303, '/login')`. Clears
`better-auth.session_token` (+ cache cookies). Invoked by:
- the dashboard header button, and
- the `/settings/account` page button —
both plain `<form method="POST" action="/logout">` (works without JS).

---

## Configuration & secrets

| Var | Where | Purpose |
|---|---|---|
| `BETTER_AUTH_SECRET` | `.dev.vars` (local), `wrangler secret put` (remote) | Signs sessions. **Required** — `getAuth` throws if unset. Generate: `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | optional, `Platform.env` | Explicit base URL. Left unset → better-auth infers origin from the request via the cookies plugin. Set once there's a stable deploy URL. |
| `DB` | `wrangler.jsonc` binding | The D1 database (binding name `DB`). |

Local dev (`bun run dev`) loads `.dev.vars` and binds the local D1 automatically
through `@sveltejs/adapter-cloudflare`'s platform proxy.

---

## Deploying to remote

Phase 2 was built and tested against **local D1 only**. Before exposing remotely:

```bash
# 1. Set the signing secret on the remote Worker (never commit it)
wrangler secret put BETTER_AUTH_SECRET

# 2. Apply the auth migration to remote D1
bun run db:migrate:remote          # applies 0012_auth.sql

# 3. (optional) pin the base URL
#    set BETTER_AUTH_URL to the deploy origin if inference misbehaves
```

Until these are done, remote signups/logins will fail (missing secret / missing
tables).

---

## Testing locally

A test account exists in **local D1 only**: `linus@test.dev` / `supersecret123`
(workspace "Linus Printfarm").

Verified behaviors (curl against `bun run dev`):

| Request | Expected |
|---|---|
| `POST /signup` (new email) | user + account(hashed) + session + workspace; `303 /` |
| `POST /signup` (existing email) | `400` "User already exists" |
| `POST /login` (correct) | `303 /` + session cookie |
| `POST /login` (wrong) | `400` "Invalid email or password." |
| `POST /logout` | `303 /login`, cookies cleared |
| `GET /` unauth | `303 /login?redirectTo=%2F` |
| `GET /settings` unauth | `303 /login?redirectTo=%2Fsettings` |
| `GET /api/objects` unauth | `401 {"error":"Unauthorized"}` |
| `GET /api/pi/webhook` unauth | reaches endpoint (allowlisted) |
| `GET /login` (authed) | `303 /` |
| `GET /` / `/settings/account` (authed) | `200` |

Form actions enforce SvelteKit's origin check — when testing with curl include
`-H "Origin: http://localhost:<port>"`.

---

## Using auth in app code

```ts
// In any +page.server.ts load or form action / +server.ts endpoint:
export const load = async ({ locals }) => {
  // The guard guarantees locals.user is non-null on protected routes.
  const user = locals.user;          // { id, name, email, ... } | null
  const workspace = locals.workspace; // { id, name, slug } | null
  …
};
```

`locals` types live in `src/app.d.ts` (`App.Locals`), with the user/session
shapes inferred from better-auth via `Auth['$Infer']['Session']`.

---

## What is intentionally NOT here (yet)

- **Tenant data isolation** — domain rows have no `workspace_id` yet, so all
  users currently see the same data. **Phase 3.**
- **OAuth / social login, email verification, password reset** — email+password
  only. better-auth supports these; add as needed.
- **Workspace members / roles** — one user per workspace. Memberships are Phase 4.
- **Cookie-cache for sessions** — every request hits the DB for `getSession`.

---

## Phase 3 hooks (where this connects next)

- `locals.workspace` is already populated per request — Phase 3 threads
  `locals.workspace.id` into a `forWorkspace(id)` scoped DB helper.
- **Backfill, not wipe** (decided 2026-06-30): the migration that adds
  `workspace_id` should create a default workspace and set every existing domain
  row to it, in the same migration.
- Code already tagged `MULTI-USER (Phase 3)`: `shopify_settings` is a single
  shared row (`id=1`) that must become per-workspace; `printer_secrets.access_code`
  still needs encryption.

See `docs/saas-migration-plan.md` → Phase 3 for the full task list.
