import type { D1Database } from '@cloudflare/workers-types';
import type { ObjectItem, InventoryLog, InventoryChangeType, ServerResponse } from './types';
import { sql } from 'drizzle-orm';
import { getDb } from './db';

// ─── Getters ──────────────────────────────────────────────────────────────────

export async function getAllObjects(db: D1Database): Promise<ObjectItem[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<ObjectItem>(sql`SELECT * FROM objects ORDER BY name ASC`);
  return (rows ?? []) as unknown as ObjectItem[];
}

export async function getObjectById(db: D1Database, id: number): Promise<ObjectItem | null> {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.get<ObjectItem>(sql`SELECT * FROM objects WHERE id = ${id}`);
  return result ?? null;
}

export async function getObjectBySku(db: D1Database, sku: string): Promise<ObjectItem | null> {
  const drizzleDb = getDb(db);
  const result = await drizzleDb.get<ObjectItem>(sql`SELECT * FROM objects WHERE sku = ${sku}`);
  return result ?? null;
}

export async function getLowStockObjects(db: D1Database): Promise<ObjectItem[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<ObjectItem>(sql`
    SELECT * FROM objects
    WHERE in_stock < min_threshold
    ORDER BY (min_threshold - in_stock) DESC
  `);
  return (rows ?? []) as unknown as ObjectItem[];
}

export async function getInventoryLogs(
  db: D1Database,
  objectId: number,
  limit = 50,
): Promise<InventoryLog[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<InventoryLog>(sql`
    SELECT * FROM inventory_log
    WHERE object_id = ${objectId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return (rows ?? []) as unknown as InventoryLog[];
}

export async function getAllRecentLogs(
  db: D1Database,
  limit = 100,
): Promise<(InventoryLog & { object_name: string; object_sku: string })[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<InventoryLog & { object_name: string; object_sku: string }>(sql`
    SELECT il.*, o.name as object_name, o.sku as object_sku
    FROM inventory_log il
    JOIN objects o ON il.object_id = o.id
    ORDER BY il.created_at DESC
    LIMIT ${limit}
  `);
  return (rows ?? []) as unknown as (InventoryLog & { object_name: string; object_sku: string })[];
}

// ─── Create / Update / Delete ─────────────────────────────────────────────────

export async function createObject(
  db: D1Database,
  item: {
    name: string;
    sku: string; // required — stable human-readable identifier
    inStock?: number;
    minThreshold?: number;
    category?: string | null;
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await drizzleDb.run(sql`
      INSERT INTO objects (name, sku, in_stock, min_threshold, category, created_at, updated_at)
      VALUES (
        ${item.name}, ${item.sku},
        ${item.inStock ?? 0}, ${item.minThreshold ?? 0},
        ${item.category ?? null}, ${now}, ${now}
      )
    `);
    return {
      success: true,
      message: `Object "${item.name}" created`,
      data: { id: result.meta.last_row_id, sku: item.sku },
    };
  } catch (error) {
    console.error('Error creating object:', error);
    return { success: false, error: 'Failed to create object' };
  }
}

export async function updateObject(
  db: D1Database,
  id: number,
  item: {
    name?: string;
    sku?: string;
    minThreshold?: number;
    category?: string | null;
  },
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const updates: ReturnType<typeof sql>[] = [];
    if (item.name !== undefined) updates.push(sql`name = ${item.name}`);
    if (item.sku !== undefined) updates.push(sql`sku = ${item.sku}`);
    if (item.minThreshold !== undefined) updates.push(sql`min_threshold = ${item.minThreshold}`);
    if (item.category !== undefined) updates.push(sql`category = ${item.category}`);
    if (updates.length === 0) return { success: false, error: 'No updates provided' };

    await drizzleDb.run(
      sql`UPDATE objects SET ${sql.join(updates, sql`, `)}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE id = ${id}`,
    );
    return { success: true, message: 'Object updated' };
  } catch (error) {
    console.error('Error updating object:', error);
    return { success: false, error: 'Failed to update object' };
  }
}

/**
 * Delete an object.
 * Blocked by design if inventory_log rows exist (onDelete: restrict on the FK).
 * The audit history is the source of truth — deleting a product with history
 * would make past sales and print records unresolvable.
 * If the object has history, archive it instead (set a "hidden" category or similar).
 */
export async function deleteObject(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const logCount = await drizzleDb.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM inventory_log WHERE object_id = ${id}`,
    );
    if ((logCount?.count ?? 0) > 0) {
      return {
        success: false,
        error:
          'Cannot delete: this object has inventory history. ' +
          'Change its category to archive it instead.',
      };
    }

    // Also check Shopify mappings — cascade handles the delete but warn first
    await drizzleDb.run(sql`DELETE FROM shopify_sku_mapping WHERE object_id = ${id}`);
    await drizzleDb.run(sql`DELETE FROM objects WHERE id = ${id}`);

    return { success: true, message: 'Object deleted' };
  } catch (error) {
    console.error('Error deleting object:', error);
    return { success: false, error: 'Failed to delete object' };
  }
}

// ─── Stock Adjustments ────────────────────────────────────────────────────────

/**
 * Add stock after printing. Uses change_type '+ printed'.
 * printJobId links the log entry back to the job that produced the stock.
 * (For print-completion, prefer calling this from jobs.ts which already has jobId.)
 */
export async function addPrintedStock(
  db: D1Database,
  objectId: number,
  quantity: number,
  printJobId?: number | null,
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      UPDATE objects
      SET in_stock = in_stock + ${quantity}, updated_at = ${now}
      WHERE id = ${objectId}
    `);
    await logInventoryChange(db, objectId, '+ printed', quantity, printJobId ?? null);
    return { success: true, message: `Added ${quantity} to stock (printed)` };
  } catch (error) {
    console.error('Error adding printed stock:', error);
    return { success: false, error: 'Failed to add stock' };
  }
}

/** Manually add stock (e.g. transferring from another location). */
export async function addStock(db: D1Database, objectId: number, quantity: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      UPDATE objects SET in_stock = in_stock + ${quantity}, updated_at = ${now} WHERE id = ${objectId}
    `);
    await logInventoryChange(db, objectId, '+ stock count', quantity);
    return { success: true, message: `Added ${quantity} to stock` };
  } catch (error) {
    console.error('Error adding stock:', error);
    return { success: false, error: 'Failed to add stock' };
  }
}

/** Manually remove stock (damage, loss, etc.). */
export async function removeStock(db: D1Database, objectId: number, quantity: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      UPDATE objects
      SET in_stock = MAX(0, in_stock - ${quantity}), updated_at = ${now}
      WHERE id = ${objectId}
    `);
    await logInventoryChange(db, objectId, '- stock count', quantity);
    return { success: true, message: `Removed ${quantity} from stock` };
  } catch (error) {
    console.error('Error removing stock:', error);
    return { success: false, error: 'Failed to remove stock' };
  }
}

export async function recordSaleB2C(db: D1Database, objectId: number, quantity: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      UPDATE objects
      SET in_stock = MAX(0, in_stock - ${quantity}), updated_at = ${now}
      WHERE id = ${objectId}
    `);
    await logInventoryChange(db, objectId, '- sold b2c', quantity);
    return { success: true, message: `Recorded ${quantity} B2C sale(s)` };
  } catch (error) {
    console.error('Error recording B2C sale:', error);
    return { success: false, error: 'Failed to record sale' };
  }
}

export async function recordSaleB2B(db: D1Database, objectId: number, quantity: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const now = Math.floor(Date.now() / 1000);
    await drizzleDb.run(sql`
      UPDATE objects
      SET in_stock = MAX(0, in_stock - ${quantity}), updated_at = ${now}
      WHERE id = ${objectId}
    `);
    await logInventoryChange(db, objectId, '- sold b2b', quantity);
    return { success: true, message: `Recorded ${quantity} B2B sale(s)` };
  } catch (error) {
    console.error('Error recording B2B sale:', error);
    return { success: false, error: 'Failed to record sale' };
  }
}

/**
 * Manual stock count session.
 * Sets in_stock to the actual observed count, records the discrepancy
 * (actual - expected) on the object row, and logs the adjustment.
 */
export async function performManualCount(
  db: D1Database,
  objectId: number,
  actualCount: number,
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  try {
    const object = await getObjectById(db, objectId);
    if (!object) return { success: false, error: 'Object not found' };

    const expected = object.in_stock;
    const discrepancy = actualCount - expected; // positive = more than expected
    const now = Math.floor(Date.now() / 1000);

    await drizzleDb.run(sql`
      UPDATE objects
      SET in_stock             = ${actualCount},
          last_count_date      = ${now},
          last_count_discrepancy = ${discrepancy},
          updated_at           = ${now}
      WHERE id = ${objectId}
    `);

    // Log as addition or removal depending on the sign
    const changeType: InventoryChangeType = discrepancy >= 0 ? '+ stock count' : '- stock count';
    await logInventoryChange(db, objectId, changeType, Math.abs(discrepancy));

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

// ─── SKU-based convenience wrappers ──────────────────────────────────────────
// SKU is the stable identifier for external lookups (Shopify, CSV, etc.)

export async function addStockBySku(
  db: D1Database,
  sku: string,
  quantity: number,
): Promise<ServerResponse> {
  const object = await getObjectBySku(db, sku);
  if (!object) return { success: false, error: `Object with SKU "${sku}" not found` };
  return addStock(db, object.id, quantity);
}

export async function recordSaleB2CBySku(
  db: D1Database,
  sku: string,
  quantity: number,
): Promise<ServerResponse> {
  const object = await getObjectBySku(db, sku);
  if (!object) return { success: false, error: `Object with SKU "${sku}" not found` };
  return recordSaleB2C(db, object.id, quantity);
}

export async function recordSaleB2BBySku(
  db: D1Database,
  sku: string,
  quantity: number,
): Promise<ServerResponse> {
  const object = await getObjectBySku(db, sku);
  if (!object) return { success: false, error: `Object with SKU "${sku}" not found` };
  return recordSaleB2B(db, object.id, quantity);
}

export async function performManualCountBySku(
  db: D1Database,
  sku: string,
  actualCount: number,
): Promise<ServerResponse> {
  const object = await getObjectBySku(db, sku);
  if (!object) return { success: false, error: `Object with SKU "${sku}" not found` };
  return performManualCount(db, object.id, actualCount);
}

// ─── Internal log writer ──────────────────────────────────────────────────────

/**
 * Append one row to inventory_log.
 * quantity is ALWAYS positive — the sign is encoded in change_type.
 * printJobId is set for '+ printed' entries, null for everything else.
 */
async function logInventoryChange(
  db: D1Database,
  objectId: number,
  changeType: InventoryChangeType,
  quantity: number,
  printJobId: number | null = null,
): Promise<void> {
  const drizzleDb = getDb(db);
  const now = Math.floor(Date.now() / 1000);
  await drizzleDb.run(sql`
    INSERT INTO inventory_log (object_id, change_type, quantity, print_job_id, created_at)
    VALUES (${objectId}, ${changeType}, ${Math.abs(quantity)}, ${printJobId}, ${now})
  `);
}
