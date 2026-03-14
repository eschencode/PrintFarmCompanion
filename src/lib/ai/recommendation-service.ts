import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';
import { AIContextBuilder } from './context-builder';
import type {
  AIRecommendationContext,
  InventoryPriority,
  InventoryWithVelocity,
  PrioritizedInventory,
  PrioritizedInventoryItem,
  ModuleContext
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
   * Suggests the best spool preset to load next for a given printer,
   * based on inventory priority and sales trends.
   */
  async suggestSpoolToLoad(
    printerId?: number
  ): Promise<{ preset_id: number; preset_name: string; reason: string } | null> {
    const modules = await this.contextBuilder.getModulesContext();
    const aiContext = await this.contextBuilder.getAdjustedInventoryContext(modules);
    const prioritized = prioritizeInventoryFromContext(aiContext);

    // Flat sorted list: CRITICAL first, then HIGH, etc.
    const orderedItems = [
      ...prioritized.CRITICAL,
      ...prioritized.HIGH,
      ...prioritized.MEDIUM,
      ...prioritized.LOW,
      ...prioritized.VERY_LOW,
    ];

    // Optionally restrict to modules compatible with the given printer model
    let printer: Awaited<ReturnType<typeof getPrinterById>> | null = null;
    if (printerId) {
      printer = await getPrinterById(this.db, printerId);
    }

    for (const invItem of orderedItems) {
      // Find a module that produces this inventory item and has a preset assigned
      const module = modules.find(m => {
        if (m.inventory_slug !== invItem.slug) return false;
        if (m.preset_id === null || m.preset_id === undefined) return false;
        if (printer?.model && m.printer_model && m.printer_model !== printer.model) return false;
        return true;
      });
      if (!module || !module.preset_id || !module.preset_name) continue;

      return {
        preset_id: Number(module.preset_id),
        preset_name: module.preset_name,
        reason: `Needed for "${module.name}" — stock: ${invItem.stock_count}, velocity: ${invItem.daily_velocity}/day`
      };
    }

    return null;
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

    // Example logic (adjust thresholds as needed)
    if (item.days_until_stockout <= 2 ){//|| item.stock_count <= item.min_threshold) {
      priority = 'CRITICAL';
    } else if (item.days_until_stockout <= 10) {
      priority = 'HIGH';
    } else if (item.days_until_stockout <= 25) {
      priority = 'MEDIUM';
    } else if (item.days_until_stockout <= 35) {
      priority = 'LOW';
    } else {
      priority = 'VERY_LOW';
    }

    prioritized[priority].push({
      slug: item.slug,
      name: item.name,
      stock_count: item.stock_count,
      daily_velocity: item.daily_velocity,
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
};





export async function getSuggestedPrintQueue(
  db: D1Database,
  printerId: number,
  prioritized: PrioritizedInventory,
  modules?: ModuleContext[]
): Promise<SuggestedPrintQueueItem[]> {
  const printer = await getPrinterById(db, printerId);
  if (!printer || !printer.loaded_spool_id) return [];

  const loadedSpool = await getSpoolById(db, printer.loaded_spool_id);
  if (!loadedSpool) return [];

  if (!modules) {
    const contextBuilder = new AIContextBuilder(db);
    modules = await contextBuilder.getModulesContext();
  }

  const printableModules = modules.filter(m =>
    m.preset_id === loadedSpool.preset_id &&
    (!m.printer_model || m.printer_model === printer.model) &&
    m.inventory_slug
  );

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
      for (const [prio, items] of Object.entries(simInventory)) {
        if (items.some((i: PrioritizedInventoryItem) => i.slug === module.inventory_slug)) {
          currentPriority = prio as InventoryPriority;
          break;
        }
      }

      const baseScore = PRIORITY_SCORES[currentPriority] || 0;
      // Fill bonus: reward heavier prints (less waste) up to 15% of the priority score.
      // Scales within a tier so it never overrides a priority difference.
      const fillBonus = (module.expected_weight / remainingWeight) * baseScore * 0.15;
      const score = baseScore + fillBonus;

      unrolledItems.push({
        module,
        weight: Math.round(module.expected_weight),
        score,
        priority: currentPriority
      });

      const invItem = getSimulatedItem(simInventory, module.inventory_slug!);
      if (invItem) {
        invItem.stock_count += module.objects_per_print ?? 1;
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
  // Sort by priority so CRITICAL prints happen first.
  optimalPrints.sort((a, b) => PRIORITY_SCORES[b.priority] - PRIORITY_SCORES[a.priority]);

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

  // Generate queue — pass modules so getSuggestedPrintQueue doesn't re-fetch them
  const queue = await getSuggestedPrintQueue(db, printerId, prioritized, modules);

  // Save queue to printer
  await updatePrinter(db, printerId, {
    suggested_queue: JSON.stringify(queue)
  });

  return queue;
}

