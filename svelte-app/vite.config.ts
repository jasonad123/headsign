import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	envDir: '..',

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
		include: ['svelte-i18n', '@svelte-put/qr/svg/QR.svelte']
	}
});
