import type { D1Database } from "@cloudflare/workers-types";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { workspaces } from "../db/schema";
import type { GridCell } from "../types";

export type Workspace = {
  id: number;
  name: string;
  slug: string;
};

/** Lowercase, alnum + single dashes, trimmed. Falls back to "workspace". */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return s || "workspace";
}

/**
 * The workspace a user owns. One per user for now (Phase 4 adds memberships),
 * so the first owned row is the answer. Returns null if none (shouldn't happen
 * for a fully signed-up user, but the caller must handle it).
 */
export async function getWorkspaceForUser(
  db: D1Database,
  userId: string,
): Promise<Workspace | null> {
  const drizzleDb = getDb(db);
  const rows = await drizzleDb
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
    })
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Rename the workspace a user owns. No-op-safe: only touches the owned row. */
export async function renameWorkspace(
  db: D1Database,
  workspaceId: number,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await getDb(db)
    .update(workspaces)
    .set({ name: trimmed })
    .where(eq(workspaces.id, workspaceId));
}

/** Short random base36 suffix for slug uniqueness (e.g. "k3f9q"). */
function randomSuffix(len = 5): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/**
 * Create the one workspace a user owns at signup. Name defaults to
 * "<user name> Printfarm" (or the email local-part if the name is blank) unless
 * the signup form supplied a custom name. Slug is slugify(name) + random suffix,
 * retried on the (extremely unlikely) unique collision.
 *
 * Returns the created workspace. Throws if it can't be created — the caller
 * (signup action) must surface that, since a user without a workspace is broken.
 */
export async function createWorkspaceForUser(
  db: D1Database,
  args: {
    userId: string;
    userName?: string | null;
    userEmail: string;
    requestedName?: string | null;
  },
): Promise<Workspace> {
  const drizzleDb = getDb(db);

  const requested = args.requestedName?.trim();
  const fallbackBase =
    args.userName?.trim() || args.userEmail.split("@")[0] || "My";
  const name = requested || `${fallbackBase} Printfarm`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${slugify(name)}-${randomSuffix()}`;
    try {
      const result = await drizzleDb
        .insert(workspaces)
        .values({ name, slug, ownerUserId: args.userId });
      const workspace = { id: Number(result.meta.last_row_id), name, slug };
      // Onboarding starter grid: the dashboard *is* the setup flow for a new
      // workspace. completeSetupStep() (setup.ts) morphs these cells into the
      // real thing as each step finishes. Failure is non-fatal — the dashboard
      // falls back to its default layout.
      try {
        await createStarterGrid(db, workspace.id);
      } catch (e) {
        console.error("Starter grid creation failed (non-fatal):", e);
      }
      return workspace;
    } catch (error) {
      lastError = error;
      // Only retry slug collisions; anything else is a real failure.
      if (!String(error).includes("UNIQUE")) break;
    }
  }
  console.error("Failed to create workspace for user", args.userId, lastError);
  throw new Error("Failed to create workspace");
}

/** The 3×3 grid a brand-new workspace starts with: guided-setup cells + settings. */
async function createStarterGrid(db: D1Database, workspaceId: number): Promise<void> {
  const cells: GridCell[] = [
    { type: "setup", step: "printers" },
    { type: "setup", step: "spools" },
    { type: "setup", step: "modules" },
    { type: "setup", step: "inventory" },
    { type: "setup", step: "stats" },
    { type: "empty" },
    { type: "empty" },
    { type: "empty" },
    { type: "settings" },
  ];
  const now = Math.floor(Date.now() / 1000);
  await getDb(db).run(sql`
    INSERT INTO grid_presets (workspace_id, name, is_default, rows, cols, grid_config, created_at, updated_at)
    VALUES (${workspaceId}, ${"Default"}, 1, 3, 3, ${JSON.stringify(cells)}, ${now}, ${now})
  `);
}
