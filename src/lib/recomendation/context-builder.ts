import type { D1Database } from '@cloudflare/workers-types';
import type {
  ObjectWithVelocity,
  ModuleContext,
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

  async getInventoryWithVelocity(): Promise<ObjectWithVelocity[]> {
    const drizzleDb = getDb(this.db);
    const inventoryRows = await drizzleDb.all<{ id: number; name: string; in_stock: number; min_threshold: number }>(sql`
      SELECT id, name, in_stock, min_threshold FROM objects
    `);

    const nowSec = Math.floor(Date.now() / 1000);
    const todayBucket = Math.floor(nowSec / SEC_PER_DAY);

    // Effective tracking window: dividing by a fixed 90 days when sales have only
    // been recorded for, say, 20 days understates velocity ~4.5× (and inflates
    // days-of-cover). Use the actual elapsed window since the first recorded
    // sale, capped at FORECAST_LOOKBACK_DAYS. Days before tracking began were
    // never zero-demand — they just weren't measured — so they must not dilute.
    const firstSaleRow = await drizzleDb.get<{ first: number | null }>(sql`
      SELECT MIN(created_at) as first FROM inventory_log
      WHERE change_type IN ('- sold b2c', '- sold b2b')
    `);
    const firstBucket = firstSaleRow?.first ? Math.floor(firstSaleRow.first / SEC_PER_DAY) : todayBucket;
    const windowDays = Math.min(FORECAST_LOOKBACK_DAYS, Math.max(1, todayBucket - firstBucket + 1));

    const cutoffSec = nowSec - windowDays * SEC_PER_DAY;
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

    const startBucket = todayBucket - (windowDays - 1);

    const salesByObject = new Map<number, number[]>();
    for (const row of (dailyRows ?? [])) {
      const idx = row.day_bucket - startBucket;
      if (idx < 0 || idx >= windowDays) continue;
      let arr = salesByObject.get(row.object_id);
      if (!arr) {
        arr = new Array(windowDays).fill(0);
        salesByObject.set(row.object_id, arr);
      }
      arr[idx] = row.daily_sold;
    }

    return (inventoryRows ?? []).map(item => {
      const dailySales = salesByObject.get(item.id) ?? new Array(windowDays).fill(0);
      const key = String(item.id);

      this.forecast.fit(key, dailySales);
      const stockout_risk = this.forecast.riskAtStock(key, item.in_stock);

      let total = 0;
      let daysWithSales = 0;
      for (const v of dailySales) {
        total += v;
        if (v > 0) daysWithSales++;
      }
      const daily_velocity = Math.round((total / windowDays) * 100) / 100;
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
        days_with_sales: daysWithSales,
        demand_p50: Math.round(this.forecast.quantile(key, 0.5)),
        demand_p90: Math.round(this.forecast.quantile(key, 0.9))
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
}
