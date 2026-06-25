# Global Print Queue — logic & flow

The single source of truth for "what should we print, and what should we load."
One demand-driven backlog (`print_queue`) is generated from inventory velocity, then
*derived* into per-printer assignments and spool recommendations.

---

## The three queue concepts (don't confuse them)

| Name | Where | Role |
|---|---|---|
| **client `startQueue`** | `(main)/+page.svelte` (localStorage) | Execution: FIFO dispatch of print-start actions across transports. Unrelated to demand. |
| **global `print_queue`** | DB table | **Planning**: the demand backlog — what needs printing, ranked by urgency. |
| **`printer_queued_jobs`** | DB table | **Assignment**: per-printer selection drawn from the global backlog (advisory). |

`startQueue` = execution; the other two = planning/assignment.

---

## Data model — `print_queue` (`schema.ts`)

Global, printer-agnostic. One `source='auto'` row per object (unique on `object_id, source`).

- `object_id`, `module_id` (preferred producing module), `quantity` (deficit to target)
- `priority` (`InventoryPriority`), `reason` (human string)
- `source` `'auto' | 'manual'` — auto rows are rebuilt; **manual pins are never touched** (manual-add UI deferred)
- `status` `'pending' | 'assigned' | 'done'` — currently always left `'pending'` (see assignment)
- `assigned_printer_id` — informational (last printer that picked the row)

---

## 1. Generation — `regenerateGlobalQueue(db)`

Rebuilds the `source='auto'` backlog from **raw** demand (never the queue-adjusted
context — that would feed back on itself).

1. `getInventoryWithVelocity()` → per-object stock + velocity + forecast.
   - **Velocity window**: total sales ÷ `min(90, days since first recorded sale)`.
     Dividing by a fixed 90 when only ~20 days of history exist understates velocity
     ~4.5× — so the effective window is used instead (`context-builder.ts`).
2. For each object:
   - `daysCover = in_stock / velocity`
   - `target = max(min_threshold, ceil(velocity × COVER_TARGET_DAYS))` (`COVER_TARGET_DAYS = 45`)
   - `quantity = max(0, target − in_stock)`
   - **Include** if below min-threshold floor **or** `velocity > 0` (every selling SKU is
     listed; well-stocked ones ride along at `quantity = 0`).
   - `priority = bucketPriority(item)` (risk/threshold tiers, confidence-capped — `forecast.ts`)
3. Upsert auto rows; delete obsolete auto rows; leave manual rows alone.

**Ordering** (`getGlobalQueue`): manual pins first, then by **days-of-cover ascending**
(most urgent first), tie-broken by tier then quantity. With deep stock everything is one
tier, so days-of-cover is what actually discriminates relevance.

---

## 2. When it regenerates — `regenerateGlobalQueueIfStale(db, ttl=3600)`

Lazy, no always-on worker. Rebuilds only when it would change:

- backlog is empty, **or**
- **newest `inventory_log` row is newer than the queue** — i.e. any stock add/remove,
  B2C/B2B sale, printed stock, or manual count happened since the last regen, **or**
- queue older than the TTL (1h safety net).

Because every inventory mutation writes `inventory_log`, this covers "regenerate after any
inventory change" without hooking each mutation site, and without regenerating N times for
an N-line order — it rebuilds once, on the next read.

**Called on load of**: dashboard (`+page.server.ts`, warms it so the first spool-load is
fast), inventory, spools, and `/api/ai-recommendations` (`spool` | `queue` | `global` |
`spool-demand`).

---

## 3. Per-printer assignment — `assignQueueToPrinter(db, printerId)`

Turns the global backlog into one printer's `printer_queued_jobs`, fitting the loaded spool.

- **Candidates** = `print_queue` rows (`status != 'done'`) whose module is printer-model
  compatible **and** every filament slot matches a loaded spool preset (multi-slot, not just
  slot 0). Per-slot weight falls back: slot → module total ÷ slots → nominal 20g, so a
  CRITICAL item is never dropped for missing weight metadata.
- **Knapsack** (0/1) over the loaded spool's remaining weight:
  - "needed" copies up to the row's `quantity`, scored by priority tier.
  - "filler" copies beyond that, scored just above zero → only claim leftover weight, never
    displace real demand. These are written with `reason = 'TOPUP'`.
- Writes the result to `printer_queued_jobs` (replacing pending), sets `assigned_printer_id`
  on chosen rows. **Status stays `'pending'`** so the shared backlog remains visible to every
  other compatible printer and survives regeneration.

`generateAndSaveSuggestedQueue(db, printerId)` (stable name for the API/dashboard) =
`regenerateGlobalQueueIfStale` → `assignQueueToPrinter` → read back `printer_queued_jobs`,
attaching live `days_left` per object for the UI.

---

## 4. Spool recommendations (derived from the same queue)

- **`suggestSpoolToLoad(printerId?)`** — walks `getGlobalQueue`, **skips `quantity = 0`**
  (don't suggest a spool for something that doesn't need printing), dedupes by preset,
  filters by printer model. Reason shown = module name + days-left.
- **`getSpoolDemandFromQueue(db)`** — sums `slot.weight × quantity` per preset across the
  backlog; available = loaded remaining + `in_storage × default_weight`; surfaces deficits
  + spools-to-buy on `/spools`.

---

## UI surfaces

- **`/inventory`** "Print queue" panel — renders `getGlobalQueue` directly (one source of
  truth; ranked by days-of-cover). KPI cards remain client-side analytics.
- **Dashboard** per-printer "Saved Print Queue" / "Next Suggested Print" — from
  `printer_queued_jobs`; needed prints show `Xd left`, filler shows `topup`.
- **Spool load modal** — `suggestSpoolToLoad` cards.
- **`/spools`** — `getSpoolDemandFromQueue` deficits.
- **`/recommendations`** — debug/inspection surface (shows tiers, forecast internals).

---

## Tunables

- `COVER_TARGET_DAYS = 45` (`printQueue.ts`) — buffer target driving quantities.
- `MAX_COPIES_PER_ITEM = 200` — knapsack safety bound.
- `regenerateGlobalQueueIfStale` TTL `3600`s — staleness safety net.
- `FORECAST_LOOKBACK_DAYS = 90`, `HORIZON = 7`, `TRIALS = 500` (`forecast.ts`).

## Key files

- `src/lib/server/printQueue.ts` — table ops, generation, assignment, spool demand.
- `src/lib/recomendation/context-builder.ts` — `getInventoryWithVelocity` (velocity window).
- `src/lib/recomendation/forecast.ts` — bootstrap forecast + `bucketPriority`.
- `src/lib/recomendation/recommendation-service.ts` — `suggestSpoolToLoad`,
  `generateAndSaveSuggestedQueue`.

## Known gaps

- No eager regen on mutation (lazy on next read) and no Cloudflare Cron yet — fine given the
  `inventory_log` staleness check, but a Cron could pre-warm.
- Manual pins (`source='manual'`) are supported in the data model; the add/pin UI is deferred.
- `status='assigned'`/`done` columns exist but are currently unused by the assignment flow.
