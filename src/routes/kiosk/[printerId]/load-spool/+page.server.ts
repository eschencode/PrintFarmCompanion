import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform, params }) => {
  const database = platform?.env?.DB;
  const printerId = Number(params.printerId);
  if (!database) {
    return { printer: null, spool: null, spoolPresets: [] };
  }

  const printer = await db.getPrinterById(database, printerId);
  const spool = printer?.loaded_spool_id ? await db.getSpoolById(database, printer.loaded_spool_id) : null;
  const spoolPresets = await db.getAllSpoolPresets(database);

  return { printer, spool, spoolPresets };
};

export const actions: Actions = {
  default: async ({ platform, request, params }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const printerId = Number(params.printerId);
    const formData = await request.formData();

    const result = await db.loadSpool(database, {
      printerId,
      spoolData: {
        preset_id: Number(formData.get('presetId')) || null,
        brand: formData.get('brand') as string,
        material: formData.get('material') as string,
        color: (formData.get('color') as string) || null,
        initial_weight: Number(formData.get('initialWeight')),
        remaining_weight: Number(formData.get('remainingWeight')),
        cost: Number(formData.get('cost')) || null,
      },
      forceUnload: true,
    });

    if (result.success) {
      try {
        await db.generateAndSaveSuggestedQueue(database, printerId);
      } catch (e) {
        console.error('Failed to generate queue:', e);
      }
    }

    return result;
  },
};
