import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import type { GridCell } from '$lib/types';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) return { gridPresets: [], printers: [] };
  const [gridPresets, printers] = await Promise.all([
    db.getAllGridPresets(database),
    db.getAllPrinters(database),
  ]);
  return { gridPresets, printers };
};

export const actions: Actions = {
  addGridPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    let gridConfig: GridCell[];
    try { gridConfig = JSON.parse(formData.get('gridConfig') as string); }
    catch { return { success: false, error: 'Invalid grid configuration' }; }
    return db.createGridPreset(database, {
      name: formData.get('name') as string,
      is_default: formData.get('isDefault') === 'true',
      grid_config: gridConfig,
      rows: Number(formData.get('rows')) || 3,
      cols: Number(formData.get('cols')) || 3,
    });
  },

  updateGridPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    let gridConfig: GridCell[];
    try { gridConfig = JSON.parse(formData.get('gridConfig') as string); }
    catch { return { success: false, error: 'Invalid grid configuration' }; }
    return db.updateGridPreset(database, Number(formData.get('presetId')), {
      name: formData.get('name') as string,
      is_default: formData.get('isDefault') === 'true',
      grid_config: gridConfig,
      rows: Number(formData.get('rows')) || 3,
      cols: Number(formData.get('cols')) || 3,
    });
  },

  setDefaultGridPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.setDefaultGridPreset(database, Number(formData.get('presetId')));
  },

  deleteGridPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.deleteGridPreset(database, Number(formData.get('presetId')));
  },
};
