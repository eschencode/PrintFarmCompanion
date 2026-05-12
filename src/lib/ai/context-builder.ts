import type { D1Database } from '@cloudflare/workers-types';
import type {
  InventoryWithVelocity,
  Printer,
  ModuleContext,
  AIRecommendationContext,
  SuggestedPrintQueueItem
} from '../types';
import {
  StockoutForecast,
  FORECAST_LOOKBACK_DAYS,
  confidenceFromDaysWithSales
} from './forecast';

function computeStockout(stock: number, velocity: number): number {
  return velocity > 0 ? Math.round((stock / velocity) * 10) / 10 : 999;
}

const MS_PER_DAY = 86_400_000;

export class AIContextBuilder {
  private db: D1Database;
  private forecast = new StockoutForecast();

  constructor(db: D1Database) {
    this.db = db;
  }

  /** The bootstrap forecast, populated by getInventoryWithVelocity. */
  getForecast(): StockoutForecast {
    return this.forecast;
  }

  /**
   * Inventory with bootstrap-derived stockout risk over the next horizon days.
   * Daily sales over the lookback window are aggregated in SQL, then resampled
   * with replacement in JS to estimate P(demand >= stock).
   */
  async getInventoryWithVelocity(): Promise<InventoryWithVelocity[]> {
    const inventoryResult = await this.db.prepare(`
      SELECT id, slug, name, stock_count, min_threshold
      FROM inventory
    `).all<{ id: number; slug: string; name: string; stock_count: number; min_threshold: number }>();

    const dailyResult = await this.db.prepare(`
      SELECT
        l.inventory_id,
        CAST(l.created_at / ${MS_PER_DAY} AS INTEGER) as day_bucket,
        SUM(ABS(l.quantity)) as daily_sold
      FROM inventory_log l
      WHERE l.change_type IN ('sold_b2c', 'sold_b2b')
        AND l.created_at > strftime('%s', 'now', '-${FORECAST_LOOKBACK_DAYS} days') * 1000
      GROUP BY l.inventory_id, day_bucket
    `).all<{ inventory_id: number; day_bucket: number; daily_sold: number }>();

    const todayBucket = Math.floor(Date.now() / MS_PER_DAY);
    const startBucket = todayBucket - (FORECAST_LOOKBACK_DAYS - 1);

    const salesByInventory = new Map<number, number[]>();
    for (const row of dailyResult.results) {
      const idx = row.day_bucket - startBucket;
      if (idx < 0 || idx >= FORECAST_LOOKBACK_DAYS) continue;
      let arr = salesByInventory.get(row.inventory_id);
      if (!arr) {
        arr = new Array(FORECAST_LOOKBACK_DAYS).fill(0);
        salesByInventory.set(row.inventory_id, arr);
      }
      arr[idx] = row.daily_sold;
    }

    return inventoryResult.results.map(item => {
      const dailySales = salesByInventory.get(item.id) ?? new Array(FORECAST_LOOKBACK_DAYS).fill(0);

      this.forecast.fit(item.slug, dailySales);
      const stockout_risk = this.forecast.riskAtStock(item.slug, item.stock_count);

      let total = 0;
      let daysWithSales = 0;
      for (const v of dailySales) {
        total += v;
        if (v > 0) daysWithSales++;
      }
      const daily_velocity = Math.round((total / FORECAST_LOOKBACK_DAYS) * 100) / 100;
      const days_until_stockout = computeStockout(item.stock_count, daily_velocity);
      const confidence = confidenceFromDaysWithSales(daysWithSales);

      return {
        slug: item.slug,
        name: item.name,
        stock_count: item.stock_count,
        min_threshold: item.min_threshold,
        daily_velocity,
        days_until_stockout,
        stockout_risk,
        confidence,
        days_with_sales: daysWithSales
      };
    });
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
        sp.name as preset_name,
        pm.printer_model,
        pm.printer_model_id
      FROM print_modules pm
      LEFT JOIN spool_presets sp ON pm.default_spool_preset_id = sp.id
      WHERE pm.active = 1
    `).all<ModuleContext>();

    return result.results;
  }


/**
 * Get all printers with their suggested queue (queued jobs)
 */
async getAllPrintersWithQueuedJobs(): Promise<Printer[]> {
  type PrinterRow = Printer & { module_id: number | null; module_name: string | null; job_status: string | null };
  const result = await this.db.prepare(`
    SELECT
      p.*,
      pj.module_id,
      pm.name as module_name,
      pj.status as job_status
    FROM printers p
    LEFT JOIN print_jobs pj ON pj.printer_id = p.id AND pj.status IN ('queued', 'printing')
    LEFT JOIN print_modules pm ON pj.module_id = pm.id
    ORDER BY p.id, pj.id
  `).all<PrinterRow>();

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
        printer_model_id: null,
        printer_ip: null,
        printer_serial: null,
        printer_access_code: null,
        transport: 'auto',
        suggested_queue: []
      });
    }
    if (row.module_id) {
      printersMap.get(row.id)!.suggested_queue!.push({
        module_id: row.module_id,
        module_name: row.module_name ?? '',
        status: row.job_status ?? ''
      } as unknown as SuggestedPrintQueueItem);
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
        inv.stock_count += module.objects_per_print;
        inv.days_until_stockout = computeStockout(inv.stock_count, inv.daily_velocity);
        inv.stockout_risk = this.forecast.riskAtStock(inv.slug, inv.stock_count);
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
