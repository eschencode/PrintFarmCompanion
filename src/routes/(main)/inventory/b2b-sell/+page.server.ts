import type { PageServerLoad, Actions } from './$types';
import { getAllObjects, recordSaleB2BBySku } from '$lib/inventory_handler';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

interface SetComponent {
  inventory_slug: string;
  quantity: number;
}

interface SetDefinition {
  sku: string;
  label: string;
  components: SetComponent[];
}

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
    sets.push({
      sku,
      label: buildSetLabel(sku, components),
      components: components.map(c => ({ inventory_slug: c.object_sku, quantity: c.quantity }))
    });
  }
  return sets;
}

function buildSetLabel(sku: string, components: { object_sku: string; quantity: number; item_name: string }[]): string {
  if (sku.startsWith('KLH/')) {
    const halter = components.find(c => c.object_sku.startsWith('klohalter-'));
    const stab = components.find(c => c.object_sku.startsWith('stab-'));
    if (halter && stab) {
      return `Klohalter Set: ${halter.item_name.split(' ').pop()} / ${stab.item_name.split(' ').pop()}`;
    }
  }
  if (sku.startsWith('WH/K5/') || sku.startsWith('WH/S5/')) {
    const type = sku.startsWith('WH/K5/') ? 'Kleben' : 'Schrauben';
    const hooks = components.filter(c => c.object_sku.includes('haken-'));
    const colors = hooks.map(c => `${c.quantity}x ${c.item_name.split(' ').pop()}`).join(', ');
    return `5er Pack ${type}: ${colors}`;
  }
  return `${sku}: ${components.map(c => `${c.quantity}x ${c.item_name}`).join(', ')}`;
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { items: [], setDefinitions: [] };

  const [items, setDefinitions] = await Promise.all([
    getAllObjects(db),
    getSetDefinitions(db).catch(() => [])
  ]);

  return { items, setDefinitions };
};

export const actions: Actions = {
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
  }
};
