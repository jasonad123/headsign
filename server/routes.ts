import { Application, Request, Response, NextFunction, RequestHandler } from 'express';
import fs from 'fs';
import errors from './components/errors/index.js';
import path from 'path';
import config from './config/environment/index.js';
import logger from './config/logger.js';
import imageRoutes from './api/image/index.js';
import transitRoutes from './api/routes/index.js';
import vehiclesRoutes from './api/vehicles/index.js';
import configRoutes from './api/config/index.js';

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string };

interface SvelteKitHandler {
	(req: Request, res: Response, next: NextFunction): void;
}

interface SvelteKitModule {
	handler: SvelteKitHandler;
}

export default function setupRoutes(app: Application): void {
	// Insert routes below
	app.use('/api/images', imageRoutes);
	app.use('/api/routes', transitRoutes);
	app.use('/api/vehicles', vehiclesRoutes);
	app.use('/api/config', configRoutes);

	// Health check endpoint for monitoring and orchestration
	// Always allow CORS for health endpoint to support dev mode version fetching
	app.get('/health', (req: Request, res: Response) => {
		// Allow cross-origin requests for health check (always, even in production)
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

		res.status(200).json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
			version: pkg.version,
			uptime: process.uptime(),
			environment: process.env.NODE_ENV || 'development'
		});
	});

	// All undefined asset or api routes should return a 404
	app.get(
		['/api/*splat', '/auth/*splat', '/components/*splat', '/app/*splat', '/assets/*splat'],
		errors[404] as RequestHandler
	);

	// SvelteKit handler for all other routes
	const buildPath = path.join(config.root, 'svelte-app/build');
	const handlerPath = buildPath + '/handler.js';

	logger.info({ path: buildPath }, 'Loading SvelteKit handler');

	// Load handler once and cache it
	let handlerCache: SvelteKitHandler | null = null;
	let handlerLoadError: Error | null = null;

	// Middleware that loads handler on first request or retries if failed
	app.use((req: Request, res: Response, next: NextFunction) => {
		// If handler is already loaded, use it
		if (handlerCache) {
			return handlerCache(req, res, next);
		}

		// If previous load attempt failed, return error
		if (handlerLoadError) {
			logger.error({ err: handlerLoadError }, 'SvelteKit handler not available');
			return res.status(500).send({
				error: 'Application not available',
				message: 'SvelteKit build not found. Run: cd svelte-app && pnpm build'
			});
		}

		// Load handler on first request
		import(handlerPath)
			.then((module: SvelteKitModule) => {
				logger.info('SvelteKit handler loaded successfully');
				handlerCache = module.handler;
				handlerCache(req, res, next);
			})
			.catch((err: Error) => {
				logger.error(
					{ err },
					'Failed to load SvelteKit handler - run: cd svelte-app && pnpm build'
				);
				handlerLoadError = err;
				res.status(500).send({
					error: 'Application not available',
					message: 'SvelteKit build not found. Run: cd svelte-app && pnpm build'
				});
			});
	});
}
