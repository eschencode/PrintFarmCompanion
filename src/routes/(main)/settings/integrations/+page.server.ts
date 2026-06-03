import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { getAllObjects, createObject } from '$lib/inventory_handler';
import { ShopifyClient, ShopifySyncService, normalizeShopifyDomain } from '$lib/shopify';
import { getShopifyConfig, getShopifyConfigSummary } from '$lib/server/shopifyConfig';
import { encryptSecret } from '$lib/server/crypto';
import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/db';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) {
    return {
      shopifyConfigured: false,
      shopifyConfig: { storeDomain: null, hasToken: false, source: null },
      shopifySyncState: null,
      shopifyRecentOrders: [],
      skuMappings: [],
      shopifySkus: [],
      inventoryItems: [],
      spoolPresets: [],
    };
  }

  const drizzleDb = getDb(database);
  const shopifyConfig = await getShopifyConfigSummary(database, platform?.env);
  // Decryption can throw on a missing/wrong ENCRYPTION_KEY — don't let that lock
  // the settings page (you still need it to fix the config). Degrade to "not configured".
  let runtimeConfig = null;
  try {
    runtimeConfig = await getShopifyConfig(database, platform?.env);
  } catch (e) {
    console.error('Failed to resolve Shopify config (decryption?):', e);
  }
  const shopifyConfigured = !!runtimeConfig;

  let shopifySyncState = null;
  let shopifyRecentOrders: { order_id: string; order_number: string; processed_at: number; total_items: number }[] = [];

  if (shopifyConfigured && runtimeConfig) {
    try {
      const client = new ShopifyClient(runtimeConfig.storeDomain, runtimeConfig.accessToken);
      const syncService = new ShopifySyncService(database, client);
      shopifySyncState = await syncService.getSyncState();
      shopifyRecentOrders = await syncService.getRecentOrders(10);
    } catch (e) {
      console.error('Failed to get Shopify sync state:', e);
    }
  }

  const skuMappingsRaw = await drizzleDb.all(
    sql`SELECT sm.id, sm.shopify_sku, sm.object_id, sm.quantity, o.name as object_name
        FROM shopify_sku_mapping sm
        LEFT JOIN objects o ON sm.object_id = o.id
        ORDER BY sm.shopify_sku, o.name`
  );
  const skuMappings = (skuMappingsRaw || []) as { id: number; shopify_sku: string; object_id: number; quantity: number; object_name: string }[];

  const shopifySkusRaw = await drizzleDb.all(
    sql`SELECT sku, product_title, variant_title FROM shopify_skus ORDER BY product_title, sku`
  );
  const shopifySkus = (shopifySkusRaw || []) as { sku: string; product_title: string | null; variant_title: string | null }[];

  const inventoryItems = await getAllObjects(database);
  const spoolPresets = await db.getAllSpoolPresets(database);

  return { shopifyConfigured, shopifyConfig, shopifySyncState, shopifyRecentOrders, skuMappings, shopifySkus, inventoryItems, spoolPresets };
};

export const actions: Actions = {
  syncShopify: async ({ platform }) => {
    const database = platform?.env?.DB;
    const config = await getShopifyConfig(database, platform?.env);
    if (!database || !config) return fail(400, { error: 'Shopify not configured' });
    try {
      const client = new ShopifyClient(config.storeDomain, config.accessToken);
      const syncService = new ShopifySyncService(database, client);
      const result = await syncService.sync(true);
      return { success: result.success, ordersProcessed: result.ordersProcessed, itemsDeducted: result.itemsDeducted, skippedOrders: result.skippedOrders, errors: result.errors.slice(0, 10) };
    } catch (err) {
      return fail(500, { error: `Sync failed: ${err}` });
    }
  },

  syncShopifySkus: async ({ platform }) => {
    const database = platform?.env?.DB;
    const config = await getShopifyConfig(database, platform?.env);
    if (!database || !config) return fail(400, { error: 'Shopify not configured' });
    try {
      const client = new ShopifyClient(config.storeDomain, config.accessToken);
      const syncService = new ShopifySyncService(database, client);
      const result = await syncService.syncSkus();
      if (!result.success) return fail(500, { error: `SKU refresh failed: ${result.error}` });
      return { success: true, message: `Synced ${result.count} SKU${result.count === 1 ? '' : 's'} from Shopify` };
    } catch (err) {
      return fail(500, { error: `SKU refresh failed: ${err}` });
    }
  },

  testShopifyConnection: async ({ platform }) => {
    const config = await getShopifyConfig(platform?.env?.DB, platform?.env);
    if (!config) return { success: false, error: 'Shopify not configured' };
    const client = new ShopifyClient(config.storeDomain, config.accessToken);
    const result = await client.testConnection();
    return { success: result.success, shopName: result.shopName, error: result.error };
  },

  // MULTI-USER (Phase 3): the id=1 singleton upsert must become a per-workspace
  // upsert (workspace_id key). Today every caller shares one credential row.
  saveShopifyConfig: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return fail(500, { error: 'Database not available' });
    const encryptionKey = platform?.env?.ENCRYPTION_KEY;
    if (!encryptionKey) return fail(500, { error: 'ENCRYPTION_KEY not configured on the server' });
    const form = await request.formData();
    const rawDomain = ((form.get('shopifyDomain') as string) || '').trim();
    const accessToken = ((form.get('shopifyToken') as string) || '').trim();
    if (!rawDomain) return fail(400, { error: 'Store domain is required' });
    // Pin to a real *.myshopify.com host — the token is sent to this domain, so a
    // bad value here would exfiltrate it. Store the normalized form.
    let storeDomain: string;
    try {
      storeDomain = normalizeShopifyDomain(rawDomain);
    } catch {
      return fail(400, { error: 'Store domain must be a valid *.myshopify.com domain' });
    }

    const drizzleDb = getDb(database);
    const existing = await drizzleDb.get<{ access_token: string }>(
      sql`SELECT access_token FROM shopify_settings ORDER BY updated_at DESC LIMIT 1`
    );
    // Freshly-entered token → encrypt. Blank → reuse the stored (already-encrypted) value as-is.
    const tokenToSave = accessToken
      ? await encryptSecret(accessToken, encryptionKey)
      : existing?.access_token;
    if (!tokenToSave) return fail(400, { error: 'Access token is required' });

    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      INSERT INTO shopify_settings (id, store_domain, access_token, updated_at)
      VALUES (1, ${storeDomain}, ${tokenToSave}, ${now})
      ON CONFLICT(id) DO UPDATE SET
        store_domain = excluded.store_domain,
        access_token = excluded.access_token,
        updated_at = excluded.updated_at
    `);

    return { success: true, message: 'Shopify settings saved' };
  },

  saveSkuSet: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return fail(400, { error: 'Database not available' });
    const drizzleDb = getDb(database);
    const form = await request.formData();
    const shopifySku = (form.get('shopifySku') as string).trim();
    const originalSku = ((form.get('originalSku') as string) || '').trim();
    if (!shopifySku) return fail(400, { error: 'Shopify SKU is required' });
    let items: { object_id: number; quantity: number }[];
    try { items = JSON.parse(form.get('items') as string); }
    catch { return fail(400, { error: 'Invalid items data' }); }
    if (items.length === 0) return fail(400, { error: 'At least one item is required' });
    try {
      if (originalSku) await drizzleDb.run(sql`DELETE FROM shopify_sku_mapping WHERE shopify_sku = ${originalSku}`);
      for (const item of items) {
        await drizzleDb.run(sql`
          INSERT INTO shopify_sku_mapping (shopify_sku, object_id, quantity)
          VALUES (${shopifySku}, ${item.object_id}, ${item.quantity})
          ON CONFLICT (shopify_sku, object_id) DO UPDATE SET quantity = excluded.quantity
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
    const name = (form.get('name') as string | null)?.trim();
    if (!name) return fail(400, { error: 'Name is required' });
    return createObject(database, { name });
  },
};
