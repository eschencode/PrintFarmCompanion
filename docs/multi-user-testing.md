# Multi-User Testing Checklist

Manual QA for the auth + tenancy work (Phase 2 + Phase 3). Reseed anytime with
`bun run db:seed:test` — 3 users, password `password123`:
`alice@test.dev`, `bob@test.dev`, `carol@test.dev`.

**How to test isolation:** log in as Alice in one browser, Bob in another (or a
private window). Each should only ever see their own data for the ✅ areas below.

> ⚠️ **What is NOT isolated yet** (Groups 4–9 pending) — do **not** report these as
> bugs. Both users currently SHARE: **print modules**, **print history / jobs**,
> **the print queue + AI recommendations**, **Shopify settings/SKUs/orders**,
> **printer models (presets)**, **build-plate presets**, **dashboard grid layouts**,
> **object categories**. These get scoped in later groups.

---

## 1. Authentication (Phase 2)

- [ ] Sign up a brand-new account → lands logged in on the dashboard.
- [ ] New signup auto-creates a workspace named "<name> Printfarm" (or your custom
      name if you filled the optional field). Check `/settings/account`.
- [ ] Sign up with an email that already exists → clear "user already exists" error.
- [ ] Sign up with a <8-char password → rejected.
- [ ] Log out (dashboard header button) → sent to `/login`, session cleared.
- [ ] Log out via `/settings/account` → same.
- [ ] Log in with correct password → dashboard.
- [ ] Log in with wrong password → "Invalid email or password" (no detail leak).
- [ ] While logged out, visit `/`, `/inventory`, `/settings` → redirected to
      `/login?redirectTo=…`, and after login you land back on that page.
- [ ] While logged out, visit `/landing` → loads (public).
- [ ] While logged in, visit `/login` or `/signup` → bounced to `/`.
- [ ] Hit a protected API logged out, e.g. `/api/objects` → 401 JSON.

## 2. Tenant isolation (the core of multi-user) ✅

With Alice + Bob logged in separately, confirm each sees ONLY their own:

- [ ] **Inventory / objects** (`/inventory`, `/products`) — counts, names, stock.
- [ ] **Inventory history / activity log** (`/inventory` log, `/stats` inventory
      charts) — only your own printed/sold entries.
- [ ] **Filament library / spool presets** (`/settings/materials`, `/spools`).
- [ ] **Physical spools** (`/spools`, stats "spools" tab).
- [ ] **Printers** (dashboard, `/settings/printers`, `/settings/connections`).
- [ ] **Printer credentials** — IP/serial/access code on `/settings/printers`.
- [ ] Same product name (e.g. "Wall Hook") exists in BOTH workspaces independently
      — editing Alice's doesn't touch Bob's.

### Cross-workspace access attempts (should all fail)
- [ ] As Alice, note one of Bob's printer IDs (from Bob's session), then try to
      start/pause/cancel it via the dashboard while logged in as Alice — the API
      (`/api/pi/print`, `/api/pi/control`) should return "Printer not found".
- [ ] As Alice, poll `/api/pi/status?serial=<Bob's printer serial>` → should not
      return Bob's credentials.
- [ ] Editing/deleting an object or spool by an id that belongs to Bob (via a
      crafted request) → no effect on Bob's data.

## 3. Inventory features (per workspace) ✅

- [ ] Create a new object; duplicate name in the SAME workspace → rejected.
- [ ] Edit an object (name, min threshold, category).
- [ ] Delete an object with no history; delete one WITH history → blocked with the
      "has inventory history" message.
- [ ] Add stock / remove stock → `in_stock` changes + a log entry appears.
- [ ] Record a B2C sale and a B2B sale → stock drops, log entries created.
- [ ] Manual stock count (`/inventory/stock-count`) → adjusts to the counted
      number, records the discrepancy.
- [ ] B2B bulk sell (`/inventory/b2b-sell`), bulk add, add-by-weight, add-sets.
- [ ] Low-stock / out-of-stock items are flagged (seed has "Phone Stand" low,
      "Cable Clip" at 0).
- [ ] Categories: create, rename, delete, assign to an object. *(Note: categories
      are still shared across workspaces — Group 8.)*

## 4. Spool / filament features (per workspace) ✅

- [ ] Add a spool preset (`/settings/materials`); edit; delete.
- [ ] Delete a preset that's referenced by a module → blocked message.
- [ ] `/spools`: adjust storage count (+ / − / set absolute).
- [ ] Create a preset with initial storage stock.
- [ ] Load a spool onto a printer slot from the dashboard → `in_storage`
      decrements, slot shows the spool.
- [ ] Load an already-open spool into a slot; unload a slot.
- [ ] Loading a spool that's on another slot auto-unloads it from the old slot.
- [ ] Adjust a loaded spool's remaining weight from the dashboard.
- [ ] Edit / delete a spool from the stats "spools" tab; deleting a loaded spool
      is blocked with "currently loaded on <printer>".

## 5. Printer features (per workspace) ✅

- [ ] Add a printer (with model, slot count, IP/serial/access code).
- [ ] Edit a printer; change slot count up (adds empty slots) and down (blocked if
      a to-be-removed slot still has a spool loaded).
- [ ] Delete a printer (blocked while it has an active print).
- [ ] Set a printer active/inactive.
- [ ] Change transport mode (auto / direct / pi) on `/settings/printers` or via the
      printer detail modal.
- [ ] Dashboard shows each printer's loaded spools + status.

## 6. Print flow (per workspace, shared history for now) ✅ start/⚠️ history

- [ ] Start a print from the dashboard (manual mode is easiest without a real Pi)
      → a `printing` job appears on that printer.
- [ ] Complete a print as **successful** → object `in_stock` increases by the
      module's objects-per-print, an inventory "+ printed" log is added, loaded
      spool weight is deducted.
- [ ] Complete a print as **failed** → no inventory added, failure reason recorded.
- [ ] Confirm an externally-started print (the "adopt this print?" prompt).
- [ ] *(Note: the stats/print-history and the print queue currently show data
      across all workspaces — Groups 5 & 6.)*

## 7. Pages load & don't error ✅

Log in and open each; check the browser console + server log for errors:
- [ ] `/` (dashboard) · `/inventory` · `/products` · `/spools` · `/stats`
      · `/modules` · `/logs` · `/settings` and each settings subpage.

## 8. Deploy / infra sanity

- [ ] Preview build succeeds on Cloudflare (Bun, no `package-lock.json`).
- [ ] Preview URL uses the **staging** DB (fresh); production untouched.
- [ ] Sign up on the preview URL works (BETTER_AUTH_SECRET set for Preview env).
