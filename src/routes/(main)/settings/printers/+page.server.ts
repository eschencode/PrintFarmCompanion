import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) return { printers: [], printerModels: [] };
  const [printers, printerModels] = await Promise.all([
    db.getAllPrintersFull(database),
    db.getAllPrinterPresets(database),
  ]);
  return { printers, printerModels };
};

export const actions: Actions = {
  addPrinter: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.createPrinter(database, {
      name: formData.get('name') as string,
      printerPresetId: Number(formData.get('printerPresetId')) || Number(formData.get('printerModelId')),
    }, {
      printerIp: (formData.get('printerIp') as string) || null,
      serial: (formData.get('printerSerial') as string) || null,
      accessCode: (formData.get('printerAccessCode') as string) || null,
    });
  },

  updatePrinter: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    await db.updatePrinter(database, printerId, {
      name: formData.get('name') as string,
      printerPresetId: Number(formData.get('printerPresetId')) || Number(formData.get('printerModelId')) || undefined,
    });
    await db.upsertPrinterSecrets(database, printerId, {
      printerIp: (formData.get('printerIp') as string) || null,
      serial: (formData.get('printerSerial') as string) || null,
      accessCode: (formData.get('printerAccessCode') as string) || null,
    });
    return { success: true };
  },

  deletePrinter: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.deletePrinter(database, Number(formData.get('printerId')));
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
