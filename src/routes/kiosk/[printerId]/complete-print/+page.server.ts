import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { markSuggestedQueueItemDone } from '$lib/server';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ platform, params }) => {
  const database = platform?.env?.DB;
  const printerId = Number(params.printerId);
  if (!database) {
    return { printer: null, spool: null, activeJob: null };
  }

  const printer = await db.getPrinterById(database, printerId);
  const spool = printer?.loaded_spool_id ? await db.getSpoolById(database, printer.loaded_spool_id) : null;
  const activePrintJobs = await db.getActivePrintJobs(database);
  const activeJob = activePrintJobs.find((j) => j.printer_id === printerId) || null;

  return { printer, spool, activeJob };
};

export const actions: Actions = {
  default: async ({ platform, request, params }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { error: 'Database not available' };
    }

    const formData = await request.formData();
    const jobId = Number(formData.get('jobId'));
    const success = formData.get('success') === 'true';
    const actualWeight = Number(formData.get('actualWeight')) || 0;
    const failureReason = (formData.get('failureReason') as string) || null;

    try {
      const job = await db.getPrintJobById(database, jobId);
      if (!job) {
        return { error: 'Print job not found' };
      }

      const endTime = Date.now();

      await db.completePrintJob(database, jobId, endTime, success, actualWeight, failureReason);

      if (job.printer_id) {
        await db.updatePrinterStatus(database, job.printer_id, 'IDLE');
      }

      if (actualWeight > 0 && job.printer_loaded_spool_id) {
        const currentSpool = await db.getSpoolById(database, job.printer_loaded_spool_id);
        if (currentSpool) {
          await db.updateSpoolWeight(database, job.printer_loaded_spool_id, currentSpool.remaining_weight - actualWeight);
        }
      }

      if (job.printer_id && job.start_time && job.expected_time) {
        let hoursUsed: number;
        if (success) {
          hoursUsed = job.expected_time / 60;
        } else {
          hoursUsed = (endTime - job.start_time) / (1000 * 60 * 60);
        }
        await db.updatePrinterHours(database, job.printer_id, hoursUsed);
      }

      if (success && job.printer_id && job.module_id) {
        await markSuggestedQueueItemDone(database, job.printer_id, { module_id: job.module_id });
      }

      redirect(303, '/kiosk');
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error; // re-throw redirect
      console.error('Error completing print job:', error);
      return { error: 'Failed to complete print job' };
    }
  },
};
