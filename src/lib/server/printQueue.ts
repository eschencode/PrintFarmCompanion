import type { D1Database } from '@cloudflare/workers-types';
import type { PrintQueueItem, QueueSpoolDemand, ServerResponse, InventoryPriority } from '../types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { AIContextBuilder } from '../recomendation/context-builder';
import { bucketPriority } from '../recomendation/forecast';
import { getPrinterById, getLoadedSpools, addPrinterQueuedJob } from './printers';

const PRIORITY_SCORES: Record<InventoryPriority, number> = {
  CRITICAL: 100000,
  HIGH: 10000,
  MEDIUM: 1000,
  LOW: 100,
  VERY_LOW: 10,
};

// Safety bound on knapsack item count, mirrors the old per-printer knapsack.
const MAX_COPIES_PER_ITEM = 200;

// Days of stock to aim for. Drives the suggested quantity (deficit to reach it)
// used by per-printer assignment. The queue itself always lists every selling
// SKU ranked by days-of-cover.
const COVER_TARGET_DAYS = 45;

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
export async function regenerateGlobalQueue(db: D1Database): Promise<{ updated: number }> {
  const drizzleDb = getDb(db);
  const builder = new AIContextBuilder(db);
  const inventory = await builder.getInventoryWithVelocity();

  // object -> preferred active module (lowest id wins; stable).
  const moduleRows = await drizzleDb.all<{ object_id: number; module_id: number }>(sql`
    SELECT object_id, MIN(id) as module_id
    FROM print_modules
    WHERE active = 1 AND object_id IS NOT NULL
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
      const daysCover = vel > 0 ? item.in_stock / vel : Infinity;
      const belowFloor = item.min_threshold > 0 && item.in_stock <= item.min_threshold;
      const target = Math.max(item.min_threshold, Math.ceil(vel * COVER_TARGET_DAYS));
      const deficit = Math.max(0, target - item.in_stock);

      if (!(belowFloor || vel > 0)) return null;

      const moduleId = moduleByObject.get(item.id) ?? null;
      const quantity = deficit;
      const priority = bucketPriority(item);
      const coverLabel = Number.isFinite(daysCover) ? `${Math.round(daysCover)}d cover` : 'no recent sales';
      return {
        objectId: item.id,
        moduleId,
        quantity,
        priority,
        reason: `${priority} — ${coverLabel}, stock ${item.in_stock}/${target}, ${vel}/d`,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const now = Math.floor(Date.now() / 1000);
  for (const d of desired) {
    await drizzleDb.run(sql`
      INSERT INTO print_queue (object_id, module_id, quantity, priority, reason, source, status, created_at, updated_at)
      VALUES (${d.objectId}, ${d.moduleId}, ${d.quantity}, ${d.priority}, ${d.reason}, 'auto', 'pending', ${now}, ${now})
      ON CONFLICT(object_id, source) DO UPDATE SET
        module_id = excluded.module_id,
        quantity  = excluded.quantity,
        priority  = excluded.priority,
        reason    = excluded.reason,
        updated_at = ${now}
    `);
  }

  // Drop auto rows that are no longer relevant. Manual pins are never touched.
  const keepIds = desired.map((d) => d.objectId);
  if (keepIds.length > 0) {
    await drizzleDb.run(sql`
      DELETE FROM print_queue
      WHERE source = 'auto'
        AND object_id NOT IN (${sql.join(keepIds.map((id) => sql`${id}`), sql`, `)})
    `);
  } else {
    await drizzleDb.run(sql`DELETE FROM print_queue WHERE source = 'auto'`);
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
export async function regenerateGlobalQueueIfStale(db: D1Database, ttlSeconds = 3600): Promise<void> {
  try {
    const drizzleDb = getDb(db);
    const row = await drizzleDb.get<{ newest: number | null; n: number }>(sql`
      SELECT MAX(updated_at) as newest, COUNT(*) as n FROM print_queue WHERE source = 'auto'
    `);
    const queueNewest = row?.newest ?? 0;

    const logRow = await drizzleDb.get<{ newest: number | null }>(sql`
      SELECT MAX(created_at) as newest FROM inventory_log
    `);
    const inventoryNewest = logRow?.newest ?? 0;

    const now = Math.floor(Date.now() / 1000);
    const stale =
      !row ||
      row.n === 0 ||
      inventoryNewest > queueNewest ||
      queueNewest < now - ttlSeconds;
    if (stale) await regenerateGlobalQueue(db);
  } catch (err) {
    console.error('regenerateGlobalQueueIfStale failed:', err);
  }
}

/** The full backlog (auto + manual), tier-ordered, with live forecast fields attached. */
export async function getGlobalQueue(db: D1Database): Promise<PrintQueueItem[]> {
  const drizzleDb = getDb(db);
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
  `);

  // Attach live velocity/risk (not stored on the row) for display + sorting.
  const builder = new AIContextBuilder(db);
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

  // Canonical ranking: most-worth-printing first = lowest days-of-cover. Tier
  // and quantity only break ties (with deep stock everything is one tier, so
  // cover is what actually discriminates relevance). Manual pins sort ahead.
  items.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
    if (a.days_until_stockout !== b.days_until_stockout) return a.days_until_stockout - b.days_until_stockout;
    const tier = PRIORITY_SCORES[b.priority] - PRIORITY_SCORES[a.priority];
    if (tier !== 0) return tier;
    return b.quantity - a.quantity;
  });

  return items;
}

/** Add or update a manual pin. Survives regeneration (source='manual'). */
export async function addManualQueueItem(
  db: D1Database,
  item: { objectId: number; moduleId?: number | null; quantity: number; priority?: InventoryPriority; reason?: string },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      INSERT INTO print_queue (object_id, module_id, quantity, priority, reason, source, status, created_at, updated_at)
      VALUES (${item.objectId}, ${item.moduleId ?? null}, ${item.quantity}, ${item.priority ?? 'HIGH'}, ${item.reason ?? 'Manual pin'}, 'manual', 'pending', ${now}, ${now})
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

export async function removeQueueItem(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`DELETE FROM print_queue WHERE id = ${id}`);
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
export async function assignQueueToPrinter(db: D1Database, printerId: number): Promise<{ assigned: number }> {
  const drizzleDb = getDb(db);
  const printer = await getPrinterById(db, printerId);
  if (!printer) return { assigned: 0 };

  const loadedSlots = await getLoadedSpools(db, printerId);
  const loadedByIndex = new Map(loadedSlots.map((s) => [s.slot_index, s.spool]));
  if (!loadedSlots.some((s) => s.spool_id)) return { assigned: 0 };

  const rows = await drizzleDb.all<{
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
    WHERE pq.status != 'done'
  `);

  const slotRows = await drizzleDb.all<{
    module_id: number;
    slot_index: number;
    spool_preset_id: number | null;
    weight: number | null;
  }>(sql`SELECT module_id, slot_index, spool_preset_id, weight FROM module_filament_slots`);

  const slotsByModule = new Map<number, typeof slotRows>();
  for (const r of slotRows ?? []) {
    const arr = slotsByModule.get(r.module_id) ?? [];
    arr.push(r);
    slotsByModule.set(r.module_id, arr);
  }

  type Candidate = { queueId: number; moduleId: number; weight: number; priority: InventoryPriority };
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

    candidates.push({ queueId: row.queue_id, moduleId: row.module_id, weight: Math.round(bottleneckWeight), priority: row.priority });
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

  // Each candidate contributes (a) "needed" copies up to its queue quantity,
  // scored by priority, then (b) "filler" copies up to what fits, scored just
  // above zero so they only ever claim leftover spool weight — never displacing
  // real demand. This fills the spool to minimize waste / keep the printer busy
  // once everything needed is queued. Filler ranks by the item's own tier, so
  // surplus space goes to the next-most-relevant SKU.
  for (const c of candidates) {
    const baseScore = PRIORITY_SCORES[c.priority] || 0;
    const fillBonus = (c.weight / capacity) * baseScore * 0.4;
    const needed = Math.min(queueQuantity.get(c.queueId) ?? 1, MAX_COPIES_PER_ITEM);
    const maxFit = Math.min(Math.floor(capacity / c.weight), MAX_COPIES_PER_ITEM);
    for (let k = 0; k < maxFit; k++) {
      const filler = k >= needed;
      // Filler score is a tiny positive (< any real VERY_LOW=10 copy) nudged by
      // tier so faster sellers win leftover space.
      const score = filler ? 0.001 + baseScore * 1e-6 : baseScore + fillBonus;
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
  // Needed prints first (by tier), then filler (by tier).
  chosenCopies.sort((a, b) => {
    if (a.filler !== b.filler) return a.filler ? 1 : -1;
    return PRIORITY_SCORES[b.candidate.priority] - PRIORITY_SCORES[a.candidate.priority];
  });

  await drizzleDb.run(sql`DELETE FROM printer_queued_jobs WHERE printer_id = ${printerId} AND is_completed = 0`);

  const assignedQueueIds = new Set<number>();
  for (let i = 0; i < chosenCopies.length; i++) {
    const { candidate: c, filler } = chosenCopies[i];
    await addPrinterQueuedJob(db, { printerId, moduleId: c.moduleId, reason: filler ? 'TOPUP' : c.priority, sortOrder: i });
    assignedQueueIds.add(c.queueId);
  }

  if (assignedQueueIds.size > 0) {
    // Record which printer last picked each row (visibility only). Leave status
    // 'pending' so the backlog stays visible to every other compatible printer.
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      UPDATE print_queue SET assigned_printer_id = ${printerId}, updated_at = ${now}
      WHERE id IN (${sql.join([...assignedQueueIds].map((id) => sql`${id}`), sql`, `)})
    `);
  }

  return { assigned: chosenCopies.length };
}

/**
 * Aggregate filament demand across the active backlog (pending + assigned,
 * not yet printed) per spool preset, and compare to what's on hand (loaded
 * spools' remaining weight + unopened spools in storage). This is the basis
 * for spool-load ranking and replenishment buying decisions.
 */
export async function getSpoolDemandFromQueue(db: D1Database): Promise<QueueSpoolDemand[]> {
  const drizzleDb = getDb(db);

  const queueRows = await drizzleDb.all<{ module_id: number; quantity: number }>(sql`
    SELECT module_id, quantity FROM print_queue WHERE module_id IS NOT NULL AND status != 'done'
  `);

  const slotRows = await drizzleDb.all<{ module_id: number; spool_preset_id: number | null; weight: number | null }>(sql`
    SELECT module_id, spool_preset_id, weight FROM module_filament_slots
  `);
  const slotsByModule = new Map<number, typeof slotRows>();
  for (const r of slotRows ?? []) {
    const arr = slotsByModule.get(r.module_id) ?? [];
    arr.push(r);
    slotsByModule.set(r.module_id, arr);
  }

  const gramsNeeded = new Map<number, number>();
  for (const row of queueRows ?? []) {
    for (const slot of slotsByModule.get(row.module_id) ?? []) {
      if (slot.spool_preset_id == null || !slot.weight) continue;
      gramsNeeded.set(slot.spool_preset_id, (gramsNeeded.get(slot.spool_preset_id) ?? 0) + slot.weight * row.quantity);
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
  }>(sql`SELECT id, color, color_hex, brand, material, default_weight, in_storage FROM spool_presets`);
  const presetById = new Map((presetRows ?? []).map((p) => [p.id, p]));

  const loadedRows = await drizzleDb.all<{ preset_id: number; remaining_weight: number }>(sql`
    SELECT preset_id, remaining_weight FROM spools WHERE preset_id IS NOT NULL
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
