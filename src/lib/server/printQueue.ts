import type { D1Database } from '@cloudflare/workers-types';
import type { PrintQueueItem, QueueSpoolDemand, ServerResponse, InventoryPriority } from '../types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { AIContextBuilder } from '../recomendation/context-builder';
import { getPrinterById, getLoadedSpools } from './printers';
import type { TenantContext } from './context';

// Safety bound on knapsack item count, mirrors the old per-printer knapsack.
const MAX_COPIES_PER_ITEM = 200;

// The one knob: aim to keep this many days of stock. Items with fewer days of
// cover are "demand" (quantity = deficit to reach this); items past it ride along
// at quantity 0 and only ever get printed as spool-filling topup. Everything —
// ordering, quantity, topup preference — is driven by days-till-stockout, so
// there is no risk model and no min-threshold floor anymore.
const COVER_TARGET_DAYS = 30;

/** Display-only tier derived purely from days-of-cover (no risk model). Ranking
 *  and knapsack scoring use the continuous days value directly, not this label. */
function priorityFromDays(days: number): InventoryPriority {
  if (days < 7) return 'CRITICAL';
  if (days < 15) return 'HIGH';
  if (days < 30) return 'MEDIUM';
  if (days < 90) return 'LOW';
  return 'VERY_LOW';
}

/** Knapsack urgency: higher = fewer days of cover. Bounded, positive, strictly
 *  decreasing in days, so packing prefers the lowest-days items. */
function urgencyScore(days: number): number {
  return 1000 / (Math.max(0, days) + 1);
}

/**
 * Rebuild the `source='auto'` backlog from current demand and stock.
 *
 * Uses RAW velocity (getInventoryWithVelocity), NOT the queue-adjusted context —
 * the global backlog is the total need; per-printer assignment draws it down.
 * Feeding adjusted inventory here would create a feedback loop with assignments
 * that are themselves derived from this backlog.
 *
 * Idempotent: upserts auto rows keyed on (object_id, 'auto'); never touches
 * `source='manual'` pins; deletes obsolete auto rows.
 */
export async function regenerateGlobalQueue(ctx: TenantContext): Promise<{ updated: number }> {
  const drizzleDb = ctx.db;
  const builder = new AIContextBuilder(ctx);
  const inventory = await builder.getInventoryWithVelocity();

  // object -> preferred active module (lowest id wins; stable).
  const moduleRows = await drizzleDb.all<{ object_id: number; module_id: number }>(sql`
    SELECT object_id, MIN(id) as module_id
    FROM print_modules
    WHERE active = 1 AND object_id IS NOT NULL AND workspace_id = ${ctx.workspaceId}
    GROUP BY object_id
  `);
  const moduleByObject = new Map<number, number>();
  for (const r of moduleRows ?? []) moduleByObject.set(r.object_id, r.module_id);

  // Full ranked production backlog: every selling SKU (plus anything below its
  // min-threshold floor), ranked by days-of-cover in getGlobalQueue. Quantity =
  // deficit to reach the target cover (drives per-printer assignment; well-stocked
  // items ride along at quantity 0).
  const desired = inventory
    .map((item) => {
      const vel = item.daily_velocity;
      // Only things that actually sell have a stockout date to rank by.
      if (vel <= 0) return null;

      const daysCover = item.in_stock / vel;
      const target = Math.ceil(vel * COVER_TARGET_DAYS);
      const deficit = Math.max(0, target - item.in_stock);

      const moduleId = moduleByObject.get(item.id) ?? null;
      const quantity = deficit;
      const priority = priorityFromDays(daysCover);
      return {
        objectId: item.id,
        moduleId,
        quantity,
        priority,
        reason: `${Math.round(daysCover)}d cover, stock ${item.in_stock}/${target}, ${vel}/d`,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  // One D1 batch (single round-trip) of single-row upserts. A multi-row VALUES
  // insert would blow past D1's ~100 bound-parameter cap once there are more than
  // ~a dozen objects; batch() keeps each statement tiny while still round-tripping once.
  const now = Math.floor(Date.now() / 1000);
  if (desired.length > 0) {
    const upsertSql = `
      INSERT INTO print_queue (workspace_id, object_id, module_id, quantity, priority, reason, source, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'auto', 'pending', ?, ?)
      ON CONFLICT(object_id, source) DO UPDATE SET
        module_id = excluded.module_id,
        quantity  = excluded.quantity,
        priority  = excluded.priority,
        reason    = excluded.reason,
        updated_at = ?`;
    await ctx.d1.batch(
      desired.map((d) =>
        ctx.d1
          .prepare(upsertSql)
          .bind(ctx.workspaceId, d.objectId, d.moduleId, d.quantity, d.priority, d.reason, now, now, now),
      ),
    );
  }

  // Drop auto rows that are no longer relevant. Manual pins are never touched.
  const keepIds = desired.map((d) => d.objectId);
  if (keepIds.length > 0) {
    await drizzleDb.run(sql`
      DELETE FROM print_queue
      WHERE source = 'auto' AND workspace_id = ${ctx.workspaceId}
        AND object_id NOT IN (${sql.join(keepIds.map((id) => sql`${id}`), sql`, `)})
    `);
  } else {
    await drizzleDb.run(sql`DELETE FROM print_queue WHERE source = 'auto' AND workspace_id = ${ctx.workspaceId}`);
  }

  return { updated: desired.length };
}

/**
 * Regenerate lazily when it would actually change. This is the "background"
 * mechanism: pages call it on load, so the queue stays fresh without an
 * always-on worker. Rebuilds when:
 *   - the backlog is empty, OR
 *   - inventory changed since the last regen (newest inventory_log entry is
 *     newer than the queue) — i.e. any stock/sale/print/count moved the numbers, OR
 *   - the queue is older than `ttlSeconds` (safety net for clock edge cases).
 * Best-effort — never throws into the caller's load().
 */
export async function regenerateGlobalQueueIfStale(ctx: TenantContext, ttlSeconds = 3600): Promise<void> {
  try {
    const drizzleDb = ctx.db;
    const [row, logRow] = await Promise.all([
      drizzleDb.get<{ newest: number | null; n: number }>(sql`
        SELECT MAX(updated_at) as newest, COUNT(*) as n FROM print_queue WHERE source = 'auto' AND workspace_id = ${ctx.workspaceId}
      `),
      drizzleDb.get<{ newest: number | null }>(sql`
        SELECT MAX(created_at) as newest FROM inventory_log WHERE workspace_id = ${ctx.workspaceId}
      `),
    ]);
    const queueNewest = row?.newest ?? 0;
    const inventoryNewest = logRow?.newest ?? 0;

    const now = Math.floor(Date.now() / 1000);
    const stale =
      !row ||
      row.n === 0 ||
      inventoryNewest > queueNewest ||
      queueNewest < now - ttlSeconds;
    if (stale) await regenerateGlobalQueue(ctx);
  } catch (err) {
    console.error('regenerateGlobalQueueIfStale failed:', err);
  }
}

/** The full backlog (auto + manual), tier-ordered, with live forecast fields attached. */
export async function getGlobalQueue(ctx: TenantContext): Promise<PrintQueueItem[]> {
  const drizzleDb = ctx.db;
  const rows = await drizzleDb.all<{
    id: number;
    object_id: number;
    object_name: string;
    module_id: number | null;
    module_name: string | null;
    quantity: number;
    priority: InventoryPriority;
    reason: string;
    source: 'auto' | 'manual';
    status: 'pending' | 'assigned' | 'done';
    assigned_printer_id: number | null;
    in_stock: number;
  }>(sql`
    SELECT pq.id, pq.object_id, o.name as object_name, pq.module_id, pm.name as module_name,
           pq.quantity, pq.priority, pq.reason, pq.source, pq.status, pq.assigned_printer_id,
           o.in_stock
    FROM print_queue pq
    JOIN objects o ON pq.object_id = o.id
    LEFT JOIN print_modules pm ON pq.module_id = pm.id
    WHERE pq.workspace_id = ${ctx.workspaceId}
  `);

  // Attach live velocity/risk (not stored on the row) for display + sorting.
  const builder = new AIContextBuilder(ctx);
  const inv = await builder.getInventoryWithVelocity();
  const byId = new Map(inv.map((i) => [i.id, i]));

  const items = (rows ?? []).map((r) => {
    const v = byId.get(r.object_id);
    return {
      ...r,
      daily_velocity: v?.daily_velocity ?? 0,
      days_until_stockout: v?.days_until_stockout ?? 999,
      stockout_risk: v?.stockout_risk ?? 0,
    } satisfies PrintQueueItem;
  });

  // Canonical ranking: purely lowest days-of-cover first. Manual pins sort ahead
  // (deliberate user override); quantity only breaks exact ties.
  items.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
    if (a.days_until_stockout !== b.days_until_stockout) return a.days_until_stockout - b.days_until_stockout;
    return b.quantity - a.quantity;
  });

  return items;
}

/** Add or update a manual pin. Survives regeneration (source='manual'). */
export async function addManualQueueItem(
  ctx: TenantContext,
  item: { objectId: number; moduleId?: number | null; quantity: number; priority?: InventoryPriority; reason?: string },
): Promise<ServerResponse> {
  const drizzleDb = ctx.db;
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      INSERT INTO print_queue (workspace_id, object_id, module_id, quantity, priority, reason, source, status, created_at, updated_at)
      VALUES (${ctx.workspaceId}, ${item.objectId}, ${item.moduleId ?? null}, ${item.quantity}, ${item.priority ?? 'HIGH'}, ${item.reason ?? 'Manual pin'}, 'manual', 'pending', ${now}, ${now})
      ON CONFLICT(object_id, source) DO UPDATE SET
        module_id = excluded.module_id,
        quantity  = excluded.quantity,
        priority  = excluded.priority,
        reason    = excluded.reason,
        updated_at = ${now}
    `);
    return { success: true, message: 'Pinned to print queue' };
  } catch (error) {
    console.error('Error adding manual queue item:', error);
    return { success: false, error: 'Failed to pin item' };
  }
}

export async function removeQueueItem(ctx: TenantContext, id: number): Promise<ServerResponse> {
  try {
    await ctx.db.run(sql`DELETE FROM print_queue WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`);
    return { success: true, message: 'Removed from print queue' };
  } catch (error) {
    console.error('Error removing queue item:', error);
    return { success: false, error: 'Failed to remove queue item' };
  }
}

/**
 * Knapsack-select from the global backlog for one printer's currently loaded
 * spools and write the result into `printer_queued_jobs`. Replaces that
 * printer's pending assignment and records `assigned_printer_id` on the chosen
 * global rows for visibility.
 *
 * The backlog is advisory and shared: rows are NOT consumed/hidden on
 * assignment, so every compatible printer keeps seeing the full demand (the
 * old `status='assigned'` gate made items vanish from all other printers and
 * never come back). Per-printer `printer_queued_jobs` is the actual assignment.
 *
 * Compatibility requires EVERY filament slot a module needs to match the
 * preset physically loaded in that slot (fixes the old slot-0-only check).
 * Capacity is a single resource: the module's *bottleneck* slot — true
 * multi-dimensional bin-packing across slots is unnecessary for the AMS setups
 * in use today.
 */
export async function assignQueueToPrinter(ctx: TenantContext, printerId: number): Promise<{ assigned: number }> {
  const drizzleDb = ctx.db;

  // All independent reads in parallel — collapses five sequential round-trips
  // (the dominant per-click cost on remote D1) into one batch.
  const [printer, loadedSlots, rows, slotRows, inv] = await Promise.all([
    getPrinterById(ctx, printerId),
    getLoadedSpools(ctx, printerId),
    drizzleDb.all<{
      queue_id: number;
      object_id: number;
      module_id: number | null;
      quantity: number;
      priority: InventoryPriority;
      printer_preset_id: number | null;
      module_weight: number | null;
    }>(sql`
      SELECT pq.id as queue_id, pq.object_id, pq.module_id, pq.quantity, pq.priority,
             pm.printer_preset_id, pm.weight as module_weight
      FROM print_queue pq
      JOIN print_modules pm ON pq.module_id = pm.id
      WHERE pq.status != 'done' AND pq.workspace_id = ${ctx.workspaceId}
    `),
    drizzleDb.all<{
      module_id: number;
      slot_index: number;
      spool_preset_id: number | null;
      weight: number | null;
    }>(sql`SELECT module_id, slot_index, spool_preset_id, weight FROM module_filament_slots WHERE workspace_id = ${ctx.workspaceId}`),
    new AIContextBuilder(ctx).getInventoryWithVelocity(),
  ]);
  if (!printer) return { assigned: 0 };

  const loadedByIndex = new Map(loadedSlots.map((s) => [s.slot_index, s.spool]));
  if (!loadedSlots.some((s) => s.spool_id)) return { assigned: 0 };

  const slotsByModule = new Map<number, typeof slotRows>();
  for (const r of slotRows ?? []) {
    const arr = slotsByModule.get(r.module_id) ?? [];
    arr.push(r);
    slotsByModule.set(r.module_id, arr);
  }

  // Live days-of-cover per object — the sole driver of needed/topup scoring
  // (inv is fetched in the parallel batch above; velocity is request-memoized).
  const daysByObject = new Map(inv.map((i) => [i.id, i.days_until_stockout]));

  type Candidate = { queueId: number; moduleId: number; weight: number; priority: InventoryPriority; days: number };
  const candidates: Candidate[] = [];

  for (const row of rows ?? []) {
    if (!row.module_id) continue;
    if (row.printer_preset_id && printer.printer_preset_id && row.printer_preset_id !== printer.printer_preset_id) continue;

    const slots = (slotsByModule.get(row.module_id) ?? []).filter((s) => s.spool_preset_id != null);
    if (slots.length === 0) continue;

    // Per-slot weight may be missing (older modules). Fall back to module total
    // split across slots, then to a nominal so a CRITICAL item is never silently
    // dropped just for lacking weight metadata.
    const fallbackPerSlot = (row.module_weight ?? 0) > 0 ? (row.module_weight as number) / slots.length : 20;

    let compatible = true;
    let bottleneckWeight = 0;
    let bottleneckCoverage = Infinity; // copies the tightest slot can produce
    for (const slot of slots) {
      const loaded = loadedByIndex.get(slot.slot_index);
      if (!loaded || loaded.preset_id !== slot.spool_preset_id) {
        compatible = false;
        break;
      }
      const w = slot.weight && slot.weight > 0 ? slot.weight : fallbackPerSlot;
      const coverage = loaded.remaining_weight / w;
      if (coverage < bottleneckCoverage) {
        bottleneckCoverage = coverage;
        bottleneckWeight = w;
      }
    }
    if (!compatible || bottleneckWeight <= 0) continue;

    candidates.push({
      queueId: row.queue_id,
      moduleId: row.module_id,
      weight: Math.round(bottleneckWeight),
      priority: row.priority,
      days: daysByObject.get(row.object_id) ?? 999,
    });
  }

  // Capacity = the loaded spool with the least headroom across all candidates'
  // bottleneck slots — conservative, single-resource stand-in for true
  // multi-slot bin-packing.
  const capacity = Math.min(
    10_000,
    ...loadedSlots.filter((s) => s.spool_id).map((s) => Math.floor(s.spool?.remaining_weight ?? 0)),
  );
  if (!Number.isFinite(capacity) || capacity <= 0) return { assigned: 0 };

  type UnrolledItem = { candidate: Candidate; score: number; filler: boolean };
  const unrolled: UnrolledItem[] = [];
  const queueQuantity = new Map((rows ?? []).map((r) => [r.queue_id, r.quantity]));

  // Each candidate contributes (a) "needed" copies up to its queue quantity and
  // (b) "filler" copies up to what fits. Both are scored by days-till-stockout
  // (fewer days = higher urgency), but needed copies carry a large base so they
  // always outrank any filler and are never displaced by it. All scores are
  // positive, so the knapsack still fills the spool as full as it can — and among
  // filler options it prefers the lowest-days item (the next-most-needed).
  const NEEDED_BASE = 1e6;
  for (const c of candidates) {
    const urgency = urgencyScore(c.days);
    const needed = Math.min(queueQuantity.get(c.queueId) ?? 1, MAX_COPIES_PER_ITEM);
    const maxFit = Math.min(Math.floor(capacity / c.weight), MAX_COPIES_PER_ITEM);
    for (let k = 0; k < maxFit; k++) {
      const filler = k >= needed;
      const score = filler ? urgency : NEEDED_BASE + urgency;
      unrolled.push({ candidate: c, score, filler });
    }
  }

  // 0/1 knapsack over the unrolled copies.
  const dp = new Array(capacity + 1).fill(0);
  const from: ({ prevWeight: number; item: UnrolledItem } | null)[] = new Array(capacity + 1).fill(null);
  for (const item of unrolled) {
    for (let w = capacity; w >= item.candidate.weight; w--) {
      const candidateScore = dp[w - item.candidate.weight] + item.score;
      if (candidateScore > dp[w]) {
        dp[w] = candidateScore;
        from[w] = { prevWeight: w - item.candidate.weight, item };
      }
    }
  }

  let bestWeight = 0;
  for (let w = 1; w <= capacity; w++) if (dp[w] > dp[bestWeight]) bestWeight = w;

  const chosenCopies: UnrolledItem[] = [];
  let w = bestWeight;
  while (from[w] !== null) {
    chosenCopies.push(from[w]!.item);
    w = from[w]!.prevWeight;
  }
  // Needed prints first, then filler — each ordered by fewest days of cover.
  chosenCopies.sort((a, b) => {
    if (a.filler !== b.filler) return a.filler ? 1 : -1;
    return a.candidate.days - b.candidate.days;
  });

  await drizzleDb.run(sql`DELETE FROM printer_queued_jobs WHERE printer_id = ${printerId} AND is_completed = 0 AND workspace_id = ${ctx.workspaceId}`);

  // One D1 batch of single-row inserts (single round-trip, no bound-param cap)
  // instead of N sequential awaited inserts — the old loop was the main per-click
  // cost against remote D1.
  const assignedQueueIds = new Set<number>();
  const now = Math.floor(Date.now() / 1000);
  if (chosenCopies.length > 0) {
    const insertSql = `
      INSERT INTO printer_queued_jobs (workspace_id, printer_id, module_id, reason, sort_order, is_completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)`;
    await ctx.d1.batch(
      chosenCopies.map((cc, i) => {
        assignedQueueIds.add(cc.candidate.queueId);
        const reason = cc.filler ? 'TOPUP' : cc.candidate.priority;
        return ctx.d1
          .prepare(insertSql)
          .bind(ctx.workspaceId, printerId, cc.candidate.moduleId, reason, i, now, now);
      }),
    );
  }

  if (assignedQueueIds.size > 0) {
    // Record which printer last picked each row (visibility only). Leave status
    // 'pending' so the backlog stays visible to every other compatible printer.
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      UPDATE print_queue SET assigned_printer_id = ${printerId}, updated_at = ${now}
      WHERE workspace_id = ${ctx.workspaceId} AND id IN (${sql.join([...assignedQueueIds].map((id) => sql`${id}`), sql`, `)})
    `);
  }

  return { assigned: chosenCopies.length };
}

/**
 * Aggregate filament demand across the active backlog (pending + assigned,
 * not yet printed) per spool preset, and compare to what's on hand (loaded
 * spools' remaining weight + unopened spools in storage). This is the basis
 * for spool-load ranking and replenishment buying decisions.
 *
 * Demand is scoped to the next `horizonDays`: the copies actually needed to keep
 * each object covered = max(0, velocity × horizonDays − finished-goods in_stock).
 * (The queue's own quantity targets 45-day cover and ignores finished stock, so
 * using it raw over-orders filament.) A queued item with no recent velocity
 * (manual pin / new SKU) keeps its full quantity so it isn't silently dropped.
 */
export async function getSpoolDemandFromQueue(ctx: TenantContext, horizonDays = 30): Promise<QueueSpoolDemand[]> {
  const drizzleDb = ctx.db;

  const queueRows = await drizzleDb.all<{ object_id: number; module_id: number; quantity: number }>(sql`
    SELECT object_id, module_id, quantity FROM print_queue WHERE module_id IS NOT NULL AND status != 'done' AND workspace_id = ${ctx.workspaceId}
  `);

  // Per-object velocity + finished-goods stock, to scope copies to the horizon.
  const builder = new AIContextBuilder(ctx);
  const inv = await builder.getInventoryWithVelocity();
  const invByObject = new Map(inv.map((i) => [i.id, i]));

  const slotRows = await drizzleDb.all<{ module_id: number; spool_preset_id: number | null; weight: number | null }>(sql`
    SELECT module_id, spool_preset_id, weight FROM module_filament_slots WHERE workspace_id = ${ctx.workspaceId}
  `);
  const slotsByModule = new Map<number, typeof slotRows>();
  for (const r of slotRows ?? []) {
    const arr = slotsByModule.get(r.module_id) ?? [];
    arr.push(r);
    slotsByModule.set(r.module_id, arr);
  }

  const gramsNeeded = new Map<number, number>();
  for (const row of queueRows ?? []) {
    const info = invByObject.get(row.object_id);
    const vel = info?.daily_velocity ?? 0;
    // Velocity-driven: copies to cover the horizon after finished stock runs down.
    // No velocity: manual pin / floor-driven, keep the queued quantity as-is.
    const quantity = vel > 0
      ? Math.max(0, Math.min(row.quantity, Math.ceil(vel * horizonDays) - (info?.in_stock ?? 0)))
      : row.quantity;
    if (quantity <= 0) continue;
    for (const slot of slotsByModule.get(row.module_id) ?? []) {
      if (slot.spool_preset_id == null || !slot.weight) continue;
      gramsNeeded.set(slot.spool_preset_id, (gramsNeeded.get(slot.spool_preset_id) ?? 0) + slot.weight * quantity);
    }
  }
  if (gramsNeeded.size === 0) return [];

  const presetRows = await drizzleDb.all<{
    id: number;
    color: string;
    color_hex: string | null;
    brand: string;
    material: string;
    default_weight: number;
    in_storage: number;
  }>(sql`SELECT id, color, color_hex, brand, material, default_weight, in_storage FROM spool_presets WHERE workspace_id = ${ctx.workspaceId}`);
  const presetById = new Map((presetRows ?? []).map((p) => [p.id, p]));

  const loadedRows = await drizzleDb.all<{ preset_id: number; remaining_weight: number }>(sql`
    SELECT preset_id, remaining_weight FROM spools WHERE preset_id IS NOT NULL AND workspace_id = ${ctx.workspaceId}
  `);
  const loadedByPreset = new Map<number, number>();
  for (const r of loadedRows ?? []) {
    loadedByPreset.set(r.preset_id, (loadedByPreset.get(r.preset_id) ?? 0) + r.remaining_weight);
  }

  const demand: QueueSpoolDemand[] = [];
  for (const [presetId, grams_needed] of gramsNeeded) {
    const preset = presetById.get(presetId);
    if (!preset) continue;
    const grams_available = (loadedByPreset.get(presetId) ?? 0) + preset.in_storage * preset.default_weight;
    const grams_deficit = Math.max(0, grams_needed - grams_available);
    const spools_to_buy = preset.default_weight > 0 ? Math.ceil(grams_deficit / preset.default_weight) : 0;
    demand.push({
      preset_id: presetId,
      preset_label: `${preset.brand} ${preset.material} ${preset.color}`,
      color_hex: preset.color_hex,
      grams_needed,
      grams_available,
      grams_deficit,
      spools_to_buy,
    });
  }

  return demand.sort((a, b) => b.grams_deficit - a.grams_deficit);
}
