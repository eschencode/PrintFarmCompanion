import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import type { DashboardPrinter, PrinterFull } from '$lib/types';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;

  if (!database) {
    console.log('⚠️ Database not available.');
    return { printers: [], spools: [], printModules: [], activePrintJobs: [], printJobs: [], spoolPresets: [], gridPresets: [] };
  }

  const [printersFull, spools, printModules, activePrintJobs, printJobs, spoolPresets, gridPresets] = await Promise.all([
    db.getAllPrintersFull(database),
    db.getAllSpools(database),
    db.getAllPrintModules(database),
    db.getActivePrintJobs(database),
    db.getAllPrintJobs(database),
    db.getAllSpoolPresets(database),
    db.getAllGridPresets(database),
  ]);

  // Flatten secrets + derive status onto each printer for the UI
  const printers: DashboardPrinter[] = printersFull.map((p: PrinterFull) => {
    const slot0 = p.loaded_spools?.find(s => s.slot_index === 0);
    const isActivePrinting = activePrintJobs.some((j: any) => j.printer_id === p.id);
    return {
      ...p,
      printer_serial: p.secrets?.serial ?? null,
      printer_ip: p.secrets?.printer_ip ?? null,
      printer_access_code: p.secrets?.access_code ?? null,
      transport: p.secrets?.transport ?? 'auto',
      loaded_spool: (slot0 as any)?.spool ?? null,
      status: !p.active ? 'inactive' : isActivePrinting ? 'printing' : 'idle',
    };
  });

  return { printers, spools, printModules, activePrintJobs, printJobs, spoolPresets, gridPresets };
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

  unloadSpool: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const slotIndex = Number(formData.get('slotIndex') ?? 0);

    await db.unloadSpool(database, printerId, slotIndex);
    return { success: true, message: 'Spool unloaded' };
  },

  startPrint: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    if (!database) return { success: false, error: 'Database not available' };

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const moduleId = Number(formData.get('moduleId'));

    return db.startPrintJob(database, { printerId, moduleId });
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
      // completePrintJob handles spool weight deduction + inventory log internally
      await db.completePrintJob(
        database,
        jobId,
        success,
        { 0: actualWeight }, // single-color: all weight on slot 0
        failureReason,
      );
      return { success: true, message: 'Print job completed' };
    } catch (error) {
      console.error('Error completing print job:', error);
      return { error: 'Failed to complete print job' };
    }
  },
};
