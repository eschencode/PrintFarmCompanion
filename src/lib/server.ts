import type { D1Database } from '@cloudflare/workers-types';
import type {
  Printer,
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
  ServerResponse
} from './types';

// Printers
export async function getAllPrinters(db: D1Database) {
  const result = await db.prepare('SELECT * FROM printers').all();
  return result.results || [];
}

export async function getPrinterById(db: D1Database, id: number): Promise<Printer | null> {
  const result = await db.prepare('SELECT * FROM printers WHERE id = ?').bind(id).first();
  return result as Printer | null;
}

export async function updatePrinterStatus(db: D1Database, id: number | null, status: string, loadedSpoolId?: number | null): Promise<void> {
  if (!id) return; // Handle null printer_id
  
  if (loadedSpoolId !== undefined) {
    await db.prepare('UPDATE printers SET status = ?, loaded_spool_id = ? WHERE id = ?')
      .bind(status, loadedSpoolId, id).run();
  } else {
    await db.prepare('UPDATE printers SET status = ? WHERE id = ?')
      .bind(status, id).run();
  }
}

// Spools
export async function getAllSpools(db: D1Database) {
  const result = await db.prepare('SELECT * FROM spools').all();
  return result.results || [];
}

export async function getSpoolById(db: D1Database, id: number): Promise<Spool | null> {
  const result = await db.prepare('SELECT * FROM spools WHERE id = ?').bind(id).first();
  return result as Spool | null;
}

export async function updateSpoolWeight(db: D1Database, id: number | null, remainingWeight: number): Promise<void> {
  if (!id) return; // Handle null spool_id
  
  await db.prepare('UPDATE spools SET remaining_weight = ? WHERE id = ?')
    .bind(remainingWeight, id).run();
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
  const result = await db.prepare(`
    INSERT INTO spools (preset_id, brand, material, color, initial_weight, remaining_weight, cost)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    spool.presetId ?? null,
    spool.brand,
    spool.material,
    spool.color ?? null,
    spool.initialWeight,
    spool.remainingWeight,
    spool.cost ?? null
  ).run();
  
  return result;
}

// Unload spool from printer
export async function unloadSpool(db: D1Database, printerId: number) {
  await db.prepare('UPDATE printers SET loaded_spool_id = NULL WHERE id = ?').bind(printerId).run();
}

// Load spool to printer
export async function loadSpoolToPrinter(db: D1Database, printerId: number, spoolId: number) {
  await db.prepare('UPDATE printers SET loaded_spool_id = ? WHERE id = ?').bind(spoolId, printerId).run();
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

  // 5. Load the new spool to the printer
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
  const result = await db.prepare('SELECT * FROM print_modules').all();
  return result.results || [];
}

// Print Jobs
export async function createPrintJob(db: D1Database, job: {
  name: string;
  moduleId: number;
  printerId: number;
  spoolId: number;
  plannedWeight: number;
}) {
  const result = await db.prepare(`
    INSERT INTO print_jobs (name, module_id, printer_id, spool_id, planned_weight)
    VALUES (?, ?, ?, ?, ?)
  `).bind(job.name, job.moduleId, job.printerId, job.spoolId, job.plannedWeight).run();
  
  return result;
}

export async function getRecentPrintJobs(db: D1Database, limit = 10) {
  const result = await db.prepare(`
    SELECT * FROM print_jobs 
    ORDER BY start_time DESC 
    LIMIT ?
  `).bind(limit).all();
  
  return result.results || [];
}

export async function getPrintJobById(db: D1Database, id: number): Promise<PrintJobExtended | null> {
  const result = await db.prepare(`
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
    WHERE pj.id = ?
  `).bind(id).first();
  
  return result as PrintJobExtended | null;
}

// Start a print job
export async function startPrintJob(db: D1Database, params: {
  printerId: number;
  moduleId: number;
  name?: string;
}): Promise<StartPrintResponse> {
  const { printerId, moduleId, name } = params;

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
  const module = await db.prepare('SELECT * FROM print_modules WHERE id = ?').bind(moduleId).first();
  
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

  // Create the print job with status = 'printing'
  const jobName = name || `${module.name} - ${new Date().toLocaleString()}`;
  
  const result = await db.prepare(`
    INSERT INTO print_jobs (
      name, 
      module_id, 
      printer_id, 
      spool_id, 
      planned_weight,
      start_time,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    jobName,
    moduleId,
    printerId,
    printer.loaded_spool_id,
    module.expected_weight,
    Date.now(),
    'printing'  // ✅ Set initial status to 'printing'
  ).run();

  await updatePrinterStatus(db, printerId, 'printing');

  return {
    success: true,
    jobId: result.meta.last_row_id,
    message: `Print job started on ${printer.name}`,
    expectedTime: typeof module.expected_time === 'number' ? module.expected_time : undefined,
    expectedWeight: typeof module.expected_weight === 'number' ? module.expected_weight : undefined,
    lowMaterial: spool.remaining_weight < (typeof module.expected_weight === 'number' ? module.expected_weight : 0)
  };
}

// Complete/finish a print job
export async function completePrintJob(
  db: D1Database,
  jobId: number,
  endTime: number,
  success: boolean,
  actualWeight: number,
  failureReason: string | null = null
): Promise<void> {
  const status = success ? 'success' : 'failed'; // ✅ Convert boolean to status string
  
  await db
    .prepare(`
      UPDATE print_jobs 
      SET end_time = ?, 
          status = ?, 
          actual_weight = ?, 
          failure_reason = ?
      WHERE id = ?
    `)
    .bind(endTime, status, actualWeight, failureReason, jobId)
    .run();
}

// Spool Presets
export async function getAllSpoolPresets(db: D1Database) {
  const result = await db.prepare('SELECT * FROM spool_presets').all();
  return result.results || [];
}

export async function createSpoolPreset(db: D1Database, preset: {
  name: string;
  brand: string;
  material: string;
  color?: string | null;
  defaultWeight: number;
  cost?: number | null;
}) {
  const result = await db.prepare(`
    INSERT INTO spool_presets (name, brand, material, color, default_weight, cost)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    preset.name,
    preset.brand,
    preset.material,
    preset.color ?? null,
    preset.defaultWeight,
    preset.cost ?? null
  ).run();

  return {
    success: true,
    presetId: result.meta.last_row_id,
    message: `Spool preset "${preset.name}" created successfully`
  };
}

// Print Module Functions
export async function createPrintModule(db: D1Database, module: {
  name: string;
  expectedWeight: number;
  expectedTime: number;
  objectsPerPrint?: number;
  defaultSpoolPresetId?: number | null;
  path: string;
  imagePath?: string | null;
}) {
  const result = await db.prepare(`
    INSERT INTO print_modules (
      name, 
      expected_weight, 
      expected_time, 
      objects_per_print, 
      default_spool_preset_id, 
      path,
      image_path
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    module.name,
    module.expectedWeight,
    module.expectedTime,
    module.objectsPerPrint ?? 1,
    module.defaultSpoolPresetId ?? null,
    module.path,
    module.imagePath ?? null
  ).run();

  return {
    success: true,
    moduleId: result.meta.last_row_id,
    message: `Print module "${module.name}" created successfully`
  };
}

export async function deletePrintModule(db: D1Database, moduleId: number) {
  // First, set module_id to NULL for any print jobs using this module
  await db.prepare(
    'UPDATE print_jobs SET module_id = NULL WHERE module_id = ?'
  ).bind(moduleId).run();

  // Now safe to delete the module
  await db.prepare('DELETE FROM print_modules WHERE id = ?').bind(moduleId).run();
  
  return {
    success: true,
    message: 'Print module deleted successfully (jobs using it were updated)'
  };
}

export async function getPrintModuleById(db: D1Database, id: number) {
  const result = await db.prepare('SELECT * FROM print_modules WHERE id = ?').bind(id).first();
  return result;
}

export async function getActivePrintJobs(db: D1Database) {
  const result = await db.prepare(`
    SELECT 
      pj.*,
      p.name as printer_name,
      pm.name as module_name,
      pm.expected_weight,
      pm.expected_time
    FROM print_jobs pj
    JOIN printers p ON pj.printer_id = p.id
    JOIN print_modules pm ON pj.module_id = pm.id
    WHERE pj.status = 'printing'  
    ORDER BY pj.start_time DESC
  `).all();
  
  return result.results || [];
}

export async function getAllPrintJobs(db: D1Database) {
  const result = await db.prepare(`
    SELECT 
      pj.*,
      pm.name as module_name
    FROM print_jobs pj
    LEFT JOIN print_modules pm ON pj.module_id = pm.id
    ORDER BY pj.start_time DESC
  `).all();
  
  return result.results || [];
}

// Add this function for updating printer hours
export async function updatePrinterHours(db: D1Database, printerId: number | null, hoursToAdd: number): Promise<void> {
  if (!printerId) return;
  
  await db.prepare('UPDATE printers SET total_hours = total_hours + ? WHERE id = ?')
    .bind(hoursToAdd, printerId).run();
}

