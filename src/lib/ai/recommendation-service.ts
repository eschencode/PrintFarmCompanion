import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';
import { AIContextBuilder } from './context-builder';
import type {
  AIRecommendationContext,
  InventoryPriority,
  PrioritizedInventory,
  PrioritizedInventoryItem,
  ModuleContext
} from '../types';
import {
  getPrinterById,
  getSpoolById,
  getAllPrintModules
} from '../server';

export class AIRecommendationService {
  private db: D1Database;
  private ai: Ai;
  private contextBuilder: AIContextBuilder;

  constructor(db: D1Database, ai: Ai) {
    this.db = db;
    this.ai = ai;
    this.contextBuilder = new AIContextBuilder(db);
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

export async function testPrioritization(db: D1Database) {
  const contextBuilder = new AIContextBuilder(db);
  const modules = await contextBuilder.getModulesContext();
  const aiContext = await contextBuilder.getAdjustedInventoryContext(modules);

  const prioritized = prioritizeInventoryFromContext(aiContext);

  // Log the prioritized inventory
  for (const [priority, items] of Object.entries(prioritized)) {
    console.log(`\n=== ${priority} ===`);
    for (const item of items) {
      console.log(
        `- ${item.name} (slug: ${item.slug}): stock=${item.stock_count}, velocity=${item.daily_velocity}`
      );
    }
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
  module: any; // Use your Module type here
  weight: number;
  score: number;
  priority: InventoryPriority;
};

export async function getSuggestedPrintQueue(
  db: D1Database,
  printerId: number,
  prioritized: PrioritizedInventory
): Promise<SuggestedPrintQueueItem[]> {
  const contextBuilder = new AIContextBuilder(db);
  const printer = await getPrinterById(db, printerId);
  if (!printer || !printer.loaded_spool_id) return [];

  const loadedSpool = await getSpoolById(db, printer.loaded_spool_id);
  if (!loadedSpool) return [];

  const modules = await contextBuilder.getModulesContext();

  const printableModules = modules.filter(m =>
    m.preset_id === loadedSpool.preset_id &&
    (!m.printer_model || m.printer_model === printer.model) &&
    m.inventory_slug
  );

  const remainingWeight = Math.floor(loadedSpool.remaining_weight);
  if (remainingWeight <= 0) return [];

  // Helper to clone and find an item
  const getSimulatedItem = (inventory: PrioritizedInventory, slug: string) => {
    for (const items of Object.values(inventory)) {
      const found = items.find(i => i.slug === slug);
      if (found) return found;
    }
    return undefined;
  };

  // --- STEP 1: UNROLL THE PRINTS ---
  // We figure out the value of the 1st print, 2nd print, 3rd print of each module
  const unrolledItems: UnrolledItem[] = [];

  for (const module of printableModules) {
    // Deep clone the inventory so we can simulate for this specific module
    let simInventory = JSON.parse(JSON.stringify(prioritized)); 
    let accumulatedWeight = module.expected_weight;

    while (accumulatedWeight <= remainingWeight) {
      // Find the current priority of this item in our simulation
      let currentPriority: InventoryPriority = 'VERY_LOW';
      for (const [prio, items] of Object.entries(simInventory)) {
        if (items.some((i: any) => i.slug === module.inventory_slug)) {
          currentPriority = prio as InventoryPriority;
          break;
        }
      }

      // Calculate score: Massive points for priority + small points for weight (to minimize waste)
      const baseScore = PRIORITY_SCORES[currentPriority] || 0;
      const score = baseScore + (module.expected_weight * 0.01); 

      unrolledItems.push({
        module,
        weight: Math.round(module.expected_weight), // DP requires integer weights
        score,
        priority: currentPriority
      });

      // Simulate the inventory increasing so the next iteration naturally drops in priority
      const invItem = getSimulatedItem(simInventory, module.inventory_slug!);
      if (invItem) {
        invItem.stock_count += module.objects_per_print ?? 1;
      }
      
      // Re-run your prioritization logic on the simulated inventory here
      simInventory = prioritizeInventoryFromContext({
        adjustedInventory: Object.values(simInventory).flat() as any,
        salesVelocity: [] 
      });

      accumulatedWeight += module.expected_weight;
    }
  }

  // --- STEP 2: 0/1 KNAPSACK ALGORITHM ---
  // Find the absolute best combination of unrolled items to maximize score
  const dp = new Array(remainingWeight + 1).fill(0);
  const selectedItems: UnrolledItem[][] = Array.from({ length: remainingWeight + 1 }, () => []);

  for (const item of unrolledItems) {
    for (let w = remainingWeight; w >= item.weight; w--) {
      if (dp[w - item.weight] + item.score > dp[w]) {
        dp[w] = dp[w - item.weight] + item.score;
        selectedItems[w] = [...selectedItems[w - item.weight], item];
      }
    }
  }

  // Find the max score achieved
  let bestWeight = 0;
  let maxScore = -1;
  for (let w = 0; w <= remainingWeight; w++) {
    if (dp[w] > maxScore) {
      maxScore = dp[w];
      bestWeight = w;
    }
  }

  // --- STEP 3: FORMAT THE OUTPUT ---
  // The DP algorithm gives us the best items, but not in order. 
  // We sort them by priority so the printer prints CRITICAL stuff first.
  let optimalPrints = selectedItems[bestWeight];
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

  // Generate queue
  const queue = await getSuggestedPrintQueue(db, printerId, prioritized);

  // Save queue to printer
  await updatePrinter(db, printerId, {
    suggested_queue: JSON.stringify(queue)
  });

  return queue;
}