import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

export interface ProductModule {
  id: number;
  name: string;
  expected_weight: number | null;
  objects_per_print: number;
  printer_model_name: string | null;
}

export interface ProductSkuMapping {
  shopify_sku: string;
  quantity: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  category: string;
  stock_count: number;
  min_threshold: number;
  modules: ProductModule[];   // print modules that produce this item
  skus: ProductSkuMapping[];  // shopify SKUs that include this item
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { products: [], categories: [] };

  const drizzleDb = getDb(db);
  // Load all inventory items with their linked modules and SKU mappings in one pass
  const [itemRows, moduleRows, skuRows] = await Promise.all([
    drizzleDb.all(sql`SELECT * FROM inventory ORDER BY category ASC, name ASC`),
    drizzleDb.all(sql`
      SELECT pm.id, pm.name, pm.inventory_slug, pm.expected_weight, pm.objects_per_print,
             pmod.name AS printer_model_name
      FROM print_modules pm
      LEFT JOIN printer_models pmod ON pm.printer_model_id = pmod.id
      WHERE pm.inventory_slug IS NOT NULL
      ORDER BY pm.name ASC
    `),
    drizzleDb.all(sql`
      SELECT shopify_sku, inventory_slug, quantity
      FROM shopify_sku_mapping
      WHERE source_type = 'inventory'
      ORDER BY shopify_sku ASC
    `),
  ]);

  const items = (itemRows || []) as Record<string, unknown>[];
  const modules = (moduleRows || []) as Record<string, unknown>[];
  const skus = (skuRows || []) as Record<string, unknown>[];

  // Index modules and skus by inventory_slug for fast lookup
  const modulesBySlug: Record<string, ProductModule[]> = {};
  for (const m of modules) {
    const slug = m.inventory_slug as string;
    if (!modulesBySlug[slug]) modulesBySlug[slug] = [];
    modulesBySlug[slug].push({
      id: m.id as number,
      name: m.name as string,
      expected_weight: m.expected_weight as number | null,
      objects_per_print: (m.objects_per_print as number) || 1,
      printer_model_name: m.printer_model_name as string | null,
    });
  }

  const skusBySlug: Record<string, ProductSkuMapping[]> = {};
  for (const s of skus) {
    const slug = s.inventory_slug as string;
    if (!skusBySlug[slug]) skusBySlug[slug] = [];
    skusBySlug[slug].push({
      shopify_sku: s.shopify_sku as string,
      quantity: s.quantity as number,
    });
  }

  const products: Product[] = items.map(item => ({
    id: item.id as number,
    name: item.name as string,
    slug: item.slug as string,
    sku: item.sku as string | null,
    description: item.description as string | null,
    category: (item.category as string) || '',
    stock_count: item.stock_count as number,
    min_threshold: item.min_threshold as number,
    modules: modulesBySlug[item.slug as string] ?? [],
    skus: skusBySlug[item.slug as string] ?? [],
  }));

  // Distinct non-empty categories for filter chips
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  return { products, categories };
};

export const actions: Actions = {
  saveItem: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return fail(500, { error: 'Database not available' });

    const drizzleDb = getDb(db);
    const form = await request.formData();
    const id = form.get('id') ? Number(form.get('id')) : null;
    const name = (form.get('name') as string | null)?.trim();
    const slug = (form.get('slug') as string | null)?.trim();
    const sku = (form.get('sku') as string | null)?.trim() || null;
    const category = (form.get('category') as string | null)?.trim() || '';
    const min_threshold = Number(form.get('min_threshold') ?? 5);
    const description = (form.get('description') as string | null)?.trim() || null;

    if (!name || !slug) return fail(400, { error: 'Name and slug are required' });
    if (!/^[a-z0-9-]+$/.test(slug)) return fail(400, { error: 'Slug may only contain lowercase letters, numbers and hyphens' });

    if (id) {
      await drizzleDb.run(sql`
        UPDATE inventory
        SET name = ${name}, sku = ${sku}, category = ${category}, min_threshold = ${min_threshold}, description = ${description}
        WHERE id = ${id}
      `);
    } else {
      // Check slug uniqueness
      const existing = await drizzleDb.get(sql`SELECT id FROM inventory WHERE slug = ${slug}`);
      if (existing) return fail(409, { error: `Slug "${slug}" is already in use` });
      await drizzleDb.run(sql`
        INSERT INTO inventory (name, slug, sku, category, min_threshold, description, stock_count)
        VALUES (${name}, ${slug}, ${sku}, ${category}, ${min_threshold}, ${description}, 0)
      `);
    }

    return { success: true };
  },

  deleteItem: async ({ request, platform }) => {
    const db = platform?.env?.DB;
    if (!db) return fail(500, { error: 'Database not available' });

    const drizzleDb = getDb(db);
    const form = await request.formData();
    const id = Number(form.get('id'));

    // Block delete if modules or SKU mappings reference this slug
    const item = await drizzleDb.get<{ slug: string }>(sql`SELECT slug FROM inventory WHERE id = ${id}`);
    if (!item) return fail(404, { error: 'Item not found' });

    const linkedModules = await drizzleDb.get<{ n: number }>(
      sql`SELECT COUNT(*) as n FROM print_modules WHERE inventory_slug = ${item.slug}`
    );

    const linkedSkus = await drizzleDb.get<{ n: number }>(
      sql`SELECT COUNT(*) as n FROM shopify_sku_mapping WHERE inventory_slug = ${item.slug}`
    );

    if ((linkedModules?.n ?? 0) > 0)
      return fail(409, { error: `Cannot delete — ${linkedModules.n} print module(s) still produce this item` });
    if ((linkedSkus?.n ?? 0) > 0)
      return fail(409, { error: `Cannot delete — ${linkedSkus.n} Shopify SKU mapping(s) reference this item` });

    await drizzleDb.run(sql`DELETE FROM inventory_log WHERE inventory_id = ${id}`);
    await drizzleDb.run(sql`DELETE FROM inventory WHERE id = ${id}`);

    return { success: true };
  },
};
