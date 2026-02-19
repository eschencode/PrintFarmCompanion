import type { D1Database } from '@cloudflare/workers-types';
import type {
  InventoryWithVelocity,
  ModuleContext,
  PrinterContext,
  AIRecommendationContext
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
   * Get all printers with their loaded spools and suggested queue
   */
  async getPrintersContext(): Promise<PrinterContext[]> {
    const result = await this.db.prepare(`
      SELECT 
        p.id,
        p.name,
        p.status,
        p.suggested_queue,
        s.id as spool_id,
        s.preset_id,
        sp.name as preset_name,
        sp.color,
        s.remaining_weight
      FROM printers p
      LEFT JOIN spools s ON s.id = p.loaded_spool_id
      LEFT JOIN spool_presets sp ON s.preset_id = sp.id
    `).all();

    return result.results.map((row: any) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      loaded_spool: row.spool_id ? {
        id: row.spool_id,
        preset_id: row.preset_id,
        preset_name: row.preset_name,
        color: row.color,
        remaining_weight: row.remaining_weight,
        printer_id: row.id,
        printer_name: row.name
      } : null,
      suggested_queue: row.suggested_queue ? JSON.parse(row.suggested_queue) : []
    }));
  }

  /**
   * Build full context for AI recommendation
   */
  async buildContext(
    printerId: number,
    type: 'spool_selection' | 'module_selection'
  ): Promise<AIRecommendationContext> {
    const [inventory, modules, printers] = await Promise.all([
      this.getInventoryWithVelocity(),
      this.getModulesContext(),
      this.getPrintersContext()
    ]);

    const currentPrinter = printers.find(p => p.id === printerId);
    if (!currentPrinter) {
      throw new Error(`Printer ${printerId} not found`);
    }

    // For module_selection, filter modules compatible with loaded spool
    let availableModules = modules;
    if (type === 'module_selection' && currentPrinter.loaded_spool) {
      availableModules = modules.filter(
        m => !m.preset_id || m.preset_id === currentPrinter.loaded_spool!.preset_id
      );
    }

    return {
      type,
      printer: currentPrinter,
      available_spools: [], // Not needed here, but keep for type compatibility
      available_modules: availableModules,
      inventory,
      other_printers: printers.filter(p => p.id !== printerId)
    };
  }
}