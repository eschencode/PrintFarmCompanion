import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { regenerateGlobalQueueIfStale, getSpoolDemandFromQueue } from '$lib/server/printQueue';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;

  if (!database) {
    console.log('⚠️ Database not available.');
    return { spoolPresets: [], usageStats: [], spoolDemand: [] };
  }

  await regenerateGlobalQueueIfStale(database);

  const [spoolPresets, usageStats, spoolDemand] = await Promise.all([
    db.getAllSpoolPresets(database),
    db.getSpoolUsageStats(database),
    getSpoolDemandFromQueue(database),
  ]);

  return { spoolPresets, usageStats, spoolDemand };
};

export const actions: Actions = {
  // Add stock to a preset
  addStock: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const quantity = Number(formData.get('quantity')) || 1;

    if (!presetId) return { success: false, error: 'Preset ID is required' };

    return db.updateStorageCount(database, presetId, quantity);
  },

  // Remove stock from a preset
  removeStock: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const quantity = Number(formData.get('quantity')) || 1;

    if (!presetId) return { success: false, error: 'Preset ID is required' };

    return db.updateStorageCount(database, presetId, -quantity);
  },

  // Set absolute stock count
  setStock: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const count = Number(formData.get('count'));

    if (!presetId) return { success: false, error: 'Preset ID is required' };
    if (isNaN(count) || count < 0) return { success: false, error: 'Invalid count' };

    return db.setStorageCount(database, presetId, count);
  },

  // Create new preset with initial stock
  createPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const brand = formData.get('brand') as string;
    const material = formData.get('material') as string;
    const color = (formData.get('color') as string) || '';
    const colorHex = (formData.get('colorHex') as string) || null;
    const defaultWeight = Number(formData.get('defaultWeight')) || 1000;
    const cost = formData.get('cost') ? Number(formData.get('cost')) : undefined;
    const initialStock = Number(formData.get('initialStock')) || 0;

    if (!brand || !material) {
      return { success: false, error: 'Brand and material are required' };
    }

    const result = await db.createSpoolPreset(database, {
      brand,
      material,
      color,
      colorHex,
      defaultWeight,
      cost,
      inStorage: initialStock,
    });

    return result;
  },

  deletePreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    if (!presetId) return { success: false, error: 'Preset ID is required' };

    return db.deleteSpoolPreset(database, presetId);
  },
};
