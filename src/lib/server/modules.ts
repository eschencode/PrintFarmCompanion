import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import type { PrintModule, PrintModuleFull, ModuleFilamentSlot, ServerResponse } from '../types';

// ─── Module Filament Slots ────────────────────────────────────────────────────

export async function getModuleFilamentSlots(
  db: D1Database,
  moduleId: number,
): Promise<(ModuleFilamentSlot & { preset?: unknown })[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all(sql`
    SELECT
      mfs.module_id, mfs.slot_index, mfs.spool_preset_id,
      sp.color, sp.brand, sp.material, sp.default_weight
    FROM module_filament_slots mfs
    LEFT JOIN spool_presets sp ON mfs.spool_preset_id = sp.id
    WHERE mfs.module_id = ${moduleId}
    ORDER BY mfs.slot_index
  `);
  return (rows ?? []) as unknown as (ModuleFilamentSlot & { preset?: unknown })[];
}

/**
 * Replace all filament slot definitions for a module.
 * Pass an empty array to clear all slots (no filament requirements).
 */
export async function setModuleFilamentSlots(
  db: D1Database,
  moduleId: number,
  slots: { slotIndex: number; spoolPresetId: number }[],
): Promise<void> {
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`DELETE FROM module_filament_slots WHERE module_id = ${moduleId}`);
  for (const slot of slots) {
    await drizzleDb.run(sql`
      INSERT INTO module_filament_slots (module_id, slot_index, spool_preset_id)
      VALUES (${moduleId}, ${slot.slotIndex}, ${slot.spoolPresetId})
    `);
  }
}

// ─── Print Modules ────────────────────────────────────────────────────────────

export async function getAllPrintModules(db: D1Database): Promise<PrintModuleFull[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<PrintModule>(sql`
    SELECT
      pm.*,
      pp.model  as printer_preset_model,
      pp.brand  as printer_preset_brand,
      plp.name  as plate_preset_name,
      o.name    as object_name,
      mfs.spool_preset_id as default_spool_preset_id
    FROM print_modules pm
    LEFT JOIN printer_presets pp  ON pm.printer_preset_id = pp.id
    LEFT JOIN plate_presets   plp ON pm.plate_preset_id   = plp.id
    LEFT JOIN objects         o   ON pm.object_id         = o.id
    LEFT JOIN module_filament_slots mfs ON pm.id = mfs.module_id AND mfs.slot_index = 0
    ORDER BY pm.name
  `);

  // Attach filament slots to each module
  const modules = rows ?? [];
  return Promise.all(
    modules.map(async (m) => {
      const slots = await getModuleFilamentSlots(db, m.id);
      return { ...m, filament_slots: slots } as unknown as PrintModuleFull;
    }),
  );
}

export async function getPrintModuleById(
  db: D1Database,
  id: number,
): Promise<PrintModuleFull | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<PrintModule>(sql`
    SELECT
      pm.*,
      pp.model  as printer_preset_model,
      pp.brand  as printer_preset_brand,
      plp.name  as plate_preset_name,
      o.name    as object_name,
      mfs.spool_preset_id as default_spool_preset_id
    FROM print_modules pm
    LEFT JOIN printer_presets pp  ON pm.printer_preset_id = pp.id
    LEFT JOIN plate_presets   plp ON pm.plate_preset_id   = plp.id
    LEFT JOIN objects         o   ON pm.object_id         = o.id
    LEFT JOIN module_filament_slots mfs ON pm.id = mfs.module_id AND mfs.slot_index = 0
    WHERE pm.id = ${id}
  `);
  if (!row) return null;

  const slots = await getModuleFilamentSlots(db, id);
  return { ...row, filament_slots: slots } as unknown as PrintModuleFull;
}

export async function createPrintModule(
  db: D1Database,
  module: {
    name: string;
    weight: number;
    expectedTimeMinutes: number;
    objectsPerPrint?: number;
    platePresetId: number;
    printerPresetId: number;
    objectId?: number | null;
    nozzleDiameter?: number | null;
    filename: string;
    thumbnail?: string | null;
    /** Filament slot requirements. Empty = no requirements (any filament). */
    filamentSlots?: { slotIndex: number; spoolPresetId: number }[];
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await drizzleDb.run(sql`
      INSERT INTO print_modules (
        name, weight, expected_time_minutes, objects_per_print,
        plate_preset_id, printer_preset_id, object_id,
        nozzle_diameter, filename, thumbnail, active,
        created_at, updated_at
      ) VALUES (
        ${module.name}, ${module.weight}, ${module.expectedTimeMinutes},
        ${module.objectsPerPrint ?? 1},
        ${module.platePresetId}, ${module.printerPresetId}, ${module.objectId ?? null},
        ${module.nozzleDiameter ?? null}, ${module.filename},
        ${module.thumbnail ?? null}, 1, ${now}, ${now}
      )
    `);

    const moduleId = result.meta.last_row_id as number;

    if (module.filamentSlots?.length) {
      await setModuleFilamentSlots(db, moduleId, module.filamentSlots);
    }

    return { success: true, message: `Module "${module.name}" created`, data: { id: moduleId } };
  } catch (error) {
    console.error('Error creating print module:', error);
    return { success: false, error: 'Failed to create print module' };
  }
}

export async function updatePrintModule(
  db: D1Database,
  id: number,
  module: {
    name?: string;
    weight?: number;
    expectedTimeMinutes?: number;
    objectsPerPrint?: number;
    platePresetId?: number;
    printerPresetId?: number;
    objectId?: number | null;
    nozzleDiameter?: number | null;
    filename?: string;
    thumbnail?: string | null;
    active?: boolean;
    filamentSlots?: { slotIndex: number; spoolPresetId: number }[];
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const updates: ReturnType<typeof sql>[] = [];
    if (module.name !== undefined) updates.push(sql`name = ${module.name}`);
    if (module.weight !== undefined) updates.push(sql`weight = ${module.weight}`);
    if (module.expectedTimeMinutes !== undefined) updates.push(sql`expected_time_minutes = ${module.expectedTimeMinutes}`);
    if (module.objectsPerPrint !== undefined) updates.push(sql`objects_per_print = ${module.objectsPerPrint}`);
    if (module.platePresetId !== undefined) updates.push(sql`plate_preset_id = ${module.platePresetId}`);
    if (module.printerPresetId !== undefined) updates.push(sql`printer_preset_id = ${module.printerPresetId}`);
    if (module.objectId !== undefined) updates.push(sql`object_id = ${module.objectId}`);
    if (module.nozzleDiameter !== undefined) updates.push(sql`nozzle_diameter = ${module.nozzleDiameter}`);
    if (module.filename !== undefined) updates.push(sql`filename = ${module.filename}`);
    if (module.thumbnail !== undefined) updates.push(sql`thumbnail = ${module.thumbnail}`);
    if (module.active !== undefined) updates.push(sql`active = ${module.active ? 1 : 0}`);

    if (updates.length > 0) {
      await drizzleDb.run(
        sql`UPDATE print_modules SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`,
      );
    }

    if (module.filamentSlots !== undefined) {
      await setModuleFilamentSlots(db, id, module.filamentSlots);
    }

    return { success: true, message: 'Print module updated' };
  } catch (error) {
    console.error('Error updating print module:', error);
    return { success: false, error: 'Failed to update print module' };
  }
}

/**
 * Soft-delete a module by setting active = false.
 * Hard-delete is avoided because historical print_jobs reference modules.
 */
export async function deletePrintModule(db: D1Database, id: number): Promise<ServerResponse> {
  return updatePrintModule(db, id, { active: false });
}
