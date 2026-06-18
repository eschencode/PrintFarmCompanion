import type { D1Database } from '@cloudflare/workers-types';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import type { Category, ServerResponse } from '../types';

export async function getAllCategories(db: D1Database): Promise<Category[]> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb.all<Category>(sql`
    SELECT id, name, parent_id, sort_order, created_at
    FROM categories
    ORDER BY sort_order ASC, name ASC
  `);
  return rows ?? [];
}

export async function createCategory(
  db: D1Database,
  name: string,
  parentId: number | null = null,
): Promise<ServerResponse> {
  const clean = name.trim();
  if (!clean) return { success: false, error: 'Name required' };
  const drizzleDb = getDb(db);
  // Subcategories only nest one level — reject a parent that is itself a child.
  if (parentId != null) {
    const parent = await drizzleDb.get<{ parent_id: number | null }>(
      sql`SELECT parent_id FROM categories WHERE id = ${parentId}`,
    );
    if (!parent) return { success: false, error: 'Parent not found' };
    if (parent.parent_id != null) return { success: false, error: 'Only one level of nesting allowed' };
  }
  const next = await drizzleDb.get<{ n: number }>(
    sql`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories WHERE parent_id IS ${parentId}`,
  );
  await drizzleDb.run(
    sql`INSERT INTO categories (name, parent_id, sort_order) VALUES (${clean}, ${parentId}, ${next?.n ?? 0})`,
  );
  return { success: true, message: `Created "${clean}"` };
}

export async function renameCategory(
  db: D1Database,
  id: number,
  name: string,
): Promise<ServerResponse> {
  const clean = name.trim();
  if (!clean) return { success: false, error: 'Name required' };
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`UPDATE categories SET name = ${clean} WHERE id = ${id}`);
  return { success: true };
}

/** Deletes a category and (via FK cascade) its subcategories; affected objects fall back to Uncategorized. */
export async function deleteCategory(db: D1Database, id: number): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  await drizzleDb.run(sql`DELETE FROM categories WHERE id = ${id}`);
  return { success: true };
}

export async function assignObjectCategory(
  db: D1Database,
  objectId: number,
  categoryId: number | null,
): Promise<ServerResponse> {
  const drizzleDb = getDb(db);
  await drizzleDb.run(
    sql`UPDATE objects SET category_id = ${categoryId}, updated_at = unixepoch() WHERE id = ${objectId}`,
  );
  return { success: true };
}
