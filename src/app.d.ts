// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

// Extend the Cloudflare Env interface with Shopify credentials
declare global {
	namespace App {
		interface Platform {
			env: Env & {
				SHOPIFY_STORE_DOMAIN?: string;
				SHOPIFY_ACCESS_TOKEN?: string;
			};
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
