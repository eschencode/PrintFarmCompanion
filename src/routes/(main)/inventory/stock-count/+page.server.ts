import type { PageServerLoad, Actions } from './$types';
import { getAllObjects, performManualCount } from '$lib/inventory_handler';
import { sql } from 'drizzle-orm';
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

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);

  const [items, setDefinitions, unitWeights] = await Promise.all([
    getAllObjects(ctx),
    getSetDefinitions(ctx).catch(() => []),
    getUnitWeights(ctx).catch(() => []),
  ]);

  return { items, setDefinitions, unitWeights };
};

export const actions: Actions = {
  applyStockCount: async ({ request, locals }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const entriesJson = formData.get('entries') as string;
    if (!entriesJson) return { success: false, error: 'No entries provided' };

    try {
      const entries: { id: number; count: number }[] = JSON.parse(entriesJson);
      let losses = 0, gains = 0;
      for (const entry of entries) {
        const result = await performManualCount(ctx, entry.id, entry.count);
        const delta = (result.data as any)?.discrepancy ?? 0;
        if (delta < 0) losses++; else if (delta > 0) gains++;
      }
      return { success: true, message: `Stock count applied: ${losses} losses, ${gains} gains` };
    } catch {
      return { success: false, error: 'Failed to apply stock count' };
    }
  },
};
