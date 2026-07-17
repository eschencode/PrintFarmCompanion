import { error } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import type { AppDB } from "../db";

/**
 * Platform-operator (cross-tenant) queries. Everything here is reachable only
 * behind the /admin gate in hooks.server.ts plus requireAdmin() — these queries
 * deliberately read across workspaces and must never be imported from tenant
 * routes.
 */

export type AdminContext = { db: AppDB; d1: D1Database };

/**
 * Narrow locals to an admin caller. 404 (matching the hooks gate) so the panel
 * doesn't exist for anyone else. Defense-in-depth: every /admin load and action
 * calls this even though hooks already gates the path.
 */
export function requireAdmin(locals: App.Locals): AdminContext {
  if (locals.user?.role !== "admin" || !locals.ctx) {
    throw error(404, "Not found");
  }
  return { db: locals.ctx.db, d1: locals.ctx.d1 };
}

export type AdminWorkspaceRow = {
  workspace_id: number;
  workspace_name: string;
  slug: string;
  created_at: number;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  email_verified: number | null;
  banned: number | null;
  last_active: number | null;
  printer_count: number;
  job_count: number;
  spool_count: number;
};

/** All workspaces with owner, activity and usage counts — the operator overview. */
export async function listAllWorkspaces(admin: AdminContext): Promise<AdminWorkspaceRow[]> {
  return admin.db.all<AdminWorkspaceRow>(sql`
    SELECT
      w.id AS workspace_id,
      w.name AS workspace_name,
      w.slug,
      w.created_at,
      u.id AS owner_id,
      u.name AS owner_name,
      u.email AS owner_email,
      u.email_verified,
      u.banned,
      (SELECT MAX(s.updated_at) FROM session s WHERE s.user_id = u.id) AS last_active,
      (SELECT COUNT(*) FROM printers p WHERE p.workspace_id = w.id) AS printer_count,
      (SELECT COUNT(*) FROM print_jobs j WHERE j.workspace_id = w.id) AS job_count,
      (SELECT COUNT(*) FROM spools sp WHERE sp.workspace_id = w.id) AS spool_count
    FROM workspaces w
    LEFT JOIN user u ON u.id = w.owner_user_id
    ORDER BY w.created_at DESC
  `);
}

// ── System preset catalog (workspace_id IS NULL rows) ────────────────────────

export type SystemPrinterPreset = {
  id: number;
  brand: string;
  model: string;
  dimension_x: number | null;
  dimension_y: number | null;
  dimension_z: number | null;
  device_file_path: string;
};

export type SystemPlatePreset = {
  id: number;
  name: string;
  dimension_x: number | null;
  dimension_y: number | null;
};

export async function listSystemPrinterPresets(admin: AdminContext): Promise<SystemPrinterPreset[]> {
  return admin.db.all<SystemPrinterPreset>(sql`
    SELECT id, brand, model, dimension_x, dimension_y, dimension_z, device_file_path
    FROM printer_presets WHERE workspace_id IS NULL
    ORDER BY brand, model
  `);
}

export async function listSystemPlatePresets(admin: AdminContext): Promise<SystemPlatePreset[]> {
  return admin.db.all<SystemPlatePreset>(sql`
    SELECT id, name, dimension_x, dimension_y
    FROM plate_presets WHERE workspace_id IS NULL
    ORDER BY name
  `);
}

export async function createSystemPrinterPreset(
  admin: AdminContext,
  p: { brand: string; model: string; dimensionX: number | null; dimensionY: number | null; dimensionZ: number | null; deviceFilePath: string },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await admin.db.run(sql`
    INSERT INTO printer_presets (workspace_id, brand, model, dimension_x, dimension_y, dimension_z, device_file_path, created_at, updated_at)
    VALUES (NULL, ${p.brand}, ${p.model}, ${p.dimensionX}, ${p.dimensionY}, ${p.dimensionZ}, ${p.deviceFilePath}, ${now}, ${now})
  `);
}

export async function updateSystemPrinterPreset(
  admin: AdminContext,
  id: number,
  p: { brand: string; model: string; dimensionX: number | null; dimensionY: number | null; dimensionZ: number | null; deviceFilePath: string },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await admin.db.run(sql`
    UPDATE printer_presets
    SET brand = ${p.brand}, model = ${p.model}, dimension_x = ${p.dimensionX},
        dimension_y = ${p.dimensionY}, dimension_z = ${p.dimensionZ},
        device_file_path = ${p.deviceFilePath}, updated_at = ${now}
    WHERE id = ${id} AND workspace_id IS NULL
  `);
}

export async function deleteSystemPrinterPreset(admin: AdminContext, id: number): Promise<void> {
  await admin.db.run(sql`
    DELETE FROM printer_presets WHERE id = ${id} AND workspace_id IS NULL
  `);
}

export async function createSystemPlatePreset(
  admin: AdminContext,
  p: { name: string; dimensionX: number | null; dimensionY: number | null },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await admin.db.run(sql`
    INSERT INTO plate_presets (workspace_id, name, dimension_x, dimension_y, created_at, updated_at)
    VALUES (NULL, ${p.name}, ${p.dimensionX}, ${p.dimensionY}, ${now}, ${now})
  `);
}

export async function updateSystemPlatePreset(
  admin: AdminContext,
  id: number,
  p: { name: string; dimensionX: number | null; dimensionY: number | null },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await admin.db.run(sql`
    UPDATE plate_presets
    SET name = ${p.name}, dimension_x = ${p.dimensionX}, dimension_y = ${p.dimensionY}, updated_at = ${now}
    WHERE id = ${id} AND workspace_id IS NULL
  `);
}

export async function deleteSystemPlatePreset(admin: AdminContext, id: number): Promise<void> {
  await admin.db.run(sql`
    DELETE FROM plate_presets WHERE id = ${id} AND workspace_id IS NULL
  `);
}

// ── Platform metrics ──────────────────────────────────────────────────────────

export type PlatformMetrics = {
  signupsByDay: { day: string; count: number }[];
  jobsByDay: { day: string; count: number }[];
  totals: {
    users: number;
    workspaces: number;
    active7d: number;
    active30d: number;
  };
};

export async function getPlatformMetrics(admin: AdminContext): Promise<PlatformMetrics> {
  const now = Math.floor(Date.now() / 1000);
  const since90d = now - 90 * 86_400;

  // Auth tables (user/session/workspaces) are global — not scope-checked.
  const signupsByDay = await admin.db.all<{ day: string; count: number }>(sql`
    SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS count
    FROM user WHERE created_at >= ${since90d}
    GROUP BY day ORDER BY day
  `);

  const jobsByDay = await admin.db.all<{ day: string; count: number }>(sql`
    -- scoping-ok: platform-wide metric, cross-tenant by design
    SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS count
    FROM print_jobs WHERE created_at >= ${since90d}
    GROUP BY day ORDER BY day
  `);

  const activeSince = async (cutoff: number) => {
    const rows = await admin.db.all<{ count: number }>(sql`
      SELECT COUNT(DISTINCT w.id) AS count
      FROM workspaces w
      JOIN session s ON s.user_id = w.owner_user_id
      WHERE s.updated_at >= ${cutoff}
    `);
    return rows[0]?.count ?? 0;
  };

  const totalsRows = await admin.db.all<{ users: number; workspaces: number }>(sql`
    SELECT (SELECT COUNT(*) FROM user) AS users,
           (SELECT COUNT(*) FROM workspaces) AS workspaces
  `);

  return {
    signupsByDay,
    jobsByDay,
    totals: {
      users: totalsRows[0]?.users ?? 0,
      workspaces: totalsRows[0]?.workspaces ?? 0,
      active7d: await activeSince(now - 7 * 86_400),
      active30d: await activeSince(now - 30 * 86_400),
    },
  };
}

// ── User deletion (GDPR-style cascade) ────────────────────────────────────────

/**
 * Delete a user and everything they own: all rows in every workspace-scoped
 * table for their workspace(s), the workspace(s), then their auth rows.
 * Explicit FK-safe order — we don't rely on ON DELETE CASCADE because
 * inventory_log.object_id is RESTRICT and cascade ordering is unspecified.
 */
export async function deleteUserCascade(admin: AdminContext, userId: string): Promise<void> {
  const owned = await admin.db.all<{ id: number }>(sql`
    SELECT id FROM workspaces WHERE owner_user_id = ${userId}
  `);
  const emailRows = await admin.db.all<{ email: string }>(sql`
    SELECT email FROM user WHERE id = ${userId}
  `);
  const email = emailRows[0]?.email ?? null;

  // Children before parents. workspace_id predicate keeps every delete scoped
  // to the target tenant.
  const scopedTables = [
    "printer_loaded_spools",
    "print_job_spools",
    "module_filament_slots",
    "printer_queued_jobs",
    "print_queue",
    "inventory_log",
    "shopify_sku_mapping",
    "shopify_skus",
    "shopify_orders",
    "shopify_settings",
    "print_jobs",
    "printer_secrets",
    "printers",
    "print_modules",
    "spools",
    "spool_presets",
    "objects",
    "categories",
    "grid_presets",
    // Hybrid catalogs: only the workspace's custom rows; system NULL rows stay.
    "plate_presets",
    "printer_presets",
  ];

  for (const ws of owned) {
    const stmts = scopedTables.map((t) =>
      admin.d1.prepare(`DELETE FROM ${t} WHERE workspace_id = ?`).bind(ws.id),
    );
    stmts.push(admin.d1.prepare(`DELETE FROM workspaces WHERE id = ?`).bind(ws.id));
    await admin.d1.batch(stmts);
  }

  const authStmts = [
    admin.d1.prepare(`DELETE FROM session WHERE user_id = ?`).bind(userId),
    admin.d1.prepare(`DELETE FROM account WHERE user_id = ?`).bind(userId),
  ];
  if (email) {
    authStmts.push(admin.d1.prepare(`DELETE FROM verification WHERE identifier = ?`).bind(email));
  }
  authStmts.push(admin.d1.prepare(`DELETE FROM user WHERE id = ?`).bind(userId));
  await admin.d1.batch(authStmts);
}
