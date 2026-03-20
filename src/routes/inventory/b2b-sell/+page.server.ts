import type { PageServerLoad, Actions } from './$types';
import { getAllInventoryItems, recordSaleB2BBySlug } from '$lib/inventory_handler';

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
  const result = await db.prepare(`
    SELECT sm.shopify_sku, sm.inventory_slug, sm.quantity, i.name as item_name
    FROM shopify_sku_mapping sm
    JOIN inventory i ON sm.inventory_slug = i.slug
    ORDER BY sm.shopify_sku, i.name
  `).all();

  const rows = (result.results || []) as { shopify_sku: string; inventory_slug: string; quantity: number; item_name: string }[];

  const skuGroups: Record<string, { inventory_slug: string; quantity: number; item_name: string }[]> = {};
  for (const row of rows) {
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
      components: components.map(c => ({ inventory_slug: c.inventory_slug, quantity: c.quantity }))
    });
  }
  return sets;
}

function buildSetLabel(sku: string, components: { inventory_slug: string; quantity: number; item_name: string }[]): string {
  if (sku.startsWith('KLH/')) {
    const halter = components.find(c => c.inventory_slug.startsWith('klohalter-'));
    const stab = components.find(c => c.inventory_slug.startsWith('stab-'));
    if (halter && stab) {
      return `Klohalter Set: ${halter.item_name.split(' ').pop()} / ${stab.item_name.split(' ').pop()}`;
    }
  }
  if (sku.startsWith('WH/K5/') || sku.startsWith('WH/S5/')) {
    const type = sku.startsWith('WH/K5/') ? 'Kleben' : 'Schrauben';
    const hooks = components.filter(c => c.inventory_slug.includes('haken-'));
    const colors = hooks.map(c => `${c.quantity}x ${c.item_name.split(' ').pop()}`).join(', ');
    return `5er Pack ${type}: ${colors}`;
  }
  return `${sku}: ${components.map(c => `${c.quantity}x ${c.item_name}`).join(', ')}`;
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { items: [], setDefinitions: [] };

  const [items, setDefinitions] = await Promise.all([
    getAllInventoryItems(db),
    getSetDefinitions(db).catch(() => [])
  ]);

  return { items, setDefinitions };
};

export const actions: Actions = {
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
  }
};
