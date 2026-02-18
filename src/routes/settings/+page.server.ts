import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import type { GridCell } from '$lib/types';
import { ShopifyClient, ShopifySyncService } from '$lib/shopify';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  
  if (!database) {
    console.log('⚠️ Database not available.');
    return { printModules: [], spoolPresets: [], availableImages: [], gridPresets: [], printers: [], shopifyConfig: null };
  }

  const printModules = await db.getAllPrintModules(database);
  const spoolPresets = await db.getAllSpoolPresets(database);
  const gridPresets = await db.getAllGridPresets(database);
  const printers = await db.getAllPrinters(database);
  
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
    shopifyRecentOrders
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

    const result = await db.createPrintModule(database, {
      name: formData.get('name') as string,
      expectedWeight: Number(formData.get('expectedWeight')),
      expectedTime: Number(formData.get('expectedTime')),
      objectsPerPrint: Number(formData.get('objectsPerPrint')) || 1,
      defaultSpoolPresetId: Number(formData.get('defaultSpoolPresetId')) || null,
      path: formData.get('path') as string,
      imagePath: normalizedImagePath  // ✅ Will be null if not selected
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
  }
};