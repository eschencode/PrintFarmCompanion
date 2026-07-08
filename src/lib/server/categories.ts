import { sql } from 'drizzle-orm';
import type { Category, ServerResponse } from '../types';
import type { TenantContext } from './context';

// categories carries workspace_id NOT NULL (Phase 3, group 8).

export async function getAllCategories(ctx: TenantContext): Promise<Category[]> {
  const rows = await ctx.db.all<Category>(sql`
    SELECT id, name, parent_id, sort_order, created_at
    FROM categories
    WHERE workspace_id = ${ctx.workspaceId}
    ORDER BY sort_order ASC, name ASC
  `);
  return rows ?? [];
}

export async function createCategory(
  ctx: TenantContext,
  name: string,
  parentId: number | null = null,
): Promise<ServerResponse> {
  const clean = name.trim();
  if (!clean) return { success: false, error: 'Name required' };
  // Subcategories only nest one level — reject a parent that is itself a child.
  if (parentId != null) {
    const parent = await ctx.db.get<{ parent_id: number | null }>(
      sql`SELECT parent_id FROM categories WHERE id = ${parentId} AND workspace_id = ${ctx.workspaceId}`,
    );
    if (!parent) return { success: false, error: 'Parent not found' };
    if (parent.parent_id != null) return { success: false, error: 'Only one level of nesting allowed' };
  }
  const next = await ctx.db.get<{ n: number }>(
    sql`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories WHERE parent_id IS ${parentId} AND workspace_id = ${ctx.workspaceId}`,
  );
  await ctx.db.run(
    sql`INSERT INTO categories (workspace_id, name, parent_id, sort_order) VALUES (${ctx.workspaceId}, ${clean}, ${parentId}, ${next?.n ?? 0})`,
  );
  return { success: true, message: `Created "${clean}"` };
}

export async function renameCategory(
  ctx: TenantContext,
  id: number,
  name: string,
): Promise<ServerResponse> {
  const clean = name.trim();
  if (!clean) return { success: false, error: 'Name required' };
  await ctx.db.run(sql`UPDATE categories SET name = ${clean} WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`);
  return { success: true };
}

/** Deletes a category and (via FK cascade) its subcategories; affected objects fall back to Uncategorized. */
export async function deleteCategory(ctx: TenantContext, id: number): Promise<ServerResponse> {
  await ctx.db.run(sql`DELETE FROM categories WHERE id = ${id} AND workspace_id = ${ctx.workspaceId}`);
  return { success: true };
}

export async function assignObjectCategory(
  ctx: TenantContext,
  objectId: number,
  categoryId: number | null,
): Promise<ServerResponse> {
  await ctx.db.run(
    sql`UPDATE objects SET category_id = ${categoryId}, updated_at = unixepoch() WHERE id = ${objectId} AND workspace_id = ${ctx.workspaceId}`,
  );
  return { success: true };
}
