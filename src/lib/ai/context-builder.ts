import type { D1Database } from '@cloudflare/workers-types';
import type {
  InventoryWithVelocity,
  Printer,
  ModuleContext,
  AIRecommendationContext,
  SalesVelocity
} from '../types';

export class AIContextBuilder {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Get inventory with sales velocity data
   */
  async getInventoryWithVelocity(): Promise<InventoryWithVelocity[]> {
    const result = await this.db.prepare(`
      SELECT 
        i.slug,
        i.name,
        i.stock_count,
        i.min_threshold,
        i.stock_count - i.min_threshold as stock_above_min,
        COALESCE(SUM(CASE 
          WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-7 days') * 1000 
          THEN ABS(l.quantity) ELSE 0 
        END), 0) as sold_7d,
        COALESCE(SUM(CASE 
          WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-14 days') * 1000 
          THEN ABS(l.quantity) ELSE 0 
        END), 0) as sold_14d,
        COALESCE(SUM(CASE 
          WHEN l.change_type = 'sold_b2c' AND l.created_at > strftime('%s', 'now', '-30 days') * 1000 
          THEN ABS(l.quantity) ELSE 0 
        END), 0) as sold_30d
      FROM inventory i
      LEFT JOIN inventory_log l ON l.inventory_id = i.id
      GROUP BY i.id
    `).all<InventoryWithVelocity>();

    return result.results.map(row => ({
      ...row,
      daily_velocity: Math.round((row.sold_30d / 30) * 100) / 100,
      days_until_stockout: row.sold_30d > 0 
        ? Math.round((row.stock_count / (row.sold_30d / 30)) * 10) / 10 
        : 999
    }));
  }

  /**
   * Get all print modules with their context
   */
  async getModulesContext(): Promise<ModuleContext[]> {
    const result = await this.db.prepare(`
      SELECT 
        pm.id,
        pm.name,
        pm.inventory_slug,
        pm.expected_weight,
        pm.expected_time,
        pm.objects_per_print,
        pm.default_spool_preset_id as preset_id,
        sp.name as preset_name
      FROM print_modules pm
      LEFT JOIN spool_presets sp ON pm.default_spool_preset_id = sp.id
    `).all<ModuleContext>();

    return result.results;
  }


/**
 * Get all printers with their suggested queue (queued jobs)
 */
async getAllPrintersWithQueuedJobs(): Promise<Printer[]> {
  const result = await this.db.prepare(`
    SELECT 
      p.*,
      pj.module_id,
      pm.name as module_name,
      pj.status as job_status
    FROM printers p
    LEFT JOIN print_jobs pj ON pj.printer_id = p.id AND pj.status = 'queued'
    LEFT JOIN print_modules pm ON pj.module_id = pm.id
    ORDER BY p.id, pj.id
  `).all();

  // Group jobs by printer
  const printersMap = new Map<number, Printer>();
  for (const row of result.results || []) {
    if (!printersMap.has(row.id)) {
      printersMap.set(row.id, {
        id: row.id,
        name: row.name,
        model: row.model,
        status: row.status,
        loaded_spool_id: row.loaded_spool_id,
        total_hours: row.total_hours,
        suggested_queue: []
      });
    }
    if (row.module_id) {
      printersMap.get(row.id)!.suggested_queue!.push({
        module_id: row.module_id,
        module_name: row.module_name,
        status: row.job_status,
        fillament_left: row.filament_left
      });
    }
  }
  return Array.from(printersMap.values());
}

/**
 * Get adjusted inventory context for AI recommendation.
 * Adds queued jobs from all printers to inventory.
 */
async getAdjustedInventoryContext(modules: ModuleContext[]): Promise<AIRecommendationContext> {
  // 1. Get inventory with velocity
  const inventory = await this.getInventoryWithVelocity();

  // 2. Get all printers with their queued jobs
  const printers = await this.getAllPrintersWithQueuedJobs();

  // 3. Build a map of inventory_slug to inventory item
  const inventoryMap = new Map<string, InventoryWithVelocity>();
  inventory.forEach(item => inventoryMap.set(item.slug, { ...item }));

  // 4. For each printer's suggested_queue, add the planned objects to inventory
  for (const printer of printers) {
    if (!printer.suggested_queue) continue;
    for (const job of printer.suggested_queue) {
      // Find the module for this job
      const module = modules.find(m => m.id === job.module_id);
      if (!module || !module.inventory_slug) continue;
      const inv = inventoryMap.get(module.inventory_slug);
      if (inv) {
        // Add the objects_per_print to stock_count
        inv.stock_count += module.objects_per_print;
      }
    }
  }

  // 5. Return context
  return {
    adjustedInventory: Array.from(inventoryMap.values()),
    salesVelocity: Array.from(inventoryMap.values()).map(i => ({
      slug: i.slug,
      daily_velocity: i.daily_velocity
    }))
  } as AIRecommendationContext ; 
	}

}
