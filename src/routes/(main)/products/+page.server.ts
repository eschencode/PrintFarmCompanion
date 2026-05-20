import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';
import { getAllObjects, createObject, updateObject, deleteObject } from '$lib/inventory_handler';

export interface ProductModule {
  id: number;
  name: string;
  weight: number | null;
  objects_per_print: number;
  printer_preset_name: string | null;
}

export interface ProductSkuMapping {
  shopify_sku: string;
  quantity: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  in_stock: number;
  min_threshold: number;
  modules: ProductModule[];
  skus: ProductSkuMapping[];
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { products: [], categories: [] };

  const drizzleDb = getDb(db);
  const [items, moduleRows, skuRows] = await Promise.all([
    getAllObjects(db),
    drizzleDb.all(sql`
      SELECT pm.id, pm.name, pm.weight, pm.objects_per_print, pm.object_id,
             pp.brand || ' ' || pp.model AS printer_preset_name
      FROM print_modules pm
      LEFT JOIN printer_presets pp ON pm.printer_preset_id = pp.id
      WHERE pm.object_id IS NOT NULL AND pm.active = 1
      ORDER BY pm.name ASC
    `),
    drizzleDb.all(sql`
      SELECT sm.shopify_sku, sm.quantity, sm.object_id
      FROM shopify_sku_mapping sm
      ORDER BY sm.shopify_sku ASC
    `),
  ]);

  const modules = (moduleRows || []) as { id: number; name: string; weight: number | null; objects_per_print: number; object_id: number; printer_preset_name: string | null }[];
  const skus = (skuRows || []) as { shopify_sku: string; quantity: number; object_id: number }[];

  const modulesByObjectId: Record<number, ProductModule[]> = {};
  for (const m of modules) {
    if (!modulesByObjectId[m.object_id]) modulesByObjectId[m.object_id] = [];
    modulesByObjectId[m.object_id].push({
      id: m.id,
      name: m.name,
      weight: m.weight,
      objects_per_print: m.objects_per_print || 1,
      printer_preset_name: m.printer_preset_name,
    });
  }

  const skusByObjectId: Record<number, ProductSkuMapping[]> = {};
  for (const s of skus) {
    if (!skusByObjectId[s.object_id]) skusByObjectId[s.object_id] = [];
    skusByObjectId[s.object_id].push({ shopify_sku: s.shopify_sku, quantity: s.quantity });
  }

  const products: Product[] = items.map(item => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    category: item.category,
    in_stock: item.in_stock,
    min_threshold: item.min_threshold,
    modules: modulesByObjectId[item.id] ?? [],
    skus: skusByObjectId[item.id] ?? [],
  }));

  const categories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort();

  return { products, categories };
};

export const actions: Actions = {
  saveItem: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return fail(500, { error: 'Database not available' });

    const form = await request.formData();
    const id = form.get('id') ? Number(form.get('id')) : null;
    const name = (form.get('name') as string | null)?.trim();
    const sku = (form.get('sku') as string | null)?.trim();
    const category = (form.get('category') as string | null)?.trim() || null;
    const min_threshold = Number(form.get('min_threshold') ?? 5);

    if (!name || !sku) return fail(400, { error: 'Name and SKU are required' });
    if (!/^[a-z0-9-]+$/.test(sku)) return fail(400, { error: 'SKU may only contain lowercase letters, numbers and hyphens' });

    if (id) {
      const result = await updateObject(db, id, { name, sku, minThreshold: min_threshold, category });
      if (!result.success) return fail(400, { error: result.error });
    } else {
      const result = await createObject(db, { name, sku, minThreshold: min_threshold, category });
      if (!result.success) return fail(409, { error: result.error });
    }

    return { success: true };
  },

  deleteItem: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return fail(500, { error: 'Database not available' });

    const form = await request.formData();
    const id = Number(form.get('id'));
    const result = await deleteObject(db, id);
    if (!result.success) return fail(409, { error: result.error });
    return { success: true };
  },
};
