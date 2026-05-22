import type { D1Database } from '@cloudflare/workers-types';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  printerPresets,
  printers,
  printerSecrets,
  printerLoadedSpools,
  printerQueuedJobs,
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

// ─── Printer Presets (catalog) ───────────────────────────────────────────────

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

export async function getAllPrinters(db: D1Database): Promise<Printer[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<Printer>(sql`
    SELECT
      p.id, p.name, p.printer_preset_id, p.loaded_plate_id,
      p.loaded_nozzle_diameter, p.slot_count, p.active, p.created_at, p.updated_at
    FROM printers p
    ORDER BY p.name
  `);
  return rows ?? [];
}

export async function getPrinterById(db: D1Database, id: number): Promise<Printer | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<Printer>(sql`
    SELECT
      p.id, p.name, p.printer_preset_id, p.loaded_plate_id,
      p.loaded_nozzle_diameter, p.slot_count, p.active, p.created_at, p.updated_at
    FROM printers p
    WHERE p.id = ${id}
  `);
  return row ?? null;
}

/** Full printer with preset, secrets, and loaded spools — for dashboard. */
export async function getPrinterFull(db: D1Database, id: number): Promise<PrinterFull | null> {
  const drizzleDb = getDb(db);

  const printer = await getPrinterById(db, id);
  if (!printer) return null;

  const preset = await getPrinterPresetById(db, printer.printer_preset_id);
  const secrets = await getPrinterSecrets(db, id);
  const loadedSpools = await getLoadedSpools(db, id);

  return { ...printer, preset: preset ?? null, secrets: secrets ?? null, loaded_spools: loadedSpools as PrinterFull['loaded_spools'] };
}

export async function getAllPrintersFull(db: D1Database): Promise<PrinterFull[]> {
  const printerList = await getAllPrinters(db);
  return Promise.all(printerList.map((p) => getPrinterFull(db, p.id) as Promise<PrinterFull>));
}

export async function createPrinter(
  db: D1Database,
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
  const drizzleDb = getDb(db);
  const slotCount = Math.max(1, printer.slotCount ?? 1);
  try {
    const result = await drizzleDb.insert(printers).values({
      name: printer.name,
      printerPresetId: printer.printerPresetId,
      loadedNozzleDiameter: printer.loadedNozzleDiameter ?? null,
      slotCount,
      active: true,
    });
    const printerId = result.meta.last_row_id as number;

    if (secrets) {
      await upsertPrinterSecrets(db, printerId, secrets);
    }

    // Seed one empty slot row per slot so the printer is immediately addressable.
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < slotCount; i++) {
      await drizzleDb.run(sql`
        INSERT OR IGNORE INTO printer_loaded_spools (printer_id, slot_index, spool_id, created_at, updated_at)
        VALUES (${printerId}, ${i}, NULL, ${now}, ${now})
      `);
    }

    return { success: true, message: 'Printer created', data: { id: printerId } };
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
    printerPresetId?: number;
    loadedPlateId?: number | null;
    loadedNozzleDiameter?: number | null;
    active?: boolean;
    slotCount?: number;
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // Reconcile slot rows before updating the printer row.
    if (printer.slotCount !== undefined) {
      const current = await getPrinterById(db, id);
      if (current) {
        const oldCount = current.slot_count ?? 1;
        const newCount = Math.max(1, printer.slotCount);
        const now = Math.floor(Date.now() / 1000);

        if (newCount > oldCount) {
          for (let i = oldCount; i < newCount; i++) {
            await drizzleDb.run(sql`
              INSERT OR IGNORE INTO printer_loaded_spools (printer_id, slot_index, spool_id, created_at, updated_at)
              VALUES (${id}, ${i}, NULL, ${now}, ${now})
            `);
          }
        } else if (newCount < oldCount) {
          const occupied = await drizzleDb.get<{ count: number }>(
            sql`SELECT COUNT(*) as count FROM printer_loaded_spools
                WHERE printer_id = ${id} AND slot_index >= ${newCount} AND spool_id IS NOT NULL`,
          );
          if ((occupied?.count ?? 0) > 0) {
            return {
              success: false,
              error: `Cannot reduce to ${newCount} slot(s): unload spools from slots ${newCount + 1}–${oldCount} first`,
            };
          }
          await drizzleDb.run(
            sql`DELETE FROM printer_loaded_spools WHERE printer_id = ${id} AND slot_index >= ${newCount}`,
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
    await drizzleDb.run(
      sql`UPDATE printers SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`,
    );
    return { success: true, message: 'Printer updated' };
  } catch (error) {
    console.error('Error updating printer:', error);
    return { success: false, error: 'Failed to update printer' };
  }
}

export async function deletePrinter(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const activeJob = await drizzleDb.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM print_jobs WHERE printer_id = ${id} AND status = 'printing'`,
    );
    if ((activeJob?.count ?? 0) > 0) {
      return { success: false, error: 'Cannot delete printer with an active print job' };
    }
    // Cascade handles printer_secrets, printer_loaded_spools, printer_queued_jobs
    await drizzleDb.run(sql`DELETE FROM printers WHERE id = ${id}`);
    return { success: true, message: 'Printer deleted' };
  } catch (error) {
    console.error('Error deleting printer:', error);
    return { success: false, error: 'Failed to delete printer' };
  }
}

/** Decommission / recommission a printer. Sets active flag. */
export async function setPrinterActive(db: D1Database, id: number, active: boolean): Promise<ServerResponse> {
  return updatePrinter(db, id, { active });
}

/** Update the transport mode stored in printer_secrets. */
export async function updatePrinterTransport(
  db: D1Database,
  printerId: number,
  transport: import('../types').TransportMode,
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      INSERT INTO printer_secrets (printer_id, transport, created_at, updated_at)
      VALUES (${printerId}, ${transport}, ${now}, ${now})
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

export async function getPrinterSecrets(db: D1Database, printerId: number): Promise<PrinterSecrets | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<PrinterSecrets>(
    sql`SELECT * FROM printer_secrets WHERE printer_id = ${printerId}`,
  );
  return row ?? null;
}

export async function upsertPrinterSecrets(
  db: D1Database,
  printerId: number,
  secrets: { printerIp?: string | null; serial?: string | null; accessCode?: string | null },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      INSERT INTO printer_secrets (printer_id, printer_ip, serial, access_code, created_at, updated_at)
      VALUES (${printerId}, ${secrets.printerIp ?? null}, ${secrets.serial ?? null}, ${secrets.accessCode ?? null}, ${now}, ${now})
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
  db: D1Database,
  printerId: number,
): Promise<(PrinterLoadedSpool & { spool: SpoolWithPreset | null })[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<{
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
      sp.color, sp.brand, sp.material, sp.default_weight, sp.cost
    FROM printer_loaded_spools pls
    LEFT JOIN spools s ON pls.spool_id = s.id
    LEFT JOIN spool_presets sp ON s.preset_id = sp.id
    WHERE pls.printer_id = ${printerId}
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
 */
export async function setLoadedSpool(
  db: D1Database,
  printerId: number,
  slotIndex: number,
  spoolId: number | null,
): Promise<void> {
  const drizzleDb = getDb(db);
  const now = Math.floor(Date.now() / 1000);
  await drizzleDb.run(sql`
    UPDATE printer_loaded_spools
    SET spool_id = ${spoolId}, updated_at = ${now}
    WHERE printer_id = ${printerId} AND slot_index = ${slotIndex}
  `);
}

/** Clear the spool from a slot (null out spool_id; the slot row stays). */
export async function unloadSpool(db: D1Database, printerId: number, slotIndex = 0): Promise<void> {
  await setLoadedSpool(db, printerId, slotIndex, null);
}

/** Load an already-open physical spool into a printer slot without touching in_storage. */
export async function loadExistingSpoolIntoSlot(
  db: D1Database,
  printerId: number,
  slotIndex: number,
  spoolId: number,
): Promise<ServerResponse> {
  try {
    await setLoadedSpool(db, printerId, slotIndex, spoolId);
    return { success: true, message: `Spool loaded into slot ${slotIndex}` };
  } catch (error) {
    console.error('Error loading existing spool:', error);
    return { success: false, error: 'Failed to load spool' };
  }
}

// ─── Printer Queue ────────────────────────────────────────────────────────────

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
