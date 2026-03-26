import type { PageServerLoad, Actions } from './$types';
import { getAllInventoryItems, performManualCountBySlug } from '$lib/inventory_handler';

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
  weight_per_unit: number;
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
  return rows.map(r => ({ slug: r.inventory_slug, name: r.name, weight_per_unit: r.weight_per_unit }));
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { items: [], setDefinitions: [], unitWeights: [] };

  const [items, setDefinitions, unitWeights] = await Promise.all([
    getAllInventoryItems(db),
    getSetDefinitions(db).catch(() => []),
    getUnitWeights(db).catch(() => [])
  ]);

  return { items, setDefinitions, unitWeights };
};

export const actions: Actions = {
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
  }
};
