import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) return { printers: [], printerModels: [] };
  const [printers, printerModels] = await Promise.all([
    db.getAllPrinters(database),
    db.getAllPrinterModels(database),
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
      printerModelId: Number(formData.get('printerModelId')) || null,
      printerIp: (formData.get('printerIp') as string) || null,
      printerSerial: (formData.get('printerSerial') as string) || null,
      printerAccessCode: (formData.get('printerAccessCode') as string) || null,
    });
  },

  updatePrinter: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.updatePrinter(database, Number(formData.get('printerId')), {
      name: formData.get('name') as string,
      printerModelId: Number(formData.get('printerModelId')) || null,
      printerIp: (formData.get('printerIp') as string) || null,
      printerSerial: (formData.get('printerSerial') as string) || null,
      printerAccessCode: (formData.get('printerAccessCode') as string) || null,
    });
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
    return db.createPrinterModel(database, {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
      buildVolumeX: Number(formData.get('buildVolumeX')) || null,
      buildVolumeY: Number(formData.get('buildVolumeY')) || null,
      buildVolumeZ: Number(formData.get('buildVolumeZ')) || null,
    });
  },

  updatePrinterModel: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.updatePrinterModel(database, Number(formData.get('modelId')), {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
      buildVolumeX: Number(formData.get('buildVolumeX')) || null,
      buildVolumeY: Number(formData.get('buildVolumeY')) || null,
      buildVolumeZ: Number(formData.get('buildVolumeZ')) || null,
    });
  },

  deletePrinterModel: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };
    const formData = await request.formData();
    return db.deletePrinterModel(database, Number(formData.get('modelId')));
  },
};
