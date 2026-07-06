import type { D1Database } from '@cloudflare/workers-types';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  printerPresets,
  printers,
} from '../db/schema';
import type {
  Printer,
  PrinterPreset,
  PrinterSecrets,
  PrinterLoadedSpool,
  PrinterFull,
  PrinterQueuedJob,
  SpoolWithPreset,
  ServerResponse,
} from '../types';
import type { TenantContext } from './context';

// printers / printer_secrets / printer_loaded_spools carry workspace_id NOT NULL
// (Phase 3, group 3) and are scoped to ctx.workspaceId.
// printer_presets stays catalog (hybrid, Group 9) — still db-based.
// printer_queued_jobs stays Group 6 — still db-based.

// ─── Printer Presets (catalog — db-based until Group 9) ──────────────────────

export async function getAllPrinterPresets(db: D1Database): Promise<PrinterPreset[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb
    .select()
    .from(printerPresets)
    .orderBy(printerPresets.brand, printerPresets.model);
  return rows as unknown as PrinterPreset[];
}

export async function getPrinterPresetById(db: D1Database, id: number): Promise<PrinterPreset | null> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb
    .select()
    .from(printerPresets)
    .where(eq(printerPresets.id, id))
    .limit(1);
  return (rows[0] ?? null) as unknown as PrinterPreset | null;
}

export async function createPrinterPreset(
  db: D1Database,
  preset: {
    model: string;
    brand: string;
    dimensionX?: number | null;
    dimensionY?: number | null;
    dimensionZ?: number | null;
    deviceFilePath: string;
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const result = await drizzleDb.insert(printerPresets).values({
      model: preset.model,
      brand: preset.brand,
      dimensionX: preset.dimensionX ?? null,
      dimensionY: preset.dimensionY ?? null,
      dimensionZ: preset.dimensionZ ?? null,
      deviceFilePath: preset.deviceFilePath,
    });
    return { success: true, message: 'Printer preset created', data: { id: result.meta.last_row_id } };
  } catch (error) {
    console.error('Error creating printer preset:', error);
    return { success: false, error: 'Failed to create printer preset' };
  }
}

export async function updatePrinterPreset(
  db: D1Database,
  id: number,
  preset: {
    model?: string;
    brand?: string;
    dimensionX?: number | null;
    dimensionY?: number | null;
    dimensionZ?: number | null;
    deviceFilePath?: string;
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const updates: ReturnType<typeof sql>[] = [];
    if (preset.model !== undefined) updates.push(sql`model = ${preset.model}`);
    if (preset.brand !== undefined) updates.push(sql`brand = ${preset.brand}`);
    if (preset.dimensionX !== undefined) updates.push(sql`dimension_x = ${preset.dimensionX}`);
    if (preset.dimensionY !== undefined) updates.push(sql`dimension_y = ${preset.dimensionY}`);
    if (preset.dimensionZ !== undefined) updates.push(sql`dimension_z = ${preset.dimensionZ}`);
    if (preset.deviceFilePath !== undefined) updates.push(sql`device_file_path = ${preset.deviceFilePath}`);
    if (updates.length === 0) return { success: false, error: 'No updates provided' };
    await drizzleDb.run(
      sql`UPDATE printer_presets SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`,
    );
    return { success: true, message: 'Printer preset updated' };
  } catch (error) {
    console.error('Error updating printer preset:', error);
    return { success: false, error: 'Failed to update printer preset' };
  }
}

export async function deletePrinterPreset(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // Restrict: can't delete if printers or modules reference it (enforced by FK, but give a friendly message)
    const printerCount = await drizzleDb.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM printers WHERE printer_preset_id = ${id}`,
    );
    const moduleCount = await drizzleDb.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM print_modules WHERE printer_preset_id = ${id}`,
    );
    if ((printerCount?.count ?? 0) > 0 || (moduleCount?.count ?? 0) > 0) {
      return { success: false, error: 'Cannot delete: preset is still referenced by printers or modules' };
    }
    await drizzleDb.run(sql`DELETE FROM printer_presets WHERE id = ${id}`);
    return { success: true, message: 'Printer preset deleted' };
  } catch (error) {
    console.error('Error deleting printer preset:', error);
    return { success: false, error: 'Failed to delete printer preset' };
  }
}

// ─── Printers ─────────────────────────────────────────────────────────────────

export async function getAllPrinters(ctx: TenantContext): Promise<Printer[]> {
  const rows = await ctx.db.all<Printer>(sql`
    SELECT
      p.id, p.name, p.printer_preset_id, p.loaded_plate_id,
      p.loaded_nozzle_diameter, p.slot_count, p.active, p.created_at, p.updated_at
    FROM printers p
    WHERE p.workspace_id = ${ctx.workspaceId}
    ORDER BY p.name
  `);
  return rows ?? [];
}

export async function getPrinterById(ctx: TenantContext, id: number): Promise<Printer | null> {
  const row = await ctx.db.get<Printer>(sql`
    SELECT
      p.id, p.name, p.printer_preset_id, p.loaded_plate_id,
      p.loaded_nozzle_diameter, p.slot_count, p.active, p.created_at, p.updated_at
    FROM printers p
    WHERE p.id = ${id} AND p.workspace_id = ${ctx.workspaceId}
  `);
  return row ?? null;
}

/** Full printer with preset, secrets, and loaded spools — for dashboard. */
export async function getPrinterFull(ctx: TenantContext, id: number): Promise<PrinterFull | null> {
  const printer = await getPrinterById(ctx, id);
  if (!printer) return null;

  // Preset is catalog (not workspace-scoped) — use the raw D1 handle.
  const preset = await getPrinterPresetById(ctx.d1, printer.printer_preset_id);
  const secrets = await getPrinterSecrets(ctx, id);
  const loadedSpools = await getLoadedSpools(ctx, id);

  return { ...printer, preset: preset ?? null, secrets: secrets ?? null, loaded_spools: loadedSpools as PrinterFull['loaded_spools'] };
}

export async function getAllPrintersFull(ctx: TenantContext): Promise<PrinterFull[]> {
  const printerList = await getAllPrinters(ctx);
  return Promise.all(printerList.map((p) => getPrinterFull(ctx, p.id) as Promise<PrinterFull>));
}

export async function createPrinter(
  ctx: TenantContext,
  printer: {
    name: string;
    printerPresetId: number;
    loadedNozzleDiameter?: number | null;
    slotCount?: number;
  },
  secrets?: {
    printerIp?: string | null;
    serial?: string | null;
    accessCode?: string | null;
  },
): Promise<ServerResponse> {
  const slotCount = Math.max(1, printer.slotCount ?? 1);
  try {
    const result = await ctx.db.insert(printers).values({
      workspaceId: ctx.workspaceId,
      name: printer.name,
      printerPresetId: printer.printerPresetId,
      loadedNozzleDiameter: printer.loadedNozzleDiameter ?? null,
      slotCount,
      active: true,
    });
    const printerId = result.meta.last_row_id as number;

    if (secrets) {
      await upsertPrinterSecrets(ctx, printerId, secrets);
    }

    // Seed one empty slot row per slot so the printer is immediately addressable.
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < slotCount; i++) {
      await ctx.db.run(sql`
        INSERT OR IGNORE INTO printer_loaded_spools (workspace_id, printer_id, slot_index, spool_id, created_at, updated_at)
        VALUES (${ctx.workspaceId}, ${printerId}, ${i}, NULL, ${now}, ${now})
      `);
    }

    return { success: true, message: 'Printer created', data: { id: printerId } };
  } catch (error) {
    console.error('Error creating printer:', error);
    return { success: false, error: 'Failed to create printer' };
  }
}

export async function updatePrinter(
  ctx: TenantContext,
  id: number,
  printer: {
    name?: string;
    printerPresetId?: number;
    loadedPlateId?: number | null;
    loadedNozzleDiameter?: number | null;
    active?: boolean;
    slotCount?: number;
  },
): Promise<ServerResponse> {
  try {
    // Reconcile slot rows before updating the printer row.
    if (printer.slotCount !== undefined) {
      const current = await getPrinterById(ctx, id);
      if (current) {
        const oldCount = current.slot_count ?? 1;
        const newCount = Math.max(1, printer.slotCount);
        const now = Math.floor(Date.now() / 1000);

        if (newCount > oldCount) {
          for (let i = oldCount; i < newCount; i++) {
            await ctx.db.run(sql`
              INSERT OR IGNORE INTO printer_loaded_spools (workspace_id, printer_id, slot_index, spool_id, created_at, updated_at)
              VALUES (${ctx.workspaceId}, ${id}, ${i}, NULL, ${now}, ${now})
            `);
          }
        } else if (newCount < oldCount) {
          const occupied = await ctx.db.get<{ count: number }>(
            sql`SELECT COUNT(*) as count FROM printer_loaded_spools
                WHERE printer_id = ${id} AND workspace_id = ${ctx.workspaceId} AND slot_index >= ${newCount} AND spool_id IS NOT NULL`,
          );
          if ((occupied?.count ?? 0) > 0) {
            return {
              success: false,
              error: `Cannot reduce to ${newCount} slot(s): unload spools from slots ${newCount + 1}–${oldCount} first`,
            };
          }
          await ctx.db.run(
            sql`DELETE FROM printer_loaded_spools WHERE printer_id = ${id} AND workspace_id = ${ctx.workspaceId} AND slot_index >= ${newCount}`,
          );
        }
      }
    }

    const updates: ReturnType<typeof sql>[] = [];
    if (printer.name !== undefined) updates.push(sql`name = ${printer.name}`);
    if (printer.printerPresetId !== undefined) updates.push(sql`printer_preset_id = ${printer.printerPresetId}`);
    if (printer.loadedPlateId !== undefined) updates.push(sql`loaded_plate_id = ${printer.loadedPlateId}`);
    if (printer.loadedNozzleDiameter !== undefined) updates.push(sql`loaded_nozzle_diameter = ${printer.loadedNozzleDiameter}`);
    if (printer.active !== undefined) updates.push(sql`active = ${printer.active ? 1 : 0}`);
    if (printer.slotCount !== undefined) updates.push(sql`slot_count = ${Math.max(1, printer.slotCount)}`);
    if (updates.length === 0) return { success: true, message: 'Nothing to update' };
    await ctx.db.run(
      sql`UPDATE printers SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`,
    );
    return { success: true, message: 'Printer updated' };
  } catch (error) {
    console.error('Error updating printer:', error);
    return { success: false, error: 'Failed to update printer' };
  }
}

export async function deletePrinter(ctx: TenantContext, id: number): Promise<ServerResponse> {
  try {
    const activeJob = await ctx.db.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM print_jobs WHERE printer_id = ${id} AND status = 'printing' AND workspace_id = ${ctx.workspaceId}`,
    );
    if ((activeJob?.count ?? 0) > 0) {
      return { success: false, error: 'Cannot delete printer with an active print job' };
    }
    // Cascade handles printer_secrets, printer_loaded_spools, printer_queued_jobs
    await ctx.db.run(sql`DELETE FROM printers WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`);
    return { success: true, message: 'Printer deleted' };
  } catch (error) {
    console.error('Error deleting printer:', error);
    return { success: false, error: 'Failed to delete printer' };
  }
}

/** Decommission / recommission a printer. Sets active flag. */
export async function setPrinterActive(ctx: TenantContext, id: number, active: boolean): Promise<ServerResponse> {
  return updatePrinter(ctx, id, { active });
}

/** Update the transport mode stored in printer_secrets. */
export async function updatePrinterTransport(
  ctx: TenantContext,
  printerId: number,
  transport: import('../types').TransportMode,
): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db.run(sql`
      INSERT INTO printer_secrets (workspace_id, printer_id, transport, created_at, updated_at)
      VALUES (${ctx.workspaceId}, ${printerId}, ${transport}, ${now}, ${now})
      ON CONFLICT (printer_id) DO UPDATE SET
        transport  = excluded.transport,
        updated_at = excluded.updated_at
    `);
    return { success: true, message: 'Transport updated' };
  } catch (error) {
    console.error('Error updating transport:', error);
    return { success: false, error: 'Failed to update transport' };
  }
}

// ─── Printer Secrets ─────────────────────────────────────────────────────────

export async function getPrinterSecrets(ctx: TenantContext, printerId: number): Promise<PrinterSecrets | null> {
  const row = await ctx.db.get<PrinterSecrets>(
    sql`SELECT * FROM printer_secrets WHERE printer_id = ${printerId} AND workspace_id = ${ctx.workspaceId}`,
  );
  return row ?? null;
}

export async function upsertPrinterSecrets(
  ctx: TenantContext,
  printerId: number,
  secrets: { printerIp?: string | null; serial?: string | null; accessCode?: string | null },
): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db.run(sql`
      INSERT INTO printer_secrets (workspace_id, printer_id, printer_ip, serial, access_code, created_at, updated_at)
      VALUES (${ctx.workspaceId}, ${printerId}, ${secrets.printerIp ?? null}, ${secrets.serial ?? null}, ${secrets.accessCode ?? null}, ${now}, ${now})
      ON CONFLICT (printer_id) DO UPDATE SET
        printer_ip   = excluded.printer_ip,
        serial       = excluded.serial,
        access_code  = excluded.access_code,
        updated_at   = excluded.updated_at
    `);
    return { success: true, message: 'Printer secrets saved' };
  } catch (error) {
    console.error('Error upserting printer secrets:', error);
    return { success: false, error: 'Failed to save printer secrets' };
  }
}

// ─── Loaded Spools (per-slot) ─────────────────────────────────────────────────

/** Get all loaded spool slots for a printer, with spool + preset nested. */
export async function getLoadedSpools(
  ctx: TenantContext,
  printerId: number,
): Promise<(PrinterLoadedSpool & { spool: SpoolWithPreset | null })[]> {
  const rows = await ctx.db.all<{
    printer_id: number;
    slot_index: number;
    spool_id: number | null;
    created_at: number;
    updated_at: number;
    // joined from spools
    s_id: number | null;
    preset_id: number | null;
    initial_weight: number | null;
    remaining_weight: number | null;
    // joined from spool_presets
    color: string | null;
    color_hex: string | null;
    brand: string | null;
    material: string | null;
    default_weight: number | null;
    cost: number | null;
  }>(sql`
    SELECT
      pls.printer_id, pls.slot_index, pls.spool_id,
      pls.created_at, pls.updated_at,
      s.id      as s_id,
      s.preset_id, s.initial_weight, s.remaining_weight,
      sp.color, sp.color_hex, sp.brand, sp.material, sp.default_weight, sp.cost
    FROM printer_loaded_spools pls
    LEFT JOIN spools s ON pls.spool_id = s.id
    LEFT JOIN spool_presets sp ON s.preset_id = sp.id
    WHERE pls.printer_id = ${printerId} AND pls.workspace_id = ${ctx.workspaceId}
    ORDER BY pls.slot_index
  `);

  return (rows ?? []).map((row) => ({
    printer_id: row.printer_id,
    slot_index: row.slot_index,
    spool_id: row.spool_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    spool: row.spool_id && row.s_id
      ? {
          id: row.s_id,
          preset_id: row.preset_id,
          initial_weight: row.initial_weight!,
          remaining_weight: row.remaining_weight!,
          created_at: row.created_at,
          updated_at: row.updated_at,
          preset: row.brand
            ? {
                id: row.preset_id!,
                brand: row.brand,
                material: row.material ?? '',
                color: row.color ?? '',
                color_hex: row.color_hex ?? null,
                default_weight: row.default_weight ?? 0,
                cost: row.cost ?? 0,
                in_storage: 0,
                created_at: 0,
                updated_at: 0,
              }
            : null,
        }
      : null,
  }));
}

/**
 * Set (or clear) the spool in a slot. The slot row must already exist —
 * rows are pre-seeded by createPrinter / migration 0004. This is a strict
 * UPDATE so swapping in a new spool automatically displaces the previous one.
 *
 * Auto-unloads the spool from any other slot it currently occupies — a
 * physical spool can only sit in one place at a time.
 */
export async function setLoadedSpool(
  ctx: TenantContext,
  printerId: number,
  slotIndex: number,
  spoolId: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  if (spoolId !== null) {
    await ctx.db.run(sql`
      UPDATE printer_loaded_spools
      SET spool_id = NULL, updated_at = ${now}
      WHERE spool_id = ${spoolId}
        AND workspace_id = ${ctx.workspaceId}
        AND NOT (printer_id = ${printerId} AND slot_index = ${slotIndex})
    `);
  }

  await ctx.db.run(sql`
    UPDATE printer_loaded_spools
    SET spool_id = ${spoolId}, updated_at = ${now}
    WHERE printer_id = ${printerId} AND slot_index = ${slotIndex} AND workspace_id = ${ctx.workspaceId}
  `);
}

/** Clear the spool from a slot (null out spool_id; the slot row stays). */
export async function unloadSpool(ctx: TenantContext, printerId: number, slotIndex = 0): Promise<void> {
  await setLoadedSpool(ctx, printerId, slotIndex, null);
}

/** Load an already-open physical spool into a printer slot without touching in_storage. */
export async function loadExistingSpoolIntoSlot(
  ctx: TenantContext,
  printerId: number,
  slotIndex: number,
  spoolId: number,
): Promise<ServerResponse> {
  try {
    await setLoadedSpool(ctx, printerId, slotIndex, spoolId);
    return { success: true, message: `Spool loaded into slot ${slotIndex}` };
  } catch (error) {
    console.error('Error loading existing spool:', error);
    return { success: false, error: 'Failed to load spool' };
  }
}

// ─── Printer Queue (db-based until Group 6) ──────────────────────────────────

export async function getPrinterQueuedJobs(
  db: D1Database,
  printerId: number,
): Promise<PrinterQueuedJob[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<PrinterQueuedJob>(sql`
    SELECT pqj.*, pm.name as module_name, pm.thumbnail
    FROM printer_queued_jobs pqj
    LEFT JOIN print_modules pm ON pqj.module_id = pm.id
    WHERE pqj.printer_id = ${printerId}
    ORDER BY pqj.sort_order
  `);
  return rows ?? [];
}

export async function addPrinterQueuedJob(
  db: D1Database,
  job: { printerId: number; moduleId: number; reason: string; sortOrder: number },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      INSERT INTO printer_queued_jobs (printer_id, module_id, reason, sort_order, is_completed, created_at, updated_at)
      VALUES (${job.printerId}, ${job.moduleId}, ${job.reason}, ${job.sortOrder}, 0, ${now}, ${now})
    `);
    return { success: true, message: 'Queue item added' };
  } catch (error) {
    console.error('Error adding queue item:', error);
    return { success: false, error: 'Failed to add queue item' };
  }
}

export async function completePrinterQueuedJob(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(
      sql`UPDATE printer_queued_jobs SET is_completed = 1, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`,
    );
    return { success: true, message: 'Queue item completed' };
  } catch (error) {
    console.error('Error completing queue item:', error);
    return { success: false, error: 'Failed to complete queue item' };
  }
}

export async function deletePrinterQueuedJob(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`DELETE FROM printer_queued_jobs WHERE id = ${id}`);
    return { success: true, message: 'Queue item removed' };
  } catch (error) {
    console.error('Error deleting queue item:', error);
    return { success: false, error: 'Failed to remove queue item' };
  }
}
