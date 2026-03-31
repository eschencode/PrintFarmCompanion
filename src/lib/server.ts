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

// Printer Models
export async function getAllPrinterModels(db: D1Database): Promise<PrinterModel[]> {
  const result = await db.prepare('SELECT * FROM printer_models ORDER BY name').all();
  return (result.results || []) as PrinterModel[];
}

export async function createPrinterModel(db: D1Database, model: {
  name: string;
  description?: string | null;
  buildVolumeX?: number | null;
  buildVolumeY?: number | null;
  buildVolumeZ?: number | null;
}): Promise<ServerResponse> {
  try {
    const result = await db.prepare(`
      INSERT INTO printer_models (name, description, build_volume_x, build_volume_y, build_volume_z)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      model.name,
      model.description ?? null,
      model.buildVolumeX ?? null,
      model.buildVolumeY ?? null,
      model.buildVolumeZ ?? null
    ).run();
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
  try {
    const updates: string[] = [];
    const values: any[] = [];
    if (model.name !== undefined) { updates.push('name = ?'); values.push(model.name); }
    if (model.description !== undefined) { updates.push('description = ?'); values.push(model.description); }
    if (model.buildVolumeX !== undefined) { updates.push('build_volume_x = ?'); values.push(model.buildVolumeX); }
    if (model.buildVolumeY !== undefined) { updates.push('build_volume_y = ?'); values.push(model.buildVolumeY); }
    if (model.buildVolumeZ !== undefined) { updates.push('build_volume_z = ?'); values.push(model.buildVolumeZ); }
    if (updates.length === 0) return { success: false, error: 'No updates provided' };
    values.push(id);
    await db.prepare(`UPDATE printer_models SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    return { success: true, message: 'Printer model updated' };
  } catch (error) {
    console.error('Error updating printer model:', error);
    return { success: false, error: 'Failed to update printer model' };
  }
}

export async function deletePrinterModel(db: D1Database, id: number): Promise<ServerResponse> {
  try {
    // Check if any printers or modules reference this model
    const printerCount = await db.prepare('SELECT COUNT(*) as count FROM printers WHERE printer_model_id = ?').bind(id).first() as { count: number };
    const moduleCount = await db.prepare('SELECT COUNT(*) as count FROM print_modules WHERE printer_model_id = ?').bind(id).first() as { count: number };
    if ((printerCount?.count || 0) > 0 || (moduleCount?.count || 0) > 0) {
      return { success: false, error: 'Cannot delete: printer model is still referenced by printers or modules' };
    }
    await db.prepare('DELETE FROM printer_models WHERE id = ?').bind(id).run();
    return { success: true, message: 'Printer model deleted' };
  } catch (error) {
    console.error('Error deleting printer model:', error);
    return { success: false, error: 'Failed to delete printer model' };
  }
}

// Printers
export async function getAllPrinters(db: D1Database) {
  const result = await db.prepare(`
    SELECT p.*, pm.name as printer_model_name
    FROM printers p
    LEFT JOIN printer_models pm ON p.printer_model_id = pm.id
  `).all();
  return result.results || [];
}

export async function getPrinterById(db: D1Database, id: number): Promise<Printer | null> {
  const result = await db.prepare(`
    SELECT p.*, pm.name as printer_model_name
    FROM printers p
    LEFT JOIN printer_models pm ON p.printer_model_id = pm.id
    WHERE p.id = ?
  `).bind(id).first();
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

// Create a new printer
export async function createPrinter(db: D1Database, printer: {
  name: string;
  model?: string | null;
  printerModelId?: number | null;
}): Promise<ServerResponse> {
  try {
    // If printerModelId is provided, also set the model text from the printer_models table
    let modelName = printer.model ?? null;
    if (printer.printerModelId) {
      const pm = await db.prepare('SELECT name FROM printer_models WHERE id = ?').bind(printer.printerModelId).first() as { name: string } | null;
      if (pm) modelName = pm.name;
    }
    const result = await db.prepare(`
      INSERT INTO printers (name, model, printer_model_id, status, total_hours)
      VALUES (?, ?, ?, 'IDLE', 0)
    `).bind(
      printer.name,
      modelName,
      printer.printerModelId ?? null
    ).run();
    
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
  }
): Promise<ServerResponse> {
  try {
    const updates: string[] = [];
    const values: any[] = [];

    if (printer.name !== undefined) {
      updates.push('name = ?');
      values.push(printer.name);
    }

    if (printer.printerModelId !== undefined) {
      updates.push('printer_model_id = ?');
      values.push(printer.printerModelId);
      // Also sync the model text field
      if (printer.printerModelId) {
        const pm = await db.prepare('SELECT name FROM printer_models WHERE id = ?').bind(printer.printerModelId).first() as { name: string } | null;
        updates.push('model = ?');
        values.push(pm?.name ?? null);
      } else {
        updates.push('model = ?');
        values.push(null);
      }
    } else if (printer.model !== undefined) {
      updates.push('model = ?');
      values.push(printer.model);
    }

    if (printer.suggested_queue !== undefined) {
      updates.push('suggested_queue = ?');
      values.push(printer.suggested_queue);
    }

    if (updates.length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    values.push(id);

    await db.prepare(`UPDATE printers SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values).run();

    return { success: true, message: 'Printer updated successfully' };
  } catch (error) {
    console.error('Error updating printer:', error);
    return { success: false, error: 'Failed to update printer' };
  }
}

// Delete a printer
export async function deletePrinter(db: D1Database, id: number): Promise<ServerResponse> {
  try {
    // Check if printer has active print jobs
    const activeJobs = await db.prepare(`
      SELECT COUNT(*) as count FROM print_jobs 
      WHERE printer_id = ? AND status = 'printing'
    `).bind(id).first() as { count: number };
    
    if (activeJobs && activeJobs.count > 0) {
      return { success: false, error: 'Cannot delete printer with active print jobs' };
    }
    
    // Delete the printer
    await db.prepare('DELETE FROM printers WHERE id = ?').bind(id).run();
    
    return { success: true, message: 'Printer deleted successfully' };
  } catch (error) {
    console.error('Error deleting printer:', error);
    return { success: false, error: 'Failed to delete printer' };
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

  // 5. Decrement storage count if loading from a preset
  if (spoolData.preset_id) {
    await db.prepare(`
      UPDATE spool_presets 
      SET storage_count = MAX(0, COALESCE(storage_count, 0) - 1) 
      WHERE id = ?
    `).bind(spoolData.preset_id).run();
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
  const result = await db.prepare(`
    SELECT pm.*, pmod.name as printer_model_name, GROUP_CONCAT(msp.spool_preset_id) as spool_preset_ids
    FROM print_modules pm
    LEFT JOIN module_spool_presets msp ON pm.id = msp.module_id
    LEFT JOIN printer_models pmod ON pm.printer_model_id = pmod.id
    GROUP BY pm.id
  `).all();
  return (result.results || []).map((m: any) => ({
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

// Update spool preset storage count
export async function updateStorageCount(db: D1Database, presetId: number, delta: number): Promise<ServerResponse> {
  try {
    await db.prepare(`
      UPDATE spool_presets 
      SET storage_count = MAX(0, COALESCE(storage_count, 0) + ?) 
      WHERE id = ?
    `).bind(delta, presetId).run();
    
    return { success: true, message: 'Storage count updated' };
  } catch (error) {
    console.error('Error updating storage count:', error);
    return { success: false, error: 'Failed to update storage count' };
  }
}

// Set absolute storage count for a preset
export async function setStorageCount(db: D1Database, presetId: number, count: number): Promise<ServerResponse> {
  try {
    await db.prepare(`
      UPDATE spool_presets 
      SET storage_count = ? 
      WHERE id = ?
    `).bind(Math.max(0, count), presetId).run();
    
    return { success: true, message: 'Storage count set' };
  } catch (error) {
    console.error('Error setting storage count:', error);
    return { success: false, error: 'Failed to set storage count' };
  }
}

// Get a single spool preset by ID
export async function getSpoolPresetById(db: D1Database, id: number): Promise<SpoolPreset | null> {
  const result = await db.prepare('SELECT * FROM spool_presets WHERE id = ?').bind(id).first();
  return result as SpoolPreset | null;
}

export async function updateSpoolPreset(db: D1Database, id: number, preset: {
  name: string;
  brand: string;
  material: string;
  color?: string | null;
  defaultWeight: number;
  cost?: number | null;
}): Promise<ServerResponse> {
  try {
    await db.prepare(`
      UPDATE spool_presets SET name = ?, brand = ?, material = ?, color = ?, default_weight = ?, cost = ?
      WHERE id = ?
    `).bind(
      preset.name,
      preset.brand,
      preset.material,
      preset.color ?? null,
      preset.defaultWeight,
      preset.cost ?? null,
      id
    ).run();
    return { success: true, message: `Spool preset "${preset.name}" updated successfully` };
  } catch (error) {
    console.error('Error updating spool preset:', error);
    return { success: false, error: 'Failed to update spool preset' };
  }
}

export async function deleteSpoolPreset(db: D1Database, id: number): Promise<ServerResponse> {
  try {
    await db.prepare('DELETE FROM module_spool_presets WHERE spool_preset_id = ?').bind(id).run();
    await db.prepare('DELETE FROM spool_presets WHERE id = ?').bind(id).run();
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
  // If printerModelId provided, sync printer_model text
  let printerModelText = module.printerModel ?? null;
  if (module.printerModelId) {
    const pm = await db.prepare('SELECT name FROM printer_models WHERE id = ?').bind(module.printerModelId).first() as { name: string } | null;
    if (pm) printerModelText = pm.name;
  }
  const result = await db.prepare(`
    INSERT INTO print_modules (
      name, expected_weight, expected_time, objects_per_print,
      default_spool_preset_id, local_file_handler_path, image_path, printer_model, printer_model_id, inventory_slug,
      file_name, thumbnail, filament_type, filament_color, plate_type, nozzle_diameter, pi_file_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    module.name,
    module.expectedWeight ?? null,
    module.expectedTime ?? null,
    module.objectsPerPrint ?? 1,
    module.spoolPresetIds?.[0] ?? module.defaultSpoolPresetId ?? null,
    module.localFileHandlerPath ?? null,
    module.imagePath || null,
    printerModelText,
    module.printerModelId ?? null,
    module.inventorySlug ?? null,
    module.fileName ?? null,
    module.thumbnail ?? null,
    module.filamentType ?? null,
    module.filamentColor ?? null,
    module.plateType ?? null,
    module.nozzleDiameter ?? null,
    module.piFilePath ?? null
  ).run();

  const moduleId = result.meta.last_row_id as number;

  // Insert into junction table for each preset
  const presetIds = module.spoolPresetIds ?? (module.defaultSpoolPresetId ? [module.defaultSpoolPresetId] : []);
  for (const presetId of presetIds) {
    await db.prepare('INSERT OR IGNORE INTO module_spool_presets (module_id, spool_preset_id) VALUES (?, ?)')
      .bind(moduleId, presetId).run();
  }

  return {
    success: true,
    moduleId,
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
  const updates: string[] = [];
  const values: any[] = [];

  if (module.inventorySlug !== undefined) {
    updates.push('inventory_slug = ?');
    values.push(module.inventorySlug);
  }

  if (module.name !== undefined) {
    updates.push('name = ?');
    values.push(module.name);
  }
  if (module.expectedWeight !== undefined) {
    updates.push('expected_weight = ?');
    values.push(module.expectedWeight);
  }
  if (module.expectedTime !== undefined) {
    updates.push('expected_time = ?');
    values.push(module.expectedTime);
  }
  if (module.objectsPerPrint !== undefined) {
    updates.push('objects_per_print = ?');
    values.push(module.objectsPerPrint);
  }
  if (module.defaultSpoolPresetId !== undefined) {
    updates.push('default_spool_preset_id = ?');
    values.push(module.defaultSpoolPresetId);
  }
  if (module.localFileHandlerPath !== undefined) {
    updates.push('local_file_handler_path = ?');
    values.push(module.localFileHandlerPath);
  }
  if (module.imagePath !== undefined) {
    updates.push('image_path = ?');
    values.push(module.imagePath);
  }
  if (module.fileName !== undefined) {
    updates.push('file_name = ?');
    values.push(module.fileName);
  }
  if (module.thumbnail !== undefined) {
    updates.push('thumbnail = ?');
    values.push(module.thumbnail);
  }
  if (module.filamentType !== undefined) {
    updates.push('filament_type = ?');
    values.push(module.filamentType);
  }
  if (module.filamentColor !== undefined) {
    updates.push('filament_color = ?');
    values.push(module.filamentColor);
  }
  if (module.plateType !== undefined) {
    updates.push('plate_type = ?');
    values.push(module.plateType);
  }
  if (module.nozzleDiameter !== undefined) {
    updates.push('nozzle_diameter = ?');
    values.push(module.nozzleDiameter);
  }
  if (module.piFilePath !== undefined) {
    updates.push('pi_file_path = ?');
    values.push(module.piFilePath);
  }
  if (module.fileStoredOnPi !== undefined) {
    updates.push('file_stored_on_pi = ?');
    values.push(module.fileStoredOnPi);
  }
  if (module.printerModelId !== undefined) {
    updates.push('printer_model_id = ?');
    values.push(module.printerModelId);
    // Sync text field
    if (module.printerModelId) {
      const pm = await db.prepare('SELECT name FROM printer_models WHERE id = ?').bind(module.printerModelId).first() as { name: string } | null;
      updates.push('printer_model = ?');
      values.push(pm?.name ?? null);
    } else {
      updates.push('printer_model = ?');
      values.push(null);
    }
  } else if (module.printerModel !== undefined) {
    updates.push('printer_model = ?');
    values.push(module.printerModel);
  }

  if (updates.length === 0 && module.spoolPresetIds === undefined) {
    return { success: false, error: 'No changes provided' };
  }

  if (updates.length > 0) {
    values.push(id);
    await db
      .prepare(`UPDATE print_modules SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  // Update junction table if preset IDs were provided
  if (module.spoolPresetIds !== undefined) {
    await db.prepare('DELETE FROM module_spool_presets WHERE module_id = ?').bind(id).run();
    for (const presetId of module.spoolPresetIds) {
      await db.prepare('INSERT OR IGNORE INTO module_spool_presets (module_id, spool_preset_id) VALUES (?, ?)')
        .bind(id, presetId).run();
    }
    // Keep default_spool_preset_id in sync with first preset
    const firstPreset = module.spoolPresetIds[0] ?? null;
    await db.prepare('UPDATE print_modules SET default_spool_preset_id = ? WHERE id = ?')
      .bind(firstPreset, id).run();
  }

  return { success: true, message: 'Print module updated' };
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
      pm.expected_time,
      pm.objects_per_print,
      pm.image_path as module_image_path
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

// Grid Presets
export async function getAllGridPresets(db: D1Database): Promise<GridPreset[]> {
  const result = await db.prepare('SELECT * FROM grid_presets ORDER BY is_default DESC, created_at DESC').all();
  return (result.results || []) as unknown as GridPreset[];
}

export async function getDefaultGridPreset(db: D1Database): Promise<GridPreset | null> {
  const result = await db.prepare('SELECT * FROM grid_presets WHERE is_default = 1 LIMIT 1').first();
  return result as GridPreset | null;
}

export async function getGridPresetById(db: D1Database, id: number): Promise<GridPreset | null> {
  const result = await db.prepare('SELECT * FROM grid_presets WHERE id = ?').bind(id).first();
  return result as GridPreset | null;
}

export async function createGridPreset(db: D1Database, preset: NewGridPreset): Promise<ServerResponse> {
  try {
    const gridConfigJson = JSON.stringify(preset.grid_config);
    
    // If this is being set as default, unset other defaults first
    if (preset.is_default) {
      await db.prepare('UPDATE grid_presets SET is_default = 0').run();
    }
    
    const result = await db.prepare(`
      INSERT INTO grid_presets (name, is_default, grid_config, rows, cols)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      preset.name,
      preset.is_default ? 1 : 0,
      gridConfigJson,
      preset.rows,
      preset.cols
    ).run();
    
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
  try {
    // If this is being set as default, unset other defaults first
    if (preset.is_default) {
      await db.prepare('UPDATE grid_presets SET is_default = 0').run();
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (preset.name !== undefined) {
      updates.push('name = ?');
      values.push(preset.name);
    }
    
    if (preset.is_default !== undefined) {
      updates.push('is_default = ?');
      values.push(preset.is_default ? 1 : 0);
    }
    
    if (preset.grid_config !== undefined) {
      updates.push('grid_config = ?');
      values.push(JSON.stringify(preset.grid_config));
    }
    
    if (preset.rows !== undefined) {
      updates.push('rows = ?');
      values.push(preset.rows);
    }
    
    if (preset.cols !== undefined) {
      updates.push('cols = ?');
      values.push(preset.cols);
    }
    
    if (updates.length === 0) {
      return { success: false, error: 'No updates provided' };
    }
    
    values.push(id);
    
    await db.prepare(`UPDATE grid_presets SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values).run();
    
    return { success: true, message: 'Grid preset updated successfully' };
  } catch (error) {
    console.error('Error updating grid preset:', error);
    return { success: false, error: 'Failed to update grid preset' };
  }
}

export async function setDefaultGridPreset(db: D1Database, id: number): Promise<ServerResponse> {
  try {
    // Unset all defaults
    await db.prepare('UPDATE grid_presets SET is_default = 0').run();
    
    // Set the new default
    await db.prepare('UPDATE grid_presets SET is_default = 1 WHERE id = ?').bind(id).run();
    
    return { success: true, message: 'Default grid preset updated' };
  } catch (error) {
    console.error('Error setting default grid preset:', error);
    return { success: false, error: 'Failed to set default grid preset' };
  }
}

export async function deleteGridPreset(db: D1Database, id: number): Promise<ServerResponse> {
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
    
    await db.prepare('DELETE FROM grid_presets WHERE id = ?').bind(id).run();
    
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