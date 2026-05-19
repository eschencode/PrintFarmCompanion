import type { D1Database } from '@cloudflare/workers-types';
import type {
  Printer,
  PrinterModel,
  Spool,
  SpoolPreset,
  PrintModule,
  PrintJob,
  PrintJobExtended,
  NewSpool,
  NewPrintModule,
  NewSpoolPreset,
  LoadSpoolResponse,
  StartPrintResponse,
  ServerResponse,
  GridPreset,
  NewGridPreset,
  GridCell,
  SuggestedPrintQueueItem
} from './types';
import { addStockBySlug } from './inventory_handler';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { printerModels, printers } from './db/schema';

// Printer Models
export async function getAllPrinterModels(db: D1Database): Promise<PrinterModel[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb
    .select({
      id: printerModels.id,
      name: printerModels.name,
      description: printerModels.description,
      build_volume_x: printerModels.buildVolumeX,
      build_volume_y: printerModels.buildVolumeY,
      build_volume_z: printerModels.buildVolumeZ,
      created_at: printerModels.createdAt,
    })
    .from(printerModels)
    .orderBy(asc(printerModels.name));
  return rows as unknown as PrinterModel[];
}

export async function createPrinterModel(db: D1Database, model: {
  name: string;
  description?: string | null;
  buildVolumeX?: number | null;
  buildVolumeY?: number | null;
  buildVolumeZ?: number | null;
}): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const result = await drizzleDb.run(sql`
      INSERT INTO printer_models (name, description, build_volume_x, build_volume_y, build_volume_z)
      VALUES (${model.name}, ${model.description ?? null}, ${model.buildVolumeX ?? null}, ${model.buildVolumeY ?? null}, ${model.buildVolumeZ ?? null})
    `);
    return { success: true, message: 'Printer model created', data: { id: result.meta.last_row_id } };
  } catch (error) {
    console.error('Error creating printer model:', error);
    return { success: false, error: 'Failed to create printer model' };
  }
}

export async function updatePrinterModel(db: D1Database, id: number, model: {
  name?: string;
  description?: string | null;
  buildVolumeX?: number | null;
  buildVolumeY?: number | null;
  buildVolumeZ?: number | null;
}): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const updates: ReturnType<typeof sql>[] = [];
    if (model.name !== undefined) updates.push(sql`name = ${model.name}`);
    if (model.description !== undefined) updates.push(sql`description = ${model.description}`);
    if (model.buildVolumeX !== undefined) updates.push(sql`build_volume_x = ${model.buildVolumeX}`);
    if (model.buildVolumeY !== undefined) updates.push(sql`build_volume_y = ${model.buildVolumeY}`);
    if (model.buildVolumeZ !== undefined) updates.push(sql`build_volume_z = ${model.buildVolumeZ}`);
    if (updates.length === 0) return { success: false, error: 'No updates provided' };
    await drizzleDb.run(sql`UPDATE printer_models SET ${sql.join(updates, sql`, `)} WHERE id = ${id}`);
    return { success: true, message: 'Printer model updated' };
  } catch (error) {
    console.error('Error updating printer model:', error);
    return { success: false, error: 'Failed to update printer model' };
  }
}

export async function deletePrinterModel(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // Check if any printers or modules reference this model
    const printerCount = await drizzleDb.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM printers WHERE printer_model_id = ${id}`
    );
    const moduleCount = await drizzleDb.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM print_modules WHERE printer_model_id = ${id}`
    );
    if ((printerCount?.count || 0) > 0 || (moduleCount?.count || 0) > 0) {
      return { success: false, error: 'Cannot delete: printer model is still referenced by printers or modules' };
    }
    await drizzleDb.run(sql`DELETE FROM printer_models WHERE id = ${id}`);
    return { success: true, message: 'Printer model deleted' };
  } catch (error) {
    console.error('Error deleting printer model:', error);
    return { success: false, error: 'Failed to delete printer model' };
  }
}

// Printers
export async function getAllPrinters(db: D1Database): Promise<Printer[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb
    .select({
      id: printers.id,
      name: printers.name,
      model: printers.model,
      printer_model_id: printers.printerModelId,
      printer_model_name: printerModels.name,
      status: printers.status,
      loaded_spool_id: printers.loadedSpoolId,
      total_hours: printers.totalHours,
      suggested_queue: printers.suggestedQueue,
      printer_ip: printers.printerIp,
      printer_serial: printers.printerSerial,
      printer_access_code: printers.printerAccessCode,
      transport: printers.transport,
    })
    .from(printers)
    .leftJoin(printerModels, eq(printers.printerModelId, printerModels.id));
  return rows as unknown as Printer[];
}

export async function getPrinterById(db: D1Database, id: number): Promise<Printer | null> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb
    .select({
      id: printers.id,
      name: printers.name,
      model: printers.model,
      printer_model_id: printers.printerModelId,
      printer_model_name: printerModels.name,
      status: printers.status,
      loaded_spool_id: printers.loadedSpoolId,
      total_hours: printers.totalHours,
      suggested_queue: printers.suggestedQueue,
      printer_ip: printers.printerIp,
      printer_serial: printers.printerSerial,
      printer_access_code: printers.printerAccessCode,
      transport: printers.transport,
    })
    .from(printers)
    .leftJoin(printerModels, eq(printers.printerModelId, printerModels.id))
    .where(eq(printers.id, id))
    .limit(1);
  return (rows[0] ?? null) as unknown as Printer | null;
}

export async function updatePrinterStatus(db: D1Database, id: number | null, status: string, loadedSpoolId?: number | null): Promise<void> {
  if (!id) return; // Handle null printer_id
  const drizzleDb = getDb(db);
  if (loadedSpoolId !== undefined) {
    await drizzleDb.run(sql`UPDATE printers SET status = ${status}, loaded_spool_id = ${loadedSpoolId} WHERE id = ${id}`);
  } else {
    await drizzleDb.run(sql`UPDATE printers SET status = ${status} WHERE id = ${id}`);
  }
}

export async function updatePrinterTransport(db: D1Database, id: number, transport: 'auto' | 'direct' | 'pi'): Promise<void> {
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`UPDATE printers SET transport = ${transport} WHERE id = ${id}`);
}

/** Mark a printer as broken — closes any orphan open event, inserts a new one, sets status. */
export async function markPrinterBroken(db: D1Database, id: number, note?: string): Promise<void> {
  const drizzleDb = getDb(db);
  const now = Date.now();
  await drizzleDb.run(sql`UPDATE printer_downtime SET ended_at = ${now} WHERE printer_id = ${id} AND ended_at IS NULL`);
  await drizzleDb.run(sql`INSERT INTO printer_downtime (printer_id, started_at, note) VALUES (${id}, ${now}, ${note ?? null})`);
  await drizzleDb.run(sql`UPDATE printers SET status = 'BROKEN' WHERE id = ${id}`);
}

/** Mark a printer as repaired — closes the open downtime event, resets status to IDLE. */
export async function markPrinterRepaired(db: D1Database, id: number): Promise<void> {
  const drizzleDb = getDb(db);
  const now = Date.now();
  await drizzleDb.run(sql`UPDATE printer_downtime SET ended_at = ${now} WHERE printer_id = ${id} AND ended_at IS NULL`);
  await drizzleDb.run(sql`UPDATE printers SET status = 'IDLE' WHERE id = ${id}`);
}

/** Fetch all downtime rows overlapping [periodStart, periodEnd] across all printers. */
export async function getAllDowntimeInRange(
  db: D1Database,
  periodStart: number,
  periodEnd: number,
): Promise<{ id: number; printer_id: number; started_at: number; ended_at: number | null; note: string | null }[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<{ id: number; printer_id: number; started_at: number; ended_at: number | null; note: string | null }>(sql`
    SELECT id, printer_id, started_at, ended_at, note
    FROM printer_downtime
    WHERE started_at < ${periodEnd}
      AND (ended_at IS NULL OR ended_at > ${periodStart})
  `);
  return rows ?? [];
}

// Create a new printer
export async function createPrinter(db: D1Database, printer: {
  name: string;
  model?: string | null;
  printerModelId?: number | null;
  printerIp?: string | null;
  printerSerial?: string | null;
  printerAccessCode?: string | null;
}): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // If printerModelId is provided, also set the model text from the printer_models table
    let modelName = printer.model ?? null;
    if (printer.printerModelId) {
      const pm = await drizzleDb.get<{ name: string }>(
        sql`SELECT name FROM printer_models WHERE id = ${printer.printerModelId}`
      );
      if (pm) modelName = pm.name;
    }
    const result = await drizzleDb.run(sql`
      INSERT INTO printers (name, model, printer_model_id, status, total_hours, printer_ip, printer_serial, printer_access_code)
      VALUES (${printer.name}, ${modelName}, ${printer.printerModelId ?? null}, 'IDLE', 0, ${printer.printerIp ?? null}, ${printer.printerSerial ?? null}, ${printer.printerAccessCode ?? null})
    `);
    
    return { 
      success: true, 
      message: 'Printer created successfully',
      data: { id: result.meta.last_row_id }
    };
  } catch (error) {
    console.error('Error creating printer:', error);
    return { success: false, error: 'Failed to create printer' };
  }
}

export async function updatePrinter(
  db: D1Database,
  id: number,
  printer: {
    name?: string;
    model?: string | null;
    printerModelId?: number | null;
    suggested_queue?: string | null;
    printerIp?: string | null;
    printerSerial?: string | null;
    printerAccessCode?: string | null;
  }
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const updates: ReturnType<typeof sql>[] = [];

    if (printer.name !== undefined) {
      updates.push(sql`name = ${printer.name}`);
    }

    if (printer.printerModelId !== undefined) {
      updates.push(sql`printer_model_id = ${printer.printerModelId}`);
      // Also sync the model text field
      if (printer.printerModelId) {
        const pm = await drizzleDb.get<{ name: string }>(
          sql`SELECT name FROM printer_models WHERE id = ${printer.printerModelId}`
        );
        updates.push(sql`model = ${pm?.name ?? null}`);
      } else {
        updates.push(sql`model = ${null}`);
      }
    } else if (printer.model !== undefined) {
      updates.push(sql`model = ${printer.model}`);
    }

    if (printer.suggested_queue !== undefined) {
      updates.push(sql`suggested_queue = ${printer.suggested_queue}`);
    }

    if (printer.printerIp !== undefined) {
      updates.push(sql`printer_ip = ${printer.printerIp || null}`);
    }
    if (printer.printerSerial !== undefined) {
      updates.push(sql`printer_serial = ${printer.printerSerial || null}`);
    }
    if (printer.printerAccessCode !== undefined) {
      updates.push(sql`printer_access_code = ${printer.printerAccessCode || null}`);
    }

    if (updates.length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    await drizzleDb.run(sql`UPDATE printers SET ${sql.join(updates, sql`, `)} WHERE id = ${id}`);

    return { success: true, message: 'Printer updated successfully' };
  } catch (error) {
    console.error('Error updating printer:', error);
    return { success: false, error: 'Failed to update printer' };
  }
}

// Delete a printer
export async function deletePrinter(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // Check if printer has active print jobs
    const activeJobs = await drizzleDb.get<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM print_jobs 
      WHERE printer_id = ${id} AND status = 'printing'
    `);
    
    if (activeJobs && activeJobs.count > 0) {
      return { success: false, error: 'Cannot delete printer with active print jobs' };
    }
    
    // Delete the printer
    await drizzleDb.run(sql`DELETE FROM printers WHERE id = ${id}`);
    
    return { success: true, message: 'Printer deleted successfully' };
  } catch (error) {
    console.error('Error deleting printer:', error);
    return { success: false, error: 'Failed to delete printer' };
  }
}

// Spools
export async function getAllSpools(db: D1Database): Promise<Spool[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<Spool>(sql`SELECT * FROM spools`);
  return rows || [];
}

export async function getSpoolById(db: D1Database, id: number): Promise<Spool | null> {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.get<Spool>(sql`SELECT * FROM spools WHERE id = ${id}`);
  return result ?? null;
}

export async function updateSpoolWeight(db: D1Database, id: number | null, remainingWeight: number): Promise<void> {
  if (!id) return; // Handle null spool_id
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`UPDATE spools SET remaining_weight = ${remainingWeight} WHERE id = ${id}`);
}

export async function createSpool(db: D1Database, spool: {
  presetId?: number | null;
  brand: string;
  material: string;
  color?: string | null;
  initialWeight: number;
  remainingWeight: number;
  cost?: number | null;
}) {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.run(sql`
    INSERT INTO spools (preset_id, brand, material, color, initial_weight, remaining_weight, cost)
    VALUES (${spool.presetId ?? null}, ${spool.brand}, ${spool.material}, ${spool.color ?? null}, ${spool.initialWeight}, ${spool.remainingWeight}, ${spool.cost ?? null})
  `);
  
  return result;
}

// Unload spool from printer
export async function unloadSpool(db: D1Database, printerId: number) {
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`UPDATE printers SET loaded_spool_id = NULL WHERE id = ${printerId}`);
}

// Load spool to printer
export async function loadSpoolToPrinter(db: D1Database, printerId: number, spoolId: number) {
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`UPDATE printers SET loaded_spool_id = ${spoolId} WHERE id = ${printerId}`);
}

// Complete load spool workflow
export async function loadSpool(db: D1Database, params: {
  printerId: number;
  spoolData: NewSpool;
  forceUnload?: boolean; // If true, automatically unload existing spool
}): Promise<LoadSpoolResponse> {
  const { printerId, spoolData, forceUnload = false } = params;

  // 1. Check if printer exists and get current state
  const printer = await getPrinterById(db, printerId);
  
  if (!printer) {
    return { 
      success: false, 
      error: 'Printer not found',
      needsUnload: false
    };
  }


  // 3. If forceUnload is true, unload the current spool
  if (printer.loaded_spool_id && forceUnload) {
    await unloadSpool(db, printerId);
  }

  // 4. Create new spool in database
  const newSpoolResult = await createSpool(db, {
    presetId: spoolData.preset_id,
    brand: spoolData.brand,
    material: spoolData.material,
    color: spoolData.color,
    initialWeight: spoolData.initial_weight,
    remainingWeight: spoolData.remaining_weight,
    cost: spoolData.cost
  });
  const newSpoolId = newSpoolResult.meta.last_row_id;

  // 5. Decrement storage count if loading from a preset
  if (spoolData.preset_id) {
    const drizzleDb = getDb(db);
    await drizzleDb.run(sql`
      UPDATE spool_presets 
      SET storage_count = MAX(0, COALESCE(storage_count, 0) - 1) 
      WHERE id = ${spoolData.preset_id}
    `);
  }

  // 6. Load the new spool to the printer
  await loadSpoolToPrinter(db, printerId, newSpoolId);

  return {
    success: true,
    spoolId: newSpoolId,
    printerId: printerId,
    message: `Successfully loaded new spool to ${printer.name}`
  };
}

// Print Modules
export async function getAllPrintModules(db: D1Database) {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<any>(sql`
    SELECT pm.*, pmod.name as printer_model_name,
           sp.name as spool_preset_name, sp.color as spool_preset_color,
           GROUP_CONCAT(msp.spool_preset_id) as spool_preset_ids
    FROM print_modules pm
    LEFT JOIN module_spool_presets msp ON pm.id = msp.module_id
    LEFT JOIN printer_models pmod ON pm.printer_model_id = pmod.id
    LEFT JOIN spool_presets sp ON pm.default_spool_preset_id = sp.id
    GROUP BY pm.id
  `);
  return (rows || []).map((m: any) => ({
    ...m,
    spool_preset_ids: m.spool_preset_ids
      ? m.spool_preset_ids.split(',').map(Number)
      : []
  }));
}

// Print Jobs
export async function createPrintJob(db: D1Database, job: {
  name: string;
  moduleId: number;
  printerId: number;
  spoolId: number;
  plannedWeight: number;
}) {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.run(sql`
    INSERT INTO print_jobs (name, module_id, printer_id, spool_id, planned_weight)
    VALUES (${job.name}, ${job.moduleId}, ${job.printerId}, ${job.spoolId}, ${job.plannedWeight})
  `);
  
  return result;
}

export async function getRecentPrintJobs(db: D1Database, limit = 10) {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<PrintJob>(sql`
    SELECT * FROM print_jobs 
    ORDER BY start_time DESC 
    LIMIT ${limit}
  `);
  
  return rows || [];
}

export async function getPrintJobById(db: D1Database, id: number): Promise<PrintJobExtended | null> {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.get<PrintJobExtended>(sql`
    SELECT 
      pj.*,
      p.loaded_spool_id as printer_loaded_spool_id,
      p.name as printer_name,
      pm.name as module_name,
      pm.expected_weight,
      pm.expected_time
    FROM print_jobs pj
    LEFT JOIN printers p ON pj.printer_id = p.id
    LEFT JOIN print_modules pm ON pj.module_id = pm.id
    WHERE pj.id = ${id}
  `);
  
  return result ?? null;
}

// Start a print job
export async function startPrintJob(db: D1Database, params: {
  printerId: number;
  moduleId: number;
  name?: string;
}): Promise<StartPrintResponse> {
  const { printerId, moduleId, name } = params;
  const drizzleDb = getDb(db);

  // 1. Check if printer exists and get its state
  const printer = await getPrinterById(db, printerId);
  
  if (!printer) {
    return { 
      success: false, 
      error: 'Printer not found'
    };
  }

  // 2. Check if printer has a loaded spool
  if (!printer.loaded_spool_id) {
    return {
      success: false,
      error: `Printer ${printer.name} has no loaded spool. Please load a spool first.`
    };
  }

  // 3. Get the print module details
  const module = await drizzleDb.get<PrintModule>(sql`SELECT * FROM print_modules WHERE id = ${moduleId}`);
  
  if (!module) {
    return {
      success: false,
      error: 'Print module not found'
    };
  }

  // 4. Get the loaded spool
  const spool = await getSpoolById(db, printer.loaded_spool_id);
  
  if (!spool) {
    return {
      success: false,
      error: 'Loaded spool not found'
    };
  }

  await closeOpenPrintJobsForPrinter(db, printerId, moduleId);

  // Create the print job with status = 'printing'
  const jobName = name || `${module.name} - ${new Date().toLocaleString()}`;

  const insertResult = await drizzleDb.run(sql`
    INSERT INTO print_jobs (
      name,
      module_id,
      printer_id,
      spool_id,
      planned_weight,
      start_time,
      status
    )
    VALUES (${jobName}, ${moduleId}, ${printerId}, ${printer.loaded_spool_id}, ${module.expected_weight}, ${Date.now()}, 'printing')
  `);

  await updatePrinterStatus(db, printerId, 'printing');

  return {
    success: true,
    jobId: insertResult.meta.last_row_id,
    message: `Print job started on ${printer.name}`,
    expectedTime: typeof module.expected_time === 'number' ? module.expected_time : undefined,
    expectedWeight: typeof module.expected_weight === 'number' ? module.expected_weight : undefined,
    lowMaterial: spool.remaining_weight < (typeof module.expected_weight === 'number' ? module.expected_weight : 0)
  };
}

// Close any in-progress jobs on a printer before starting a new one.
// Same module → restart (no material deduction). Different module → new job (deduct planned weight).
export async function closeOpenPrintJobsForPrinter(
  db: D1Database,
  printerId: number,
  newModuleId: number | null
): Promise<void> {
  const drizzleDb = getDb(db);
  const open = await drizzleDb.all<{
    id: number;
    module_id: number | null;
    planned_weight: number | null;
    resolved_spool_id: number | null;
  }>(sql`
    SELECT pj.id, pj.module_id, pj.planned_weight,
           COALESCE(pj.spool_id, p.loaded_spool_id) AS resolved_spool_id
    FROM print_jobs pj
    LEFT JOIN printers p ON pj.printer_id = p.id
    WHERE pj.printer_id = ${printerId} AND pj.status = 'printing'
  `);

  const now = Date.now();
  for (const row of (open ?? [])) {
    const isRestart = newModuleId !== null && row.module_id === newModuleId;
    const reason = isRestart ? 'manualy restarted new job on printer' : 'manualy started new job on printer';
    const actualWeight = isRestart ? 0 : (row.planned_weight ?? 0);

    await drizzleDb.run(sql`
      UPDATE print_jobs
      SET status = 'failed', end_time = ${now}, actual_weight = ${actualWeight}, failure_reason = ${reason}
      WHERE id = ${row.id}
    `);

    if (!isRestart && actualWeight > 0 && row.resolved_spool_id) {
      const spool = await getSpoolById(db, row.resolved_spool_id);
      if (spool) {
        await updateSpoolWeight(db, row.resolved_spool_id, spool.remaining_weight - actualWeight);
      }
    }
  }
}

// Complete/finish a print job
export async function completePrintJob(
  db: D1Database,
  jobId: number,
  actualEndTime: number,
  success: boolean,
  actualWeight: number,
  failureReason: string | null = null
): Promise<void> {
  const status = success ? 'success' : 'failed';

  const job = await getPrintJobById(db, jobId);
  
  if (!job) {
    throw new Error('Print job not found');
  }
  
  let endTime: number;
  
  if (job.status == 'failed' && (job.expected_time ?? 0) > (job.start_time - actualEndTime)) {
    endTime = actualEndTime;
  } else {
    const expectedDurationMs = (job.expected_time || 0) * 60 * 1000;
    endTime = job.start_time + expectedDurationMs;
  }

  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`
    UPDATE print_jobs 
    SET end_time = ${endTime}, 
        status = ${status}, 
        actual_weight = ${actualWeight}, 
        failure_reason = ${failureReason}
    WHERE id = ${jobId}
  `);

  // ✅ Auto-add to inventory if print succeeded and module has inventory_slug
  if (success && job.module_id) {
    const module = await getPrintModuleById(db, job.module_id) as PrintModule | null;
    
    if (module?.inventory_slug) {
      const quantity = module.objects_per_print || 1;
      await addStockBySlug(
        db, 
        module.inventory_slug, 
        quantity, 
        `Print job #${jobId} completed - ${module.name}`
      );
    }
  }
}

// Spool Presets
export async function getAllSpoolPresets(db: D1Database) {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<SpoolPreset>(sql`SELECT * FROM spool_presets`);
  return rows || [];
}

export async function createSpoolPreset(db: D1Database, preset: {
  name: string;
  brand: string;
  material: string;
  color?: string | null;
  defaultWeight: number;
  cost?: number | null;
}) {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.run(sql`
    INSERT INTO spool_presets (name, brand, material, color, default_weight, cost)
    VALUES (${preset.name}, ${preset.brand}, ${preset.material}, ${preset.color ?? null}, ${preset.defaultWeight}, ${preset.cost ?? null})
  `);

  return {
    success: true,
    presetId: result.meta.last_row_id,
    message: `Spool preset "${preset.name}" created successfully`
  };
}

// Update spool preset storage count
export async function updateStorageCount(db: D1Database, presetId: number, delta: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`
      UPDATE spool_presets 
      SET storage_count = MAX(0, COALESCE(storage_count, 0) + ${delta}) 
      WHERE id = ${presetId}
    `);
    
    return { success: true, message: 'Storage count updated' };
  } catch (error) {
    console.error('Error updating storage count:', error);
    return { success: false, error: 'Failed to update storage count' };
  }
}

// Set absolute storage count for a preset
export async function setStorageCount(db: D1Database, presetId: number, count: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`
      UPDATE spool_presets 
      SET storage_count = ${Math.max(0, count)} 
      WHERE id = ${presetId}
    `);
    
    return { success: true, message: 'Storage count set' };
  } catch (error) {
    console.error('Error setting storage count:', error);
    return { success: false, error: 'Failed to set storage count' };
  }
}

// Get a single spool preset by ID
export async function getSpoolPresetById(db: D1Database, id: number): Promise<SpoolPreset | null> {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.get<SpoolPreset>(sql`SELECT * FROM spool_presets WHERE id = ${id}`);
  return result ?? null;
}

export async function updateSpoolPreset(db: D1Database, id: number, preset: {
  name: string;
  brand: string;
  material: string;
  color?: string | null;
  defaultWeight: number;
  cost?: number | null;
}): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`
      UPDATE spool_presets
      SET name = ${preset.name},
          brand = ${preset.brand},
          material = ${preset.material},
          color = ${preset.color ?? null},
          default_weight = ${preset.defaultWeight},
          cost = ${preset.cost ?? null}
      WHERE id = ${id}
    `);
    return { success: true, message: `Spool preset "${preset.name}" updated successfully` };
  } catch (error) {
    console.error('Error updating spool preset:', error);
    return { success: false, error: 'Failed to update spool preset' };
  }
}

export async function deleteSpoolPreset(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`DELETE FROM module_spool_presets WHERE spool_preset_id = ${id}`);
    await drizzleDb.run(sql`DELETE FROM spool_presets WHERE id = ${id}`);
    return { success: true, message: 'Spool preset deleted successfully' };
  } catch (error) {
    console.error('Error deleting spool preset:', error);
    return { success: false, error: 'Failed to delete spool preset' };
  }
}

// Print Module Functions
export async function createPrintModule(db: D1Database, module: {
  name: string;
  expectedWeight?: number | null;
  expectedTime?: number | null;
  objectsPerPrint?: number;
  defaultSpoolPresetId?: number | null;
  spoolPresetIds?: number[];
  localFileHandlerPath?: string | null;
  imagePath?: string | null;
  printerModel?: string | null;
  printerModelId?: number | null;
  inventorySlug?: string | null;
  fileName?: string | null;
  thumbnail?: string | null;
  filamentType?: string | null;
  filamentColor?: string | null;
  plateType?: string | null;
  nozzleDiameter?: number | null;
  piFilePath?: string | null;
}) {
  const drizzleDb = getDb(db);
  // If printerModelId provided, sync printer_model text
  let printerModelText = module.printerModel ?? null;
  if (module.printerModelId) {
    const pm = await drizzleDb.get<{ name: string }>(
      sql`SELECT name FROM printer_models WHERE id = ${module.printerModelId}`
    );
    if (pm) printerModelText = pm.name;
  }
  const result = await drizzleDb.run(sql`
    INSERT INTO print_modules (
      name, expected_weight, expected_time, objects_per_print,
      default_spool_preset_id, local_file_handler_path, image_path, printer_model, printer_model_id, inventory_slug,
      file_name, thumbnail, filament_type, filament_color, plate_type, nozzle_diameter, pi_file_path
    ) VALUES (
      ${module.name},
      ${module.expectedWeight ?? null},
      ${module.expectedTime ?? null},
      ${module.objectsPerPrint ?? 1},
      ${module.spoolPresetIds?.[0] ?? module.defaultSpoolPresetId ?? null},
      ${module.localFileHandlerPath ?? null},
      ${module.imagePath || null},
      ${printerModelText},
      ${module.printerModelId ?? null},
      ${module.inventorySlug ?? null},
      ${module.fileName ?? null},
      ${module.thumbnail ?? null},
      ${module.filamentType ?? null},
      ${module.filamentColor ?? null},
      ${module.plateType ?? null},
      ${module.nozzleDiameter ?? null},
      ${module.piFilePath ?? null}
    )
  `);

  const moduleId = result.meta.last_row_id as number;

  // Insert into junction table for each preset
  const presetIds = module.spoolPresetIds ?? (module.defaultSpoolPresetId ? [module.defaultSpoolPresetId] : []);
  for (const presetId of presetIds) {
    await drizzleDb.run(sql`
      INSERT OR IGNORE INTO module_spool_presets (module_id, spool_preset_id)
      VALUES (${moduleId}, ${presetId})
    `);
  }

  return {
    success: true,
    moduleId,
    message: `Print module "${module.name}" created successfully`
  };
}

export async function deletePrintModule(db: D1Database, moduleId: number) {
  const drizzleDb = getDb(db);
  // First, set module_id to NULL for any print jobs using this module
  await drizzleDb.run(sql`UPDATE print_jobs SET module_id = NULL WHERE module_id = ${moduleId}`);

  // Now safe to delete the module
  await drizzleDb.run(sql`DELETE FROM print_modules WHERE id = ${moduleId}`);
  
  return {
    success: true,
    message: 'Print module deleted successfully (jobs using it were updated)'
  };
}

export async function updatePrintModule(
  db: D1Database,
  id: number,
  module: {
    name?: string;
    expectedWeight?: number | null;
    expectedTime?: number | null;
    objectsPerPrint?: number;
    defaultSpoolPresetId?: number | null;
    spoolPresetIds?: number[];
    localFileHandlerPath?: string | null;
    imagePath?: string | null;
    printerModel?: string | null;
    printerModelId?: number | null;
    inventorySlug?: string | null;
    fileName?: string | null;
    thumbnail?: string | null;
    filamentType?: string | null;
    filamentColor?: string | null;
    plateType?: string | null;
    nozzleDiameter?: number | null;
    piFilePath?: string | null;
    fileStoredOnPi?: number;
  }
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  const updates: ReturnType<typeof sql>[] = [];

  if (module.inventorySlug !== undefined) {
    updates.push(sql`inventory_slug = ${module.inventorySlug}`);
  }

  if (module.name !== undefined) {
    updates.push(sql`name = ${module.name}`);
  }
  if (module.expectedWeight !== undefined) {
    updates.push(sql`expected_weight = ${module.expectedWeight}`);
  }
  if (module.expectedTime !== undefined) {
    updates.push(sql`expected_time = ${module.expectedTime}`);
  }
  if (module.objectsPerPrint !== undefined) {
    updates.push(sql`objects_per_print = ${module.objectsPerPrint}`);
  }
  if (module.defaultSpoolPresetId !== undefined) {
    updates.push(sql`default_spool_preset_id = ${module.defaultSpoolPresetId}`);
  }
  if (module.localFileHandlerPath !== undefined) {
    updates.push(sql`local_file_handler_path = ${module.localFileHandlerPath}`);
  }
  if (module.imagePath !== undefined) {
    updates.push(sql`image_path = ${module.imagePath}`);
  }
  if (module.fileName !== undefined) {
    updates.push(sql`file_name = ${module.fileName}`);
  }
  if (module.thumbnail !== undefined) {
    updates.push(sql`thumbnail = ${module.thumbnail}`);
  }
  if (module.filamentType !== undefined) {
    updates.push(sql`filament_type = ${module.filamentType}`);
  }
  if (module.filamentColor !== undefined) {
    updates.push(sql`filament_color = ${module.filamentColor}`);
  }
  if (module.plateType !== undefined) {
    updates.push(sql`plate_type = ${module.plateType}`);
  }
  if (module.nozzleDiameter !== undefined) {
    updates.push(sql`nozzle_diameter = ${module.nozzleDiameter}`);
  }
  if (module.piFilePath !== undefined) {
    updates.push(sql`pi_file_path = ${module.piFilePath}`);
  }
  if (module.fileStoredOnPi !== undefined) {
    updates.push(sql`file_stored_on_pi = ${module.fileStoredOnPi}`);
  }
  if (module.printerModelId !== undefined) {
    updates.push(sql`printer_model_id = ${module.printerModelId}`);
    // Sync text field
    if (module.printerModelId) {
      const pm = await drizzleDb.get<{ name: string }>(
        sql`SELECT name FROM printer_models WHERE id = ${module.printerModelId}`
      );
      updates.push(sql`printer_model = ${pm?.name ?? null}`);
    } else {
      updates.push(sql`printer_model = ${null}`);
    }
  } else if (module.printerModel !== undefined) {
    updates.push(sql`printer_model = ${module.printerModel}`);
  }

  if (updates.length === 0 && module.spoolPresetIds === undefined) {
    return { success: false, error: 'No changes provided' };
  }

  if (updates.length > 0) {
    await drizzleDb.run(sql`UPDATE print_modules SET ${sql.join(updates, sql`, `)} WHERE id = ${id}`);
  }

  // Update junction table if preset IDs were provided
  if (module.spoolPresetIds !== undefined) {
    await drizzleDb.run(sql`DELETE FROM module_spool_presets WHERE module_id = ${id}`);
    for (const presetId of module.spoolPresetIds) {
      await drizzleDb.run(sql`
        INSERT OR IGNORE INTO module_spool_presets (module_id, spool_preset_id)
        VALUES (${id}, ${presetId})
      `);
    }
    // Keep default_spool_preset_id in sync with first preset
    const firstPreset = module.spoolPresetIds[0] ?? null;
    await drizzleDb.run(sql`UPDATE print_modules SET default_spool_preset_id = ${firstPreset} WHERE id = ${id}`);
  }

  return { success: true, message: 'Print module updated' };
}

export async function getPrintModuleById(db: D1Database, id: number) {
  const drizzleDb = getDb(db);
  return await drizzleDb.get(sql`SELECT * FROM print_modules WHERE id = ${id}`);
}

export async function getActivePrintJobs(db: D1Database) {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all(sql`
    SELECT
      pj.*,
      p.name as printer_name,
      p.printer_serial,
      pm.name as module_name,
      pm.expected_weight,
      pm.expected_time,
      pm.objects_per_print,
      pm.image_path as module_image_path
    FROM print_jobs pj
    JOIN printers p ON pj.printer_id = p.id
    JOIN print_modules pm ON pj.module_id = pm.id
    WHERE pj.status = 'printing'
    ORDER BY pj.start_time DESC
  `);
  
  return rows || [];
}

export async function getAllPrintJobs(db: D1Database): Promise<PrintJobExtended[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<PrintJobExtended>(sql`
    SELECT
      pj.*,
      pm.name as module_name,
      pm.expected_time
    FROM print_jobs pj
    LEFT JOIN print_modules pm ON pj.module_id = pm.id
    ORDER BY pj.start_time DESC
  `);

  return rows || [];
}

// Add this function for updating printer hours
export async function updatePrinterHours(db: D1Database, printerId: number | null, hoursToAdd: number): Promise<void> {
  if (!printerId) return;
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`UPDATE printers SET total_hours = total_hours + ${hoursToAdd} WHERE id = ${printerId}`);
}

// Grid Presets
export async function getAllGridPresets(db: D1Database): Promise<GridPreset[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<GridPreset>(sql`SELECT * FROM grid_presets ORDER BY is_default DESC, created_at DESC`);
  return rows as unknown as GridPreset[];
}

export async function getDefaultGridPreset(db: D1Database): Promise<GridPreset | null> {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.get<GridPreset>(sql`SELECT * FROM grid_presets WHERE is_default = 1 LIMIT 1`);
  return result ?? null;
}

export async function getGridPresetById(db: D1Database, id: number): Promise<GridPreset | null> {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.get<GridPreset>(sql`SELECT * FROM grid_presets WHERE id = ${id}`);
  return result ?? null;
}

export async function createGridPreset(db: D1Database, preset: NewGridPreset): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const gridConfigJson = JSON.stringify(preset.grid_config);
    
    // If this is being set as default, unset other defaults first
    if (preset.is_default) {
      await drizzleDb.run(sql`UPDATE grid_presets SET is_default = 0`);
    }
    
    const result = await drizzleDb.run(sql`
      INSERT INTO grid_presets (name, is_default, grid_config, rows, cols)
      VALUES (${preset.name}, ${preset.is_default ? 1 : 0}, ${gridConfigJson}, ${preset.rows}, ${preset.cols})
    `);
    
    return { 
      success: true, 
      message: 'Grid preset created successfully',
      data: { id: result.meta.last_row_id }
    };
  } catch (error) {
    console.error('Error creating grid preset:', error);
    return { success: false, error: 'Failed to create grid preset' };
  }
}

export async function updateGridPreset(db: D1Database, id: number, preset: Partial<NewGridPreset>): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // If this is being set as default, unset other defaults first
    if (preset.is_default) {
      await drizzleDb.run(sql`UPDATE grid_presets SET is_default = 0`);
    }
    
    const updates: ReturnType<typeof sql>[] = [];
    
    if (preset.name !== undefined) {
      updates.push(sql`name = ${preset.name}`);
    }
    
    if (preset.is_default !== undefined) {
      updates.push(sql`is_default = ${preset.is_default ? 1 : 0}`);
    }
    
    if (preset.grid_config !== undefined) {
      updates.push(sql`grid_config = ${JSON.stringify(preset.grid_config)}`);
    }
    
    if (preset.rows !== undefined) {
      updates.push(sql`rows = ${preset.rows}`);
    }
    
    if (preset.cols !== undefined) {
      updates.push(sql`cols = ${preset.cols}`);
    }
    
    if (updates.length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    await drizzleDb.run(sql`UPDATE grid_presets SET ${sql.join(updates, sql`, `)} WHERE id = ${id}`);
    
    return { success: true, message: 'Grid preset updated successfully' };
  } catch (error) {
    console.error('Error updating grid preset:', error);
    return { success: false, error: 'Failed to update grid preset' };
  }
}

export async function setDefaultGridPreset(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // Unset all defaults
    await drizzleDb.run(sql`UPDATE grid_presets SET is_default = 0`);
    
    // Set the new default
    await drizzleDb.run(sql`UPDATE grid_presets SET is_default = 1 WHERE id = ${id}`);
    
    return { success: true, message: 'Default grid preset updated' };
  } catch (error) {
    console.error('Error setting default grid preset:', error);
    return { success: false, error: 'Failed to set default grid preset' };
  }
}

export async function deleteGridPreset(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // Check if this is the default - if so, don't allow deletion unless it's the only one
    const preset = await getGridPresetById(db, id);
    if (!preset) {
      return { success: false, error: 'Grid preset not found' };
    }
    
    const allPresets = await getAllGridPresets(db);
    if (preset.is_default && allPresets.length > 1) {
      return { success: false, error: 'Cannot delete the default preset. Set another preset as default first.' };
    }
    
    await drizzleDb.run(sql`DELETE FROM grid_presets WHERE id = ${id}`);
    
    return { success: true, message: 'Grid preset deleted successfully' };
  } catch (error) {
    console.error('Error deleting grid preset:', error);
    return { success: false, error: 'Failed to delete grid preset' };
  }
}


export async function markSuggestedQueueItemDone(
  db: D1Database,
  printerId: number,
  moduleIdentifier: { module_id?: number; module_name?: string }
): Promise<ServerResponse> {
  const printer = await getPrinterById(db, printerId);
  if (!printer || !printer.suggested_queue) {
    return { success: false, error: 'Printer or queue not found' };
  }

  // Parse queue if it's a string
  let queue: SuggestedPrintQueueItem[] = Array.isArray(printer.suggested_queue)
    ? printer.suggested_queue
    : JSON.parse(printer.suggested_queue);

  // Find first matching item not already DONE
  const idx = queue.findIndex(item =>
    item.status !== 'DONE' &&
    (
      (moduleIdentifier.module_id !== undefined && item.module_id === moduleIdentifier.module_id) ||
      (moduleIdentifier.module_name !== undefined && item.module_name === moduleIdentifier.module_name)
    )
  );

  if (idx === -1) {
    return { success: false, error: 'No matching queue item found or already DONE' };
  }

  queue[idx].status = 'DONE';

  // Save updated queue
  await updatePrinter(db, printerId, {
    suggested_queue: JSON.stringify(queue)
  });

  return { success: true, message: `Marked queue item as DONE: ${queue[idx].module_name}` };
}

export async function getSuggestedQueueByPrinterId(
  db: D1Database,
  printerId: number
): Promise<SuggestedPrintQueueItem[] | null> {
  const printer = await getPrinterById(db, printerId);
  if (!printer || !printer.suggested_queue) {
    return null;
  }
  // Parse queue if it's a string (for DB storage as TEXT/JSON)
  return Array.isArray(printer.suggested_queue)
    ? printer.suggested_queue
    : JSON.parse(printer.suggested_queue);
}
