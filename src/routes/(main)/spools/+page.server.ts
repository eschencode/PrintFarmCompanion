import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { regenerateGlobalQueueIfStale, getSpoolDemandFromQueue } from '$lib/server/printQueue';
import { requireCtx } from '$lib/server/context';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const database = platform?.env?.DB;

  if (!database) {
    console.log('⚠️ Database not available.');
    return { spoolPresets: [], usageStats: [], spoolDemand: [], catalogItems: [], shopItems: [] };
  }
  const ctx = requireCtx(locals);

  await regenerateGlobalQueueIfStale(ctx);

  const [spoolPresets, usageStats, spoolDemand, catalogItems, shopItems] = await Promise.all([
    db.getAllSpoolPresets(ctx),
    db.getSpoolUsageStats(ctx),
    getSpoolDemandFromQueue(ctx),
    db.getCatalogItems(ctx),
    db.getShopCatalog(ctx),
  ]);

  return { spoolPresets, usageStats, spoolDemand, catalogItems, shopItems };
};

export const actions: Actions = {
  // Add stock to a preset
  addStock: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const quantity = Number(formData.get('quantity')) || 1;

    if (!presetId) return { success: false, error: 'Preset ID is required' };

    return db.updateStorageCount(ctx, presetId, quantity);
  },

  // Remove stock from a preset
  removeStock: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const quantity = Number(formData.get('quantity')) || 1;

    if (!presetId) return { success: false, error: 'Preset ID is required' };

    return db.updateStorageCount(ctx, presetId, -quantity);
  },

  // Set absolute stock count
  setStock: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const count = Number(formData.get('count'));

    if (!presetId) return { success: false, error: 'Preset ID is required' };
    if (isNaN(count) || count < 0) return { success: false, error: 'Invalid count' };

    return db.setStorageCount(ctx, presetId, count);
  },

  // Create new preset with initial stock
  createPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const brand = formData.get('brand') as string;
    const material = formData.get('material') as string;
    const color = (formData.get('color') as string) || '';
    const colorHex = (formData.get('colorHex') as string) || null;
    const defaultWeight = Number(formData.get('defaultWeight')) || 1000;
    const cost = formData.get('cost') ? Number(formData.get('cost')) : undefined;
    const initialStock = Number(formData.get('initialStock')) || 0;
    const catalogItemId = formData.get('catalogItemId')
      ? Number(formData.get('catalogItemId'))
      : null;

    if (!brand || !material) {
      return { success: false, error: 'Brand and material are required' };
    }

    const result = await db.createSpoolPreset(ctx, {
      brand,
      material,
      color,
      colorHex,
      defaultWeight,
      cost,
      inStorage: initialStock,
      catalogItemId,
    });

    return result;
  },

  deletePreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    if (!presetId) return { success: false, error: 'Preset ID is required' };

    return db.deleteSpoolPreset(ctx, presetId);
  },
};
