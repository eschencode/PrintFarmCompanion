import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { markSuggestedQueueItemDone } from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;

  if (!database) {
    return { printers: [], spools: [], printModules: [], activePrintJobs: [] };
  }

  const printers = await db.getAllPrinters(database);
  const spools = await db.getAllSpools(database);
  const printModules = await db.getAllPrintModules(database);
  const activePrintJobs = await db.getActivePrintJobs(database);

  return { printers, spools, printModules, activePrintJobs };
};

export const actions: Actions = {
  startPrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const moduleId = Number(formData.get('moduleId'));

    const result = await db.startPrintJob(database, {
      printerId,
      moduleId,
    });

    return result;
  },

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
      const job = await db.getPrintJobById(database, jobId);
      if (!job) {
        return { error: 'Print job not found' };
      }

      const endTime = Date.now();

      await db.completePrintJob(
        database,
        jobId,
        endTime,
        success,
        actualWeight,
        failureReason
      );

      if (job.printer_id) {
        await db.updatePrinterStatus(database, job.printer_id, 'IDLE');
      }

      if (actualWeight > 0 && job.printer_loaded_spool_id) {
        const currentSpool = await db.getSpoolById(database, job.printer_loaded_spool_id);
        if (currentSpool) {
          const newWeight = currentSpool.remaining_weight - actualWeight;
          await db.updateSpoolWeight(database, job.printer_loaded_spool_id, newWeight);
        }
      }

      if (job.printer_id && job.start_time && job.expected_time) {
        let hoursUsed: number;
        if (success) {
          hoursUsed = job.expected_time / 60;
        } else {
          const elapsedMs = endTime - job.start_time;
          hoursUsed = elapsedMs / (1000 * 60 * 60);
        }
        await db.updatePrinterHours(database, job.printer_id, hoursUsed);
      }

      if (success && job.printer_id && job.module_id) {
        await markSuggestedQueueItemDone(database, job.printer_id, { module_id: job.module_id });
      }

      return { success: true };
    } catch (error) {
      console.error('Error completing print job:', error);
      return { error: 'Failed to complete print job' };
    }
  },
};
