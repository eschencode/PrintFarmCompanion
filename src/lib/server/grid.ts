import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import type { GridPreset, NewGridPreset, ServerResponse } from '../types';

export async function getAllGridPresets(db: D1Database): Promise<GridPreset[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<GridPreset>(
    sql`SELECT * FROM grid_presets ORDER BY is_default DESC, created_at DESC`,
  );
  return (rows ?? []) as unknown as GridPreset[];
}

export async function getDefaultGridPreset(db: D1Database): Promise<GridPreset | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<GridPreset>(
    sql`SELECT * FROM grid_presets WHERE is_default = 1 LIMIT 1`,
  );
  return (row ?? null) as unknown as GridPreset | null;
}

export async function getGridPresetById(db: D1Database, id: number): Promise<GridPreset | null> {
  const drizzleDb = getDb(db);
  const row = await drizzleDb.get<GridPreset>(
    sql`SELECT * FROM grid_presets WHERE id = ${id}`,
  );
  return (row ?? null) as unknown as GridPreset | null;
}

export async function createGridPreset(db: D1Database, preset: NewGridPreset): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const gridConfigJson = JSON.stringify(preset.grid_config ?? []);
    const now = Math.floor(Date.now() / 1000);

    if (preset.is_default) {
      await drizzleDb.run(sql`UPDATE grid_presets SET is_default = 0`);
    }

    const result = await drizzleDb.run(sql`
      INSERT INTO grid_presets (name, is_default, rows, cols, grid_config, created_at, updated_at)
      VALUES (${preset.name}, ${preset.is_default ? 1 : 0}, ${preset.rows}, ${preset.cols}, ${gridConfigJson}, ${now}, ${now})
    `);

    return { success: true, message: 'Grid preset created', data: { id: result.meta.last_row_id } };
  } catch (error) {
    console.error('Error creating grid preset:', error);
    return { success: false, error: 'Failed to create grid preset' };
  }
}

export async function updateGridPreset(
  db: D1Database,
  id: number,
  preset: Partial<NewGridPreset>,
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    if (preset.is_default) {
      await drizzleDb.run(sql`UPDATE grid_presets SET is_default = 0`);
    }

    const updates: ReturnType<typeof sql>[] = [];
    if (preset.name !== undefined) updates.push(sql`name = ${preset.name}`);
    if (preset.is_default !== undefined) updates.push(sql`is_default = ${preset.is_default ? 1 : 0}`);
    if (preset.rows !== undefined) updates.push(sql`rows = ${preset.rows}`);
    if (preset.cols !== undefined) updates.push(sql`cols = ${preset.cols}`);
    if (preset.grid_config !== undefined) updates.push(sql`grid_config = ${JSON.stringify(preset.grid_config)}`);
    if (updates.length === 0) return { success: false, error: 'No updates provided' };

    await drizzleDb.run(
      sql`UPDATE grid_presets SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`,
    );
    return { success: true, message: 'Grid preset updated' };
  } catch (error) {
    console.error('Error updating grid preset:', error);
    return { success: false, error: 'Failed to update grid preset' };
  }
}

export async function setDefaultGridPreset(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    await drizzleDb.run(sql`UPDATE grid_presets SET is_default = 0`);
    await drizzleDb.run(
      sql`UPDATE grid_presets SET is_default = 1, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`,
    );
    return { success: true, message: 'Default grid preset updated' };
  } catch (error) {
    console.error('Error setting default grid preset:', error);
    return { success: false, error: 'Failed to set default grid preset' };
  }
}

export async function deleteGridPreset(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const preset = await getGridPresetById(db, id);
    if (!preset) return { success: false, error: 'Grid preset not found' };

    const all = await getAllGridPresets(db);
    if (preset.is_default && all.length > 1) {
      return { success: false, error: 'Cannot delete the default preset. Set another as default first.' };
    }

    await drizzleDb.run(sql`DELETE FROM grid_presets WHERE id = ${id}`);
    return { success: true, message: 'Grid preset deleted' };
  } catch (error) {
    console.error('Error deleting grid preset:', error);
    return { success: false, error: 'Failed to delete grid preset' };
  }
}
