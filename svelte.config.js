import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			routes: {
				include: ['/*'],
				exclude: ['<all>']
			},
			// AI binding has no local emulator; default remoteBindings:true tries to start
			// a remote preview session that fails (CF error 1031). Disable for local dev.
			platformProxy: { remoteBindings: false }
		})
	}
};

export default config;
