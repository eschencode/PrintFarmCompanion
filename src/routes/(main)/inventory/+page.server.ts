import type { PageServerLoad, Actions } from './$types';
import {
  getAllObjects,
  getAllRecentLogs,
  addStock,
  removeStock,
  performManualCount,
  recordSaleB2B,
} from '$lib/inventory_handler';
import { AIContextBuilder } from '$lib/recomendation/context-builder';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

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

async function getSetDefinitions(db: any): Promise<SetDefinition[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all(sql`
    SELECT sm.shopify_sku, sm.quantity, o.id as object_id, o.name as item_name
    FROM shopify_sku_mapping sm
    JOIN objects o ON sm.object_id = o.id
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

async function getUnitWeights(db: any): Promise<UnitWeight[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all(sql`
    SELECT o.id, o.name,
           ROUND(CAST(pm.weight AS FLOAT) / pm.objects_per_print, 1) as weight_per_unit
    FROM print_modules pm
    JOIN objects o ON pm.object_id = o.id
    WHERE pm.object_id IS NOT NULL AND pm.active = 1
    GROUP BY pm.object_id
  `);
  return (rows || []) as UnitWeight[];
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { items: [], logs: [], setDefinitions: [], unitWeights: [] };

  const items = await getAllObjects(db);
  const logs = await getAllRecentLogs(db, 50);

  let setDefinitions: SetDefinition[] = [];
  let unitWeights: UnitWeight[] = [];
  try {
    [setDefinitions, unitWeights] = await Promise.all([
      getSetDefinitions(db),
      getUnitWeights(db),
    ]);
  } catch (err) {
    console.error('Failed to load set definitions or unit weights:', err);
  }

  try {
    const builder = new AIContextBuilder(db);
    const velocityList = await builder.getInventoryWithVelocity();
    const itemsWithVelocity = items.map(i => {
      const v = velocityList.find(v => v.id === i.id);
      return {
        ...i,
        daily_velocity: v?.daily_velocity ?? 0,
        days_until_stockout: v?.days_until_stockout ?? 999,
      };
    });
    return { items: itemsWithVelocity, logs, setDefinitions, unitWeights };
  } catch {
    return { items, logs, setDefinitions, unitWeights };
  }
};

export const actions: Actions = {
  addStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    return addStock(db, id, quantity);
  },

  removeStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    return removeStock(db, id, quantity);
  },

  setStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const count = parseInt(formData.get('count') as string);
    return performManualCount(db, id, count);
  },

  // Bulk add from set bundles
  addSets: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
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
          await addStock(db, comp.object_id, comp.quantity * entry.count);
          total++;
        }
      }
      return { success: true, message: `Processed ${total} stock additions from sets` };
    } catch (error) {
      return { success: false, error: 'Failed to process sets' };
    }
  },

  addByWeight: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      for (const entry of entries) {
        if (entry.count > 0) await addStock(db, entry.id, entry.count);
      }
      return { success: true, message: `Added ${entries.filter(e => e.count > 0).length} items by weight` };
    } catch {
      return { success: false, error: 'Failed to add by weight' };
    }
  },

  b2bSellSets: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
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
          await recordSaleB2B(db, comp.object_id, comp.quantity * entry.count);
          total++;
        }
      }
      return { success: true, message: `Processed ${total} B2B sales from sets` };
    } catch {
      return { success: false, error: 'Failed to process B2B set sale' };
    }
  },

  b2bSellDirect: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      for (const entry of entries) {
        if (entry.count > 0) await recordSaleB2B(db, entry.id, entry.count);
      }
      return { success: true, message: `Recorded ${entries.filter(e => e.count > 0).length} B2B direct sales` };
    } catch {
      return { success: false, error: 'Failed to record B2B direct sale' };
    }
  },

  applyStockCount: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      for (const entry of entries) {
        await performManualCount(db, entry.id, entry.count);
      }
      return { success: true, message: `Stock count applied for ${entries.length} items` };
    } catch {
      return { success: false, error: 'Failed to apply stock count' };
    }
  },

  bulkAdd: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      for (const entry of entries) {
        if (entry.count > 0) await addStock(db, entry.id, entry.count);
      }
      return { success: true, message: `Bulk added ${entries.filter(e => e.count > 0).length} items` };
    } catch {
      return { success: false, error: 'Failed to perform bulk add' };
    }
  },
};
