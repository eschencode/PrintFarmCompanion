import type { PageServerLoad, Actions } from './$types';
import { getAllObjects, recordSaleB2B } from '$lib/inventory_handler';
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

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);

  const [items, setDefinitions] = await Promise.all([
    getAllObjects(ctx),
    getSetDefinitions(ctx).catch(() => []),
  ]);

  return { items, setDefinitions };
};

export const actions: Actions = {
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
};
