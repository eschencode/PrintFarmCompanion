import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';
import { AIContextBuilder } from './context-builder';
import { RISK_THRESHOLDS, type StockoutForecast, type Confidence } from './forecast';
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
  addPrinterQueuedJob,
} from '../server';
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
   * Returns spool presets ranked by which to load next.
   * Deduped by preset_id — the most urgent inventory item a preset can satisfy wins.
   */
  async suggestSpoolToLoad(printerId?: number): Promise<SpoolSuggestion[]> {
    const modules = await this.contextBuilder.getModulesContext();
    const aiContext = await this.contextBuilder.getAdjustedInventoryContext(modules);
    const prioritized = prioritizeInventoryFromContext(aiContext);

    const tierOrder: InventoryPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'VERY_LOW'];
    const orderedItems = tierOrder.flatMap(p =>
      prioritized[p].slice().sort((a, b) => b.stockout_risk - a.stockout_risk)
    );

    let printer: Awaited<ReturnType<typeof getPrinterById>> | null = null;
    if (printerId) {
      printer = await getPrinterById(this.db, printerId);
    }

    const isCompatibleModule = (m: ModuleContext, invId: number) => {
      if (m.object_id !== invId) return false;
      if (m.spool_preset_id === null || m.spool_preset_id === undefined) return false;
      if (printer?.printer_preset_id && m.printer_preset_id && m.printer_preset_id !== printer.printer_preset_id) return false;
      return true;
    };

    // orderedItems is sorted by tier then risk, so the first item that maps to a
    // preset is its headline; later items for the same preset get listed under it.
    const byPreset = new Map<number, SpoolSuggestion>();
    const suggestions: SpoolSuggestion[] = [];

    for (const invItem of orderedItems) {
      const module = modules.find(m => isCompatibleModule(m, invItem.id));
      if (!module || !module.spool_preset_id) continue;

      const presetId = Number(module.spool_preset_id);
      const existing = byPreset.get(presetId);
      if (existing) {
        const relieves = (existing.also_relieves ??= []);
        if (relieves.length < 3 && !relieves.some(r => r.object_name === invItem.name)) {
          relieves.push({ object_name: invItem.name, priority: invItem.priority });
        }
        continue;
      }

      const suggestion: SpoolSuggestion = {
        preset_id: presetId,
        priority: invItem.priority,
        object_name: invItem.name,
        in_stock: invItem.in_stock,
        daily_velocity: invItem.daily_velocity,
        days_until_stockout: invItem.days_until_stockout,
        module_id: module.id,
        module_name: module.name,
        reason: `Needed for "${module.name}" — stock: ${invItem.in_stock}, velocity: ${invItem.daily_velocity}/day`,
        also_relieves: []
      };
      byPreset.set(presetId, suggestion);
      suggestions.push(suggestion);
    }

    return suggestions;
  }
}

const RISK_TIER_ORDER: InventoryPriority[] = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Cap on how high a *risk-derived* tier can climb given forecast confidence.
// A low-data SKU shouldn't scream CRITICAL on a noisy bootstrap spike — but the
// hard min_threshold floor below still overrides this regardless of confidence.
const CONFIDENCE_MAX_RISK_TIER: Record<Confidence, InventoryPriority> = {
  high: 'CRITICAL',
  medium: 'HIGH',
  low: 'MEDIUM'
};

/** Bucket a single SKU from its stock, floor, stockout risk, and forecast confidence. */
export function bucketPriority(item: {
  in_stock: number;
  min_threshold: number;
  stockout_risk: number;
  confidence?: Confidence;
}): InventoryPriority {
  // Hard inventory floor — independent of forecast quality.
  if (item.in_stock <= item.min_threshold) return 'CRITICAL';

  let tier: InventoryPriority;
  if (item.stockout_risk >= RISK_THRESHOLDS.CRITICAL) tier = 'CRITICAL';
  else if (item.stockout_risk >= RISK_THRESHOLDS.HIGH) tier = 'HIGH';
  else if (item.stockout_risk >= RISK_THRESHOLDS.MEDIUM) tier = 'MEDIUM';
  else if (item.stockout_risk >= RISK_THRESHOLDS.LOW) tier = 'LOW';
  else tier = 'VERY_LOW';

  if (item.confidence) {
    const cap = CONFIDENCE_MAX_RISK_TIER[item.confidence];
    if (RISK_TIER_ORDER.indexOf(tier) > RISK_TIER_ORDER.indexOf(cap)) tier = cap;
  }
  return tier;
}

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
  priority: InventoryPriority;
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

export async function generateAndSaveSuggestedQueue(
  db: D1Database,
  printerId: number
): Promise<SuggestedPrintQueueItem[]> {
  // Clear this printer's pending queue first: otherwise its own old jobs
  // inflate adjusted stock and suppress the very items we're re-scoring.
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`DELETE FROM printer_queued_jobs WHERE printer_id = ${printerId} AND is_completed = 0`);

  const contextBuilder = new AIContextBuilder(db);
  const modules = await contextBuilder.getModulesContext();
  const aiContext = await contextBuilder.getAdjustedInventoryContext(modules);
  const prioritized = prioritizeInventoryFromContext(aiContext);

  const queue = await getSuggestedPrintQueue(db, printerId, prioritized, modules, contextBuilder.getForecast());

  for (let i = 0; i < queue.length; i++) {
    await addPrinterQueuedJob(db, {
      printerId,
      moduleId: queue[i].module_id,
      reason: queue[i].priority,
      sortOrder: i
    });
  }

  return queue;
}
