import type { PageServerLoad, Actions } from './$types';
import {
  getAllObjects,
  getAllRecentLogs,
  addStock,
  removeStock,
  performManualCount,
  addStockBySku,
  recordSaleB2BBySku,
  performManualCountBySku
} from '$lib/inventory_handler';
import { AIContextBuilder } from '$lib/recomendation/context-builder';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

// Types for set definitions and unit weights
interface SetComponent {
  object_sku: string;
  quantity: number;
}

interface SetDefinition {
  sku: string;
  label: string;
  components: SetComponent[];
}

interface UnitWeight {
  slug: string;
  name: string;
  weight_per_unit: number; // grams per single object
}

// Get unique set definitions from shopify_sku_mapping (bundles with multiple components)
async function getSetDefinitions(db: any): Promise<SetDefinition[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all(sql`
    SELECT sm.shopify_sku, sm.quantity, o.sku as object_sku, o.name as item_name
    FROM shopify_sku_mapping sm
    JOIN objects o ON sm.object_id = o.id
    ORDER BY sm.shopify_sku, o.name
  `);

  const typedRows = (rows || []) as { shopify_sku: string; object_sku: string; quantity: number; item_name: string }[];

  const skuGroups: Record<string, { object_sku: string; quantity: number; item_name: string }[]> = {};
  for (const row of typedRows) {
    if (!skuGroups[row.shopify_sku]) skuGroups[row.shopify_sku] = [];
    skuGroups[row.shopify_sku].push(row);
  }

  const sets: SetDefinition[] = [];
  for (const [sku, components] of Object.entries(skuGroups)) {
    const isBundle = components.length > 1 || components.some(c => c.quantity > 1);
    if (!isBundle) continue;

    const label = buildSetLabel(sku, components);
    sets.push({
      sku,
      label,
      components: components.map(c => ({ object_sku: c.object_sku, quantity: c.quantity }))
    });
  }

  return sets;
}

function buildSetLabel(sku: string, components: { object_sku: string; quantity: number; item_name: string }[]): string {
  const parts = components.map(c => c.quantity > 1 ? `${c.quantity}× ${c.item_name}` : c.item_name).join(' + ');
  return `${sku}: ${parts}`;
}

async function getUnitWeights(db: any): Promise<UnitWeight[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all(sql`
    SELECT
      o.sku,
      o.name,
      ROUND(CAST(pm.weight AS FLOAT) / pm.objects_per_print, 1) as weight_per_unit
    FROM print_modules pm
    JOIN objects o ON pm.object_id = o.id
    WHERE pm.object_id IS NOT NULL
    GROUP BY pm.object_id
  `);

  const typedRows = (rows || []) as { sku: string; name: string; weight_per_unit: number }[];

  return typedRows.map(r => ({
    slug: r.sku,
    name: r.name,
    weight_per_unit: r.weight_per_unit
  }));
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  
  if (!db) {
    return { items: [], logs: [], error: 'Database not available', setDefinitions: [], unitWeights: [] };
  }

  const items = await getAllObjects(db);
  const logs = await getAllRecentLogs(db, 50);
  
  // Load set definitions and unit weights for inventory check tool
  let setDefinitions: SetDefinition[] = [];
  let unitWeights: UnitWeight[] = [];
  try {
    [setDefinitions, unitWeights] = await Promise.all([
      getSetDefinitions(db),
      getUnitWeights(db)
    ]);
  } catch (err) {
    console.error('Failed to load set definitions or unit weights:', err);
  }

  // ✅ Attach velocity & days_until_stockout to each item
  try {
    const builder = new AIContextBuilder(db);
    const velocityList = await builder.getInventoryWithVelocity();
    const itemsWithVelocity = items.map(i => {
      const v = velocityList.find(v => v.sku === i.sku);
      return {
        ...i,
        daily_velocity: v?.daily_velocity ?? 0,
        days_until_stockout: v?.days_until_stockout ?? 999
      };
    });

    return { items: itemsWithVelocity, logs, setDefinitions, unitWeights };
  } catch (err) {
    console.error('Failed to compute inventory velocity:', err);
    return { items, logs, setDefinitions, unitWeights };
  }
};

export const actions: Actions = {
  // Add stock manually
  addStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    const reason = formData.get('reason') as string || 'Manual add';

    return await addStock(db, id, quantity);
  },

  // Remove stock manually
  removeStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    const reason = formData.get('reason') as string || 'Manual remove';

    return await removeStock(db, id, quantity);
  },

  // Set stock to specific value (manual count)
  setStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const count = parseInt(formData.get('count') as string);
    const reason = formData.get('reason') as string || undefined;

    return await performManualCount(db, id, count);
  },

  // Bulk add from sets – decompose sets into individual items
  addSets: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const drizzleDb = getDb(db);

    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    
    if (!entriesJson) return { success: false, error: 'No entries provided' };
    
    try {
      const entries: { sku: string; count: number }[] = JSON.parse(entriesJson);
      const results: { slug: string; quantity: number; success: boolean }[] = [];
      
      for (const entry of entries) {
        if (entry.count <= 0) continue;
        
        const components = await drizzleDb.all(sql`
          SELECT o.sku as object_sku, sm.quantity
          FROM shopify_sku_mapping sm
          JOIN objects o ON sm.object_id = o.id
          WHERE sm.shopify_sku = ${entry.sku}
        `);

        const rows = (components || []) as { object_sku: string; quantity: number }[];

        for (const comp of rows) {
          const totalQty = comp.quantity * entry.count;
          const result = await addStockBySku(db, comp.object_sku, totalQty);
          results.push({ slug: comp.object_sku, quantity: totalQty, success: result.success });
        }
      }
      
      return { success: true, message: `Processed ${results.length} stock additions from sets`, data: results };
    } catch (error) {
      console.error('Error processing sets:', error);
      return { success: false, error: 'Failed to process sets' };
    }
  },

  // Bulk add from weight – convert total weight to item count
  addByWeight: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    
    if (!entriesJson) return { success: false, error: 'No entries provided' };
    
    try {
      const entries: { slug: string; count: number }[] = JSON.parse(entriesJson);
      const results: { slug: string; quantity: number; success: boolean }[] = [];
      
      for (const entry of entries) {
        if (entry.count <= 0) continue;
        const result = await addStockBySku(db, entry.slug, entry.count);
        results.push({ slug: entry.slug, quantity: entry.count, success: result.success });
      }
      
      return { success: true, message: `Added ${results.length} items by weight`, data: results };
    } catch (error) {
      console.error('Error adding by weight:', error);
      return { success: false, error: 'Failed to add by weight' };
    }
  },

  // B2B sell by sets – decompose sets and remove stock
  b2bSellSets: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };
    const drizzleDb = getDb(db);

    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;

    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { sku: string; count: number }[] = JSON.parse(entriesJson);
      const results: { slug: string; quantity: number; success: boolean }[] = [];

      for (const entry of entries) {
        if (entry.count <= 0) continue;

        const components = await drizzleDb.all(sql`
          SELECT o.sku as object_sku, sm.quantity
          FROM shopify_sku_mapping sm
          JOIN objects o ON sm.object_id = o.id
          WHERE sm.shopify_sku = ${entry.sku}
        `);

        const rows = (components || []) as { object_sku: string; quantity: number }[];

        for (const comp of rows) {
          const totalQty = comp.quantity * entry.count;
          const result = await recordSaleB2BBySku(db, comp.object_sku, totalQty);
          results.push({ slug: comp.object_sku, quantity: totalQty, success: result.success });
        }
      }

      return { success: true, message: `Processed ${results.length} B2B stock removals from sets`, data: results };
    } catch (error) {
      console.error('Error processing B2B set sale:', error);
      return { success: false, error: 'Failed to process B2B set sale' };
    }
  },

  // B2B sell direct – remove exact counts from individual items
  b2bSellDirect: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;

    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { slug: string; count: number }[] = JSON.parse(entriesJson);
      const results: { slug: string; quantity: number; success: boolean }[] = [];

      for (const entry of entries) {
        if (entry.count <= 0) continue;
        const result = await recordSaleB2BBySku(db, entry.slug, entry.count);
        results.push({ slug: entry.slug, quantity: entry.count, success: result.success });
      }

      return { success: true, message: `Recorded ${results.length} B2B direct sales`, data: results };
    } catch (error) {
      console.error('Error in B2B direct sale:', error);
      return { success: false, error: 'Failed to record B2B direct sale' };
    }
  },

  // Apply stock count – set stock to physically counted values and record discrepancies
  applyStockCount: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;

    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { slug: string; count: number }[] = JSON.parse(entriesJson);
      const results: { slug: string; success: boolean; delta?: number }[] = [];

      for (const entry of entries) {
        const result = await performManualCountBySku(db, entry.slug, entry.count);
        results.push({ slug: entry.slug, success: result.success, delta: (result.data as any)?.difference });
      }

      const losses = results.filter(r => r.success && (r.delta ?? 0) < 0);
      const gains  = results.filter(r => r.success && (r.delta ?? 0) > 0);
      return {
        success: true,
        message: `Stock count applied: ${losses.length} losses, ${gains.length} gains`,
        data: results
      };
    } catch (error) {
      console.error('Error applying stock count:', error);
      return { success: false, error: 'Failed to apply stock count' };
    }
  },

  // Bulk direct add – add exact counts to multiple items at once
  bulkAdd: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    
    if (!entriesJson) return { success: false, error: 'No entries provided' };
    
    try {
      const entries: { slug: string; count: number }[] = JSON.parse(entriesJson);
      const results: { slug: string; quantity: number; success: boolean }[] = [];
      
      for (const entry of entries) {
        if (entry.count <= 0) continue;
        const result = await addStockBySku(db, entry.slug, entry.count);
        results.push({ slug: entry.slug, quantity: entry.count, success: result.success });
      }
      
      return { success: true, message: `Added ${results.length} items in bulk`, data: results };
    } catch (error) {
      console.error('Error in bulk add:', error);
      return { success: false, error: 'Failed to perform bulk add' };
    }
  }
};
