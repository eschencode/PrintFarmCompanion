import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { markSuggestedQueueItemDone } from '$lib/server';
import { generateAndSaveSuggestedQueue } from '$lib/ai/recommendation-service';

function getCompatibleModules(printer: any, spool: any, printModules: any[], spoolPresets: any[]) {
  return printModules.filter((m: any) => {
    if (printer.printer_model_id && m.printer_model_id && m.printer_model_id !== printer.printer_model_id) return false;
    if (spool && m.default_spool_preset_id) {
      const preset = spoolPresets.find((sp: any) => sp.id === m.default_spool_preset_id);
      if (preset && preset.material !== spool.material) return false;
    }
    return true;
  });
}

type TopSuggested = { module_id: number; module_name: string; weight: number } | null;
type PrinterFlags = {
  needsNewSpool: boolean;
  printableCount: number;
  topSuggested: TopSuggested;
};

function computePrinterFlags(printers: any[], spools: any[], printModules: any[], spoolPresets: any[], activePrintJobs: any[]) {
  const flags: Record<number, PrinterFlags> = {};
  for (const printer of printers) {
    const spool = printer.loaded_spool_id ? spools.find((s: any) => s.id === printer.loaded_spool_id) : null;
    const activeJob = activePrintJobs.find((j: any) => j.printer_id === printer.id);
    const remainingAfterJob = spool ? spool.remaining_weight - (activeJob?.expected_weight || 0) : 0;
    if (!spool) {
      flags[printer.id] = { needsNewSpool: true, printableCount: 0, topSuggested: null };
      continue;
    }
    const compatible = getCompatibleModules(printer, spool, printModules, spoolPresets);
    const printableCount = compatible.filter((m: any) => (m.expected_weight ?? 0) <= remainingAfterJob).length;

    let topSuggested: TopSuggested = null;
    if (printer.suggested_queue) {
      let queue: any[] = [];
      try {
        queue = Array.isArray(printer.suggested_queue)
          ? printer.suggested_queue
          : JSON.parse(printer.suggested_queue);
      } catch { queue = []; }

      for (const item of queue) {
        if (item.status === 'DONE') continue;
        const mod = compatible.find((m: any) => m.id === item.module_id);
        if (!mod) continue;
        const w = item.weight_of_print ?? mod.expected_weight ?? 0;
        if (w > 0 && w <= remainingAfterJob) {
          topSuggested = { module_id: mod.id, module_name: item.module_name || mod.name, weight: w };
          break;
        }
      }
    }

    flags[printer.id] = { needsNewSpool: printableCount === 0, printableCount, topSuggested };
  }
  return flags;
}

const EMPTY = {
  printers: [],
  spools: [],
  spoolPresets: [],
  printModules: [],
  activePrintJobs: [],
  printerFlags: {},
  serverTime: Date.now(),
};

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) return EMPTY;

  const printers = (await db.getAllPrinters(database)) as any[];
  for (const printer of printers) {
    try {
      printer.suggested_queue = await db.getSuggestedQueueByPrinterId(database, Number(printer.id));
    } catch {
      printer.suggested_queue = [];
    }
  }
  const spools = await db.getAllSpools(database);
  const spoolPresets = await db.getAllSpoolPresets(database);
  const printModules = await db.getAllPrintModules(database);
  const activePrintJobs = await db.getActivePrintJobs(database);
  const printerFlags = computePrinterFlags(printers, spools, printModules, spoolPresets, activePrintJobs);

  return {
    printers,
    spools,
    spoolPresets,
    printModules,
    activePrintJobs,
    printerFlags,
    serverTime: Date.now(),
  };
};

export const actions: Actions = {
  loadSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));

    await db.loadSpool(database, {
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

    try {
      await generateAndSaveSuggestedQueue(database, printerId);
    } catch (e) {
      console.error('Failed to generate queue:', e);
    }

    return { success: true };
  },

  startPrintFallback: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const moduleId = Number(formData.get('moduleId'));

    const result = await db.startPrintJob(database, { printerId, moduleId });
    return result;
  },

  completePrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const jobId = Number(formData.get('jobId'));
    const success = formData.get('success') === 'true';
    const actualWeight = Number(formData.get('actualWeight')) || 0;
    const failureReason = (formData.get('failureReason') as string) || null;

    try {
      const job = await db.getPrintJobById(database, jobId);
      if (!job) return { success: false, error: 'Job not found' };

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
          // expected_time is in SECONDS → convert to hours
          hoursUsed = job.expected_time / 3600;
        } else {
          hoursUsed = (endTime - job.start_time) / (1000 * 60 * 60);
        }
        await db.updatePrinterHours(database, job.printer_id, hoursUsed);
      }

      if (success && job.printer_id && job.module_id) {
        await markSuggestedQueueItemDone(database, job.printer_id, { module_id: job.module_id });
      }

      return { success: true };
    } catch (error) {
      console.error('Error completing print job:', error);
      return { success: false, error: 'Failed to complete print job' };
    }
  },
};
