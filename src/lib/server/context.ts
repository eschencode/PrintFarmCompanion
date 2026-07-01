import { error } from "@sveltejs/kit";
import type { AppDB } from "../db";

/**
 * Per-request tenant context. Built in hooks.server.ts from the resolved session
 * and threaded into every domain server function (Phase 3). Carries the Drizzle
 * db (wrapped once per request) plus the caller's workspace id, so queries can
 * scope to `workspace_id = ctx.workspaceId`.
 *
 * Phase 4 will extend this with `userId` / `role` without changing call sites.
 */
export type TenantContext = {
  db: AppDB;
  workspaceId: number;
};

/**
 * Pull the tenant context off `locals`, throwing 401 if absent. The route guard
 * guarantees a context on protected routes; this is the type-narrowing +
 * defense-in-depth accessor for loaders/actions/endpoints.
 */
export function requireCtx(locals: App.Locals): TenantContext {
  if (!locals.ctx) throw error(401, "Unauthorized");
  return locals.ctx;
}
