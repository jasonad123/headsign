import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// $lib was removed in SvelteKit 3 (replaced by #lib); keep the alias to
			// avoid rewriting every import
			alias: { $lib: 'src/lib' }
		})
	],

	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},

	build: {
		// Reasonable chunk size limit
		chunkSizeWarningLimit: 600,
		// Enable hidden source maps in production for debugging (not exposed to users)
		sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
		rolldownOptions: {
			checks: {
				// SvelteKit's internal plugins (guard, virtual-modules) always dominate
				// build time — suppress the noise from Rolldown's timing instrumentation
				pluginTimings: false
			}
		}
	},

	server: {
		host: process.env.VITE_HOST || '0.0.0.0', // Allow override
		fs: {
			allow: ['..']
		},
		proxy: {
			'/api': {
				target: process.env.VITE_API_PROXY || 'http://localhost:8080',
				changeOrigin: true
			}
		}
	},

	// Pre-optimize dependencies for faster dev server startup
	optimizeDeps: {
		include: ['i18next', '@svelte-put/qr/svg/QR.svelte']
	},

	// i18next ships CJS by default, so Vite's SSR build externalizes it
	// instead of bundling it in (unlike the old pure-ESM svelte-i18n). The
	// production Docker image only installs the root server's dependencies,
	// not svelte-app's, so an externalized import would fail to resolve at
	// runtime — force it to be bundled into the SSR output instead.
	ssr: {
		noExternal: ['i18next']
	}
});
