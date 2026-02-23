import type { D1Database } from '@cloudflare/workers-types';
import type {
  InventoryItem,
  InventoryLog,
  InventoryChangeType,
  ServerResponse
} from './types';

// ============ GETTERS ============

// Get all inventory items
export async function getAllInventoryItems(db: D1Database): Promise<InventoryItem[]> {
  const result = await db.prepare('SELECT * FROM inventory ORDER BY name ASC').all();
  return (result.results || []) as unknown as  InventoryItem[];
}

// Get single inventory item by ID
export async function getInventoryItemById(db: D1Database, id: number): Promise<InventoryItem | null> {
  const result = await db.prepare('SELECT * FROM inventory WHERE id = ?').bind(id).first();
  return result as InventoryItem | null;
}

// Get inventory item by SKU (for Shopify sync)
export async function getInventoryItemBySku(db: D1Database, sku: string): Promise<InventoryItem | null> {
  const result = await db.prepare('SELECT * FROM inventory WHERE sku = ?').bind(sku).first();
  return result as InventoryItem | null;
}

// Get inventory item by slug
export async function getInventoryItemBySlug(db: D1Database, slug: string): Promise<InventoryItem | null> {
  const result = await db.prepare('SELECT * FROM inventory WHERE slug = ?').bind(slug).first();
  return result as unknown as InventoryItem | null;
}

// Get low stock items (below threshold)
export async function getLowStockItems(db: D1Database): Promise<InventoryItem[]> {
  const result = await db.prepare(`
    SELECT * FROM inventory 
    WHERE stock_count < min_threshold 
    ORDER BY (min_threshold - stock_count) DESC
  `).all();
  return (result.results || []) as unknown as InventoryItem[];
}

// Get inventory logs for an item
export async function getInventoryLogs(db: D1Database, inventoryId: number, limit = 50): Promise<InventoryLog[]> {
  const result = await db.prepare(`
    SELECT * FROM inventory_log 
    WHERE inventory_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `).bind(inventoryId, limit).all();
  return (result.results || []) as unknown as  InventoryLog[];
}

// Get all recent inventory logs
export async function getAllRecentLogs(db: D1Database, limit = 100): Promise<(InventoryLog & { item_name: string })[]> {
  const result = await db.prepare(`
    SELECT il.*, i.name as item_name
    FROM inventory_log il
    JOIN inventory i ON il.inventory_id = i.id
    ORDER BY il.created_at DESC 
    LIMIT ?
  `).bind(limit).all();
  return (result.results || []) as unknown as (InventoryLog & { item_name: string })[];
}

// ============ SETTERS / MUTATIONS ============

// Create new inventory item
export async function createInventoryItem(db: D1Database, item: {
  name: string;
  sku?: string | null;
  description?: string | null;
  image_path?: string | null;
  stock_count?: number;
  min_threshold?: number;
}): Promise<ServerResponse> {
  try {
    const result = await db.prepare(`
      INSERT INTO inventory (name, sku, description, image_path, stock_count, min_threshold)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      item.name,
      item.sku ?? null,
      item.description ?? null,
      item.image_path ?? null,
      item.stock_count ?? 0,
      item.min_threshold ?? 5
    ).run();

    return {
      success: true,
      message: `Inventory item "${item.name}" created`,
      data: { id: result.meta.last_row_id }
    };
  } catch (error) {
    console.error('Error creating inventory item:', error);
    return { success: false, error: 'Failed to create inventory item' };
  }
}

// Update inventory item details
export async function updateInventoryItem(db: D1Database, id: number, item: {
  name?: string;
  sku?: string | null;
  description?: string | null;
  image_path?: string | null;
  min_threshold?: number;
}): Promise<ServerResponse> {
  try {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (item.name !== undefined) {
      updates.push('name = ?');
      values.push(item.name);
    }
    if (item.sku !== undefined) {
      updates.push('sku = ?');
      values.push(item.sku);
    }
    if (item.description !== undefined) {
      updates.push('description = ?');
      values.push(item.description);
    }
    if (item.image_path !== undefined) {
      updates.push('image_path = ?');
      values.push(item.image_path);
    }
    if (item.min_threshold !== undefined) {
      updates.push('min_threshold = ?');
      values.push(item.min_threshold);
    }

    if (updates.length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    values.push(id);

    await db.prepare(`UPDATE inventory SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values).run();

    return { success: true, message: 'Inventory item updated' };
  } catch (error) {
    console.error('Error updating inventory item:', error);
    return { success: false, error: 'Failed to update inventory item' };
  }
}

// Delete inventory item
export async function deleteInventoryItem(db: D1Database, id: number): Promise<ServerResponse> {
  try {
    // Delete logs first (foreign key constraint)
    await db.prepare('DELETE FROM inventory_log WHERE inventory_id = ?').bind(id).run();
    
    // Delete the item
    await db.prepare('DELETE FROM inventory WHERE id = ?').bind(id).run();

    return { success: true, message: 'Inventory item deleted' };
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    return { success: false, error: 'Failed to delete inventory item' };
  }
}

// ============ STOCK ADJUSTMENTS ============

// Add stock (e.g., after printing)
export async function addStock(db: D1Database, id: number, quantity: number, reason?: string): Promise<ServerResponse> {
  try {
    await db.prepare(`
      UPDATE inventory 
      SET stock_count = stock_count + ?, total_added = total_added + ?
      WHERE id = ?
    `).bind(quantity, quantity, id).run();

    await logInventoryChange(db, id, 'add', quantity, reason ?? 'Stock added');

    return { success: true, message: `Added ${quantity} to stock` };
  } catch (error) {
    console.error('Error adding stock:', error);
    return { success: false, error: 'Failed to add stock' };
  }
}

// Remove stock manually
export async function removeStock(db: D1Database, id: number, quantity: number, reason?: string): Promise<ServerResponse> {
  try {
    await db.prepare(`
      UPDATE inventory 
      SET stock_count = MAX(0, stock_count - ?), total_removed_manually = total_removed_manually + ?
      WHERE id = ?
    `).bind(quantity, quantity, id).run();

    await logInventoryChange(db, id, 'remove', -quantity, reason ?? 'Stock removed manually');

    return { success: true, message: `Removed ${quantity} from stock` };
  } catch (error) {
    console.error('Error removing stock:', error);
    return { success: false, error: 'Failed to remove stock' };
  }
}

// Record sale (B2C)
export async function recordSaleB2C(db: D1Database, id: number, quantity: number, reason?: string): Promise<ServerResponse> {
  try {
    await db.prepare(`
      UPDATE inventory 
      SET stock_count = MAX(0, stock_count - ?), 
          total_sold = total_sold + ?,
          total_sold_b2c = total_sold_b2c + ?
      WHERE id = ?
    `).bind(quantity, quantity, quantity, id).run();

    await logInventoryChange(db, id, 'sold_b2c', -quantity, reason ?? 'Sold B2C');

    return { success: true, message: `Recorded ${quantity} B2C sale(s)` };
  } catch (error) {
    console.error('Error recording B2C sale:', error);
    return { success: false, error: 'Failed to record sale' };
  }
}

// Record sale (B2B)
export async function recordSaleB2B(db: D1Database, id: number, quantity: number, reason?: string): Promise<ServerResponse> {
  try {
    await db.prepare(`
      UPDATE inventory 
      SET stock_count = MAX(0, stock_count - ?), 
          total_sold = total_sold + ?,
          total_sold_b2b = total_sold_b2b + ?
      WHERE id = ?
    `).bind(quantity, quantity, quantity, id).run();

    await logInventoryChange(db, id, 'sold_b2b', -quantity, reason ?? 'Sold B2B');

    return { success: true, message: `Recorded ${quantity} B2B sale(s)` };
  } catch (error) {
    console.error('Error recording B2B sale:', error);
    return { success: false, error: 'Failed to record sale' };
  }
}

// Manual count adjustment
export async function performManualCount(db: D1Database, id: number, actualCount: number, reason?: string): Promise<ServerResponse> {
  try {
    // Get current expected count
    const item = await getInventoryItemById(db, id);
    if (!item) {
      return { success: false, error: 'Inventory item not found' };
    }

    const expectedCount = item.stock_count;
    const difference = actualCount - expectedCount;

    await db.prepare(`
      UPDATE inventory 
      SET stock_count = ?,
          last_count_date = ?,
          last_count_expected = ?,
          last_count_actual = ?
      WHERE id = ?
    `).bind(actualCount, Date.now(), expectedCount, actualCount, id).run();

    await logInventoryChange(
      db, 
      id, 
      'count_adjust', 
      difference, 
      reason ?? `Manual count: expected ${expectedCount}, found ${actualCount}`
    );

    return { 
      success: true, 
      message: `Stock adjusted from ${expectedCount} to ${actualCount} (${difference >= 0 ? '+' : ''}${difference})`,
      data: { difference, expectedCount, actualCount }
    };
  } catch (error) {
    console.error('Error performing manual count:', error);
    return { success: false, error: 'Failed to perform manual count' };
  }
}

// Set stock to specific value (without logging as count_adjust)
export async function setStock(db: D1Database, id: number, count: number): Promise<ServerResponse> {
  try {
    await db.prepare('UPDATE inventory SET stock_count = ? WHERE id = ?')
      .bind(Math.max(0, count), id).run();

    return { success: true, message: 'Stock count set' };
  } catch (error) {
    console.error('Error setting stock:', error);
    return { success: false, error: 'Failed to set stock' };
  }
}

// ============ LOGGING ============

// Log an inventory change
async function logInventoryChange(
  db: D1Database, 
  inventoryId: number, 
  changeType: InventoryChangeType, 
  quantity: number, 
  reason?: string
): Promise<void> {
  await db.prepare(`
    INSERT INTO inventory_log (inventory_id, change_type, quantity, reason)
    VALUES (?, ?, ?, ?)
  `).bind(inventoryId, changeType, quantity, reason ?? null).run();
}

// Add stock by slug (for use after print completion)
export async function addStockBySlug(db: D1Database, slug: string, quantity: number, reason?: string): Promise<ServerResponse> {
  try {
    const item = await getInventoryItemBySlug(db, slug);
    if (!item) {
      console.warn(`Inventory item with slug "${slug}" not found - skipping stock update`);
      return { success: false, error: `Inventory item with slug "${slug}" not found` };
    }
    
    return await addStock(db, item.id, quantity, reason);
  } catch (error) {
    console.error('Error adding stock by slug:', error);
    return { success: false, error: 'Failed to add stock' };
  }
}