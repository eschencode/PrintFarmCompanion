import type { PageServerLoad, Actions } from './$types';
import {
  getAllInventoryItems,
  getAllRecentLogs,
  addStock,
  removeStock,
  performManualCount,
  setStock,
  addStockBySlug,
  recordSaleB2BBySlug,
  performManualCountBySlug
} from '$lib/inventory_handler';
import { AIContextBuilder } from '$lib/ai/context-builder';

// Types for set definitions and unit weights
interface SetComponent {
  inventory_slug: string;
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
  const result = await db.prepare(`
    SELECT sm.shopify_sku, sm.inventory_slug, sm.quantity, i.name as item_name
    FROM shopify_sku_mapping sm
    JOIN inventory i ON sm.inventory_slug = i.slug
    ORDER BY sm.shopify_sku, i.name
  `).all();
  
  const rows = (result.results || []) as { shopify_sku: string; inventory_slug: string; quantity: number; item_name: string }[];
  
  // Group by SKU
  const skuGroups: Record<string, { inventory_slug: string; quantity: number; item_name: string }[]> = {};
  for (const row of rows) {
    if (!skuGroups[row.shopify_sku]) skuGroups[row.shopify_sku] = [];
    skuGroups[row.shopify_sku].push(row);
  }
  
  // Only include SKUs that are true bundles (>1 component OR quantity > 1)
  const sets: SetDefinition[] = [];
  for (const [sku, components] of Object.entries(skuGroups)) {
    const isBundle = components.length > 1 || components.some(c => c.quantity > 1);
    if (!isBundle) continue;
    
    // Build a readable label
    const label = buildSetLabel(sku, components);
    
    sets.push({
      sku,
      label,
      components: components.map(c => ({
        inventory_slug: c.inventory_slug,
        quantity: c.quantity
      }))
    });
  }
  
  return sets;
}

function buildSetLabel(sku: string, components: { inventory_slug: string; quantity: number; item_name: string }[]): string {
  // Klopapierhalter bundles
  if (sku.startsWith('KLH/')) {
    const halter = components.find(c => c.inventory_slug.startsWith('klohalter-'));
    const stab = components.find(c => c.inventory_slug.startsWith('stab-'));
    if (halter && stab) {
      const halterColor = halter.item_name.split(' ').pop();
      const stabColor = stab.item_name.split(' ').pop();
      return `Klohalter Set: ${halterColor} / ${stabColor}`;
    }
  }
  
  // Haken 5er packs
  if (sku.startsWith('WH/K5/') || sku.startsWith('WH/S5/')) {
    const type = sku.startsWith('WH/K5/') ? 'Kleben' : 'Schrauben';
    const hooks = components.filter(c => c.inventory_slug.includes('haken-'));
    const colors = hooks.map(c => `${c.quantity}x ${c.item_name.split(' ').pop()}`).join(', ');
    return `5er Pack ${type}: ${colors}`;
  }
  
  // Fallback
  const parts = components.map(c => `${c.quantity}x ${c.item_name}`).join(', ');
  return `${sku}: ${parts}`;
}

// Get unit weights from print_modules (weight per batch / objects per print)
async function getUnitWeights(db: any): Promise<UnitWeight[]> {
  const result = await db.prepare(`
    SELECT 
      pm.inventory_slug,
      i.name,
      ROUND(CAST(pm.expected_weight AS FLOAT) / pm.objects_per_print, 1) as weight_per_unit
    FROM print_modules pm
    JOIN inventory i ON pm.inventory_slug = i.slug
    WHERE pm.inventory_slug IS NOT NULL
    GROUP BY pm.inventory_slug
  `).all();
  
  const rows = (result.results || []) as { inventory_slug: string; name: string; weight_per_unit: number }[];
  
  return rows.map(r => ({
    slug: r.inventory_slug,
    name: r.name,
    weight_per_unit: r.weight_per_unit
  }));
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  
  if (!db) {
    return { items: [], logs: [], error: 'Database not available', setDefinitions: [], unitWeights: [] };
  }

  const items = await getAllInventoryItems(db);
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
      const v = velocityList.find(v => v.slug === i.slug);
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

    return await addStock(db, id, quantity, reason);
  },

  // Remove stock manually
  removeStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const quantity = parseInt(formData.get('quantity') as string) || 1;
    const reason = formData.get('reason') as string || 'Manual remove';

    return await removeStock(db, id, quantity, reason);
  },

  // Set stock to specific value (manual count)
  setStock: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const id = parseInt(formData.get('id') as string);
    const count = parseInt(formData.get('count') as string);
    const reason = formData.get('reason') as string || undefined;

    return await performManualCount(db, id, count, reason);
  },

  // Bulk add from sets – decompose sets into individual items
  addSets: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    
    if (!entriesJson) return { success: false, error: 'No entries provided' };
    
    try {
      const entries: { sku: string; count: number }[] = JSON.parse(entriesJson);
      const results: { slug: string; quantity: number; success: boolean }[] = [];
      
      for (const entry of entries) {
        if (entry.count <= 0) continue;
        
        // Look up the set components from shopify_sku_mapping
        const components = await db.prepare(`
          SELECT inventory_slug, quantity 
          FROM shopify_sku_mapping 
          WHERE shopify_sku = ?
        `).bind(entry.sku).all();
        
        const rows = (components.results || []) as { inventory_slug: string; quantity: number }[];
        
        for (const comp of rows) {
          const totalQty = comp.quantity * entry.count;
          const result = await addStockBySlug(db, comp.inventory_slug, totalQty, `Set decompose: ${entry.count}x ${entry.sku}`);
          results.push({ slug: comp.inventory_slug, quantity: totalQty, success: result.success });
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
        const result = await addStockBySlug(db, entry.slug, entry.count, `Weight-based count`);
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

    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;

    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { sku: string; count: number }[] = JSON.parse(entriesJson);
      const results: { slug: string; quantity: number; success: boolean }[] = [];

      for (const entry of entries) {
        if (entry.count <= 0) continue;

        const components = await db.prepare(`
          SELECT inventory_slug, quantity
          FROM shopify_sku_mapping
          WHERE shopify_sku = ?
        `).bind(entry.sku).all();

        const rows = (components.results || []) as { inventory_slug: string; quantity: number }[];

        for (const comp of rows) {
          const totalQty = comp.quantity * entry.count;
          const result = await recordSaleB2BBySlug(db, comp.inventory_slug, totalQty, `B2B sale: ${entry.count}x ${entry.sku}`);
          results.push({ slug: comp.inventory_slug, quantity: totalQty, success: result.success });
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
        const result = await recordSaleB2BBySlug(db, entry.slug, entry.count, 'B2B direct sale');
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
        const result = await performManualCountBySlug(db, entry.slug, entry.count, 'Stock count session');
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
        const result = await addStockBySlug(db, entry.slug, entry.count, `Bulk inventory add`);
        results.push({ slug: entry.slug, quantity: entry.count, success: result.success });
      }
      
      return { success: true, message: `Added ${results.length} items in bulk`, data: results };
    } catch (error) {
      console.error('Error in bulk add:', error);
      return { success: false, error: 'Failed to perform bulk add' };
    }
  }
};
