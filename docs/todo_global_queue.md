# Global queue — status & open items

## When / how the queue is calculated
- `regenerateGlobalQueueIfStale(db)` runs lazily (1h TTL) on: inventory load, /spools load,
  and `/api/ai-recommendations` (`spool` | `queue` | `global` | `spool-demand`).
- NOT yet wired into sale/stock mutations (B2C webhook, B2B sale, print completion, stock count).
  Until then the queue can be up to 1h stale or only refreshes on those page/API visits.
- Source: `getInventoryWithVelocity()` (raw 90-day-capped velocity + stock) → days-of-cover.
  Inclusion = below min-threshold OR days_cover ≤ RANK_CEILING_DAYS (120).
  Quantity = top-up toward COVER_TARGET_DAYS (45) or one batch. Printer/spool independent.

## Fixed
- [x] **Sales-tracking window**: velocity now divides by the *actual* window since the first
  recorded sale (capped at 90), not a fixed 90. Was understating velocity ~4.5× / inflating cover.
  (`context-builder.ts`)
- [x] **Single source of truth**: inventory "Print queue" panel, /spools deficits, spool-load
  suggestion, per-printer assignment, AND /recommendations all read the global `print_queue`.
  Removed divergent `?type=test`; repointed /recommendations to `generateAndSaveSuggestedQueue`.
- [x] **Fill spool to minimize waste**: `assignQueueToPrinter` knapsack now adds needed prints
  across all compatible items, then `TOPUP` filler copies for leftover weight.

- [x] **Configurable target days + full-queue mode** (UI): cog on the Print Queue panel
  sets `coverTargetDays` and a `fullQueue` toggle, stored in `app_settings`, applied on save
  (queue regenerates immediately). Removed the old "one-batch nudge" — well-stocked items now
  show "stocked" (qty 0) instead of a misleading batch.

## Open
- [ ] Wire `regenerateGlobalQueue` into sale/stock mutation points (true background freshness).
- [ ] Per-object tracking-start: velocity still uses the *global* first-sale window; an item that
  started selling late is slightly understated. Minor; revisit if it matters.
- [ ] Dead code: `getSuggestedPrintQueue` (old all-inventory knapsack) in recommendation-service.ts
  now has zero callers — safe to delete along with its private helpers.
- [ ] Module data gaps: `klohalter-blau` (module 16) has no slot/module weight → shows `w=0` and
  relies on the nominal-weight fallback. Fill in real weight.
