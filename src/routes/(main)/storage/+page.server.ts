import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  
  if (!database) {
    console.log('⚠️ Database not available.');
    return { spoolPresets: [] };
  }

  const spoolPresets = await db.getAllSpoolPresets(database);

  return { spoolPresets };
};

export const actions: Actions = {
  // Add stock to a preset
  addStock: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const quantity = Number(formData.get('quantity')) || 1;

    if (!presetId) {
      return { success: false, error: 'Preset ID is required' };
    }

    const result = await db.updateStorageCount(database, presetId, quantity);
    return result;
  },

  // Remove stock from a preset
  removeStock: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const quantity = Number(formData.get('quantity')) || 1;

    if (!presetId) {
      return { success: false, error: 'Preset ID is required' };
    }

    const result = await db.updateStorageCount(database, presetId, -quantity);
    return result;
  },

  // Set absolute stock count
  setStock: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const presetId = Number(formData.get('presetId'));
    const count = Number(formData.get('count'));

    if (!presetId) {
      return { success: false, error: 'Preset ID is required' };
    }

    if (isNaN(count) || count < 0) {
      return { success: false, error: 'Invalid count' };
    }

    const result = await db.setStorageCount(database, presetId, count);
    return result;
  },

  // Create new preset with initial stock
  createPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const brand = formData.get('brand') as string;
    const material = formData.get('material') as string;
    const color = formData.get('color') as string || null;
    const defaultWeight = Number(formData.get('defaultWeight')) || 1000;
    const cost = formData.get('cost') ? Number(formData.get('cost')) : null;
    const initialStock = Number(formData.get('initialStock')) || 0;

    if (!name || !brand || !material) {
      return { success: false, error: 'Name, brand, and material are required' };
    }

    // Create the preset
    const result = await db.createSpoolPreset(database, {
      name,
      brand,
      material,
      color,
      defaultWeight,
      cost
    });

    // Set initial stock if provided
    if (result.success && result.presetId && initialStock > 0) {
      await db.setStorageCount(database, result.presetId, initialStock);
    }

    return result;
  }
};
