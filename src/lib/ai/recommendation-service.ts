import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';
import { AIContextBuilder } from './context-builder';
import { RISK_THRESHOLDS, type StockoutForecast } from './forecast';
import type {
  AIRecommendationContext,
  InventoryPriority,
  InventoryWithVelocity,
  PrioritizedInventory,
  PrioritizedInventoryItem,
  ModuleContext,
  SpoolSuggestion
} from '../types';
import {
  getPrinterById,
  getSpoolById,
  getAllPrintModules,
  updatePrinter
} from '../server';

export class AIRecommendationService {
  private db: D1Database;
  private ai: Ai;
  public contextBuilder: AIContextBuilder;

  constructor(db: D1Database, ai: Ai) {
    this.db = db;
    this.ai = ai;
    this.contextBuilder = new AIContextBuilder(db);
  }

  /**
   * Gets inventory with velocity information.
   */
  async getInventoryWithVelocity() {
    const modules = await this.contextBuilder.getModulesContext();
    const aiContext = await this.contextBuilder.getAdjustedInventoryContext(modules);
    return aiContext.adjustedInventory;
  }

  /**
   * Returns spool presets ranked by which to load next.
   * Deduped by preset_id — the most urgent inventory item a preset can satisfy wins.
   * Entries are ordered CRITICAL → VERY_LOW, then by days_until_stockout ascending.
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

    const isCompatibleModule = (m: ModuleContext, invSlug: string) => {
      if (m.inventory_slug !== invSlug) return false;
      if (m.preset_id === null || m.preset_id === undefined) return false;
      if (printer?.printer_model_id && m.printer_model_id && m.printer_model_id !== printer.printer_model_id) return false;
      if (!printer?.printer_model_id && printer?.model && m.printer_model && m.printer_model !== printer.model) return false;
      return true;
    };

    const seenPresets = new Set<number>();
    const suggestions: SpoolSuggestion[] = [];

    for (const invItem of orderedItems) {
      const module = modules.find(m => isCompatibleModule(m, invItem.slug));
      if (!module || !module.preset_id || !module.preset_name) continue;

      const presetId = Number(module.preset_id);
      if (seenPresets.has(presetId)) continue;
      seenPresets.add(presetId);

      suggestions.push({
        preset_id: presetId,
        preset_name: module.preset_name,
        priority: invItem.priority,
        inventory_slug: invItem.slug,
        inventory_name: invItem.name,
        stock_count: invItem.stock_count,
        daily_velocity: invItem.daily_velocity,
        days_until_stockout: invItem.days_until_stockout,
        module_id: module.id,
        module_name: module.name,
        reason: `Needed for "${module.name}" — stock: ${invItem.stock_count}, velocity: ${invItem.daily_velocity}/day`
      });
    }

    return suggestions;
  }
}

/**
 * Assigns a priority to each inventory item and groups them.
 */
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

    if (item.stock_count <= item.min_threshold) {
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
      slug: item.slug,
      name: item.name,
      stock_count: item.stock_count,
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
  inventory_slug: string;
  priority: InventoryPriority;
  weight_of_print: number;
  spool_weight_after_print: number;
}
// Define scores to heavily favor priority, but use weight as a tie-breaker
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
  if (!printer || !printer.loaded_spool_id) return [];

  const loadedSpool = await getSpoolById(db, printer.loaded_spool_id);
  if (!loadedSpool) return [];

  if (!modules || !forecast) {
    const contextBuilder = new AIContextBuilder(db);
    if (!modules) modules = await contextBuilder.getModulesContext();
    if (!forecast) {
      // Need to populate the forecast — getInventoryWithVelocity does the fit.
      await contextBuilder.getInventoryWithVelocity();
      forecast = contextBuilder.getForecast();
    }
  }

  const printableModules = modules.filter(m => {
    if (m.preset_id !== loadedSpool.preset_id) return false;
    if (!m.inventory_slug) return false;
    // Use printer_model_id for matching when available, fall back to text
    if (m.printer_model_id && printer.printer_model_id) return m.printer_model_id === printer.printer_model_id;
    if (m.printer_model && printer.model) return m.printer_model === printer.model;
    return true; // No model restriction
  });

  const remainingWeight = Math.floor(loadedSpool.remaining_weight);
  if (remainingWeight <= 0) return [];

  const getSimulatedItem = (inventory: PrioritizedInventory, slug: string) => {
    for (const items of Object.values(inventory)) {
      const found = items.find(i => i.slug === slug);
      if (found) return found;
    }
    return undefined;
  };

  // --- STEP 1: UNROLL THE PRINTS ---
  // Calculate score for the 1st, 2nd, 3rd... print of each module, simulating
  // how inventory priority drops as we plan more of the same item.
  const unrolledItems: UnrolledItem[] = [];

  for (const module of printableModules) {
    let simInventory: PrioritizedInventory = JSON.parse(JSON.stringify(prioritized));
    let accumulatedWeight = module.expected_weight;

    while (accumulatedWeight <= remainingWeight) {
      let currentPriority: InventoryPriority = 'VERY_LOW';
      let currentRisk = 0;
      for (const [prio, items] of Object.entries(simInventory)) {
        const match = (items as PrioritizedInventoryItem[]).find(i => i.slug === module.inventory_slug);
        if (match) {
          currentPriority = prio as InventoryPriority;
          currentRisk = match.stockout_risk;
          break;
        }
      }

      const baseScore = PRIORITY_SCORES[currentPriority] || 0;
      // Fill bonus: reward heavier prints (less waste) up to 40% of the priority score.
      const fillBonus = (module.expected_weight / remainingWeight) * baseScore * 0.40;
      const score = baseScore + fillBonus;

      unrolledItems.push({
        module,
        weight: Math.round(module.expected_weight),
        score,
        priority: currentPriority,
        stockout_risk: currentRisk
      });

      const invItem = getSimulatedItem(simInventory, module.inventory_slug!);
      if (invItem) {
        invItem.stock_count += module.objects_per_print ?? 1;
        invItem.stockout_risk = forecast.riskAtStock(invItem.slug, invItem.stock_count);
      }

      simInventory = prioritizeInventoryFromContext({
        adjustedInventory: Object.values(simInventory).flat() as InventoryWithVelocity[],
        salesVelocity: []
      });

      accumulatedWeight += module.expected_weight;
    }
  }

  // --- STEP 2: 0/1 KNAPSACK ALGORITHM ---
  // Backtrack table instead of copying arrays at every slot — O(n*W) time, O(W) memory.
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

  // Find the weight with highest score
  let bestWeight = 0;
  for (let w = 1; w <= remainingWeight; w++) {
    if (dp[w] > dp[bestWeight]) bestWeight = w;
  }

  // Reconstruct selected items via backtrack
  const optimalPrints: UnrolledItem[] = [];
  let w = bestWeight;
  while (from[w] !== null) {
    optimalPrints.push(from[w]!.item);
    w = from[w]!.prevWeight;
  }

  // --- STEP 3: FORMAT THE OUTPUT ---
  // Sort by priority so CRITICAL prints happen first; within a tier, most urgent first.
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
      inventory_slug: print.module.inventory_slug!,
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
  // Build context and prioritized inventory
  const contextBuilder = new AIContextBuilder(db);
  const modules = await contextBuilder.getModulesContext();
  const aiContext = await contextBuilder.getAdjustedInventoryContext(modules);
  const prioritized = prioritizeInventoryFromContext(aiContext);

  // Generate queue — pass modules and the populated forecast so we don't re-fit.
  const queue = await getSuggestedPrintQueue(db, printerId, prioritized, modules, contextBuilder.getForecast());

  // Save queue to printer
  await updatePrinter(db, printerId, {
    suggested_queue: JSON.stringify(queue)
  });

  return queue;
}

