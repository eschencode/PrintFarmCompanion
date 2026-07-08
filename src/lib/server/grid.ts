import { sql } from 'drizzle-orm';
import type { GridPreset, NewGridPreset, ServerResponse } from '../types';
import type { TenantContext } from './context';

// grid_presets carries workspace_id NOT NULL (Phase 3, group 8). Every query is
// scoped to ctx.workspaceId — including the "unset all defaults" writes.

export async function getAllGridPresets(ctx: TenantContext): Promise<GridPreset[]> {
  const rows = await ctx.db.all<GridPreset>(
    sql`SELECT * FROM grid_presets WHERE workspace_id = ${ctx.workspaceId} ORDER BY is_default DESC, created_at DESC`,
  );
  return (rows ?? []) as unknown as GridPreset[];
}

export async function getDefaultGridPreset(ctx: TenantContext): Promise<GridPreset | null> {
  const row = await ctx.db.get<GridPreset>(
    sql`SELECT * FROM grid_presets WHERE is_default = 1 AND workspace_id = ${ctx.workspaceId} LIMIT 1`,
  );
  return (row ?? null) as unknown as GridPreset | null;
}

export async function getGridPresetById(ctx: TenantContext, id: number): Promise<GridPreset | null> {
  const row = await ctx.db.get<GridPreset>(
    sql`SELECT * FROM grid_presets WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`,
  );
  return (row ?? null) as unknown as GridPreset | null;
}

export async function createGridPreset(ctx: TenantContext, preset: NewGridPreset): Promise<ServerResponse> {
  try {
    const gridConfigJson = JSON.stringify(preset.grid_config ?? []);
    const now = Math.floor(Date.now() / 1000);

    if (preset.is_default) {
      await ctx.db.run(sql`UPDATE grid_presets SET is_default = 0 WHERE workspace_id = ${ctx.workspaceId}`);
    }

    const result = await ctx.db.run(sql`
      INSERT INTO grid_presets (workspace_id, name, is_default, rows, cols, grid_config, created_at, updated_at)
      VALUES (${ctx.workspaceId}, ${preset.name}, ${preset.is_default ? 1 : 0}, ${preset.rows}, ${preset.cols}, ${gridConfigJson}, ${now}, ${now})
    `);

    return { success: true, message: 'Grid preset created', data: { id: result.meta.last_row_id } };
  } catch (error) {
    console.error('Error creating grid preset:', error);
    return { success: false, error: 'Failed to create grid preset' };
  }
}

export async function updateGridPreset(
  ctx: TenantContext,
  id: number,
  preset: Partial<NewGridPreset>,
): Promise<ServerResponse> {
  try {
    if (preset.is_default) {
      await ctx.db.run(sql`UPDATE grid_presets SET is_default = 0 WHERE workspace_id = ${ctx.workspaceId}`);
    }

    const updates: ReturnType<typeof sql>[] = [];
    if (preset.name !== undefined) updates.push(sql`name = ${preset.name}`);
    if (preset.is_default !== undefined) updates.push(sql`is_default = ${preset.is_default ? 1 : 0}`);
    if (preset.rows !== undefined) updates.push(sql`rows = ${preset.rows}`);
    if (preset.cols !== undefined) updates.push(sql`cols = ${preset.cols}`);
    if (preset.grid_config !== undefined) updates.push(sql`grid_config = ${JSON.stringify(preset.grid_config)}`);
    if (updates.length === 0) return { success: false, error: 'No updates provided' };

    await ctx.db.run(
      sql`UPDATE grid_presets SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`,
    );
    return { success: true, message: 'Grid preset updated' };
  } catch (error) {
    console.error('Error updating grid preset:', error);
    return { success: false, error: 'Failed to update grid preset' };
  }
}

export async function setDefaultGridPreset(ctx: TenantContext, id: number): Promise<ServerResponse> {
  try {
    await ctx.db.run(sql`UPDATE grid_presets SET is_default = 0 WHERE workspace_id = ${ctx.workspaceId}`);
    await ctx.db.run(
      sql`UPDATE grid_presets SET is_default = 1, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`,
    );
    return { success: true, message: 'Default grid preset updated' };
  } catch (error) {
    console.error('Error setting default grid preset:', error);
    return { success: false, error: 'Failed to set default grid preset' };
  }
}

export async function deleteGridPreset(ctx: TenantContext, id: number): Promise<ServerResponse> {
  try {
    const preset = await getGridPresetById(ctx, id);
    if (!preset) return { success: false, error: 'Grid preset not found' };

    const all = await getAllGridPresets(ctx);
    if (preset.is_default && all.length > 1) {
      return { success: false, error: 'Cannot delete the default preset. Set another as default first.' };
    }

    await ctx.db.run(sql`DELETE FROM grid_presets WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`);
    return { success: true, message: 'Grid preset deleted' };
  } catch (error) {
    console.error('Error deleting grid preset:', error);
    return { success: false, error: 'Failed to delete grid preset' };
  }
}
