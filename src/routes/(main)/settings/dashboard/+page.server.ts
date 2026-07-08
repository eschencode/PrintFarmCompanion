import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import type { GridCell } from '$lib/types';
import { requireCtx } from '$lib/server/context';

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const [gridPresets, printers] = await Promise.all([
    db.getAllGridPresets(ctx),
    db.getAllPrinters(ctx),
  ]);
  return { gridPresets, printers };
};

export const actions: Actions = {
  addGridPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    let gridConfig: GridCell[];
    try { gridConfig = JSON.parse(formData.get('gridConfig') as string); }
    catch { return { success: false, error: 'Invalid grid configuration' }; }
    return db.createGridPreset(ctx, {
      name: formData.get('name') as string,
      is_default: formData.get('isDefault') === 'true',
      grid_config: gridConfig,
      rows: Number(formData.get('rows')) || 3,
      cols: Number(formData.get('cols')) || 3,
    });
  },

  updateGridPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    let gridConfig: GridCell[];
    try { gridConfig = JSON.parse(formData.get('gridConfig') as string); }
    catch { return { success: false, error: 'Invalid grid configuration' }; }
    return db.updateGridPreset(ctx, Number(formData.get('presetId')), {
      name: formData.get('name') as string,
      is_default: formData.get('isDefault') === 'true',
      grid_config: gridConfig,
      rows: Number(formData.get('rows')) || 3,
      cols: Number(formData.get('cols')) || 3,
    });
  },

  setDefaultGridPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    return db.setDefaultGridPreset(ctx, Number(formData.get('presetId')));
  },

  deleteGridPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    return db.deleteGridPreset(ctx, Number(formData.get('presetId')));
  },
};
