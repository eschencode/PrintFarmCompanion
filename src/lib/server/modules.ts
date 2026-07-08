import { sql } from 'drizzle-orm';
import type { PrintModule, PrintModuleFull, ModuleFilamentSlot, ServerResponse } from '../types';
import type { TenantContext } from './context';

// print_modules + module_filament_slots carry workspace_id NOT NULL (Phase 3,
// group 4). Every query is scoped to ctx.workspaceId.

// ─── Module Filament Slots ────────────────────────────────────────────────────

export async function getModuleFilamentSlots(
  ctx: TenantContext,
  moduleId: number,
): Promise<(ModuleFilamentSlot & { preset?: unknown })[]> {
  const rows = await ctx.db.all(sql`
    SELECT
      mfs.module_id, mfs.slot_index, mfs.spool_preset_id, mfs.weight,
      sp.color, sp.brand, sp.material, sp.default_weight
    FROM module_filament_slots mfs
    LEFT JOIN spool_presets sp ON mfs.spool_preset_id = sp.id
    WHERE mfs.module_id = ${moduleId} AND mfs.workspace_id = ${ctx.workspaceId}
    ORDER BY mfs.slot_index
  `);
  return (rows ?? []) as unknown as (ModuleFilamentSlot & { preset?: unknown })[];
}

/**
 * Replace all filament slot definitions for a module.
 * Pass an empty array to clear all slots (no filament requirements).
 */
export async function setModuleFilamentSlots(
  ctx: TenantContext,
  moduleId: number,
  slots: { slotIndex: number; spoolPresetId: number | null; weight?: number | null }[],
): Promise<void> {
  await ctx.db.run(sql`DELETE FROM module_filament_slots WHERE module_id = ${moduleId} AND workspace_id = ${ctx.workspaceId}`);
  for (const slot of slots) {
    await ctx.db.run(sql`
      INSERT INTO module_filament_slots (workspace_id, module_id, slot_index, spool_preset_id, weight)
      VALUES (${ctx.workspaceId}, ${moduleId}, ${slot.slotIndex}, ${slot.spoolPresetId}, ${slot.weight ?? null})
    `);
  }
}

// ─── Print Modules ────────────────────────────────────────────────────────────

export async function getAllPrintModules(ctx: TenantContext): Promise<PrintModuleFull[]> {
  const rows = await ctx.db.all<PrintModule>(sql`
    SELECT
      pm.*,
      pp.model  as printer_preset_model,
      pp.brand  as printer_preset_brand,
      plp.name  as plate_preset_name,
      o.name    as object_name,
      c.name    as object_category,
      mfs.spool_preset_id as default_spool_preset_id
    FROM print_modules pm
    LEFT JOIN printer_presets pp  ON pm.printer_preset_id = pp.id
    LEFT JOIN plate_presets   plp ON pm.plate_preset_id   = plp.id
    LEFT JOIN objects         o   ON pm.object_id         = o.id
    LEFT JOIN categories      c   ON o.category_id         = c.id
    LEFT JOIN module_filament_slots mfs ON pm.id = mfs.module_id AND mfs.slot_index = 0
    WHERE pm.workspace_id = ${ctx.workspaceId}
    ORDER BY pm.name
  `);

  // Attach filament slots to each module. Exposed under both keys: `filament_slots`
  // for the dashboard, `slots` for the modules page + edit modal (which read .slots
  // and rely on per-slot weight for display/editing).
  const modules = rows ?? [];
  return Promise.all(
    modules.map(async (m) => {
      const slots = await getModuleFilamentSlots(ctx, m.id);
      return { ...m, filament_slots: slots, slots } as unknown as PrintModuleFull;
    }),
  );
}

export async function getPrintModuleById(
  ctx: TenantContext,
  id: number,
): Promise<PrintModuleFull | null> {
  const row = await ctx.db.get<PrintModule>(sql`
    SELECT
      pm.*,
      pp.model  as printer_preset_model,
      pp.brand  as printer_preset_brand,
      plp.name  as plate_preset_name,
      o.name    as object_name,
      c.name    as object_category,
      mfs.spool_preset_id as default_spool_preset_id
    FROM print_modules pm
    LEFT JOIN printer_presets pp  ON pm.printer_preset_id = pp.id
    LEFT JOIN plate_presets   plp ON pm.plate_preset_id   = plp.id
    LEFT JOIN objects         o   ON pm.object_id         = o.id
    LEFT JOIN categories      c   ON o.category_id         = c.id
    LEFT JOIN module_filament_slots mfs ON pm.id = mfs.module_id AND mfs.slot_index = 0
    WHERE pm.id = ${id} AND pm.workspace_id = ${ctx.workspaceId}
  `);
  if (!row) return null;

  const slots = await getModuleFilamentSlots(ctx, id);
  return { ...row, filament_slots: slots } as unknown as PrintModuleFull;
}

export async function createPrintModule(
  ctx: TenantContext,
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
    /** Filament slot requirements. Empty = no requirements (any filament).
     *  spoolPresetId = null means slot accepts any loaded spool. */
    filamentSlots?: { slotIndex: number; spoolPresetId: number | null }[];
  },
): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await ctx.db.run(sql`
      INSERT INTO print_modules (
        workspace_id, name, weight, expected_time_minutes, objects_per_print,
        plate_preset_id, printer_preset_id, object_id,
        nozzle_diameter, filename, thumbnail, active,
        created_at, updated_at
      ) VALUES (
        ${ctx.workspaceId}, ${module.name}, ${module.weight}, ${module.expectedTimeMinutes},
        ${module.objectsPerPrint ?? 1},
        ${module.platePresetId}, ${module.printerPresetId}, ${module.objectId ?? null},
        ${module.nozzleDiameter ?? null}, ${module.filename},
        ${module.thumbnail ?? null}, 1, ${now}, ${now}
      )
    `);

    const moduleId = result.meta.last_row_id as number;

    if (module.filamentSlots?.length) {
      await setModuleFilamentSlots(ctx, moduleId, module.filamentSlots);
    }

    return { success: true, message: `Module "${module.name}" created`, data: { id: moduleId } };
  } catch (error) {
    console.error('Error creating print module:', error);
    return { success: false, error: 'Failed to create print module' };
  }
}

export async function updatePrintModule(
  ctx: TenantContext,
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
    filamentSlots?: { slotIndex: number; spoolPresetId: number | null }[];
  },
): Promise<ServerResponse> {
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
      await ctx.db.run(
        sql`UPDATE print_modules SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`,
      );
    }

    if (module.filamentSlots !== undefined) {
      await setModuleFilamentSlots(ctx, id, module.filamentSlots);
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
export async function deletePrintModule(ctx: TenantContext, id: number): Promise<ServerResponse> {
  return updatePrintModule(ctx, id, { active: false });
}
