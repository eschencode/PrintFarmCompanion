import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import type { PrintJob, PrintJobFull, PrintJobWithDetails, PrintJobSpool, StartPrintResponse, ServerResponse } from '../types';
import { getPrinterById, getLoadedSpools } from './printers';
import { getSpoolById, updateSpoolWeight } from './spools';
import { getPrintModuleById, getModuleFilamentSlots } from './modules';
import { logPrinterEvent } from './events';
import type { TenantContext } from './context';

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPrintJobById(ctx: TenantContext, id: number): Promise<PrintJobFull | null> {
  const row = await ctx.db.get<PrintJob>(sql`
    SELECT
      pj.*,
      p.name  as printer_name,
      pm.name as module_name,
      pm.weight as module_weight,
      pm.expected_time_minutes
    FROM print_jobs pj
    LEFT JOIN printers      p  ON pj.printer_id = p.id
    LEFT JOIN print_modules pm ON pj.module_id  = pm.id
    WHERE pj.id = ${id} AND pj.workspace_id = ${ctx.workspaceId}
  `);
  if (!row) return null;

  const spools = await getPrintJobSpools(ctx, id);
  return { ...row, spools } as unknown as PrintJobFull;
}

export async function getPrintJobSpools(ctx: TenantContext, jobId: number): Promise<PrintJobSpool[]> {
  const rows = await ctx.db.all<PrintJobSpool>(sql`
    SELECT
      pjs.print_job_id, pjs.slot_index, pjs.spool_id, pjs.used_weight,
      sp.color, sp.brand, sp.material,
      s.remaining_weight, s.initial_weight
    FROM print_job_spools pjs
    LEFT JOIN spools        s  ON pjs.spool_id  = s.id
    LEFT JOIN spool_presets sp ON s.preset_id   = sp.id
    WHERE pjs.print_job_id = ${jobId} AND pjs.workspace_id = ${ctx.workspaceId}
    ORDER BY pjs.slot_index
  `);
  return rows ?? [];
}

export async function getRecentPrintJobs(ctx: TenantContext, limit = 10): Promise<PrintJobFull[]> {
  const rows = await ctx.db.all<PrintJob>(sql`
    SELECT
      pj.*,
      p.name  as printer_name,
      pm.name as module_name
    FROM print_jobs pj
    LEFT JOIN printers      p  ON pj.printer_id = p.id
    LEFT JOIN print_modules pm ON pj.module_id  = pm.id
    WHERE pj.workspace_id = ${ctx.workspaceId}
    ORDER BY pj.created_at DESC
    LIMIT ${limit}
  `);
  return (rows ?? []) as unknown as PrintJobFull[];
}

export async function getAllPrintJobs(ctx: TenantContext): Promise<PrintJobWithDetails[]> {
  const rows = await ctx.db.all<PrintJob>(sql`
    SELECT
      pj.*,
      p.name  as printer_name,
      pm.name as module_name,
      pm.expected_time_minutes
    FROM print_jobs pj
    LEFT JOIN printers      p  ON pj.printer_id = p.id
    LEFT JOIN print_modules pm ON pj.module_id  = pm.id
    WHERE pj.workspace_id = ${ctx.workspaceId}
    ORDER BY pj.created_at DESC
  `);
  return (rows ?? []) as unknown as PrintJobWithDetails[];
}

/** Spool slot info joined for the history modal (subset of the stats join). */
export interface PrinterHistorySpool {
  print_job_id: number;
  slot_index: number;
  spool_id: number | null;
  used_weight: number | null;
  color: string | null;
  color_hex: string | null;
  brand: string | null;
  material: string | null;
}

export type PrinterHistoryJob = PrintJobWithDetails & { spools: PrinterHistorySpool[] };

/**
 * Newest-first jobs for one printer, with module info + per-slot spools for
 * the history modal. `before` (unix seconds, compared against created_at —
 * start_time can be null) enables keyset pagination.
 */
export async function getPrintJobsForPrinter(
  ctx: TenantContext,
  printerId: number,
  limit = 50,
  before?: number,
): Promise<PrinterHistoryJob[]> {
  const rows = await ctx.db.all<PrintJobWithDetails>(sql`
    SELECT
      pj.*,
      pm.name as module_name,
      pm.weight as module_weight,
      pm.thumbnail as module_thumbnail,
      pm.expected_time_minutes,
      pm.objects_per_print
    FROM print_jobs pj
    LEFT JOIN print_modules pm ON pj.module_id = pm.id
    WHERE pj.printer_id = ${printerId} AND pj.workspace_id = ${ctx.workspaceId}
      ${before !== undefined ? sql`AND pj.created_at < ${before}` : sql``}
    ORDER BY pj.created_at DESC
    LIMIT ${limit}
  `);

  const jobs: PrinterHistoryJob[] = (rows ?? []).map((row) => ({ ...row, spools: [] }));
  if (jobs.length === 0) return jobs;

  // One batched query for all jobs' spools — not per-job round-trips.
  const ids = sql.join(jobs.map((j) => sql`${j.id}`), sql`, `);
  const spoolRows = await ctx.db.all<PrinterHistorySpool>(sql`
    SELECT
      pjs.print_job_id, pjs.slot_index, pjs.spool_id, pjs.used_weight,
      sp.color, sp.color_hex, sp.brand, sp.material
    FROM print_job_spools pjs
    LEFT JOIN spools        s  ON pjs.spool_id = s.id
    LEFT JOIN spool_presets sp ON s.preset_id  = sp.id
    WHERE pjs.workspace_id = ${ctx.workspaceId} AND pjs.print_job_id IN (${ids})
    ORDER BY pjs.print_job_id, pjs.slot_index
  `);

  const byJob = new Map(jobs.map((j) => [j.id, j]));
  for (const row of spoolRows ?? []) {
    byJob.get(row.print_job_id)?.spools.push(row);
  }
  return jobs;
}

/**
 * Stats-tailored job row. Aggregates print_job_spools across slots so the
 * caller doesn't need to N+1 queries to compute material / cost.
 *
 * - total_used_weight: grams across all slots (null-safe summed)
 * - total_cost: sum(used_weight * preset.cost / preset.default_weight)
 *   (preserves existing cost-per-gram math; cost unit is whatever the preset stores)
 * - primary_color/brand/material: slot 0's spool (the "single-color view")
 *
 * start_time / expected_end_time / created_at / updated_at are converted
 * from Unix seconds to milliseconds here so consumers can use Date.now() math.
 */
export interface PrintJobStatsRow {
  id: number;
  module_id: number | null;
  printer_id: number | null;
  external_task_id: string | null;
  start_time: number | null;       // ms
  expected_end_time: number | null; // ms
  status: string;
  failure_reason: string | null;
  created_at: number;              // ms
  updated_at: number;              // ms
  printer_name: string | null;
  module_name: string | null;
  module_thumbnail: string | null;
  module_weight: number;
  expected_time_minutes: number;
  objects_per_print: number;
  total_used_weight: number;
  total_cost: number;
  primary_color: string | null;
  primary_brand: string | null;
  primary_material: string | null;
}

export async function getAllPrintJobsForStats(ctx: TenantContext): Promise<PrintJobStatsRow[]> {
  const rows = await ctx.db.all<{
    id: number;
    module_id: number | null;
    printer_id: number | null;
    external_task_id: string | null;
    start_time: number | null;
    expected_end_time: number | null;
    status: string;
    failure_reason: string | null;
    created_at: number;
    updated_at: number;
    printer_name: string | null;
    module_name: string | null;
    module_thumbnail: string | null;
    module_weight: number | null;
    expected_time_minutes: number | null;
    objects_per_print: number | null;
    total_used_weight: number | null;
    total_cost: number | null;
    primary_color: string | null;
    primary_brand: string | null;
    primary_material: string | null;
  }>(sql`
    SELECT
      pj.id, pj.module_id, pj.printer_id, pj.external_task_id,
      pj.start_time, pj.expected_end_time, pj.status, pj.failure_reason,
      pj.created_at, pj.updated_at,
      p.name              as printer_name,
      pm.name             as module_name,
      pm.thumbnail        as module_thumbnail,
      pm.weight           as module_weight,
      pm.expected_time_minutes,
      pm.objects_per_print,
      COALESCE(SUM(pjs.used_weight), 0) as total_used_weight,
      COALESCE(SUM(
        CASE WHEN pjs.used_weight IS NOT NULL
              AND sp.cost > 0
              AND sp.default_weight > 0
          THEN pjs.used_weight * sp.cost / sp.default_weight
          ELSE 0
        END
      ), 0) as total_cost,
      MAX(CASE WHEN pjs.slot_index = 0 THEN sp.color    END) as primary_color,
      MAX(CASE WHEN pjs.slot_index = 0 THEN sp.brand    END) as primary_brand,
      MAX(CASE WHEN pjs.slot_index = 0 THEN sp.material END) as primary_material
    FROM print_jobs pj
    LEFT JOIN printers          p   ON pj.printer_id = p.id
    LEFT JOIN print_modules     pm  ON pj.module_id  = pm.id
    LEFT JOIN print_job_spools  pjs ON pj.id         = pjs.print_job_id
    LEFT JOIN spools            s   ON pjs.spool_id  = s.id
    LEFT JOIN spool_presets     sp  ON s.preset_id   = sp.id
    WHERE pj.workspace_id = ${ctx.workspaceId}
    GROUP BY pj.id
    ORDER BY pj.created_at DESC
  `);

  return (rows ?? []).map((r) => ({
    id: r.id,
    module_id: r.module_id,
    printer_id: r.printer_id,
    external_task_id: r.external_task_id,
    start_time: r.start_time != null ? r.start_time * 1000 : null,
    expected_end_time: r.expected_end_time != null ? r.expected_end_time * 1000 : null,
    status: r.status,
    failure_reason: r.failure_reason,
    created_at: r.created_at * 1000,
    updated_at: r.updated_at * 1000,
    printer_name: r.printer_name,
    module_name: r.module_name,
    module_thumbnail: r.module_thumbnail,
    module_weight: r.module_weight ?? 0,
    expected_time_minutes: r.expected_time_minutes ?? 0,
    objects_per_print: r.objects_per_print ?? 1,
    total_used_weight: r.total_used_weight ?? 0,
    total_cost: r.total_cost ?? 0,
    primary_color: r.primary_color,
    primary_brand: r.primary_brand,
    primary_material: r.primary_material,
  }));
}

export async function getActivePrintJobs(ctx: TenantContext): Promise<PrintJobWithDetails[]> {
  const rows = await ctx.db.all<PrintJob>(sql`
    SELECT
      pj.*,
      p.name           as printer_name,
      ps.serial        as printer_serial,
      pm.name          as module_name,
      pm.weight        as module_weight,
      pm.expected_time_minutes,
      pm.objects_per_print,
      pm.thumbnail     as module_thumbnail
    FROM print_jobs pj
    JOIN printers      p  ON pj.printer_id = p.id
    JOIN print_modules pm ON pj.module_id  = pm.id
    LEFT JOIN printer_secrets ps ON p.id = ps.printer_id
    WHERE pj.workspace_id = ${ctx.workspaceId} AND pj.status IN ('printing', 'print_finished')
    ORDER BY pj.created_at DESC
  `);
  return (rows ?? []) as unknown as PrintJobWithDetails[];
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Start a print job on a printer.
 * Snapshots the current printer_loaded_spools into print_job_spools so the
 * historical record is accurate even if spools are swapped after the print.
 */
export async function startPrintJob(
  ctx: TenantContext,
  params: { printerId: number; moduleId: number },
): Promise<StartPrintResponse> {
  const { printerId, moduleId } = params;
  const drizzleDb = ctx.db;

  const printer = await getPrinterById(ctx, printerId);
  if (!printer) return { success: false, error: 'Printer not found' };

  const module = await getPrintModuleById(ctx, moduleId);
  if (!module) return { success: false, error: 'Print module not found' };

  const loadedSlots = await getLoadedSpools(ctx, printerId);

  // Warn if module has filament requirements but printer has nothing loaded
  const lowMaterial =
    loadedSlots.length === 0 ||
    loadedSlots.some((slot) => {
      const s = slot as unknown as { remaining_weight?: number };
      return (s.remaining_weight ?? 0) < module.weight / Math.max(loadedSlots.length, 1);
    });

  // Close any currently-printing jobs on this printer
  await closeOpenPrintJobsForPrinter(ctx, printerId, moduleId);

  const now = Math.floor(Date.now() / 1000);
  const expectedEndTime = now + module.expected_time_minutes * 60;

  const result = await drizzleDb.run(sql`
    INSERT INTO print_jobs (
      workspace_id, module_id, printer_id, start_time, expected_end_time,
      status, created_at, updated_at
    ) VALUES (
      ${ctx.workspaceId}, ${moduleId}, ${printerId}, ${now}, ${expectedEndTime},
      'printing', ${now}, ${now}
    )
  `);

  const jobId = result.meta.last_row_id as number;

  // Snapshot loaded spools → print_job_spools (one row per slot)
  for (const slot of loadedSlots) {
    const s = slot as unknown as { slot_index: number; spool_id: number | null };
    await drizzleDb.run(sql`
      INSERT INTO print_job_spools (workspace_id, print_job_id, slot_index, spool_id, used_weight)
      VALUES (${ctx.workspaceId}, ${jobId}, ${s.slot_index}, ${s.spool_id ?? null}, NULL)
    `);
  }

  await logPrinterEvent(ctx, printerId, 'print_started', { module: module.name }, jobId);

  return {
    success: true,
    jobId,
    message: `Print started on ${printer.name}`,
    expectedTime: module.expected_time_minutes,
    expectedWeight: module.weight,
    lowMaterial,
  };
}

/**
 * Distribute a single total used-weight number across the module's slots,
 * proportional to each slot's expected weight. Fallbacks:
 *  - if no slots have a stored weight, the total lands on slot 0;
 *  - if total is 0 or negative, returns the per-slot expected weights as-is
 *    (so spools are still deducted by the planned amount).
 *
 * Use this when the user only reports a single combined "actual weight" from
 * the dashboard's Complete Print form — the schema can still attribute usage
 * to each spool correctly.
 */
export async function distributeWeightAcrossSlots(
  ctx: TenantContext,
  moduleId: number,
  totalUsedWeight: number,
): Promise<Record<number, number>> {
  const slots = await getModuleFilamentSlots(ctx, moduleId);
  if (slots.length === 0) {
    return totalUsedWeight > 0 ? { 0: totalUsedWeight } : {};
  }

  const slotWeights = slots.map((s) => ({
    slot_index: s.slot_index,
    weight: typeof s.weight === 'number' && s.weight > 0 ? s.weight : 0,
  }));
  const planned = slotWeights.reduce((sum: number, s) => sum + s.weight, 0);

  // No per-slot weights stored — fall back to slot 0 for the whole amount.
  if (planned === 0) {
    return totalUsedWeight > 0 ? { [slotWeights[0].slot_index]: totalUsedWeight } : {};
  }

  // No total reported — deduct exactly the planned amounts per slot.
  const effectiveTotal = totalUsedWeight > 0 ? totalUsedWeight : planned;

  const out: Record<number, number> = {};
  for (const s of slotWeights) {
    if (s.weight === 0) continue;
    out[s.slot_index] = Math.round((s.weight / planned) * effectiveTotal);
  }
  return out;
}

/**
 * Complete a print job: record used weight per slot, deduct from spools,
 * and (on success) add to inventory.
 *
 * For single-color jobs, pass usedWeightBySlot as `{ 0: totalGrams }`.
 * For multi-color, pass one entry per slot — or use
 * `distributeWeightAcrossSlots` to split a single total proportionally.
 */
export async function completePrintJob(
  ctx: TenantContext,
  jobId: number,
  success: boolean,
  usedWeightBySlot: Record<number, number> = {},
  failureReason: string | null = null,
): Promise<void> {
  const drizzleDb = ctx.db;
  const now = Math.floor(Date.now() / 1000);

  const status = success ? 'successful' : 'failed';

  // Idempotency guard: only complete a job that's still open. A double submit
  // (e.g. re-confirming from a stale modal) would otherwise re-deduct spool
  // weight and re-log inventory for an already-completed job.
  const res = await drizzleDb.run(sql`
    UPDATE print_jobs
    SET status = ${status}, failure_reason = ${failureReason}, updated_at = ${now}
    WHERE id = ${jobId} AND workspace_id = ${ctx.workspaceId}
      AND status IN ('printing', 'print_finished')
  `);
  if ((res.meta.changes ?? 0) === 0) return;

  const job = await getPrintJobById(ctx, jobId);

  // Update used weight per slot and deduct from physical spools
  const spoolRows = await getPrintJobSpools(ctx, jobId);
  for (const row of spoolRows) {
    const usedWeight = usedWeightBySlot[row.slot_index] ?? null;
    if (usedWeight !== null) {
      await drizzleDb.run(sql`
        UPDATE print_job_spools
        SET used_weight = ${usedWeight}
        WHERE print_job_id = ${jobId} AND slot_index = ${row.slot_index} AND workspace_id = ${ctx.workspaceId}
      `);
      if (row.spool_id) {
        const spool = await getSpoolById(ctx, row.spool_id);
        if (spool) {
          await updateSpoolWeight(ctx, row.spool_id, Math.max(0, spool.remaining_weight - usedWeight));
        }
      }
    }
  }

  // Add to inventory if module produces an object
  if (success && job?.module_id) {
    const module = await getPrintModuleById(ctx, job.module_id);
    if (module?.object_id) {
      const quantity = module.objects_per_print ?? 1;
      await drizzleDb.run(sql`
        UPDATE objects
        SET in_stock = in_stock + ${quantity}, updated_at = ${now}
        WHERE id = ${module.object_id} AND workspace_id = ${ctx.workspaceId}
      `);
      await drizzleDb.run(sql`
        INSERT INTO inventory_log (workspace_id, object_id, change_type, quantity, print_job_id, created_at)
        VALUES (${ctx.workspaceId}, ${module.object_id}, '+ printed', ${quantity}, ${jobId}, ${now})
      `);
    }
  }

  if (job?.printer_id) {
    const totalWeight = Object.values(usedWeightBySlot).reduce((sum, w) => sum + w, 0);
    await logPrinterEvent(ctx, job.printer_id, success ? 'marked_successful' : 'marked_failed', {
      ...(failureReason ? { reason: failureReason } : {}),
      ...(totalWeight > 0 ? { totalWeight } : {}),
    }, jobId);
  }
}

/**
 * Retroactively flip a finished job's outcome (e.g. a batch marked successful
 * turns out bad). Only terminal→terminal: successful ↔ failed, with
 * failed_confirmed accepted as a flip source so auto-failed jobs can be
 * corrected. Reverses the inventory side of completePrintJob when the
 * success-ness actually changes; spool weights stay untouched (the filament
 * was consumed either way).
 */
export async function changePrintJobOutcome(
  ctx: TenantContext,
  jobId: number,
  newOutcome: 'successful' | 'failed',
  failureReason: string | null = null,
): Promise<ServerResponse> {
  const drizzleDb = ctx.db;
  const now = Math.floor(Date.now() / 1000);

  const job = await getPrintJobById(ctx, jobId);
  if (!job) return { success: false, error: 'Print job not found' };

  if (!['successful', 'failed', 'failed_confirmed'].includes(job.status)) {
    return { success: false, error: 'Job is still open — complete it instead' };
  }
  if (job.status === newOutcome) {
    return { success: false, error: 'Job already has that outcome' };
  }

  const reason = newOutcome === 'failed' ? failureReason : null;

  // Keyed on the observed status so a concurrent flip can't double-apply the
  // inventory delta below.
  const res = await drizzleDb.run(sql`
    UPDATE print_jobs
    SET status = ${newOutcome}, failure_reason = ${reason}, updated_at = ${now}
    WHERE id = ${jobId} AND workspace_id = ${ctx.workspaceId} AND status = ${job.status}
  `);
  if ((res.meta.changes ?? 0) === 0) {
    return { success: false, error: 'Job changed in the meantime — reload and retry' };
  }

  const wasSuccessful = job.status === 'successful';
  const isSuccessful = newOutcome === 'successful';
  if (wasSuccessful !== isSuccessful && job.module_id) {
    const module = await getPrintModuleById(ctx, job.module_id);
    if (module?.object_id) {
      const quantity = module.objects_per_print ?? 1;
      await drizzleDb.run(sql`
        UPDATE objects
        SET in_stock = in_stock + ${isSuccessful ? quantity : -quantity}, updated_at = ${now}
        WHERE id = ${module.object_id} AND workspace_id = ${ctx.workspaceId}
      `);
      await drizzleDb.run(sql`
        INSERT INTO inventory_log (workspace_id, object_id, change_type, quantity, print_job_id, created_at)
        VALUES (${ctx.workspaceId}, ${module.object_id}, ${isSuccessful ? '+ printed' : '- printed reversal'}, ${quantity}, ${jobId}, ${now})
      `);
    }
  }

  if (job.printer_id) {
    await logPrinterEvent(ctx, job.printer_id, 'outcome_changed', {
      from: job.status,
      to: newOutcome,
      ...(reason ? { reason } : {}),
    }, jobId);
  }

  return { success: true, message: `Outcome changed to ${newOutcome}` };
}

/**
 * Permanently delete a print job (e.g. a stale queued/paused entry). If the
 * job was successful, its inventory contribution is reversed first so stock
 * counts stay honest. Spool weight is left alone — filament consumed by a real
 * print isn't un-consumed by deleting the record. The print_job_spools snapshot
 * is removed explicitly (not relying on FK cascade); inventory_log and
 * printer_events keep their rows with the job link nulled.
 */
export async function deletePrintJob(
  ctx: TenantContext,
  jobId: number,
): Promise<ServerResponse> {
  const drizzleDb = ctx.db;
  const now = Math.floor(Date.now() / 1000);

  const job = await getPrintJobById(ctx, jobId);
  if (!job) return { success: false, error: 'Print job not found' };

  // Reverse the inventory a successful print added, so deleting the record
  // doesn't leave the stock count inflated.
  if (job.status === 'successful' && job.module_id) {
    const module = await getPrintModuleById(ctx, job.module_id);
    if (module?.object_id) {
      const quantity = module.objects_per_print ?? 1;
      await drizzleDb.run(sql`
        UPDATE objects
        SET in_stock = in_stock - ${quantity}, updated_at = ${now}
        WHERE id = ${module.object_id} AND workspace_id = ${ctx.workspaceId}
      `);
      await drizzleDb.run(sql`
        INSERT INTO inventory_log (workspace_id, object_id, change_type, quantity, print_job_id, created_at)
        VALUES (${ctx.workspaceId}, ${module.object_id}, '- printed reversal', ${quantity}, ${jobId}, ${now})
      `);
    }
  }

  await drizzleDb.run(sql`
    DELETE FROM print_job_spools WHERE print_job_id = ${jobId} AND workspace_id = ${ctx.workspaceId}
  `);
  const res = await drizzleDb.run(sql`
    DELETE FROM print_jobs WHERE id = ${jobId} AND workspace_id = ${ctx.workspaceId}
  `);
  if ((res.meta.changes ?? 0) === 0) return { success: false, error: 'Nothing deleted' };

  // Standalone printer-level event (the job link would be nulled by delete anyway).
  if (job.printer_id) {
    const moduleName = (job as unknown as { module_name?: string | null }).module_name ?? null;
    await logPrinterEvent(ctx, job.printer_id, 'print_deleted', {
      module: moduleName,
      status: job.status,
    });
  }

  return { success: true, message: 'Print deleted' };
}

/**
 * Close any printing jobs for a printer before starting a new one.
 * Same module → mark as failed_confirmed (restart), different module → failed.
 * Does not attempt weight deduction (use completePrintJob for that).
 */
export async function closeOpenPrintJobsForPrinter(
  ctx: TenantContext,
  printerId: number,
  newModuleId: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  const open = await ctx.db.all<{ id: number; module_id: number | null }>(sql`
    SELECT id, module_id FROM print_jobs
    WHERE printer_id = ${printerId} AND status = 'printing' AND workspace_id = ${ctx.workspaceId}
  `);

  for (const row of open ?? []) {
    const isRestart = newModuleId !== null && row.module_id === newModuleId;
    const reason = isRestart ? 'manually restarted' : 'new job started on printer';
    await ctx.db.run(sql`
      UPDATE print_jobs
      SET status = 'failed', failure_reason = ${reason}, updated_at = ${now}
      WHERE id = ${row.id} AND workspace_id = ${ctx.workspaceId}
    `);
    await logPrinterEvent(ctx, printerId, 'marked_failed', { reason }, row.id);
  }
}

/** Update only the status and external_task_id on a job (used by Pi webhook). */
export async function updatePrintJobStatus(
  ctx: TenantContext,
  jobId: number,
  status: string,
  externalTaskId?: string | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Pre-read for the print_finished event: only emit on the actual transition,
  // not on webhook retries that re-set an unchanged status.
  let finishedPrinterId: number | null = null;
  if (status === 'print_finished') {
    const prev = await ctx.db.get<{ printer_id: number | null; status: string }>(sql`
      SELECT printer_id, status FROM print_jobs
      WHERE id = ${jobId} AND workspace_id = ${ctx.workspaceId}
    `);
    if (prev && prev.status !== 'print_finished') finishedPrinterId = prev.printer_id;
  }

  if (externalTaskId !== undefined) {
    await ctx.db.run(sql`
      UPDATE print_jobs
      SET status = ${status}, external_task_id = ${externalTaskId}, updated_at = ${now}
      WHERE id = ${jobId} AND workspace_id = ${ctx.workspaceId}
    `);
  } else {
    await ctx.db.run(sql`
      UPDATE print_jobs SET status = ${status}, updated_at = ${now} WHERE id = ${jobId} AND workspace_id = ${ctx.workspaceId}
    `);
  }

  if (finishedPrinterId !== null) {
    await logPrinterEvent(ctx, finishedPrinterId, 'print_finished', null, jobId);
  }
}

/** Look up a job by its external Pi task ID. */
export async function getPrintJobByExternalTaskId(
  ctx: TenantContext,
  externalTaskId: string,
): Promise<PrintJob | null> {
  const row = await ctx.db.get<PrintJob>(
    sql`SELECT * FROM print_jobs WHERE external_task_id = ${externalTaskId} AND workspace_id = ${ctx.workspaceId} LIMIT 1`,
  );
  return row ?? null;
}

/**
 * Create a job for an externally-started print the user explicitly confirmed.
 * Idempotent on external_task_id; never closes/fails other jobs.
 */
export async function adoptExternalPrintJob(
  ctx: TenantContext,
  params: { printerId: number; moduleId: number | null; externalTaskId: string },
): Promise<ServerResponse> {
  const drizzleDb = ctx.db;
  try {
    const existing = await drizzleDb.get(
      sql`SELECT id FROM print_jobs WHERE external_task_id = ${params.externalTaskId} AND workspace_id = ${ctx.workspaceId} LIMIT 1`,
    );
    if (existing) return { success: true };

    const now = Math.floor(Date.now() / 1000);
    const result = await drizzleDb.run(sql`
      INSERT INTO print_jobs (workspace_id, module_id, printer_id, start_time, status, external_task_id, created_at, updated_at)
      VALUES (${ctx.workspaceId}, ${params.moduleId}, ${params.printerId}, ${now}, 'printing', ${params.externalTaskId}, ${now}, ${now})
    `);
    const jobId = result.meta.last_row_id as number;

    // Snapshot loaded spools so completion can deduct used weight. Mirrors startPrintJob.
    const loadedSlots = await getLoadedSpools(ctx, params.printerId);
    for (const slot of loadedSlots) {
      const s = slot as unknown as { slot_index: number; spool_id: number | null };
      await drizzleDb.run(sql`
        INSERT INTO print_job_spools (workspace_id, print_job_id, slot_index, spool_id, used_weight)
        VALUES (${ctx.workspaceId}, ${jobId}, ${s.slot_index}, ${s.spool_id ?? null}, NULL)
      `);
    }
    return { success: true, data: { id: jobId } };
  } catch (error) {
    console.error('Error adopting external print job:', error);
    return { success: false, error: 'Failed to adopt external print job' };
  }
}

export async function createPrintJob(
  ctx: TenantContext,
  job: {
    moduleId?: number | null;
    printerId?: number | null;
    externalTaskId?: string | null;
    status?: string;
  },
): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await ctx.db.run(sql`
      INSERT INTO print_jobs (workspace_id, module_id, printer_id, external_task_id, status, created_at, updated_at)
      VALUES (
        ${ctx.workspaceId}, ${job.moduleId ?? null}, ${job.printerId ?? null},
        ${job.externalTaskId ?? null}, ${job.status ?? 'queued'}, ${now}, ${now}
      )
    `);
    return { success: true, data: { id: result.meta.last_row_id } };
  } catch (error) {
    console.error('Error creating print job:', error);
    return { success: false, error: 'Failed to create print job' };
  }
}
