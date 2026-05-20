import type { PageServerLoad, Actions } from './$types';
import { getAllObjects, performManualCountBySku } from '$lib/inventory_handler';
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

interface UnitWeight {
  slug: string;
  name: string;
  weight_per_unit: number;
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
  return typedRows.map(r => ({ slug: r.sku, name: r.name, weight_per_unit: r.weight_per_unit }));
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { items: [], setDefinitions: [], unitWeights: [] };

  const [items, setDefinitions, unitWeights] = await Promise.all([
    getAllObjects(db),
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
  }
};
