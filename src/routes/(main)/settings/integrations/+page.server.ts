import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { getAllObjects, createObject } from '$lib/inventory_handler';
import { ShopifyClient, ShopifySyncService } from '$lib/shopify';
import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) return { shopifyConfigured: false, shopifySyncState: null, shopifyRecentOrders: [], skuMappings: [], inventoryItems: [], spoolPresets: [] };

  const drizzleDb = getDb(database);
  const shopifyConfigured = !!(platform?.env?.SHOPIFY_STORE_DOMAIN && platform?.env?.SHOPIFY_ACCESS_TOKEN);

  let shopifySyncState = null;
  let shopifyRecentOrders: { shopify_order_id: string; shopify_order_number: string; processed_at: number; total_items: number }[] = [];

  if (shopifyConfigured) {
    try {
      const client = new ShopifyClient(platform.env.SHOPIFY_STORE_DOMAIN!, platform.env.SHOPIFY_ACCESS_TOKEN!);
      const syncService = new ShopifySyncService(database, client);
      shopifySyncState = await syncService.getSyncState();
      shopifyRecentOrders = await syncService.getRecentOrders(10);
    } catch (e) {
      console.error('Failed to get Shopify sync state:', e);
    }
  }

  const skuMappingsRaw = await drizzleDb.all(
    sql`SELECT id, shopify_sku, inventory_slug, quantity, source_type, spool_preset_id FROM shopify_sku_mapping ORDER BY shopify_sku, inventory_slug`
  );
  const skuMappings = (skuMappingsRaw || []) as { id: number; shopify_sku: string; inventory_slug: string; quantity: number; source_type: string; spool_preset_id: number | null }[];
  const inventoryItems = await getAllObjects(database);
  const spoolPresets = await db.getAllSpoolPresets(database);

  return { shopifyConfigured, shopifySyncState, shopifyRecentOrders, skuMappings, inventoryItems, spoolPresets };
};

export const actions: Actions = {
  syncShopify: async ({ platform }) => {
    const database = platform?.env?.DB;
    const shopifyDomain = platform?.env?.SHOPIFY_STORE_DOMAIN;
    const shopifyToken = platform?.env?.SHOPIFY_ACCESS_TOKEN;
    if (!database || !shopifyDomain || !shopifyToken) return fail(400, { error: 'Shopify not configured' });
    try {
      const client = new ShopifyClient(shopifyDomain, shopifyToken);
      const syncService = new ShopifySyncService(database, client);
      const result = await syncService.sync(true);
      return { success: result.success, ordersProcessed: result.ordersProcessed, itemsDeducted: result.itemsDeducted, skippedOrders: result.skippedOrders, errors: result.errors.slice(0, 10) };
    } catch (err) {
      return fail(500, { error: `Sync failed: ${err}` });
    }
  },

  testShopifyConnection: async ({ platform }) => {
    if (!platform?.env?.SHOPIFY_STORE_DOMAIN || !platform?.env?.SHOPIFY_ACCESS_TOKEN) return { success: false, error: 'Shopify not configured' };
    const client = new ShopifyClient(platform.env.SHOPIFY_STORE_DOMAIN, platform.env.SHOPIFY_ACCESS_TOKEN);
    const result = await client.testConnection();
    return { success: result.success, shopName: result.shopName, error: result.error };
  },

  saveSkuSet: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return fail(400, { error: 'Database not available' });
    const drizzleDb = getDb(database);
    const form = await request.formData();
    const shopifySku = (form.get('shopifySku') as string).trim();
    const originalSku = ((form.get('originalSku') as string) || '').trim();
    if (!shopifySku) return fail(400, { error: 'Shopify SKU is required' });
    let items: { source_type: string; inventory_slug: string; spool_preset_id: number | null; quantity: number }[];
    try { items = JSON.parse(form.get('items') as string); }
    catch { return fail(400, { error: 'Invalid items data' }); }
    if (items.length === 0) return fail(400, { error: 'At least one item is required' });
    try {
      if (originalSku) await drizzleDb.run(sql`DELETE FROM shopify_sku_mapping WHERE shopify_sku = ${originalSku}`);
      for (const item of items) {
        await drizzleDb.run(sql`
          INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity, source_type, spool_preset_id)
          VALUES (${shopifySku}, ${item.inventory_slug || ''}, ${item.quantity}, ${item.source_type}, ${item.spool_preset_id})
        `);
      }
      return { success: true };
    } catch (err) { return fail(400, { error: `Failed to save set: ${err}` }); }
  },

  deleteSkuSet: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return fail(400, { error: 'Database not available' });
    const drizzleDb = getDb(database);
    const form = await request.formData();
    const shopifySku = (form.get('shopifySku') as string).trim();
    try {
      await drizzleDb.run(sql`DELETE FROM shopify_sku_mapping WHERE shopify_sku = ${shopifySku}`);
      return { success: true };
    } catch (err) { return fail(400, { error: `Failed to delete set: ${err}` }); }
  },

  addInventoryItem: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return fail(400, { error: 'Database not available' });
    const form = await request.formData();
    const name = (form.get('name') as string).trim();
    const slug = (form.get('slug') as string).trim();
    if (!name || !slug) return fail(400, { error: 'Name and slug are required' });
    return createObject(database, { name, sku: slug });
  },
};
