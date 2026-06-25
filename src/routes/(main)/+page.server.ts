import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { regenerateGlobalQueueIfStale } from '$lib/server/printQueue';
import type { DashboardPrinter, PrinterFull } from '$lib/types';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;

  if (!database) {
    console.log('⚠️ Database not available.');
    return { printers: [], spools: [], printModules: [], activePrintJobs: [], printJobs: [], spoolPresets: [], spoolUsage: [], gridPresets: [] };
  }

  // Warm the global queue on dashboard load so the first per-printer spool-load
  // assignment is fast (no synchronous full regeneration on the click path).
  await regenerateGlobalQueueIfStale(database);

  const [printersFull, spools, printModules, activePrintJobs, printJobs, spoolPresets, spoolUsage, gridPresets] = await Promise.all([
    db.getAllPrintersFull(database),
    db.getAllSpools(database),
    db.getAllPrintModules(database),
    db.getActivePrintJobs(database),
    db.getAllPrintJobs(database),
    db.getAllSpoolPresets(database),
    db.getSpoolUsageStats(database),
    db.getAllGridPresets(database),
  ]);

  // Flatten secrets + derive status onto each printer for the UI
  const nowSec = Math.floor(Date.now() / 1000);
  const printers: DashboardPrinter[] = printersFull.map((p: PrinterFull) => {
    const slot0 = p.loaded_spools?.find(s => s.slot_index === 0);
    const activeJob = activePrintJobs.find((j: any) => j.printer_id === p.id);
    // Manual/direct/fallback prints have no printer that reports FINISH — their
    // only completion signal is the estimated end time elapsing. (Pi prints leave
    // expected_end_time null and rely on the webhook to set print_finished.)
    const timedOut =
      activeJob?.status === 'printing' &&
      activeJob.expected_end_time != null &&
      (activeJob.expected_end_time as number) <= nowSec;
    return {
      ...p,
      printer_serial: p.secrets?.serial ?? null,
      printer_ip: p.secrets?.printer_ip ?? null,
      printer_access_code: p.secrets?.access_code ?? null,
      transport: p.secrets?.transport ?? 'auto',
      loaded_spool: slot0?.spool ?? null,
      status: !p.active
        ? 'inactive'
        : activeJob?.status === 'print_finished' || timedOut
          ? 'finished'
          : activeJob
            ? 'printing'
            : 'idle',
    };
  });

  return { printers, spools, printModules, activePrintJobs, printJobs, spoolPresets, spoolUsage, gridPresets };
};

export const actions: Actions = {
  loadSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const presetId = Number(formData.get('presetId'));
    const slotIndex = Number(formData.get('slotIndex') ?? 0);
    const initialWeightRaw = formData.get('initialWeight');
    const initialWeight = initialWeightRaw ? Number(initialWeightRaw) : undefined;

    const result = await db.loadSpool(database, { printerId, presetId, initialWeight, slotIndex });
    return result;
  },

  loadExistingSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const slotIndex = Number(formData.get('slotIndex') ?? 0);
    const spoolId = Number(formData.get('spoolId'));

    if (!spoolId) return { success: false, error: 'No spool selected' };
    return db.loadExistingSpoolIntoSlot(database, printerId, slotIndex, spoolId);
  },

  unloadSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const slotIndex = Number(formData.get('slotIndex') ?? 0);

    await db.unloadSpool(database, printerId, slotIndex);
    return { success: true, message: 'Spool unloaded' };
  },

  adjustSpoolWeight: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const spoolId = Number(formData.get('spoolId'));
    const remainingWeight = Number(formData.get('remainingWeight'));

    if (!spoolId) return { success: false, error: 'No spool loaded' };
    if (!Number.isFinite(remainingWeight) || remainingWeight < 0)
      return { success: false, error: 'Invalid weight' };

    await db.updateSpoolWeight(database, spoolId, Math.round(remainingWeight));
    return { success: true, message: 'Spool weight updated' };
  },

  startPrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const moduleId = Number(formData.get('moduleId'));

    return db.startPrintJob(database, { printerId, moduleId });
  },

  confirmExternalPrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const taskId = String(formData.get('taskId') ?? '');
    const moduleIdRaw = formData.get('moduleId');
    const moduleId = moduleIdRaw ? Number(moduleIdRaw) : null;

    if (!printerId || !taskId) return { success: false, error: 'Missing printer or task' };

    return db.adoptExternalPrintJob(database, { printerId, moduleId, externalTaskId: taskId });
  },

  completePrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { error: 'Database not available' };

    const formData = await request.formData();
    const jobId = Number(formData.get('jobId'));
    const success = formData.get('success') === 'true';
    const actualWeight = Number(formData.get('actualWeight')) || 0;
    const failureReason = (formData.get('failureReason') as string | null) || null;

    try {
      // Split the reported total across the module's slots so multi-spool
      // jobs deduct from each loaded spool by its share. Falls back to
      // {0: total} when the module has no per-slot weights.
      let usedWeightBySlot: Record<number, number> = {};
      if (success && actualWeight > 0) {
        const job = await db.getPrintJobById(database, jobId);
        usedWeightBySlot = job?.module_id
          ? await db.distributeWeightAcrossSlots(database, job.module_id, actualWeight)
          : { 0: actualWeight };
      }

      await db.completePrintJob(
        database,
        jobId,
        success,
        usedWeightBySlot,
        failureReason,
      );
      return { success: true, message: 'Print job completed' };
    } catch (error) {
      console.error('Error completing print job:', error);
      return { error: 'Failed to complete print job' };
    }
  },
};
