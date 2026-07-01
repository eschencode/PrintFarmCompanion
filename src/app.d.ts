// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';
import type { Auth } from '$lib/auth';
import type { Workspace } from '$lib/server/workspaces';
import type { TenantContext } from '$lib/server/context';

type AuthSession = Auth['$Infer']['Session'];

declare global {
    namespace App {
        // interface Error {}
        interface Locals {
            // Populated per-request by hooks.server.ts. null when unauthenticated.
            user: AuthSession['user'] | null;
            session: AuthSession['session'] | null;
            workspace: Workspace | null;
            // Tenant context for domain queries (Phase 3). Non-null when the
            // user has a workspace; null for unauthenticated requests.
            ctx: TenantContext | null;
        }
        // interface PageState {}
        interface Platform {
            env?: {
                DB: D1Database;
                SHOPIFY_STORE_DOMAIN?: string;
                SHOPIFY_ACCESS_TOKEN?: string;
                AI?: Ai;
                PI_TUNNEL_URL?: string;
                PI_SECRET?: string;
                PI_WEBHOOK_SECRET?: string;
                ENCRYPTION_KEY?: string;
                CRON_SECRET?: string;
                BETTER_AUTH_SECRET?: string;
                BETTER_AUTH_URL?: string;
            };
        }
    }
}

export {};
