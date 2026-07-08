import type { D1Database } from "@cloudflare/workers-types";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { workspaces } from "../db/schema";

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
      return { id: Number(result.meta.last_row_id), name, slug };
    } catch (error) {
      lastError = error;
      // Only retry slug collisions; anything else is a real failure.
      if (!String(error).includes("UNIQUE")) break;
    }
  }
  console.error("Failed to create workspace for user", args.userId, lastError);
  throw new Error("Failed to create workspace");
}
