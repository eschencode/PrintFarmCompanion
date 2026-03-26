import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { getSuggestedQueueByPrinterId } from '$lib/server';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ platform, params }) => {
  const database = platform?.env?.DB;
  const printerId = Number(params.printerId);
  if (!database) {
    return { printer: null, spool: null, printModules: [], suggestedQueue: [] };
  }

  const printer = await db.getPrinterById(database, printerId);
  const spool = printer?.loaded_spool_id ? await db.getSpoolById(database, printer.loaded_spool_id) : null;
  
  let printModules = await db.getAllPrintModules(database);
  
  // Filter modules by printer model and preset
  if (spool?.preset_id) {
    printModules = printModules.filter((m: any) => {
      // Check printer model match
      if (m.printer_model_id && printer?.printer_model_id) {
        if (m.printer_model_id !== printer.printer_model_id) return false;
      } else if (m.printer_model_id) {
        return false;
      }
      // Check preset match
      return m.default_spool_preset_id === spool.preset_id;
    });
  }
  
  const suggestedQueue = await getSuggestedQueueByPrinterId(database, printerId);

  return { printer, spool, printModules, suggestedQueue };
};

export const actions: Actions = {
  default: async ({ platform, request, params }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const printerId = Number(params.printerId);
    const formData = await request.formData();
    const moduleId = Number(formData.get('moduleId'));

    const result = await db.startPrintJob(database, {
      printerId,
      moduleId,
    });

    if (result.success) {
      redirect(303, '/kiosk');
    }

    return result;
  },
};
