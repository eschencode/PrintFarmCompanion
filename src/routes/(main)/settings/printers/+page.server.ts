import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { requireCtx } from '$lib/server/context';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const database = platform?.env?.DB;
  if (!database) return { printers: [], printerModels: [] };
  const ctx = requireCtx(locals);
  const [printers, printerModels] = await Promise.all([
    db.getAllPrintersFull(ctx),
    db.getAllPrinterPresets(database), // presets are catalog (Group 9) — still db
  ]);
  return { printers, printerModels };
};

export const actions: Actions = {
  addPrinter: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    return db.createPrinter(ctx, {
      name: formData.get('name') as string,
      printerPresetId: Number(formData.get('printerPresetId')) || Number(formData.get('printerModelId')),
      slotCount: Number(formData.get('slotCount')) || 1,
    }, {
      printerIp: (formData.get('printerIp') as string) || null,
      serial: (formData.get('printerSerial') as string) || null,
      accessCode: (formData.get('printerAccessCode') as string) || null,
    });
  },

  updatePrinter: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const result = await db.updatePrinter(ctx, printerId, {
      name: formData.get('name') as string,
      printerPresetId: Number(formData.get('printerPresetId')) || Number(formData.get('printerModelId')) || undefined,
      slotCount: Number(formData.get('slotCount')) || undefined,
    });
    if (!result.success) return result;
    await db.upsertPrinterSecrets(ctx, printerId, {
      printerIp: (formData.get('printerIp') as string) || null,
      serial: (formData.get('printerSerial') as string) || null,
      accessCode: (formData.get('printerAccessCode') as string) || null,
    });
    return { success: true };
  },

  deletePrinter: async ({ locals, request }) => {
    const ctx = requireCtx(locals);
    const formData = await request.formData();
    return db.deletePrinter(ctx, Number(formData.get('printerId')));
  },

  addPrinterModel: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.createPrinterPreset(database, {
      model: formData.get('name') as string,
      brand: (formData.get('brand') as string) || '',
      dimensionX: Number(formData.get('buildVolumeX')) || null,
      dimensionY: Number(formData.get('buildVolumeY')) || null,
      dimensionZ: Number(formData.get('buildVolumeZ')) || null,
      deviceFilePath: (formData.get('deviceFilePath') as string) || '/',
    });
  },

  updatePrinterModel: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.updatePrinterPreset(database, Number(formData.get('modelId')), {
      model: formData.get('name') as string,
      dimensionX: Number(formData.get('buildVolumeX')) || null,
      dimensionY: Number(formData.get('buildVolumeY')) || null,
      dimensionZ: Number(formData.get('buildVolumeZ')) || null,
    });
  },

  deletePrinterModel: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.deletePrinterPreset(database, Number(formData.get('modelId')));
  },
};
