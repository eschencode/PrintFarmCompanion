import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';
import { AIContextBuilder } from './context-builder';
import { RISK_THRESHOLDS, type StockoutForecast } from './forecast';
import type {
  AIRecommendationContext,
  InventoryPriority,
  ObjectWithVelocity,
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

    const isCompatibleModule = (m: ModuleContext, invSku: string) => {
      if (m.object_sku !== invSku) return false;
      if (m.spool_preset_id === null || m.spool_preset_id === undefined) return false;
      if (printer?.printer_preset_id && m.printer_preset_id && m.printer_preset_id !== printer.printer_preset_id) return false;
      return true;
    };

    const seenPresets = new Set<number>();
    const suggestions: SpoolSuggestion[] = [];

    for (const invItem of orderedItems) {
      const module = modules.find(m => isCompatibleModule(m, invItem.sku));
      if (!module || !module.spool_preset_id) continue;

      const presetId = Number(module.spool_preset_id);
      if (seenPresets.has(presetId)) continue;
      seenPresets.add(presetId);

      suggestions.push({
        preset_id: presetId,
        priority: invItem.priority,
        object_sku: invItem.sku,
        object_name: invItem.name,
        in_stock: invItem.in_stock,
        daily_velocity: invItem.daily_velocity,
        days_until_stockout: invItem.days_until_stockout,
        module_id: module.id,
        module_name: module.name,
        reason: `Needed for "${module.name}" — stock: ${invItem.in_stock}, velocity: ${invItem.daily_velocity}/day`
      });
    }

    return suggestions;
  }
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
    let priority: InventoryPriority;

    if (item.in_stock <= item.min_threshold) {
      priority = 'CRITICAL';
    } else if (item.stockout_risk >= RISK_THRESHOLDS.CRITICAL) {
      priority = 'CRITICAL';
    } else if (item.stockout_risk >= RISK_THRESHOLDS.HIGH) {
      priority = 'HIGH';
    } else if (item.stockout_risk >= RISK_THRESHOLDS.MEDIUM) {
      priority = 'MEDIUM';
    } else if (item.stockout_risk >= RISK_THRESHOLDS.LOW) {
      priority = 'LOW';
    } else {
      priority = 'VERY_LOW';
    }

    prioritized[priority].push({
      sku: item.sku,
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
  object_sku: string;
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
    if (!m.object_sku) return false;
    if (m.printer_preset_id && printer.printer_preset_id) return m.printer_preset_id === printer.printer_preset_id;
    return true;
  });

  const remainingWeight = Math.floor(loadedSpool.remaining_weight);
  if (remainingWeight <= 0) return [];

  const getSimulatedItem = (inventory: PrioritizedInventory, sku: string) => {
    for (const items of Object.values(inventory)) {
      const found = (items as PrioritizedObjectItem[]).find(i => i.sku === sku);
      if (found) return found;
    }
    return undefined;
  };

  const unrolledItems: UnrolledItem[] = [];

  for (const module of printableModules) {
    let simInventory: PrioritizedInventory = JSON.parse(JSON.stringify(prioritized));
    let accumulatedWeight = module.weight;

    while (accumulatedWeight <= remainingWeight) {
      let currentPriority: InventoryPriority = 'VERY_LOW';
      let currentRisk = 0;
      for (const [prio, items] of Object.entries(simInventory)) {
        const match = (items as PrioritizedObjectItem[]).find(i => i.sku === module.object_sku);
        if (match) {
          currentPriority = prio as InventoryPriority;
          currentRisk = match.stockout_risk;
          break;
        }
      }

      const baseScore = PRIORITY_SCORES[currentPriority] || 0;
      const fillBonus = (module.weight / remainingWeight) * baseScore * 0.40;
      const score = baseScore + fillBonus;

      unrolledItems.push({
        module,
        weight: Math.round(module.weight),
        score,
        priority: currentPriority,
        stockout_risk: currentRisk
      });

      const invItem = getSimulatedItem(simInventory, module.object_sku!);
      if (invItem) {
        invItem.in_stock += module.objects_per_print ?? 1;
        invItem.stockout_risk = forecast.riskAtStock(invItem.sku, invItem.in_stock);
      }

      simInventory = prioritizeInventoryFromContext({
        adjustedInventory: Object.values(simInventory).flat() as ObjectWithVelocity[],
        salesVelocity: []
      });

      accumulatedWeight += module.weight;
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
      object_sku: print.module.object_sku!,
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
  const contextBuilder = new AIContextBuilder(db);
  const modules = await contextBuilder.getModulesContext();
  const aiContext = await contextBuilder.getAdjustedInventoryContext(modules);
  const prioritized = prioritizeInventoryFromContext(aiContext);

  const queue = await getSuggestedPrintQueue(db, printerId, prioritized, modules, contextBuilder.getForecast());

  // Clear old queued jobs and save new ones
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`DELETE FROM printer_queued_jobs WHERE printer_id = ${printerId} AND is_completed = 0`);
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
