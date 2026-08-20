import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';
import { AIContextBuilder } from '$lib/recomendation/context-builder';
import { requireCtx } from '$lib/server/context';
import type { DashboardPrinter, PrinterFull } from '$lib/types';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const database = platform?.env?.DB;

  if (!database) {
    console.log('⚠️ Database not available.');
    return { printers: [], spools: [], printModules: [], activePrintJobs: [], printJobs: [], spoolPresets: [], spoolUsage: [], gridPresets: [] };
  }

  // NOTE: the global queue is NOT regenerated here. Doing so ran the heavy
  // getInventoryWithVelocity() forecast a second time (it also runs below for the
  // module cover labels) plus a per-object write loop, blowing the free plan's
  // per-request CPU/subrequest limits (Error 1102). The queue is regenerated on
  // the inventory page and on-demand by the per-printer assignment instead.
  const ctx = requireCtx(locals);

  const [printersFull, spools, printModules, activePrintJobs, printJobs, spoolPresets, spoolUsage, gridPresets, sparePartsCatalog] = await Promise.all([
    db.getAllPrintersFull(ctx),
    db.getAllSpools(ctx),
    db.getAllPrintModules(ctx),
    db.getActivePrintJobs(ctx),
    db.getAllPrintJobs(ctx),
    db.getAllSpoolPresets(ctx),
    db.getSpoolUsageStats(ctx),
    db.getAllGridPresets(ctx),
    db.getSparePartCatalog(ctx),
  ]);

  // Days-of-cover per object → attached to each module so the start-print picker
  // can show "Xd left" alongside the spool-fill numbers. Purely days-till-stockout.
  const inv = await new AIContextBuilder(ctx).getInventoryWithVelocity();
  const daysByObject = new Map(inv.map((i) => [i.id, i.days_until_stockout]));
  const printModulesWithCover = printModules.map((m: any) => ({
    ...m,
    days_until_stockout: m.object_id != null ? daysByObject.get(m.object_id) ?? null : null,
  }));

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

  return { printers, spools, printModules: printModulesWithCover, activePrintJobs, printJobs, spoolPresets, spoolUsage, gridPresets, sparePartsCatalog, workspaceName: locals.workspace?.name ?? null };
};

export const actions: Actions = {
  loadSpool: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const presetId = Number(formData.get('presetId'));
    const slotIndex = Number(formData.get('slotIndex') ?? 0);
    const initialWeightRaw = formData.get('initialWeight');
    const initialWeight = initialWeightRaw ? Number(initialWeightRaw) : undefined;

    const result = await db.loadSpool(ctx, { printerId, presetId, initialWeight, slotIndex });
    return result;
  },

  loadExistingSpool: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const slotIndex = Number(formData.get('slotIndex') ?? 0);
    const spoolId = Number(formData.get('spoolId'));

    if (!spoolId) return { success: false, error: 'No spool selected' };
    return db.loadExistingSpoolIntoSlot(ctx, printerId, slotIndex, spoolId);
  },

  unloadSpool: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const slotIndex = Number(formData.get('slotIndex') ?? 0);

    await db.unloadSpool(ctx, printerId, slotIndex);
    return { success: true, message: 'Spool unloaded' };
  },

  adjustSpoolWeight: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const spoolId = Number(formData.get('spoolId'));
    const remainingWeight = Number(formData.get('remainingWeight'));

    if (!spoolId) return { success: false, error: 'No spool loaded' };
    if (!Number.isFinite(remainingWeight) || remainingWeight < 0)
      return { success: false, error: 'Invalid weight' };

    await db.updateSpoolWeight(ctx, spoolId, Math.round(remainingWeight));
    return { success: true, message: 'Spool weight updated' };
  },

  startPrint: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const moduleId = Number(formData.get('moduleId'));

    return db.startPrintJob(ctx, { printerId, moduleId });
  },

  confirmExternalPrint: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const printerId = Number(formData.get('printerId'));
    const taskId = String(formData.get('taskId') ?? '');
    const moduleIdRaw = formData.get('moduleId');
    const moduleId = moduleIdRaw ? Number(moduleIdRaw) : null;

    if (!printerId || !taskId) return { success: false, error: 'Missing printer or task' };

    return db.adoptExternalPrintJob(ctx, { printerId, moduleId, externalTaskId: taskId });
  },

  completePrint: async ({ platform, request, locals }) => {
    const database = platform?.env?.DB;
    if (!database) return { error: 'Database not available' };
    const ctx = requireCtx(locals);

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
        const job = await db.getPrintJobById(ctx, jobId);
        usedWeightBySlot = job?.module_id
          ? await db.distributeWeightAcrossSlots(ctx, job.module_id, actualWeight)
          : { 0: actualWeight };
      }

      await db.completePrintJob(
        ctx,
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

  changeJobOutcome: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const jobId = Number(formData.get('jobId'));
    const outcome = formData.get('outcome');
    const failureReason = (formData.get('failureReason') as string | null) || null;

    if (!jobId) return { success: false, error: 'Missing job id' };
    if (outcome !== 'successful' && outcome !== 'failed')
      return { success: false, error: 'outcome must be successful | failed' };

    return db.changePrintJobOutcome(ctx, jobId, outcome, failureReason);
  },

  deleteJob: async ({ locals, request }) => {
    const ctx = requireCtx(locals);

    const formData = await request.formData();
    const jobId = Number(formData.get('jobId'));

    if (!jobId) return { success: false, error: 'Missing job id' };

    return db.deletePrintJob(ctx, jobId);
  },
};
