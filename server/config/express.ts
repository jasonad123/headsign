/**
 * Express configuration
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import errorHandler from 'errorhandler';
import path from 'path';
import config from './environment/index.js';
import helmet from 'helmet';
import logger, { baseConfig, isDevelopment } from './logger.js';
import ejs from 'ejs';

interface ErrorWithStatus extends Error {
	status?: number;
}

export default function configureExpress(app: Application): void {
	const env = app.get('env');

	// Trust proxy setting for deployments behind reverse proxies/load balancers
	// This allows req.ip to correctly reflect the client IP from X-Forwarded-For
	// Set TRUST_PROXY=true in production if behind a proxy, or specify number of hops
	if (process.env.TRUST_PROXY) {
		app.set(
			'trust proxy',
			process.env.TRUST_PROXY === 'true' ? true : parseInt(process.env.TRUST_PROXY, 10)
		);
	}

	// Security middleware
	app.use(
		helmet({
			contentSecurityPolicy: false // We'll configure this manually if needed
		})
	);

	// Set up CORS (development only)
	// In production, SvelteKit and Express run on the same origin (port 8080),
	// so CORS is not needed. CORS is only required during local development
	// when SvelteKit dev server (port 5173) needs to call Express (port 8080).
	if (env !== 'production') {
		app.use((req: Request, res: Response, next: NextFunction) => {
			const allowedOrigins = config.security.cors.allowedOrigins;
			const origin = req.headers.origin;

			if (origin && allowedOrigins.indexOf(origin) > -1) {
				res.setHeader('Access-Control-Allow-Origin', origin);
			}

			res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
			res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			res.header('Access-Control-Allow-Credentials', 'true');

			if (req.method === 'OPTIONS') {
				return res.sendStatus(200);
			}

			next();
		});
	}

	app.set('views', config.root + '/server/views');
	app.engine('html', ejs.renderFile);
	app.set('view engine', 'html');
	app.use(compression());
	app.use(express.urlencoded({ extended: false, limit: '1mb' }));
	app.use(express.json({ limit: '1mb' }));
	app.use(cookieParser());

	// Serve SvelteKit static assets with optimal caching
	app.use(
		express.static(path.join(config.root, 'svelte-app/build/client'), {
			maxAge: env === 'production' ? '1d' : 0,
			etag: true, // Enable ETags for cache validation
			lastModified: true, // Send Last-Modified headers
			index: false, // Don't serve index.html (SvelteKit handles routing)
			setHeaders: (res: Response, filepath: string) => {
				// Immutable cache for hashed assets (SvelteKit's /_app/immutable/)
				if (filepath.includes('/_app/immutable/')) {
					res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
				}
				// Aggressive caching for fonts (they rarely change)
				else if (filepath.match(/\.(woff2|woff|ttf|eot)$/)) {
					res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
				}
				// Medium-term caching for images
				else if (filepath.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) {
					res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
				}
			}
		})
	);

	// HTTP request logging with pino
	// Note: Create pino-http's own logger instance to avoid transport worker thread issues
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const pinoHttpOptions: any = {
		// Use base config without transport for compatibility
		level: baseConfig.level,
		timestamp: baseConfig.timestamp,
		base: baseConfig.base,
		redact: baseConfig.redact,
		serializers: baseConfig.serializers,

		// Custom log levels based on response status
		customLogLevel: (_req: Request, res: Response, err?: Error) => {
			if (res.statusCode >= 500 || err) return 'error';
			if (res.statusCode >= 400) return 'warn';
			if (res.statusCode >= 300) return 'silent'; // Don't log redirects
			return 'info';
		},

		// Apache-style message format inside JSON
		customSuccessMessage: (req: Request, res: Response) => {
			const responseTime = (res as Response & { responseTime?: number }).responseTime;
			const duration = responseTime !== undefined ? responseTime + 'ms' : '';
			return req.method + ' ' + req.url + ' ' + res.statusCode + (duration ? ' ' + duration : '');
		},

		customErrorMessage: (req: Request, res: Response, err: Error) => {
			const responseTime = (res as Response & { responseTime?: number }).responseTime;
			const duration = responseTime !== undefined ? responseTime + 'ms' : '';
			return (
				req.method +
				' ' +
				req.url +
				' ' +
				res.statusCode +
				(duration ? ' ' + duration : '') +
				' - ' +
				(err.message || 'Error')
			);
		},

		// Custom attribute keys for Railway filtering
		customAttributeKeys: {
			req: 'request',
			res: 'response',
			err: 'error',
			responseTime: 'duration_ms'
		},

		// Add custom properties to each log
		customProps: (req: Request) => {
			return {
				userAgent: req.headers['user-agent'],
				ip: req.ip || req.socket.remoteAddress
			};
		},

		// Skip logging for health checks and static assets
		autoLogging: {
			ignore: (req: Request) => {
				return (
					req.path === '/health' ||
					req.path === '/favicon.ico' ||
					req.path.startsWith('/_app/immutable/')
				);
			}
		}
	};

	// Add pino-pretty transport for development
	if (isDevelopment) {
		pinoHttpOptions.transport = {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'SYS:standard',
				ignore: 'pid,hostname',
				levelFirst: true
			}
		};
	}

	app.use(pinoHttp(pinoHttpOptions));

	if (env !== 'production') {
		app.use(errorHandler());
	}

	// Error handling
	app.use((err: ErrorWithStatus, req: Request, res: Response, _next: NextFunction) => {
		// Use pino logger if available, fallback to console
		const reqWithLog = req as Request & { log?: typeof logger };
		if (reqWithLog.log) {
			reqWithLog.log.error({ err }, 'Unhandled request error');
		} else {
			logger.error({ err }, 'Unhandled request error');
		}
		res.status(err.status || 500).send({
			message: 'Server error',
			error: {}
		});
	});
}
