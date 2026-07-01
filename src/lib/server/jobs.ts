import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import type { PrintJob, PrintJobFull, PrintJobWithDetails, PrintJobSpool, StartPrintResponse, ServerResponse } from '../types';
import { getPrinterById, getLoadedSpools } from './printers';
import { getSpoolById, updateSpoolWeight } from './spools';
import { getPrintModuleById, getModuleFilamentSlots } from './modules';

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPrintJobById(db: D1Database, id: number): Promise<PrintJobFull | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<PrintJob>(sql`
    SELECT
      pj.*,
      p.name  as printer_name,
      pm.name as module_name,
      pm.weight as module_weight,
      pm.expected_time_minutes
    FROM print_jobs pj
    LEFT JOIN printers      p  ON pj.printer_id = p.id
    LEFT JOIN print_modules pm ON pj.module_id  = pm.id
    WHERE pj.id = ${id}
  `);
  if (!row) return null;

  const spools = await getPrintJobSpools(db, id);
  return { ...row, spools } as unknown as PrintJobFull;
}

export async function getPrintJobSpools(db: D1Database, jobId: number): Promise<PrintJobSpool[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<PrintJobSpool>(sql`
    SELECT
      pjs.print_job_id, pjs.slot_index, pjs.spool_id, pjs.used_weight,
      sp.color, sp.brand, sp.material,
      s.remaining_weight, s.initial_weight
    FROM print_job_spools pjs
    LEFT JOIN spools        s  ON pjs.spool_id  = s.id
    LEFT JOIN spool_presets sp ON s.preset_id   = sp.id
    WHERE pjs.print_job_id = ${jobId}
    ORDER BY pjs.slot_index
  `);
  return rows ?? [];
}

export async function getRecentPrintJobs(db: D1Database, limit = 10): Promise<PrintJobFull[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<PrintJob>(sql`
    SELECT
      pj.*,
      p.name  as printer_name,
      pm.name as module_name
    FROM print_jobs pj
    LEFT JOIN printers      p  ON pj.printer_id = p.id
    LEFT JOIN print_modules pm ON pj.module_id  = pm.id
    ORDER BY pj.created_at DESC
    LIMIT ${limit}
  `);
  return (rows ?? []) as unknown as PrintJobFull[];
}

export async function getAllPrintJobs(db: D1Database): Promise<PrintJobWithDetails[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<PrintJob>(sql`
    SELECT
      pj.*,
      p.name  as printer_name,
      pm.name as module_name,
      pm.expected_time_minutes
    FROM print_jobs pj
    LEFT JOIN printers      p  ON pj.printer_id = p.id
    LEFT JOIN print_modules pm ON pj.module_id  = pm.id
    ORDER BY pj.created_at DESC
  `);
  return (rows ?? []) as unknown as PrintJobWithDetails[];
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

export async function getAllPrintJobsForStats(db: D1Database): Promise<PrintJobStatsRow[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<{
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

export async function getActivePrintJobs(db: D1Database): Promise<PrintJobWithDetails[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<PrintJob>(sql`
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
    WHERE pj.status IN ('printing', 'print_finished')
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
  db: D1Database,
  params: { printerId: number; moduleId: number },
): Promise<StartPrintResponse> {
  const { printerId, moduleId } = params;
  const drizzleDb = getDb(db);

  const printer = await getPrinterById(db, printerId);
  if (!printer) return { success: false, error: 'Printer not found' };

  const module = await getPrintModuleById(db, moduleId);
  if (!module) return { success: false, error: 'Print module not found' };

  const loadedSlots = await getLoadedSpools(db, printerId);

  // Warn if module has filament requirements but printer has nothing loaded
  const lowMaterial =
    loadedSlots.length === 0 ||
    loadedSlots.some((slot) => {
      const s = slot as unknown as { remaining_weight?: number };
      return (s.remaining_weight ?? 0) < module.weight / Math.max(loadedSlots.length, 1);
    });

  // Close any currently-printing jobs on this printer
  await closeOpenPrintJobsForPrinter(db, printerId, moduleId);

  const now = Math.floor(Date.now() / 1000);
  const expectedEndTime = now + module.expected_time_minutes * 60;

  const result = await drizzleDb.run(sql`
    INSERT INTO print_jobs (
      module_id, printer_id, start_time, expected_end_time,
      status, created_at, updated_at
    ) VALUES (
      ${moduleId}, ${printerId}, ${now}, ${expectedEndTime},
      'printing', ${now}, ${now}
    )
  `);

  const jobId = result.meta.last_row_id as number;

  // Snapshot loaded spools → print_job_spools (one row per slot)
  for (const slot of loadedSlots) {
    const s = slot as unknown as { slot_index: number; spool_id: number | null };
    await drizzleDb.run(sql`
      INSERT INTO print_job_spools (print_job_id, slot_index, spool_id, used_weight)
      VALUES (${jobId}, ${s.slot_index}, ${s.spool_id ?? null}, NULL)
    `);
  }

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
  db: D1Database,
  moduleId: number,
  totalUsedWeight: number,
): Promise<Record<number, number>> {
  const slots = await getModuleFilamentSlots(db, moduleId);
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
  db: D1Database,
  // Workspace that owns this job's inventory writes (Phase 3, group 1). Threaded
  // from the caller until jobs/printers are fully ctx-scoped (groups 3–5).
  workspaceId: number,
  jobId: number,
  success: boolean,
  usedWeightBySlot: Record<number, number> = {},
  failureReason: string | null = null,
): Promise<void> {
  const drizzleDb = getDb(db);
  const now = Math.floor(Date.now() / 1000);

  const status = success ? 'successful' : 'failed';

  await drizzleDb.run(sql`
    UPDATE print_jobs
    SET status = ${status}, failure_reason = ${failureReason}, updated_at = ${now}
    WHERE id = ${jobId}
  `);

  // Update used weight per slot and deduct from physical spools
  const spoolRows = await getPrintJobSpools(db, jobId);
  for (const row of spoolRows) {
    const usedWeight = usedWeightBySlot[row.slot_index] ?? null;
    if (usedWeight !== null) {
      await drizzleDb.run(sql`
        UPDATE print_job_spools
        SET used_weight = ${usedWeight}
        WHERE print_job_id = ${jobId} AND slot_index = ${row.slot_index}
      `);
      if (row.spool_id) {
        const spool = await getSpoolById(db, row.spool_id);
        if (spool) {
          await updateSpoolWeight(db, row.spool_id, Math.max(0, spool.remaining_weight - usedWeight));
        }
      }
    }
  }

  // Add to inventory if module produces an object
  if (success) {
    const job = await getPrintJobById(db, jobId);
    if (job?.module_id) {
      const module = await getPrintModuleById(db, job.module_id);
      if (module?.object_id) {
        const quantity = module.objects_per_print ?? 1;
        await drizzleDb.run(sql`
          UPDATE objects
          SET in_stock = in_stock + ${quantity}, updated_at = ${now}
          WHERE id = ${module.object_id} AND workspace_id = ${workspaceId}
        `);
        await drizzleDb.run(sql`
          INSERT INTO inventory_log (workspace_id, object_id, change_type, quantity, print_job_id, created_at)
          VALUES (${workspaceId}, ${module.object_id}, '+ printed', ${quantity}, ${jobId}, ${now})
        `);
      }
    }
  }
}

/**
 * Close any printing jobs for a printer before starting a new one.
 * Same module → mark as failed_confirmed (restart), different module → failed.
 * Does not attempt weight deduction (use completePrintJob for that).
 */
export async function closeOpenPrintJobsForPrinter(
  db: D1Database,
  printerId: number,
  newModuleId: number | null,
): Promise<void> {
  const drizzleDb = getDb(db);
  const now = Math.floor(Date.now() / 1000);

  const open = await drizzleDb.all<{ id: number; module_id: number | null }>(sql`
    SELECT id, module_id FROM print_jobs
    WHERE printer_id = ${printerId} AND status = 'printing'
  `);

  for (const row of open ?? []) {
    const isRestart = newModuleId !== null && row.module_id === newModuleId;
    const reason = isRestart ? 'manually restarted' : 'new job started on printer';
    await drizzleDb.run(sql`
      UPDATE print_jobs
      SET status = 'failed', failure_reason = ${reason}, updated_at = ${now}
      WHERE id = ${row.id}
    `);
  }
}

/** Update only the status and external_task_id on a job (used by Pi webhook). */
export async function updatePrintJobStatus(
  db: D1Database,
  jobId: number,
  status: string,
  externalTaskId?: string | null,
): Promise<void> {
  const drizzleDb = getDb(db);
  const now = Math.floor(Date.now() / 1000);
  if (externalTaskId !== undefined) {
    await drizzleDb.run(sql`
      UPDATE print_jobs
      SET status = ${status}, external_task_id = ${externalTaskId}, updated_at = ${now}
      WHERE id = ${jobId}
    `);
  } else {
    await drizzleDb.run(sql`
      UPDATE print_jobs SET status = ${status}, updated_at = ${now} WHERE id = ${jobId}
    `);
  }
}

/** Look up a job by its external Pi task ID. */
export async function getPrintJobByExternalTaskId(
  db: D1Database,
  externalTaskId: string,
): Promise<PrintJob | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<PrintJob>(
    sql`SELECT * FROM print_jobs WHERE external_task_id = ${externalTaskId} LIMIT 1`,
  );
  return row ?? null;
}

/**
 * Create a job for an externally-started print the user explicitly confirmed.
 * Idempotent on external_task_id; never closes/fails other jobs.
 */
export async function adoptExternalPrintJob(
  db: D1Database,
  params: { printerId: number; moduleId: number | null; externalTaskId: string },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const existing = await drizzleDb.get(
      sql`SELECT id FROM print_jobs WHERE external_task_id = ${params.externalTaskId} LIMIT 1`,
    );
    if (existing) return { success: true };

    const now = Math.floor(Date.now() / 1000);
    const result = await drizzleDb.run(sql`
      INSERT INTO print_jobs (module_id, printer_id, start_time, status, external_task_id, created_at, updated_at)
      VALUES (${params.moduleId}, ${params.printerId}, ${now}, 'printing', ${params.externalTaskId}, ${now}, ${now})
    `);
    const jobId = result.meta.last_row_id as number;

    // Snapshot loaded spools so completion can deduct used weight. Mirrors startPrintJob.
    const loadedSlots = await getLoadedSpools(db, params.printerId);
    for (const slot of loadedSlots) {
      const s = slot as unknown as { slot_index: number; spool_id: number | null };
      await drizzleDb.run(sql`
        INSERT INTO print_job_spools (print_job_id, slot_index, spool_id, used_weight)
        VALUES (${jobId}, ${s.slot_index}, ${s.spool_id ?? null}, NULL)
      `);
    }
    return { success: true, data: { id: jobId } };
  } catch (error) {
    console.error('Error adopting external print job:', error);
    return { success: false, error: 'Failed to adopt external print job' };
  }
}

export async function createPrintJob(
  db: D1Database,
  job: {
    moduleId?: number | null;
    printerId?: number | null;
    externalTaskId?: string | null;
    status?: string;
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await drizzleDb.run(sql`
      INSERT INTO print_jobs (module_id, printer_id, external_task_id, status, created_at, updated_at)
      VALUES (
        ${job.moduleId ?? null}, ${job.printerId ?? null},
        ${job.externalTaskId ?? null}, ${job.status ?? 'queued'}, ${now}, ${now}
      )
    `);
    return { success: true, data: { id: result.meta.last_row_id } };
  } catch (error) {
    console.error('Error creating print job:', error);
    return { success: false, error: 'Failed to create print job' };
  }
}
