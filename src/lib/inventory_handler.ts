import type { ObjectItem, InventoryLog, InventoryChangeType, ServerResponse } from './types';
import { sql } from 'drizzle-orm';
import type { TenantContext } from './server/context';

// All queries are scoped to ctx.workspaceId. objects + inventory_log carry
// workspace_id NOT NULL (Phase 3, group 1).

// ─── Getters ──────────────────────────────────────────────────────────────────

export async function getAllObjects(ctx: TenantContext): Promise<ObjectItem[]> {
  const rows = await ctx.db.all<ObjectItem>(
    sql`SELECT * FROM objects WHERE workspace_id = ${ctx.workspaceId} ORDER BY name ASC`,
  );
  return (rows ?? []) as unknown as ObjectItem[];
}

export async function getObjectById(ctx: TenantContext, id: number): Promise<ObjectItem | null> {
  const result = await ctx.db.get<ObjectItem>(
    sql`SELECT * FROM objects WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`,
  );
  return result ?? null;
}

export async function getObjectByName(ctx: TenantContext, name: string): Promise<ObjectItem | null> {
  const result = await ctx.db.get<ObjectItem>(
    sql`SELECT * FROM objects WHERE name = ${name} AND workspace_id = ${ctx.workspaceId}`,
  );
  return result ?? null;
}

export async function setObjectCategory(
  ctx: TenantContext,
  id: number,
  category: string | null,
): Promise<ServerResponse> {
  const clean = category && category.trim() ? category.trim() : null;
  await ctx.db.run(
    sql`UPDATE objects SET category = ${clean}, updated_at = unixepoch() WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`,
  );
  return { success: true, message: clean ? `Categorized as ${clean}` : 'Category cleared' };
}

export async function getLowStockObjects(ctx: TenantContext): Promise<ObjectItem[]> {
  const rows = await ctx.db.all<ObjectItem>(sql`
    SELECT * FROM objects
    WHERE workspace_id = ${ctx.workspaceId} AND in_stock < min_threshold
    ORDER BY (min_threshold - in_stock) DESC
  `);
  return (rows ?? []) as unknown as ObjectItem[];
}

export async function getInventoryLogs(
  ctx: TenantContext,
  objectId: number,
  limit = 50,
): Promise<InventoryLog[]> {
  const rows = await ctx.db.all<InventoryLog>(sql`
    SELECT * FROM inventory_log
    WHERE object_id = ${objectId} AND workspace_id = ${ctx.workspaceId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return (rows ?? []) as unknown as InventoryLog[];
}

export async function getAllRecentLogs(
  ctx: TenantContext,
  limit = 100,
): Promise<(InventoryLog & { object_name: string; order_number: string | null })[]> {
  const rows = await ctx.db.all<InventoryLog & { object_name: string; order_number: string | null }>(sql`
    SELECT il.*, o.name as object_name, so.order_number
    FROM inventory_log il
    JOIN objects o ON il.object_id = o.id
    LEFT JOIN shopify_orders so ON so.order_id = il.shopify_order_id
    WHERE il.workspace_id = ${ctx.workspaceId}
    ORDER BY il.created_at DESC
    LIMIT ${limit}
  `);
  return (rows ?? []) as unknown as (InventoryLog & { object_name: string; order_number: string | null })[];
}

// ─── Create / Update / Delete ─────────────────────────────────────────────────

export async function createObject(
  ctx: TenantContext,
  item: {
    name: string;
    inStock?: number;
    minThreshold?: number;
    category?: string | null;
  },
): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await ctx.db.run(sql`
      INSERT INTO objects (workspace_id, name, in_stock, min_threshold, category, created_at, updated_at)
      VALUES (
        ${ctx.workspaceId},
        ${item.name},
        ${item.inStock ?? 0}, ${item.minThreshold ?? 0},
        ${item.category ?? null}, ${now}, ${now}
      )
    `);
    return {
      success: true,
      message: `Object "${item.name}" created`,
      data: { id: result.meta.last_row_id },
    };
  } catch (error) {
    console.error('Error creating object:', error);
    return { success: false, error: 'Failed to create object (name may already exist)' };
  }
}

export async function updateObject(
  ctx: TenantContext,
  id: number,
  item: {
    name?: string;
    minThreshold?: number;
    category?: string | null;
  },
): Promise<ServerResponse> {
  try {
    const updates: ReturnType<typeof sql>[] = [];
    if (item.name !== undefined) updates.push(sql`name = ${item.name}`);
    if (item.minThreshold !== undefined) updates.push(sql`min_threshold = ${item.minThreshold}`);
    if (item.category !== undefined) updates.push(sql`category = ${item.category}`);
    if (updates.length === 0) return { success: false, error: 'No updates provided' };

    await ctx.db.run(
      sql`UPDATE objects SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`,
    );
    return { success: true, message: 'Object updated' };
  } catch (error) {
    console.error('Error updating object:', error);
    return { success: false, error: 'Failed to update object' };
  }
}

/**
 * Delete an object.
 * Blocked if inventory_log rows exist — the audit trail is the source of truth.
 * Archive instead by changing the category to e.g. "archived".
 */
export async function deleteObject(ctx: TenantContext, id: number): Promise<ServerResponse> {
  try {
    const logCount = await ctx.db.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM inventory_log WHERE object_id = ${id} AND workspace_id = ${ctx.workspaceId}`,
    );
    if ((logCount?.count ?? 0) > 0) {
      return {
        success: false,
        error:
          'Cannot delete: this object has inventory history. ' +
          'Change its category to archive it instead.',
      };
    }

    await ctx.db.run(sql`DELETE FROM shopify_sku_mapping WHERE object_id = ${id}`);
    await ctx.db.run(sql`DELETE FROM objects WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`);

    return { success: true, message: 'Object deleted' };
  } catch (error) {
    console.error('Error deleting object:', error);
    return { success: false, error: 'Failed to delete object' };
  }
}

// ─── Stock Adjustments ────────────────────────────────────────────────────────

export async function addPrintedStock(
  ctx: TenantContext,
  objectId: number,
  quantity: number,
  printJobId?: number | null,
): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db.run(sql`
      UPDATE objects
      SET in_stock = in_stock + ${quantity}, updated_at = ${now}
      WHERE id = ${objectId} AND workspace_id = ${ctx.workspaceId}
    `);
    await logInventoryChange(ctx, objectId, '+ printed', quantity, printJobId ?? null);
    return { success: true, message: `Added ${quantity} to stock (printed)` };
  } catch (error) {
    console.error('Error adding printed stock:', error);
    return { success: false, error: 'Failed to add stock' };
  }
}

export async function addStock(ctx: TenantContext, objectId: number, quantity: number): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db.run(sql`
      UPDATE objects SET in_stock = in_stock + ${quantity}, updated_at = ${now} WHERE id = ${objectId} AND workspace_id = ${ctx.workspaceId}
    `);
    await logInventoryChange(ctx, objectId, '+ stock count', quantity);
    return { success: true, message: `Added ${quantity} to stock` };
  } catch (error) {
    console.error('Error adding stock:', error);
    return { success: false, error: 'Failed to add stock' };
  }
}

export async function removeStock(ctx: TenantContext, objectId: number, quantity: number): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db.run(sql`
      UPDATE objects
      SET in_stock = MAX(0, in_stock - ${quantity}), updated_at = ${now}
      WHERE id = ${objectId} AND workspace_id = ${ctx.workspaceId}
    `);
    await logInventoryChange(ctx, objectId, '- stock count', quantity);
    return { success: true, message: `Removed ${quantity} from stock` };
  } catch (error) {
    console.error('Error removing stock:', error);
    return { success: false, error: 'Failed to remove stock' };
  }
}

export async function recordSaleB2C(ctx: TenantContext, objectId: number, quantity: number): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    // No clamp: stock may go negative to reflect oversells.
    await ctx.db.run(sql`
      UPDATE objects
      SET in_stock = in_stock - ${quantity}, updated_at = ${now}
      WHERE id = ${objectId} AND workspace_id = ${ctx.workspaceId}
    `);
    await logInventoryChange(ctx, objectId, '- sold b2c', quantity);
    return { success: true, message: `Recorded ${quantity} B2C sale(s)` };
  } catch (error) {
    console.error('Error recording B2C sale:', error);
    return { success: false, error: 'Failed to record sale' };
  }
}

export async function recordSaleB2B(ctx: TenantContext, objectId: number, quantity: number): Promise<ServerResponse> {
  try {
    const now = Math.floor(Date.now() / 1000);
    // No clamp: stock may go negative to reflect oversells.
    await ctx.db.run(sql`
      UPDATE objects
      SET in_stock = in_stock - ${quantity}, updated_at = ${now}
      WHERE id = ${objectId} AND workspace_id = ${ctx.workspaceId}
    `);
    await logInventoryChange(ctx, objectId, '- sold b2b', quantity);
    return { success: true, message: `Recorded ${quantity} B2B sale(s)` };
  } catch (error) {
    console.error('Error recording B2B sale:', error);
    return { success: false, error: 'Failed to record sale' };
  }
}

export async function performManualCount(
  ctx: TenantContext,
  objectId: number,
  actualCount: number,
): Promise<ServerResponse> {
  try {
    const object = await getObjectById(ctx, objectId);
    if (!object) return { success: false, error: 'Object not found' };

    const expected = object.in_stock;
    const discrepancy = actualCount - expected;
    const now = Math.floor(Date.now() / 1000);

    await ctx.db.run(sql`
      UPDATE objects
      SET in_stock             = ${actualCount},
          last_count_date      = ${now},
          last_count_discrepancy = ${discrepancy},
          updated_at           = ${now}
      WHERE id = ${objectId} AND workspace_id = ${ctx.workspaceId}
    `);

    const changeType: InventoryChangeType = discrepancy >= 0 ? '+ stock count' : '- stock count';
    await logInventoryChange(ctx, objectId, changeType, Math.abs(discrepancy));

    return {
      success: true,
      message: `Count adjusted from ${expected} → ${actualCount} (${discrepancy >= 0 ? '+' : ''}${discrepancy})`,
      data: { discrepancy, expected, actual: actualCount },
    };
  } catch (error) {
    console.error('Error performing manual count:', error);
    return { success: false, error: 'Failed to perform manual count' };
  }
}

// ─── Internal log writer ──────────────────────────────────────────────────────

async function logInventoryChange(
  ctx: TenantContext,
  objectId: number,
  changeType: InventoryChangeType,
  quantity: number,
  printJobId: number | null = null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await ctx.db.run(sql`
    INSERT INTO inventory_log (workspace_id, object_id, change_type, quantity, print_job_id, created_at)
    VALUES (${ctx.workspaceId}, ${objectId}, ${changeType}, ${Math.abs(quantity)}, ${printJobId}, ${now})
  `);
}
