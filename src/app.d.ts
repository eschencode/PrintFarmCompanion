// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { D1Database } from '@cloudflare/workers-types';
import type { Ai } from '@cloudflare/workers-types';

declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageState {}
        interface Platform {
            env?: {
                DB: D1Database;
                SHOPIFY_STORE_DOMAIN?: string;
                SHOPIFY_ACCESS_TOKEN?: string;
                AI?: Ai;
            };
        }
    }
}

export {};
