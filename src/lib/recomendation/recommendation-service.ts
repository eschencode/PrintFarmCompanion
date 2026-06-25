import type { D1Database } from '@cloudflare/workers-types';
import { AIContextBuilder } from './context-builder';
import type {
  InventoryPriority,
  SpoolSuggestion
} from '../types';
import {
  getPrinterById,
  getLoadedSpools,
} from '../server';
import { regenerateGlobalQueueIfStale, assignQueueToPrinter, getGlobalQueue } from '../server/printQueue';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

export class AIRecommendationService {
  private db: D1Database;
  public contextBuilder: AIContextBuilder;

  constructor(db: D1Database) {
    this.db = db;
    this.contextBuilder = new AIContextBuilder(db);
  }

  /**
   * Returns spool presets ranked by which to load next, sourced from the
   * global print queue (not a per-printer re-scoring of all inventory) —
   * the queue is already tier+quantity ordered, so loading whatever it
   * needs next keeps printer assignment and spool choice consistent.
   * Deduped by preset_id — the most urgent queue item a preset can satisfy wins.
   */
  async suggestSpoolToLoad(printerId?: number): Promise<SpoolSuggestion[]> {
    const queue = await getGlobalQueue(this.db);
    const modules = await this.contextBuilder.getModulesContext();
    const moduleById = new Map(modules.map(m => [m.id, m]));

    let printer: Awaited<ReturnType<typeof getPrinterById>> | null = null;
    if (printerId) {
      printer = await getPrinterById(this.db, printerId);
    }

    // queue is already tier+quantity ordered, so the first item that maps to
    // a preset is its headline; later items for the same preset get listed under it.
    const byPreset = new Map<number, SpoolSuggestion>();
    const suggestions: SpoolSuggestion[] = [];

    for (const item of queue) {
      // Only suggest loading a spool for things that actually need printing.
      // The global queue lists every selling SKU (most at quantity 0); a 0-qty
      // item would otherwise recommend a spool that only yields topup prints.
      if (item.quantity <= 0) continue;
      if (!item.module_id) continue;
      const module = moduleById.get(item.module_id);
      if (!module || !module.spool_preset_id) continue;
      if (printer?.printer_preset_id && module.printer_preset_id && module.printer_preset_id !== printer.printer_preset_id) continue;

      const presetId = Number(module.spool_preset_id);
      const existing = byPreset.get(presetId);
      if (existing) {
        const relieves = (existing.also_relieves ??= []);
        if (relieves.length < 3 && !relieves.some(r => r.object_name === item.object_name)) {
          relieves.push({ object_name: item.object_name, priority: item.priority });
        }
        continue;
      }

      const suggestion: SpoolSuggestion = {
        preset_id: presetId,
        priority: item.priority,
        object_name: item.object_name,
        in_stock: item.in_stock,
        daily_velocity: item.daily_velocity,
        days_until_stockout: item.days_until_stockout,
        module_id: module.id,
        module_name: module.name,
        reason: `Needed for "${module.name}" — queue qty ${item.quantity}, stock: ${item.in_stock}, velocity: ${item.daily_velocity}/day`,
        also_relieves: []
      };
      byPreset.set(presetId, suggestion);
      suggestions.push(suggestion);
    }

    return suggestions;
  }
}

// bucketPriority now lives in ./forecast (cycle-free home shared with the
// global print queue); re-exported here so existing imports keep working.
export { bucketPriority } from './forecast';

export interface SuggestedPrintQueueItem {
  module_id: number;
  module_name: string;
  object_name: string;
  // 'TOPUP' marks a filler print added to use up remaining spool weight, as
  // opposed to a demand-driven (needed) print.
  priority: InventoryPriority | 'TOPUP';
  // Days of cover left for the produced object (null if unknown / no velocity).
  days_left?: number | null;
  weight_of_print: number;
  spool_weight_after_print: number;
}

/**
 * Assigns from the global `print_queue` backlog (knapsack against this
 * printer's loaded spools) and writes `printer_queued_jobs`. Name/signature
 * kept stable — callers (dashboard, API) are unaware the source of truth
 * moved from "all inventory" to the global backlog.
 */
export async function generateAndSaveSuggestedQueue(
  db: D1Database,
  printerId: number
): Promise<SuggestedPrintQueueItem[]> {
  await regenerateGlobalQueueIfStale(db);
  await assignQueueToPrinter(db, printerId);

  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<{
    module_id: number;
    module_name: string;
    object_id: number | null;
    object_name: string | null;
    reason: InventoryPriority | 'TOPUP';
    weight: number;
  }>(sql`
    SELECT pqj.module_id, pm.name as module_name, pm.object_id, o.name as object_name, pqj.reason, pm.weight
    FROM printer_queued_jobs pqj
    JOIN print_modules pm ON pqj.module_id = pm.id
    LEFT JOIN objects o ON pm.object_id = o.id
    WHERE pqj.printer_id = ${printerId} AND pqj.is_completed = 0
    ORDER BY pqj.sort_order
  `);

  // Live days-of-cover per object, so the card can show "Xd left" on needed prints.
  const inv = await new AIContextBuilder(db).getInventoryWithVelocity();
  const coverByObject = new Map(inv.map((i) => [i.id, i.days_until_stockout]));

  const loadedSlots = await getLoadedSpools(db, printerId);
  let runningWeight = Math.min(
    ...loadedSlots.filter((s) => s.spool_id).map((s) => s.spool?.remaining_weight ?? 0),
    Infinity
  );
  if (!Number.isFinite(runningWeight)) runningWeight = 0;

  return (rows ?? []).map((r) => {
    runningWeight -= r.weight;
    return {
      module_id: r.module_id,
      module_name: r.module_name,
      object_name: r.object_name ?? '',
      priority: r.reason,
      days_left: r.object_id != null ? coverByObject.get(r.object_id) ?? null : null,
      weight_of_print: r.weight,
      spool_weight_after_print: runningWeight
    };
  });
}
