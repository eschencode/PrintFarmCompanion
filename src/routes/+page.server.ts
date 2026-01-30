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
        preset_id: Number(formData.get('presetId')) || null,
        brand: formData.get('brand') as string,
        material: formData.get('material') as string,
        color: (formData.get('color') as string) || null,
        initial_weight: Number(formData.get('initialWeight')),
        remaining_weight: Number(formData.get('remainingWeight')),
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
        preset_id: Number(formData.get('presetId')) || null,
        brand: formData.get('brand') as string,
        material: formData.get('material') as string,
        color: (formData.get('color') as string) || null,
        initial_weight: Number(formData.get('initialWeight')),
        remaining_weight: Number(formData.get('remainingWeight')),
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
      return { error: 'Database not available' };
    }

    const formData = await request.formData();
    const jobId = Number(formData.get('jobId'));
    const success = formData.get('success') === 'true';
    const actualWeight = Number(formData.get('actualWeight')) || 0;
    const failureReason = formData.get('failureReason') as string | null;

    try {
      // Get print job details with printer info
      const job = await db.getPrintJobById(database, jobId);
      if (!job) {
        return { error: 'Print job not found' };
      }

      console.log('Completing print job:', {
        jobId,
        success,
        actualWeight,
        failureReason,
        printerLoadedSpoolId: job.printer_loaded_spool_id,
        startTime: job.start_time,
        startTimeDate: new Date(job.start_time).toISOString()
      });

      // ✅ Use milliseconds consistently
      const endTime = Date.now();
      
      // Complete the print job
      await db.completePrintJob(
        database,
        jobId,
        endTime,
        success,
        actualWeight,
        failureReason
      );

      // Update printer status to IDLE
      if (job.printer_id) {
        await db.updatePrinterStatus(database, job.printer_id, 'IDLE');
      }

      // Update spool weight if material was consumed
      if (actualWeight > 0 && job.printer_loaded_spool_id) {
        const currentSpool = await db.getSpoolById(database, job.printer_loaded_spool_id);
        if (currentSpool) {
          const newWeight = currentSpool.remaining_weight - actualWeight;
          console.log('Updating spool weight:', {
            spoolId: job.printer_loaded_spool_id,
            currentWeight: currentSpool.remaining_weight,
            deducting: actualWeight,
            newWeight
          });
          await db.updateSpoolWeight(database, job.printer_loaded_spool_id, newWeight);
        }
      }

      // ✅ Calculate printer hours from MILLISECONDS
      if (job.printer_id && job.start_time) {
        const elapsedMs = endTime - job.start_time; // Both in milliseconds
        const hoursUsed = elapsedMs / (1000 * 60 * 60); // Convert ms to hours
        
        console.log('Updating printer hours:', {
          printerId: job.printer_id,
          startTime: job.start_time,
          endTime: endTime,
          elapsedMs,
          hoursUsed: hoursUsed.toFixed(2)
        });
        
        await db.updatePrinterHours(database, job.printer_id, hoursUsed);
      }

      return { success: true, message: 'Print job completed' };
    } catch (error) {
      console.error('Error completing print job:', error);
      return { error: 'Failed to complete print job' };
    }
  }
};