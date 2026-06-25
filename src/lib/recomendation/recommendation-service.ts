import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';
import { AIContextBuilder } from './context-builder';
import { type StockoutForecast, bucketPriority } from './forecast';
import type {
  AIRecommendationContext,
  InventoryPriority,
  PrioritizedInventory,
  PrioritizedObjectItem,
  ModuleContext,
  SpoolSuggestion
} from '../types';
import {
  getPrinterById,
  getSpoolById,
  getLoadedSpools,
} from '../server';
import { regenerateGlobalQueueIfStale, assignQueueToPrinter, getGlobalQueue } from '../server/printQueue';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

export class AIRecommendationService {
  private db: D1Database;
  private ai: Ai;
  public contextBuilder: AIContextBuilder;

  constructor(db: D1Database, ai: Ai) {
    this.db = db;
    this.ai = ai;
    this.contextBuilder = new AIContextBuilder(db);
  }

  async getInventoryWithVelocity() {
    const modules = await this.contextBuilder.getModulesContext();
    const aiContext = await this.contextBuilder.getAdjustedInventoryContext(modules);
    return aiContext.adjustedInventory;
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

export function prioritizeInventoryFromContext(
  context: AIRecommendationContext
): PrioritizedInventory {
  const prioritized: PrioritizedInventory = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
    VERY_LOW: []
  };

  for (const item of context.adjustedInventory) {
    const priority = bucketPriority(item);

    prioritized[priority].push({
      id: item.id,
      name: item.name,
      in_stock: item.in_stock,
      min_threshold: item.min_threshold,
      daily_velocity: item.daily_velocity,
      days_until_stockout: item.days_until_stockout,
      stockout_risk: item.stockout_risk,
      confidence: item.confidence,
      priority
    });
  }

  return prioritized;
}


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

const PRIORITY_SCORES: Record<InventoryPriority, number> = {
  'CRITICAL': 100000,
  'HIGH':     10000,
  'MEDIUM':   1000,
  'LOW':      100,
  'VERY_LOW': 10
};

// Safety bound on knapsack item count: never simulate more than this many
// prints of one module (a 1000g spool / 5g module already saturates here).
const MAX_COPIES_PER_MODULE = 200;

type UnrolledItem = {
  module: ModuleContext;
  weight: number;
  score: number;
  priority: InventoryPriority;
  stockout_risk: number;
};

export async function getSuggestedPrintQueue(
  db: D1Database,
  printerId: number,
  prioritized: PrioritizedInventory,
  modules?: ModuleContext[],
  forecast?: StockoutForecast
): Promise<SuggestedPrintQueueItem[]> {
  const printer = await getPrinterById(db, printerId);
  if (!printer) return [];

  const loadedSlots = await getLoadedSpools(db, printerId);
  const slot0 = loadedSlots.find(s => s.slot_index === 0);
  if (!slot0?.spool_id) return [];

  const loadedSpool = await getSpoolById(db, slot0.spool_id);
  if (!loadedSpool) return [];

  if (!modules || !forecast) {
    const contextBuilder = new AIContextBuilder(db);
    if (!modules) modules = await contextBuilder.getModulesContext();
    if (!forecast) {
      await contextBuilder.getInventoryWithVelocity();
      forecast = contextBuilder.getForecast();
    }
  }

  const printableModules = modules.filter(m => {
    if (m.spool_preset_id !== loadedSpool.preset_id) return false;
    if (!m.object_id) return false;
    if (m.printer_preset_id && printer.printer_preset_id) return m.printer_preset_id === printer.printer_preset_id;
    return true;
  });

  const remainingWeight = Math.min(Math.floor(loadedSpool.remaining_weight), 10_000);
  if (remainingWeight <= 0) return [];

  // Index the adjusted inventory by object id so we can re-score a single SKU
  // as we simulate repeated prints — no full clone or re-bucket per iteration.
  const objectById = new Map<number, PrioritizedObjectItem>();
  for (const items of Object.values(prioritized)) {
    for (const it of items) objectById.set(it.id, it);
  }

  const unrolledItems: UnrolledItem[] = [];

  for (const module of printableModules) {
    const weight = Math.round(module.weight);
    if (weight <= 0 || module.object_id == null) continue;
    const base = objectById.get(module.object_id);
    if (!base) continue;

    const perPrint = module.objects_per_print ?? 1;
    const maxCopies = Math.min(Math.floor(remainingWeight / weight), MAX_COPIES_PER_MODULE);

    for (let k = 0; k < maxCopies; k++) {
      // Stock after k already-simulated copies of this module. Risk and bucket
      // drop monotonically as stock climbs, so later copies score lower.
      const simStock = base.in_stock + k * perPrint;
      const risk = forecast.riskAtStock(String(base.id), simStock);
      const priority = bucketPriority({
        in_stock: simStock,
        min_threshold: base.min_threshold,
        stockout_risk: risk,
        confidence: base.confidence
      });

      const baseScore = PRIORITY_SCORES[priority] || 0;
      const fillBonus = (module.weight / remainingWeight) * baseScore * 0.40;

      unrolledItems.push({
        module,
        weight,
        score: baseScore + fillBonus,
        priority,
        stockout_risk: risk
      });
    }
  }

  // 0/1 knapsack
  const dp = new Array(remainingWeight + 1).fill(0);
  const from: ({ prevWeight: number; item: UnrolledItem } | null)[] = new Array(remainingWeight + 1).fill(null);

  for (const item of unrolledItems) {
    for (let w = remainingWeight; w >= item.weight; w--) {
      const candidate = dp[w - item.weight] + item.score;
      if (candidate > dp[w]) {
        dp[w] = candidate;
        from[w] = { prevWeight: w - item.weight, item };
      }
    }
  }

  let bestWeight = 0;
  for (let w = 1; w <= remainingWeight; w++) {
    if (dp[w] > dp[bestWeight]) bestWeight = w;
  }

  const optimalPrints: UnrolledItem[] = [];
  let w = bestWeight;
  while (from[w] !== null) {
    optimalPrints.push(from[w]!.item);
    w = from[w]!.prevWeight;
  }

  optimalPrints.sort((a, b) => {
    const tier = PRIORITY_SCORES[b.priority] - PRIORITY_SCORES[a.priority];
    if (tier !== 0) return tier;
    return b.stockout_risk - a.stockout_risk;
  });

  const queue: SuggestedPrintQueueItem[] = [];
  let currentSpoolWeight = loadedSpool.remaining_weight;

  for (const print of optimalPrints) {
    currentSpoolWeight -= print.weight;
    queue.push({
      module_id: print.module.id,
      module_name: print.module.name,
      object_name: print.module.object_name ?? '',
      priority: print.priority,
      weight_of_print: print.weight,
      spool_weight_after_print: currentSpoolWeight
    });
  }

  return queue;
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
