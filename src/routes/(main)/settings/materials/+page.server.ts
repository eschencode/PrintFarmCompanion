import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { requireCtx } from '$lib/server/context';

export const load: PageServerLoad = async ({ locals }) => {
  const ctx = requireCtx(locals);
  const spoolPresets = await db.getAllSpoolPresets(ctx);
  return { spoolPresets };
};

export const actions: Actions = {
  addSpoolPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    return db.createSpoolPreset(ctx, {
      brand: formData.get('brand') as string,
      material: formData.get('material') as string,
      color: (formData.get('color') as string) || '',
      colorHex: (formData.get('colorHex') as string) || null,
      defaultWeight: Number(formData.get('defaultWeight')),
      cost: Number(formData.get('cost')) || undefined,
    });
  },

  updateSpoolPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    return db.updateSpoolPreset(ctx, Number(formData.get('presetId')), {
      brand: formData.get('brand') as string,
      material: formData.get('material') as string,
      color: (formData.get('color') as string) || '',
      colorHex: (formData.get('colorHex') as string) || null,
      defaultWeight: Number(formData.get('defaultWeight')),
      cost: Number(formData.get('cost')) || undefined,
    });
  },

  deleteSpoolPreset: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    return db.deleteSpoolPreset(ctx, Number(formData.get('presetId')));
  },
};
