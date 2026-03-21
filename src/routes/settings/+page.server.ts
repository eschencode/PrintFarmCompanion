import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { getAllInventoryItems } from '$lib/inventory_handler';
import type { GridCell } from '$lib/types';
import { ShopifyClient, ShopifySyncService } from '$lib/shopify';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  
  if (!database) {
    console.log('⚠️ Database not available.');
    return { printModules: [], spoolPresets: [], availableImages: [], gridPresets: [], printers: [], shopifyConfig: null, skuMappings: [], inventoryItems: [] };
  }

  const printModules = await db.getAllPrintModules(database);
  const spoolPresets = await db.getAllSpoolPresets(database);
  const gridPresets = await db.getAllGridPresets(database);
  const printers = await db.getAllPrinters(database);
  
  // Load SKU mappings and inventory items
  const skuMappingsRaw = await database.prepare('SELECT id, shopify_sku, inventory_slug, quantity, source_type, spool_preset_id FROM shopify_sku_mapping ORDER BY shopify_sku, inventory_slug').all();
  const skuMappings = (skuMappingsRaw.results || []) as { id: number; shopify_sku: string; inventory_slug: string; quantity: number; source_type: string; spool_preset_id: number | null }[];
  const inventoryItems = await getAllInventoryItems(database);

  // Shopify configuration status
  const shopifyConfigured = !!(platform?.env?.SHOPIFY_STORE_DOMAIN && platform?.env?.SHOPIFY_ACCESS_TOKEN);
  
  let shopifySyncState = null;
  let shopifyRecentOrders: { shopify_order_id: string; shopify_order_number: string; processed_at: number; total_items: number }[] = [];
  
  if (shopifyConfigured && database) {
    try {
      const client = new ShopifyClient(
        platform.env.SHOPIFY_STORE_DOMAIN!,
        platform.env.SHOPIFY_ACCESS_TOKEN!
      );
      const syncService = new ShopifySyncService(database, client);
      shopifySyncState = await syncService.getSyncState();
      shopifyRecentOrders = await syncService.getRecentOrders(10);
    } catch (e) {
      console.error('Failed to get Shopify sync state:', e);
    }
  }
  
  // ✅ List of available images in static/images/
  const availableImages = [
    'haken.JPG',
    'hakenhalter.JPG',
    'klohalter.JPG',
    'stab.JPG',
    'stöpsel.JPG',
    'vase.JPG'
  ];

  return {
    printModules,
    spoolPresets,
    availableImages,
    gridPresets,
    printers,
    shopifyConfigured,
    shopifySyncState,
    shopifyRecentOrders,
    skuMappings,
    inventoryItems
  };
};

export const actions: Actions = {
  addModule: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const imagePath = formData.get('imagePath') as string;
    
    // ✅ Only set imagePath if something was selected (not empty string)
    const normalizedImagePath = imagePath && imagePath !== '' ? `/images/${imagePath}` : null;

    const spoolPresetIds = formData.getAll('spoolPresetIds').map(Number).filter(Boolean);

    const result = await db.createPrintModule(database, {
      name: formData.get('name') as string,
      expectedWeight: Number(formData.get('expectedWeight')),
      expectedTime: Number(formData.get('expectedTime')),
      objectsPerPrint: Number(formData.get('objectsPerPrint')) || 1,
      spoolPresetIds,
      path: formData.get('path') as string,
      imagePath: normalizedImagePath,
      printerModel: (formData.get('printerModel') as string) || null
    });

    return result;
  },

  deleteModule: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const moduleId = Number(formData.get('moduleId'));

    const result = await db.deletePrintModule(database, moduleId);

    return result;
  },

  updateModule: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const form = await request.formData();
    const moduleId = Number(form.get('moduleId'));
    const imagePath = form.get('imagePath') as string;
    const normalizedImagePath =
      imagePath && imagePath !== '' ? `/images/${imagePath}` : null;

    const spoolPresetIds = form.getAll('spoolPresetIds').map(Number).filter(Boolean);

    return db.updatePrintModule(database, moduleId, {
      name: form.get('name') as string,
      expectedWeight: Number(form.get('expectedWeight')),
      expectedTime: Number(form.get('expectedTime')),
      objectsPerPrint: Number(form.get('objectsPerPrint')) || 1,
      spoolPresetIds,
      path: form.get('path') as string,
      imagePath: normalizedImagePath,
      printerModel: (form.get('printerModel') as string) || null
    });
  },

  addSpoolPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();

    const result = await db.createSpoolPreset(database, {
      name: formData.get('name') as string,
      brand: formData.get('brand') as string,
      material: formData.get('material') as string,
      color: formData.get('color') as string || null,
      defaultWeight: Number(formData.get('defaultWeight')),
      cost: Number(formData.get('cost')) || null
    });

    return result;
  },

  updateSpoolPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));

    const result = await db.updateSpoolPreset(database, presetId, {
      name: formData.get('name') as string,
      brand: formData.get('brand') as string,
      material: formData.get('material') as string,
      color: formData.get('color') as string || null,
      defaultWeight: Number(formData.get('defaultWeight')),
      cost: Number(formData.get('cost')) || null
    });

    return result;
  },

  deleteSpoolPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));

    const result = await db.deleteSpoolPreset(database, presetId);
    return result;
  },

  // Grid Preset Actions
  addGridPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const gridConfigString = formData.get('gridConfig') as string;
    
    let gridConfig: GridCell[];
    try {
      gridConfig = JSON.parse(gridConfigString);
    } catch {
      return { success: false, error: 'Invalid grid configuration' };
    }

    const result = await db.createGridPreset(database, {
      name: formData.get('name') as string,
      is_default: formData.get('isDefault') === 'true',
      grid_config: gridConfig,
      rows: Number(formData.get('rows')) || 3,
      cols: Number(formData.get('cols')) || 3
    });

    return result;
  },

  updateGridPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const gridConfigString = formData.get('gridConfig') as string;
    
    let gridConfig: GridCell[];
    try {
      gridConfig = JSON.parse(gridConfigString);
    } catch {
      return { success: false, error: 'Invalid grid configuration' };
    }

    const result = await db.updateGridPreset(database, presetId, {
      name: formData.get('name') as string,
      is_default: formData.get('isDefault') === 'true',
      grid_config: gridConfig,
      rows: Number(formData.get('rows')) || 3,
      cols: Number(formData.get('cols')) || 3
    });

    return result;
  },

  setDefaultGridPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));

    const result = await db.setDefaultGridPreset(database, presetId);

    return result;
  },

  deleteGridPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));

    const result = await db.deleteGridPreset(database, presetId);

    return result;
  },

  // Printer Actions
  addPrinter: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();

    const result = await db.createPrinter(database, {
      name: formData.get('name') as string,
      model: formData.get('model') as string || null
    });

    return result;
  },

  updatePrinter: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));

    const result = await db.updatePrinter(database, printerId, {
      name: formData.get('name') as string,
      model: formData.get('model') as string || null
    });

    return result;
  },

  deletePrinter: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));

    const result = await db.deletePrinter(database, printerId);

    return result;
  },

  syncShopify: async ({ platform }) => {
    const db = platform?.env?.DB;
    const shopifyDomain = platform?.env?.SHOPIFY_STORE_DOMAIN;
    const shopifyToken = platform?.env?.SHOPIFY_ACCESS_TOKEN;
    
    if (!db || !shopifyDomain || !shopifyToken) {
      return fail(400, { error: 'Shopify not configured' });
    }

    try {
      const client = new ShopifyClient(shopifyDomain, shopifyToken);
      const syncService = new ShopifySyncService(db, client);
      
      // Use fetchAll = true for manual sync to get all historical orders
      const result = await syncService.sync(true);
      
      return {
        success: result.success,
        ordersProcessed: result.ordersProcessed,
        itemsDeducted: result.itemsDeducted,
        skippedOrders: result.skippedOrders,
        errors: result.errors.slice(0, 10) // Limit error display
      };
    } catch (err) {
      return fail(500, { error: `Sync failed: ${err}` });
    }
  },

  testShopifyConnection: async ({ platform }) => {
    if (!platform?.env?.SHOPIFY_STORE_DOMAIN || !platform?.env?.SHOPIFY_ACCESS_TOKEN) {
      return { success: false, error: 'Shopify not configured' };
    }
    
    const client = new ShopifyClient(
      platform.env.SHOPIFY_STORE_DOMAIN,
      platform.env.SHOPIFY_ACCESS_TOKEN
    );

    const result = await client.testConnection();
    return { success: result.success, shopName: result.shopName, error: result.error };
  },

  saveSkuSet: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return fail(400, { error: 'Database not available' });

    const form = await request.formData();
    const shopifySku = (form.get('shopifySku') as string).trim();
    const originalSku = (form.get('originalSku') as string || '').trim();
    const itemsJson = form.get('items') as string;

    if (!shopifySku) return fail(400, { error: 'Shopify SKU is required' });

    let items: { source_type: string; inventory_slug: string; spool_preset_id: number | null; quantity: number }[];
    try {
      items = JSON.parse(itemsJson);
    } catch {
      return fail(400, { error: 'Invalid items data' });
    }

    if (items.length === 0) return fail(400, { error: 'At least one item is required' });

    try {
      // Delete existing mappings for this SKU (handles both new and edit)
      if (originalSku) {
        await database.prepare('DELETE FROM shopify_sku_mapping WHERE shopify_sku = ?').bind(originalSku).run();
      }

      // Insert all items
      for (const item of items) {
        await database.prepare(
          'INSERT INTO shopify_sku_mapping (shopify_sku, inventory_slug, quantity, source_type, spool_preset_id) VALUES (?, ?, ?, ?, ?)'
        ).bind(shopifySku, item.inventory_slug || '', item.quantity, item.source_type, item.spool_preset_id).run();
      }

      return { success: true };
    } catch (err) {
      return fail(400, { error: `Failed to save set: ${err}` });
    }
  },

  deleteSkuSet: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return fail(400, { error: 'Database not available' });

    const form = await request.formData();
    const shopifySku = (form.get('shopifySku') as string).trim();

    try {
      await database.prepare('DELETE FROM shopify_sku_mapping WHERE shopify_sku = ?').bind(shopifySku).run();
      return { success: true };
    } catch (err) {
      return fail(400, { error: `Failed to delete set: ${err}` });
    }
  }
};