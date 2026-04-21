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
  printDone: boolean;
  topSuggested: TopSuggested;
};

function computePrinterFlags(printers: any[], spools: any[], printModules: any[], spoolPresets: any[], activePrintJobs: any[], serverTime: number) {
  const flags: Record<number, PrinterFlags> = {};
  for (const printer of printers) {
    const spool = printer.loaded_spool_id ? spools.find((s: any) => s.id === printer.loaded_spool_id) : null;
    const activeJob = activePrintJobs.find((j: any) => j.printer_id === printer.id);
    const remainingAfterJob = spool ? spool.remaining_weight - (activeJob?.expected_weight || 0) : 0;
    const isPrinting = printer.status === 'PRINTING' || printer.status === 'printing';
    // expected_time is stored in MINUTES
    const printDone = isPrinting && activeJob && activeJob.expected_time > 0 && (serverTime - activeJob.start_time) >= activeJob.expected_time * 60_000;
    if (!spool) {
      flags[printer.id] = { needsNewSpool: true, printableCount: 0, printDone: !!printDone, topSuggested: null };
    } else {
      const compatible = getCompatibleModules(printer, spool, printModules, spoolPresets);
      const printableCount = compatible.filter((m: any) => m.expected_weight <= remainingAfterJob).length;

      // Top printable suggestion: first non-DONE queue item that maps to a
      // compatible module and fits the remaining spool weight after any inflight job.
      let topSuggested: TopSuggested = null;
      if (!isPrinting && printer.suggested_queue) {
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

      flags[printer.id] = { needsNewSpool: printableCount === 0, printableCount, printDone: !!printDone, topSuggested };
    }
  }
  return flags;
}

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  if (!database) {
    return { view: 'printers', printers: [], spools: [], spoolPresets: [], printModules: [], activePrintJobs: [], selectedPrinter: null, selectedSpool: null, activeJob: null, suggestedQueue: [], printerId: null, serverTime: Date.now(), printerFlags: {}, failedJobId: null };
  }

  const printers = await db.getAllPrinters(database);
  const spools = await db.getAllSpools(database);
  const spoolPresets = await db.getAllSpoolPresets(database);
  const printModules = await db.getAllPrintModules(database);
  const activePrintJobs = await db.getActivePrintJobs(database);
  const serverTime = Date.now();
  const printerFlags = computePrinterFlags(printers, spools, printModules, spoolPresets, activePrintJobs, serverTime);

  return { view: 'printers', printers, spools, spoolPresets, printModules, activePrintJobs, selectedPrinter: null, selectedSpool: null, activeJob: null, suggestedQueue: [], printerId: null, serverTime, printerFlags, failedJobId: null };
};

async function loadFullData(database: any, view: string, printerId: number | null, failedJobId: number | null = null) {
  const printers = await db.getAllPrinters(database);
  const spools = await db.getAllSpools(database);
  const spoolPresets = await db.getAllSpoolPresets(database);
  const printModules = await db.getAllPrintModules(database);
  const activePrintJobs = await db.getActivePrintJobs(database);

  const selectedPrinter = printerId ? printers.find((p: any) => p.id === printerId) || null : null;
  const selectedSpool = selectedPrinter?.loaded_spool_id ? spools.find((s: any) => s.id === selectedPrinter.loaded_spool_id) || null : null;
  const activeJob = selectedPrinter ? activePrintJobs.find((j: any) => j.printer_id === selectedPrinter.id) || null : null;

  let suggestedQueue: any[] = [];
  let filteredModules = printModules;

  if (view === 'startPrint' && selectedPrinter) {
    // Filter modules by printer model
    if (selectedPrinter.printer_model_id) {
      filteredModules = filteredModules.filter((m: any) =>
        !m.printer_model_id || m.printer_model_id === selectedPrinter.printer_model_id
      );
    }

    // Filter modules by spool material match
    if (selectedSpool) {
      filteredModules = filteredModules.filter((m: any) => {
        if (!m.default_spool_preset_id) return true;
        const preset = spoolPresets.find((sp: any) => sp.id === m.default_spool_preset_id);
        if (!preset) return true;
        return preset.material === selectedSpool.material;
      });
    }

    try {
      suggestedQueue = await db.getSuggestedQueueByPrinterId(database, printerId!) || [];
    } catch (e) {
      console.error('Failed to get suggested queue:', e);
    }
  }

  const serverTime = Date.now();
  const printerFlags = computePrinterFlags(printers, spools, printModules, spoolPresets, activePrintJobs, serverTime);
  return { view, printers, spools, spoolPresets, printModules: filteredModules, activePrintJobs, selectedPrinter, selectedSpool, activeJob, suggestedQueue, printerId, serverTime, printerFlags, failedJobId };
}

export const actions: Actions = {
  navigate: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { view: 'printers', printers: [], spools: [], spoolPresets: [], printModules: [], activePrintJobs: [], selectedPrinter: null, selectedSpool: null, activeJob: null, suggestedQueue: [], printerId: null, serverTime: Date.now(), printerFlags: {}, failedJobId: null };
    }

    const formData = await request.formData();
    const view = (formData.get('view') as string) || 'printers';
    const printerId = Number(formData.get('printerId')) || null;

    return await loadFullData(database, view, printerId);
  },

  loadSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { view: 'printers', printers: [], spools: [], spoolPresets: [], printModules: [], activePrintJobs: [], selectedPrinter: null, selectedSpool: null, activeJob: null, suggestedQueue: [], printerId: null, serverTime: Date.now(), printerFlags: {}, failedJobId: null };
    }

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

    return await loadFullData(database, 'printers', null);
  },

  startPrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { view: 'printers', printers: [], spools: [], spoolPresets: [], printModules: [], activePrintJobs: [], selectedPrinter: null, selectedSpool: null, activeJob: null, suggestedQueue: [], printerId: null, serverTime: Date.now(), printerFlags: {}, failedJobId: null };
    }

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const moduleId = Number(formData.get('moduleId'));

    await db.startPrintJob(database, {
      printerId,
      moduleId,
    });

    return await loadFullData(database, 'printers', null);
  },

  markFailed: async ({ platform, request }) => {
    // Soft-marks a job as "awaiting failure reason" — does not touch the DB.
    // Returns the printers view with failedJobId set so the matching card
    // renders the reason picker. Reason buttons then call ?/completePrint.
    const database = platform?.env?.DB;
    if (!database) {
      return { view: 'printers', printers: [], spools: [], spoolPresets: [], printModules: [], activePrintJobs: [], selectedPrinter: null, selectedSpool: null, activeJob: null, suggestedQueue: [], printerId: null, serverTime: Date.now(), printerFlags: {}, failedJobId: null };
    }
    const formData = await request.formData();
    const jobId = Number(formData.get('jobId')) || null;
    return await loadFullData(database, 'printers', null, jobId);
  },

  completePrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) {
      return { view: 'printers', printers: [], spools: [], spoolPresets: [], printModules: [], activePrintJobs: [], selectedPrinter: null, selectedSpool: null, activeJob: null, suggestedQueue: [], printerId: null, serverTime: Date.now(), printerFlags: {}, failedJobId: null };
    }

    const formData = await request.formData();
    const jobId = Number(formData.get('jobId'));
    const success = formData.get('success') === 'true';
    const actualWeight = Number(formData.get('actualWeight')) || 0;
    const failureReason = (formData.get('failureReason') as string) || null;

    try {
      const job = await db.getPrintJobById(database, jobId);
      if (!job) {
        return await loadFullData(database, 'printers', null);
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
          // expected_time is in MINUTES → convert to hours
          hoursUsed = job.expected_time / 60;
        } else {
          hoursUsed = (endTime - job.start_time) / (1000 * 60 * 60);
        }
        await db.updatePrinterHours(database, job.printer_id, hoursUsed);
      }

      if (success && job.printer_id && job.module_id) {
        await markSuggestedQueueItemDone(database, job.printer_id, { module_id: job.module_id });
      }
    } catch (error) {
      console.error('Error completing print job:', error);
    }

    return await loadFullData(database, 'printers', null);
  },
};
