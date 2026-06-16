import type { D1Database } from '@cloudflare/workers-types';
import type {
  ObjectWithVelocity,
  ModuleContext,
  AIRecommendationContext,
} from '../types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  StockoutForecast,
  FORECAST_LOOKBACK_DAYS,
  confidenceFromDaysWithSales
} from './forecast';

function computeStockout(stock: number, velocity: number): number {
  if (velocity <= 0) return 999;
  // Already out (or oversold) → 0 days, never negative.
  return Math.max(0, Math.round((stock / velocity) * 10) / 10);
}

// inventory_log.created_at is stored in Unix SECONDS, so all bucketing math
// here works in seconds — not milliseconds.
const SEC_PER_DAY = 86_400;

export class AIContextBuilder {
  private db: D1Database;
  private forecast = new StockoutForecast();

  constructor(db: D1Database) {
    this.db = db;
  }

  getForecast(): StockoutForecast {
    return this.forecast;
  }

  async getInventoryWithVelocity(): Promise<ObjectWithVelocity[]> {
    const drizzleDb = getDb(this.db);
    const inventoryRows = await drizzleDb.all<{ id: number; name: string; in_stock: number; min_threshold: number }>(sql`
      SELECT id, name, in_stock, min_threshold FROM objects
    `);

    const nowSec = Math.floor(Date.now() / 1000);
    const cutoffSec = nowSec - FORECAST_LOOKBACK_DAYS * SEC_PER_DAY;
    const dailyRows = await drizzleDb.all<{ object_id: number; day_bucket: number; daily_sold: number }>(sql`
      SELECT
        l.object_id,
        CAST(l.created_at / ${SEC_PER_DAY} AS INTEGER) as day_bucket,
        SUM(ABS(l.quantity)) as daily_sold
      FROM inventory_log l
      WHERE l.change_type IN ('- sold b2c', '- sold b2b')
        AND l.created_at > ${cutoffSec}
      GROUP BY l.object_id, day_bucket
    `);

    const todayBucket = Math.floor(nowSec / SEC_PER_DAY);
    const startBucket = todayBucket - (FORECAST_LOOKBACK_DAYS - 1);

    const salesByObject = new Map<number, number[]>();
    for (const row of (dailyRows ?? [])) {
      const idx = row.day_bucket - startBucket;
      if (idx < 0 || idx >= FORECAST_LOOKBACK_DAYS) continue;
      let arr = salesByObject.get(row.object_id);
      if (!arr) {
        arr = new Array(FORECAST_LOOKBACK_DAYS).fill(0);
        salesByObject.set(row.object_id, arr);
      }
      arr[idx] = row.daily_sold;
    }

    return (inventoryRows ?? []).map(item => {
      const dailySales = salesByObject.get(item.id) ?? new Array(FORECAST_LOOKBACK_DAYS).fill(0);
      const key = String(item.id);

      this.forecast.fit(key, dailySales);
      const stockout_risk = this.forecast.riskAtStock(key, item.in_stock);

      let total = 0;
      let daysWithSales = 0;
      for (const v of dailySales) {
        total += v;
        if (v > 0) daysWithSales++;
      }
      const daily_velocity = Math.round((total / FORECAST_LOOKBACK_DAYS) * 100) / 100;
      const days_until_stockout = computeStockout(item.in_stock, daily_velocity);
      const confidence = confidenceFromDaysWithSales(daysWithSales);

      return {
        id: item.id,
        name: item.name,
        in_stock: item.in_stock,
        min_threshold: item.min_threshold,
        daily_velocity,
        days_until_stockout,
        stockout_risk,
        confidence,
        days_with_sales: daysWithSales
      };
    });
  }

  async getModulesContext(): Promise<ModuleContext[]> {
    const drizzleDb = getDb(this.db);
    const rows = await drizzleDb.all<ModuleContext>(sql`
      SELECT
        pm.id,
        pm.name,
        pm.object_id,
        pm.weight,
        pm.expected_time_minutes,
        pm.objects_per_print,
        pm.printer_preset_id,
        o.name as object_name,
        mfs.spool_preset_id
      FROM print_modules pm
      LEFT JOIN objects o ON pm.object_id = o.id
      LEFT JOIN module_filament_slots mfs ON pm.id = mfs.module_id AND mfs.slot_index = 0
      WHERE pm.active = 1
    `);
    return rows ?? [];
  }

  private async getAllPrintersWithQueuedJobs(): Promise<Array<{ id: number; module_ids: number[] }>> {
    const drizzleDb = getDb(this.db);
    const rows = await drizzleDb.all<{ printer_id: number; module_id: number }>(sql`
      SELECT printer_id, module_id
      FROM printer_queued_jobs
      WHERE is_completed = 0
      ORDER BY printer_id, sort_order
    `);

    const printerMap = new Map<number, number[]>();
    for (const row of (rows ?? [])) {
      let arr = printerMap.get(row.printer_id);
      if (!arr) {
        arr = [];
        printerMap.set(row.printer_id, arr);
      }
      arr.push(row.module_id);
    }

    return Array.from(printerMap.entries()).map(([id, module_ids]) => ({ id, module_ids }));
  }

  async getAdjustedInventoryContext(modules: ModuleContext[]): Promise<AIRecommendationContext> {
    const inventory = await this.getInventoryWithVelocity();
    const printers = await this.getAllPrintersWithQueuedJobs();

    const inventoryMap = new Map<number, ObjectWithVelocity>();
    inventory.forEach(item => inventoryMap.set(item.id, { ...item }));

    for (const printer of printers) {
      for (const moduleId of printer.module_ids) {
        const module = modules.find(m => m.id === moduleId);
        if (!module || !module.object_id) continue;
        const inv = inventoryMap.get(module.object_id);
        if (inv) {
          inv.in_stock += module.objects_per_print;
          inv.days_until_stockout = computeStockout(inv.in_stock, inv.daily_velocity);
          inv.stockout_risk = this.forecast.riskAtStock(String(inv.id), inv.in_stock);
        }
      }
    }

    return {
      adjustedInventory: Array.from(inventoryMap.values()),
      salesVelocity: Array.from(inventoryMap.values()).map(i => ({
        object_id: i.id,
        daily_velocity: i.daily_velocity
      }))
    };
  }
}
