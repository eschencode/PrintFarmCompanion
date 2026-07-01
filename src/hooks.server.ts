import type { Handle } from "@sveltejs/kit";
import { json, redirect } from "@sveltejs/kit";
import { building } from "$app/environment";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { getAuth } from "$lib/auth";
import { getWorkspaceForUser } from "$lib/server/workspaces";
import { getDb } from "$lib/db";

// Pages reachable without a session.
const PUBLIC_PAGES = new Set(["/login", "/signup", "/landing"]);
// API endpoints that authenticate via their own incoming shared secret
// (external callers: cron + Pi webhook). better-auth's /api/auth/* is handled
// by svelteKitHandler and has a null route.id, so it bypasses the guard already.
const PUBLIC_API_PREFIXES = ["/api/cron-sync", "/api/pi/webhook"];

function isPublic(path: string): boolean {
  if (PUBLIC_PAGES.has(path)) return true;
  return PUBLIC_API_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export const handle: Handle = async ({ event, resolve }) => {
  // No DB/secret during prerender/build — skip auth entirely.
  if (building) {
    event.locals.user = null;
    event.locals.session = null;
    event.locals.workspace = null;
    event.locals.ctx = null;
    return resolve(event);
  }

  const auth = getAuth(event.platform);

  const session = await auth.api.getSession({ headers: event.request.headers });
  if (session) {
    const workspace = await getWorkspaceForUser(
      event.platform!.env!.DB,
      session.user.id,
    );
    event.locals.user = session.user;
    event.locals.session = session.session;
    event.locals.workspace = workspace;
    // Tenant context for Phase 3 domain queries. Non-null whenever the user has
    // a workspace (signup guarantees one).
    event.locals.ctx = workspace
      ? { db: getDb(event.platform!.env!.DB), workspaceId: workspace.id }
      : null;
  } else {
    event.locals.user = null;
    event.locals.session = null;
    event.locals.workspace = null;
    event.locals.ctx = null;
  }

  // ---- Route guard -------------------------------------------------------
  const path = event.url.pathname;

  // Signed-in users have no business on the auth pages.
  if (event.locals.user && (path === "/login" || path === "/signup")) {
    throw redirect(303, "/");
  }

  // event.route.id is null for static assets and better-auth's own routes —
  // only guard real app routes.
  if (event.route.id && !event.locals.user && !isPublic(path)) {
    if (path.startsWith("/api/")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(path)}`);
  }

  // Mounts better-auth's /api/auth/* routes; passes everything else through.
  return svelteKitHandler({ event, resolve, auth, building });
};
