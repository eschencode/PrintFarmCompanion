import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) return { spoolPresets: [] };
  const spoolPresets = await db.getAllSpoolPresets(database);
  return { spoolPresets };
};

export const actions: Actions = {
  addSpoolPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.createSpoolPreset(database, {
      brand: formData.get('brand') as string,
      material: formData.get('material') as string,
      color: (formData.get('color') as string) || '',
      defaultWeight: Number(formData.get('defaultWeight')),
      cost: Number(formData.get('cost')) || undefined,
    });
  },

  updateSpoolPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.updateSpoolPreset(database, Number(formData.get('presetId')), {
      brand: formData.get('brand') as string,
      material: formData.get('material') as string,
      color: (formData.get('color') as string) || '',
      defaultWeight: Number(formData.get('defaultWeight')),
      cost: Number(formData.get('cost')) || undefined,
    });
  },

  deleteSpoolPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.deleteSpoolPreset(database, Number(formData.get('presetId')));
  },
};
