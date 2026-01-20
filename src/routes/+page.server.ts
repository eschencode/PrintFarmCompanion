import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  
  if (!database) {
    console.log('⚠️ Database not available.');
    return { printers: [], spools: [], printModules: [], activePrintJobs: [], printJobs: [], spoolPresets: [] };
  }

  const printers = await db.getAllPrinters(database);
  const spools = await db.getAllSpools(database);
  const printModules = await db.getAllPrintModules(database);
  const activePrintJobs = await db.getActivePrintJobs(database);
  const printJobs = await db.getAllPrintJobs(database);
  const spoolPresets = await db.getAllSpoolPresets(database);

  return { printers, spools, printModules, activePrintJobs, printJobs, spoolPresets };
};

export const actions: Actions = {
  addBlueSpool: async ({ platform }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false };
    }

    await db.createSpool(database, {
      presetId: 1,
      brand: 'Generic',
      material: 'PLA',
      color: 'Blue',
      initialWeight: 1000,
      remainingWeight: 1000,
      cost: 20.00
    });
    console.log("SPOOL ADDED");

    return { success: true };
  },

  loadSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));

    const result = await db.loadSpool(database, {
      printerId: printerId,
      spoolData: {
        presetId: Number(formData.get('presetId')) || null,
        brand: formData.get('brand') as string,
        material: formData.get('material') as string,
        color: (formData.get('color') as string) || null,
        initialWeight: Number(formData.get('initialWeight')),
        remainingWeight: Number(formData.get('remainingWeight')),
        cost: Number(formData.get('cost')) || null,
      },
      forceUnload: true
    });

    return result;
  },

  forceLoadSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));

    const result = await db.loadSpool(database, {
      printerId: printerId,
      spoolData: {
        presetId: Number(formData.get('presetId')) || null,
        brand: formData.get('brand') as string,
        material: formData.get('material') as string,
        color: (formData.get('color') as string) || null,
        initialWeight: Number(formData.get('initialWeight')),
        remainingWeight: Number(formData.get('remainingWeight')),
        cost: Number(formData.get('cost')) || null,
      },
      forceUnload: true
    });

    return result;
  },

  unloadSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false };
    }

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));

    await db.unloadSpool(database, printerId);

    return { success: true, message: 'Spool unloaded successfully' };
  },

  // Start a print job
  startPrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const moduleId = Number(formData.get('moduleId'));
    const name = formData.get('name') as string || undefined;

    const result = await db.startPrintJob(database, {
      printerId,
      moduleId,
      name
    });

    return result;
  },

  // Complete a print job
  completePrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const jobId = Number(formData.get('jobId'));
    const success = formData.get('success') === 'true';
    const actualWeight = Number(formData.get('actualWeight')) || undefined;
    const wasteWeight = Number(formData.get('wasteWeight')) || 0;
    const failureReason = formData.get('failureReason') as string || undefined;

    const result = await db.completePrintJob(database, {
      jobId,
      success,
      actualWeight,
      wasteWeight,
      failureReason
    });

    return result;
  }
};