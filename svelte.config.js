import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			routes: {
				include: ['/*'],
				exclude: ['<all>']
			},
			// Dev uses REMOTE (production) D1 by default: `dev` / `desktop:dev` set
			// REMOTE_DB=true. Pass LOCAL_DB=true (`dev:local` / `desktop:dev:local`) to
			// bind LOCAL D1 instead. Remote binding needs a wrangler remote *preview
			// session*; if this account can't create one ("Could not create remote
			// preview session" / CF 1031), fall back to `dev:local` + `bun run db:pull`.
			// build/check never set REMOTE_DB, so they always stay local.
			platformProxy: { remoteBindings: process.env.REMOTE_DB === 'true' }
		})
	}
};

export default config;
