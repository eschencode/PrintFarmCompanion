# Shopify Sync — go-live checklist

What to do tomorrow to finish wiring up the Shopify order sync. Code is done (on
branch `fixweight`); this is deploy + Cloudflare/GitHub config + verification.

Background on the bugs this fixes: `docs/saas-migration-plan.md` (2026-06-03/04 log).

---

## 1. Deploy

Deploy the `fixweight` branch to Cloudflare Pages. This is the build that contains
the real fixes (the `isOrderProcessed` bug, the `MAX(order_id)` high-water-mark,
batched baseline). Earlier deploys did **not** have them.

## 2. Cloudflare Pages env (Production)

Set these as **secrets** (Settings → Environment variables → Encrypt), then redeploy
so they bind:

- `ENCRYPTION_KEY` — `openssl rand -base64 32`. Encrypts the Shopify token at rest.
  ⚠️ Never change it once a token is saved, or the saved token can't be decrypted.
- `CRON_SECRET` — `openssl rand -base64 32`. The `/api/cron-sync` endpoint returns
  500 if this is unset.

## 3. Baseline the order history (once)

Goal: mark all existing orders as already-synced **without deducting**, so current
stock isn't reduced by past sales. Only orders placed after the baseline will deduct.

1. On `/settings/integrations`, click **"Mark current orders as synced"**.
2. Read the result message: `Newest order recorded: #XXXX`.
3. **Verify #XXXX matches your most recent order in Shopify admin.** This is the
   safety check — the sync only ever fetches orders *newer* than this, so if the max
   equals your latest order, no historical order can be wrongly deducted.
   - If it does NOT match (max is older than your latest), tell Claude — don't run a
     sync yet.

## 4. Verify a real deduction

Place one test order in Shopify with a mapped SKU (or wait for a real one), then click
**Sync now**. Expect `processed 1 · deducted N`, and the object's stock to drop.

## 5. Cloudflare Access — close the pages.dev hole + let the cron in

Right now `printfarmcompanion.pages.dev` is **not** behind Access, so it's an open
back door to every route (Access only covers `printfarm.tech`). Fix both at once:

1. **Service token:** Zero Trust → Access → Service Auth → Service Tokens → Create
   (`github-cron`). Copy Client ID + Secret (secret shown once).
2. **Close the back door:** Zero Trust → Access → Applications → add hostname
   `printfarmcompanion.pages.dev` to your existing app (or create one for it) with the
   normal human-login policy.
3. **Cron path app:** create a separate self-hosted app, domain `printfarm.tech`,
   path `/api/cron-sync`, policy action **Service Auth** → Include → Service Token
   `github-cron`. (Most-specific app wins, so the cron path uses the token while
   everything else stays behind login.)

   *Simpler fallback:* make this policy **Bypass** (everyone) and skip the two
   `CF-Access-*` headers in the workflow. Endpoint is then guarded only by
   `CRON_SECRET` — fine because the secret is strong. Still keep step 2.

## 6. GitHub repo secrets

Settings → Secrets and variables → Actions:

- `CF_ACCESS_CLIENT_ID` = service token Client ID
- `CF_ACCESS_CLIENT_SECRET` = service token Client Secret
- `CRON_SECRET` = **same value** as the Cloudflare Pages env

(The workflow `.github/workflows/main.yml` already points at `printfarm.tech` and
sends all three.)

## 7. Verify the cron

Run the workflow manually (Actions → Scheduled Shopify Sync → Run workflow).

- ✅ Green job, log shows `{"success":true,...}` → Access admitted the token, the
  Worker accepted the bearer, sync ran.
- ❌ HTML / Access login page → the job now goes **red** (`--fail-with-body`), so a
  misconfig is visible. Check the service-token policy and headers.

---

## Later (not blocking go-live)

- **Remove TEMP DEBUG** — the `debug` block in `sync.ts` / the result panel in
  `+page.svelte`. Keep until the cron is confirmed deducting correctly, then strip.
- **Burn-bug fix** — `processOrder` records an order even if it had unmapped/no-SKU
  items, so a future order with an unmapped SKU is marked processed and won't
  re-deduct after you add the mapping. Needs per-line-item idempotency. Low risk now
  (everything's mapped), but do before relying on it fully unattended.
- **Multi-user** — the `MULTI-USER (Phase 3)` markers in code + the deploy-gate note
  in `saas-migration-plan.md`. Real auth (Phase 2) is the gate before public/SaaS.
