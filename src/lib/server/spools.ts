import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import type { Spool, SpoolPreset, SpoolWithPreset, LoadSpoolResponse, ServerResponse } from '../types';
import { setLoadedSpool } from './printers';

// ─── Spool Presets ────────────────────────────────────────────────────────────

export async function getAllSpoolPresets(db: D1Database): Promise<SpoolPreset[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<SpoolPreset>(
    sql`SELECT * FROM spool_presets ORDER BY brand, color`,
  );
  return rows ?? [];
}

export async function getSpoolPresetById(db: D1Database, id: number): Promise<SpoolPreset | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<SpoolPreset>(
    sql`SELECT * FROM spool_presets WHERE id = ${id}`,
  );
  return row ?? null;
}

export async function createSpoolPreset(
  db: D1Database,
  preset: {
    color: string;
    colorHex?: string | null;
    brand: string;
    material: string;
    defaultWeight: number;
    cost?: number;
    inStorage?: number;
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const result = await drizzleDb.run(sql`
      INSERT INTO spool_presets (color, color_hex, brand, material, default_weight, cost, in_storage, created_at, updated_at)
      VALUES (
        ${preset.color}, ${preset.colorHex ?? null}, ${preset.brand}, ${preset.material},
        ${preset.defaultWeight}, ${preset.cost ?? 0}, ${preset.inStorage ?? 0},
        ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)}
      )
    `);
    return { success: true, message: 'Spool preset created', data: { id: result.meta.last_row_id } };
  } catch (error) {
    console.error('Error creating spool preset:', error);
    return { success: false, error: 'Failed to create spool preset' };
  }
}

export async function updateSpoolPreset(
  db: D1Database,
  id: number,
  preset: {
    color?: string;
    colorHex?: string | null;
    brand?: string;
    material?: string;
    defaultWeight?: number;
    cost?: number | null;
    inStorage?: number;
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const updates: ReturnType<typeof sql>[] = [];
    if (preset.color !== undefined) updates.push(sql`color = ${preset.color}`);
    if (preset.colorHex !== undefined) updates.push(sql`color_hex = ${preset.colorHex}`);
    if (preset.brand !== undefined) updates.push(sql`brand = ${preset.brand}`);
    if (preset.material !== undefined) updates.push(sql`material = ${preset.material}`);
    if (preset.defaultWeight !== undefined) updates.push(sql`default_weight = ${preset.defaultWeight}`);
    if (preset.cost !== undefined) updates.push(sql`cost = ${preset.cost}`);
    if (preset.inStorage !== undefined) updates.push(sql`in_storage = ${preset.inStorage}`);
    if (updates.length === 0) return { success: false, error: 'No updates provided' };
    await drizzleDb.run(
      sql`UPDATE spool_presets SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`,
    );
    return { success: true, message: 'Spool preset updated' };
  } catch (error) {
    console.error('Error updating spool preset:', error);
    return { success: false, error: 'Failed to update spool preset' };
  }
}

export async function deleteSpoolPreset(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    // module_filament_slots has restrict on spool_preset_id — give friendly message
    const slotCount = await drizzleDb.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM module_filament_slots WHERE spool_preset_id = ${id}`,
    );
    if ((slotCount?.count ?? 0) > 0) {
      return { success: false, error: 'Cannot delete: preset is used by one or more print modules' };
    }
    await drizzleDb.run(sql`DELETE FROM spool_presets WHERE id = ${id}`);
    return { success: true, message: 'Spool preset deleted' };
  } catch (error) {
    console.error('Error deleting spool preset:', error);
    return { success: false, error: 'Failed to delete spool preset' };
  }
}

/** Adjust storage count by delta (positive = add, negative = remove). */
export async function updateStorageCount(
  db: D1Database,
  presetId: number,
  delta: number,
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`
      UPDATE spool_presets
      SET in_storage = MAX(0, in_storage + ${delta}),
          updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${presetId}
    `);
    return { success: true, message: 'Storage count updated' };
  } catch (error) {
    console.error('Error updating storage count:', error);
    return { success: false, error: 'Failed to update storage count' };
  }
}

/** Set an absolute storage count for a preset. */
export async function setStorageCount(
  db: D1Database,
  presetId: number,
  count: number,
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`
      UPDATE spool_presets
      SET in_storage = ${Math.max(0, count)},
          updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${presetId}
    `);
    return { success: true, message: 'Storage count set' };
  } catch (error) {
    console.error('Error setting storage count:', error);
    return { success: false, error: 'Failed to set storage count' };
  }
}

export interface SpoolUsageStat {
  preset_id: number;
  used_7d: number;
  used_30d: number;
}

/**
 * Count how many spools were opened (broken out of storage into a `spools` row)
 * per preset over recent windows. Each `spools` row = one unit pulled from
 * storage, so this is the consumption signal for usage/depletion prediction.
 */
export async function getSpoolUsageStats(db: D1Database): Promise<SpoolUsageStat[]> {
  const drizzleDb = getDb(db);
  const now = Math.floor(Date.now() / 1000);
  const d7 = now - 7 * 86400;
  const d30 = now - 30 * 86400;
  const rows = await drizzleDb.all<SpoolUsageStat>(sql`
    SELECT
      preset_id,
      SUM(CASE WHEN created_at >= ${d7} THEN 1 ELSE 0 END)  AS used_7d,
      SUM(CASE WHEN created_at >= ${d30} THEN 1 ELSE 0 END) AS used_30d
    FROM spools
    WHERE preset_id IS NOT NULL
    GROUP BY preset_id
  `);
  return rows ?? [];
}

// ─── Spools ───────────────────────────────────────────────────────────────────

export async function getAllSpools(db: D1Database): Promise<SpoolWithPreset[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<{
    id: number;
    preset_id: number | null;
    initial_weight: number;
    remaining_weight: number;
    created_at: number;
    updated_at: number;
    color: string | null;
    color_hex: string | null;
    brand: string | null;
    material: string | null;
    default_weight: number | null;
    cost: number | null;
    sp_in_storage: number | null;
    sp_created_at: number | null;
    sp_updated_at: number | null;
  }>(sql`
    SELECT
      s.id, s.preset_id, s.initial_weight, s.remaining_weight,
      s.created_at, s.updated_at,
      sp.color, sp.color_hex, sp.brand, sp.material, sp.default_weight, sp.cost,
      sp.in_storage    as sp_in_storage,
      sp.created_at    as sp_created_at,
      sp.updated_at    as sp_updated_at
    FROM spools s
    LEFT JOIN spool_presets sp ON s.preset_id = sp.id
    ORDER BY s.created_at DESC
  `);

  return (rows ?? []).map((r) => ({
    id: r.id,
    preset_id: r.preset_id,
    initial_weight: r.initial_weight,
    remaining_weight: r.remaining_weight,
    created_at: r.created_at,
    updated_at: r.updated_at,
    preset: r.preset_id && r.brand
      ? {
          id: r.preset_id,
          brand: r.brand,
          material: r.material ?? '',
          color: r.color ?? '',
          color_hex: r.color_hex ?? null,
          default_weight: r.default_weight ?? 0,
          cost: r.cost ?? 0,
          in_storage: r.sp_in_storage ?? 0,
          created_at: r.sp_created_at ?? 0,
          updated_at: r.sp_updated_at ?? 0,
        }
      : null,
  }));
}

export async function getSpoolById(db: D1Database, id: number): Promise<Spool | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<Spool>(sql`SELECT * FROM spools WHERE id = ${id}`);
  return row ?? null;
}

export async function createSpool(
  db: D1Database,
  spool: {
    presetId?: number | null;
    initialWeight: number;
    remainingWeight: number;
  },
): Promise<{ id: number }> {
  const drizzleDb = getDb(db);
  const now = Math.floor(Date.now() / 1000);
  const result = await drizzleDb.run(sql`
    INSERT INTO spools (preset_id, initial_weight, remaining_weight, created_at, updated_at)
    VALUES (${spool.presetId ?? null}, ${spool.initialWeight}, ${spool.remainingWeight}, ${now}, ${now})
  `);
  return { id: result.meta.last_row_id as number };
}

export async function updateSpoolWeight(
  db: D1Database,
  id: number | null,
  remainingWeight: number,
): Promise<void> {
  if (!id) return;
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`
    UPDATE spools
    SET remaining_weight = ${remainingWeight}, updated_at = ${Math.floor(Date.now() / 1000)}
    WHERE id = ${id}
  `);
}

/**
 * Open a spool from storage: decrement in_storage on the preset, create a
 * spools row with initial_weight defaulted from preset.default_weight.
 * Then load it into the specified slot on the printer.
 */
export async function loadSpool(
  db: D1Database,
  params: {
    printerId: number;
    presetId: number;
    /** Override if the actual spool weight differs from the preset default. */
    initialWeight?: number;
    slotIndex?: number;
  },
): Promise<LoadSpoolResponse> {
  const { printerId, presetId, slotIndex = 0 } = params;

  const preset = await getSpoolPresetById(db, presetId);
  if (!preset) return { success: false, error: 'Spool preset not found' };

  const initialWeight = params.initialWeight ?? preset.default_weight;

  // Create the physical spool row
  const { id: spoolId } = await createSpool(db, {
    presetId,
    initialWeight,
    remainingWeight: initialWeight,
  });

  // Decrement in_storage (was already in storage, now opened)
  await updateStorageCount(db, presetId, -1);

  // Slot the spool into the printer
  await setLoadedSpool(db, printerId, slotIndex, spoolId);

  return {
    success: true,
    spoolId,
    printerId,
    message: `Loaded ${preset.brand} ${preset.color} (${initialWeight}g) into printer slot ${slotIndex}`,
  };
}
