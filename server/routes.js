'use strict';

var errors = require('./components/errors');
var path = require('path');
var config = require('./config/environment');
var logger = require('./config/logger');
var packageJson = require('../package.json');

module.exports = function (app) {
	// Insert routes below
	app.use('/api/images', require('./api/image'));
	app.use('/api/routes', require('./api/routes'));
	app.use('/api/vehicles', require('./api/vehicles'));
	app.use('/api/config', require('./api/config'));

	// Health check endpoint for monitoring and orchestration
	// Always allow CORS for health endpoint to support dev mode version fetching
	app.get('/health', function (req, res) {
		// Allow cross-origin requests for health check (always, even in production)
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

		res.status(200).json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
			version: packageJson.version,
			uptime: process.uptime(),
			environment: process.env.NODE_ENV || 'development'
		});
	});

	// All undefined asset or api routes should return a 404
	app.get(
		['/api/*splat', '/auth/*splat', '/components/*splat', '/app/*splat', '/assets/*splat'],
		errors[404]
	);

	// SvelteKit handler for all other routes
	var buildPath = path.join(config.root, 'svelte-app/build');
	var handlerPath = buildPath + '/handler.js';

	logger.info({ path: buildPath }, 'Loading SvelteKit handler');

	// Load handler once and cache it
	var handlerCache = null;
	var handlerLoadError = null;

	// Middleware that loads handler on first request or retries if failed
	app.use(function (req, res, next) {
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
			.then(function (module) {
				logger.info('SvelteKit handler loaded successfully');
				handlerCache = module.handler;
				handlerCache(req, res, next);
			})
			.catch(function (err) {
				logger.error(
					{ err: err },
					'Failed to load SvelteKit handler - run: cd svelte-app && pnpm build'
				);
				handlerLoadError = err;
				res.status(500).send({
					error: 'Application not available',
					message: 'SvelteKit build not found. Run: cd svelte-app && pnpm build'
				});
			});
	});
};
