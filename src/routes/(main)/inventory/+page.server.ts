import type { PageServerLoad, Actions } from './$types';
import {
  getAllObjects,
  getAllRecentLogs,
  addStock,
  removeStock,
  performManualCount,
  recordSaleB2B,
} from '$lib/inventory_handler';
import {
  getAllCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  assignObjectCategory,
} from '$lib/server';
import { AIContextBuilder } from '$lib/recomendation/context-builder';
import { regenerateGlobalQueueIfStale, regenerateGlobalQueue, getGlobalQueue } from '$lib/server/printQueue';
import type { PrintQueueItem } from '$lib/types';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';
import { requireCtx, type TenantContext } from '$lib/server/context';

interface SetComponent {
  object_id: number;
  quantity: number;
}

interface SetDefinition {
  shopify_sku: string;
  label: string;
  components: SetComponent[];
}

interface UnitWeight {
  id: number;
  name: string;
  weight_per_unit: number;
}

async function getSetDefinitions(ctx: TenantContext): Promise<SetDefinition[]> {
  const rows = await ctx.db.all(sql`
    SELECT sm.shopify_sku, sm.quantity, o.id as object_id, o.name as item_name
    FROM shopify_sku_mapping sm
    JOIN objects o ON sm.object_id = o.id
    WHERE o.workspace_id = ${ctx.workspaceId}
    ORDER BY sm.shopify_sku, o.name
  `);

  const typedRows = (rows || []) as { shopify_sku: string; object_id: number; quantity: number; item_name: string }[];

  const groups: Record<string, typeof typedRows> = {};
  for (const row of typedRows) {
    if (!groups[row.shopify_sku]) groups[row.shopify_sku] = [];
    groups[row.shopify_sku].push(row);
  }

  const sets: SetDefinition[] = [];
  for (const [shopify_sku, components] of Object.entries(groups)) {
    const isBundle = components.length > 1 || components.some(c => c.quantity > 1);
    if (!isBundle) continue;
    const label = `${shopify_sku}: ${components.map(c => c.quantity > 1 ? `${c.quantity}× ${c.item_name}` : c.item_name).join(' + ')}`;
    sets.push({
      shopify_sku,
      label,
      components: components.map(c => ({ object_id: c.object_id, quantity: c.quantity })),
    });
  }
  return sets;
}

async function getUnitWeights(ctx: TenantContext): Promise<UnitWeight[]> {
  const rows = await ctx.db.all(sql`
    SELECT o.id, o.name,
           ROUND(CAST(pm.weight AS FLOAT) / pm.objects_per_print, 1) as weight_per_unit
    FROM print_modules pm
    JOIN objects o ON pm.object_id = o.id
    WHERE pm.object_id IS NOT NULL AND pm.active = 1
      AND o.workspace_id = ${ctx.workspaceId}
    GROUP BY pm.object_id
  `);
  return (rows || []) as UnitWeight[];
}

interface ProductionStat {
  object_id: number;
  weight_per_unit: number;
  minutes_per_unit: number;
  objects_per_print: number;
}

// Per-object production effort from its active print module: filament grams and
// print minutes per finished unit. Drives the "cost to refill" hint (C).
async function getProductionStats(db: any): Promise<ProductionStat[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all(sql`
    SELECT pm.object_id,
           ROUND(CAST(pm.weight AS FLOAT) / pm.objects_per_print, 1) as weight_per_unit,
           ROUND(CAST(pm.expected_time_minutes AS FLOAT) / pm.objects_per_print, 1) as minutes_per_unit,
           pm.objects_per_print
    FROM print_modules pm
    WHERE pm.object_id IS NOT NULL AND pm.active = 1
    GROUP BY pm.object_id
  `);
  return (rows || []) as ProductionStat[];
}

interface SalesWindow {
  object_id: number;
  sold_7d: number;
  sold_30d: number;
}

// Recent sell-through per object over two windows, for the weekly-throughput KPI
// and the per-row demand trend arrow (7d rate vs the 30d-implied rate).
async function getSalesWindows(ctx: TenantContext): Promise<SalesWindow[]> {
  const now = Math.floor(Date.now() / 1000);
  const cutoff7 = now - 7 * 86_400;
  const cutoff30 = now - 30 * 86_400;
  const rows = await ctx.db.all(sql`
    SELECT object_id,
           SUM(CASE WHEN created_at > ${cutoff7} THEN ABS(quantity) ELSE 0 END) as sold_7d,
           SUM(ABS(quantity)) as sold_30d
    FROM inventory_log
    WHERE workspace_id = ${ctx.workspaceId}
      AND change_type IN ('- sold b2c', '- sold b2b')
      AND created_at > ${cutoff30}
    GROUP BY object_id
  `);
  return (rows || []) as SalesWindow[];
}

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = platform?.env?.DB;
  if (!db) return { items: [], logs: [], setDefinitions: [], unitWeights: [], categories: [], globalQueue: [] };
  const ctx = requireCtx(locals);

  // Keep the global backlog fresh on visit, then read it as the single source of
  // truth for the "Print queue" panel (same table that feeds printer assignment).
  await regenerateGlobalQueueIfStale(db);
  let globalQueue: PrintQueueItem[] = [];
  try {
    globalQueue = await getGlobalQueue(db);
  } catch (err) {
    console.error('Failed to load global print queue:', err);
  }

  const items = await getAllObjects(ctx);
  const logs = await getAllRecentLogs(ctx, 50);
  const categories = await getAllCategories(db);

  let setDefinitions: SetDefinition[] = [];
  let unitWeights: UnitWeight[] = [];
  let productionStats: ProductionStat[] = [];
  let salesWindows: SalesWindow[] = [];
  try {
    [setDefinitions, unitWeights, productionStats, salesWindows] = await Promise.all([
      getSetDefinitions(ctx),
      getUnitWeights(ctx),
      getProductionStats(db),
      getSalesWindows(ctx),
    ]);
  } catch (err) {
    console.error('Failed to load set/weight/production/sales data:', err);
  }

  const prodById = new Map(productionStats.map(p => [p.object_id, p]));
  const salesById = new Map(salesWindows.map(s => [s.object_id, s]));
  const weeklyThroughput = salesWindows.reduce((sum, s) => sum + (s.sold_7d ?? 0), 0);

  try {
    const builder = new AIContextBuilder(db);
    const velocityList = await builder.getInventoryWithVelocity();
    const itemsWithVelocity = items.map(i => {
      const v = velocityList.find(v => v.id === i.id);
      const p = prodById.get(i.id);
      const s = salesById.get(i.id);
      return {
        ...i,
        daily_velocity: v?.daily_velocity ?? 0,
        days_until_stockout: v?.days_until_stockout ?? 999,
        stockout_risk: v?.stockout_risk ?? 0,
        confidence: v?.confidence ?? 'low',
        days_with_sales: v?.days_with_sales ?? 0,
        demand_p50: v?.demand_p50 ?? 0,
        demand_p90: v?.demand_p90 ?? 0,
        weight_per_unit: p?.weight_per_unit ?? null,
        minutes_per_unit: p?.minutes_per_unit ?? null,
        sold_7d: s?.sold_7d ?? 0,
        sold_30d: s?.sold_30d ?? 0,
      };
    });
    return { items: itemsWithVelocity, logs, setDefinitions, unitWeights, categories, weeklyThroughput, globalQueue };
  } catch {
    return { items, logs, setDefinitions, unitWeights, categories, weeklyThroughput, globalQueue };
  }
};

export const actions: Actions = {
  // Force a full rebuild (used by the "Print queue" button). Unlike the lazy
  // staleness check, this also picks up changes that don't write inventory_log
  // (e.g. module weight / preferred-module edits).
  regenerateQueue: async ({ platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    await regenerateGlobalQueue(db);
    return { success: true };
  },

  addStock: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    return addStock(ctx, id, quantity);
  },

  removeStock: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    return removeStock(ctx, id, quantity);
  },

  setStock: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const count = parseInt(formData.get('count') as string);
    return performManualCount(ctx, id, count);
  },

  createCategory: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const name = (formData.get('name') as string) ?? '';
    const parentRaw = formData.get('parentId') as string | null;
    const parentId = parentRaw ? parseInt(parentRaw) : null;
    return createCategory(db, name, parentId);
  },

  renameCategory: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const name = (formData.get('name') as string) ?? '';
    return renameCategory(db, id, name);
  },

  deleteCategory: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    return deleteCategory(db, id);
  },

  assignCategory: async ({ request, platform, locals }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const objectId = parseInt(formData.get('objectId') as string);
    const categoryRaw = formData.get('categoryId') as string | null;
    const categoryId = categoryRaw ? parseInt(categoryRaw) : null;
    return assignObjectCategory(db, ctx.workspaceId, objectId, categoryId);
  },

  // Bulk add from set bundles
  addSets: async ({ request, platform, locals }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const ctx = requireCtx(locals);
    const drizzleDb = getDb(db);
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { shopify_sku: string; count: number }[] = JSON.parse(entriesJson);
      let total = 0;
      for (const entry of entries) {
        if (entry.count <= 0) continue;
        const components = await drizzleDb.all(sql`
          SELECT sm.object_id, sm.quantity
          FROM shopify_sku_mapping sm
          WHERE sm.shopify_sku = ${entry.shopify_sku}
        `);
        for (const comp of (components || []) as { object_id: number; quantity: number }[]) {
          await addStock(ctx, comp.object_id, comp.quantity * entry.count);
          total++;
        }
      }
      return { success: true, message: `Processed ${total} stock additions from sets` };
    } catch (error) {
      return { success: false, error: 'Failed to process sets' };
    }
  },

  addByWeight: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      for (const entry of entries) {
        if (entry.count > 0) await addStock(ctx, entry.id, entry.count);
      }
      return { success: true, message: `Added ${entries.filter(e => e.count > 0).length} items by weight` };
    } catch {
      return { success: false, error: 'Failed to add by weight' };
    }
  },

  b2bSellSets: async ({ request, platform, locals }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const ctx = requireCtx(locals);
    const drizzleDb = getDb(db);
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { shopify_sku: string; count: number }[] = JSON.parse(entriesJson);
      let total = 0;
      for (const entry of entries) {
        if (entry.count <= 0) continue;
        const components = await drizzleDb.all(sql`
          SELECT sm.object_id, sm.quantity FROM shopify_sku_mapping sm WHERE sm.shopify_sku = ${entry.shopify_sku}
        `);
        for (const comp of (components || []) as { object_id: number; quantity: number }[]) {
          await recordSaleB2B(ctx, comp.object_id, comp.quantity * entry.count);
          total++;
        }
      }
      return { success: true, message: `Processed ${total} B2B sales from sets` };
    } catch {
      return { success: false, error: 'Failed to process B2B set sale' };
    }
  },

  b2bSellDirect: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      for (const entry of entries) {
        if (entry.count > 0) await recordSaleB2B(ctx, entry.id, entry.count);
      }
      return { success: true, message: `Recorded ${entries.filter(e => e.count > 0).length} B2B direct sales` };
    } catch {
      return { success: false, error: 'Failed to record B2B direct sale' };
    }
  },

  applyStockCount: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      for (const entry of entries) {
        await performManualCount(ctx, entry.id, entry.count);
      }
      return { success: true, message: `Stock count applied for ${entries.length} items` };
    } catch {
      return { success: false, error: 'Failed to apply stock count' };
    }
  },

  bulkAdd: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      for (const entry of entries) {
        if (entry.count > 0) await addStock(ctx, entry.id, entry.count);
      }
      return { success: true, message: `Bulk added ${entries.filter(e => e.count > 0).length} items` };
    } catch {
      return { success: false, error: 'Failed to perform bulk add' };
    }
  },
};
