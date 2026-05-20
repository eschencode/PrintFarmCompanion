import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import type { PrintJob, PrintJobFull, PrintJobSpool, StartPrintResponse, ServerResponse } from '../types';
import { getPrinterById, getLoadedSpools } from './printers';
import { getSpoolById, updateSpoolWeight } from './spools';
import { getPrintModuleById } from './modules';

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

export async function getAllPrintJobs(db: D1Database): Promise<PrintJobFull[]> {
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
  return (rows ?? []) as unknown as PrintJobFull[];
}

export async function getActivePrintJobs(db: D1Database): Promise<PrintJobFull[]> {
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
    WHERE pj.status = 'printing'
    ORDER BY pj.created_at DESC
  `);
  return (rows ?? []) as unknown as PrintJobFull[];
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
 * Complete a print job: record used weight per slot, deduct from spools,
 * and (on success) add to inventory.
 *
 * For single-color jobs, pass usedWeightBySlot as `{ 0: totalGrams }`.
 * For multi-color, pass one entry per slot.
 */
export async function completePrintJob(
  db: D1Database,
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
          WHERE id = ${module.object_id}
        `);
        await drizzleDb.run(sql`
          INSERT INTO inventory_log (object_id, change_type, quantity, print_job_id, created_at)
          VALUES (${module.object_id}, '+ printed', ${quantity}, ${jobId}, ${now})
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
