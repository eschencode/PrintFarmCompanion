import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import type { D1Database } from "@cloudflare/workers-types";
import { getDb } from "$lib/db";
import * as schema from "$lib/db/schema";

/**
 * Per-request better-auth factory.
 *
 * No module-level singleton: on Cloudflare Workers the D1 binding only exists
 * per request (`platform.env.DB`), so we build the auth instance inside the
 * request (hooks.server.ts) with that request's binding. The drizzle adapter
 * keeps `schema.ts` as the single source of truth for the auth tables.
 */
export function createAuth(d1: D1Database, opts: { secret: string; baseURL?: string }) {
  return betterAuth({
    secret: opts.secret,
    // Optional: better-auth infers the origin from the request via the
    // sveltekitCookies plugin when this is undefined. Set it (BETTER_AUTH_URL)
    // once we have a stable deploy URL.
    baseURL: opts.baseURL,
    database: drizzleAdapter(getDb(d1), {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true },
    // Keep this last — it hooks SvelteKit's cookie handling.
    plugins: [sveltekitCookies(getRequestEvent)],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Build the auth instance from a request's platform bindings. Throws if the DB
 * binding or signing secret is missing (misconfiguration — fail loud).
 */
export function getAuth(platform: App.Platform | undefined): Auth {
  const env = platform?.env;
  if (!env?.DB) throw new Error("DB binding unavailable");
  if (!env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is not set");
  return createAuth(env.DB, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
  });
}
