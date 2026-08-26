import express from 'express';
import http from 'http';
import config from './config/environment/index.js';
import logger from './config/logger.js';
import configureExpress from './config/express.js';
import setupRoutes from './routes.js';

// Setup server
const app = express();
const server = http.createServer(app);

configureExpress(app);
setupRoutes(app);

// Start server with IPv6/IPv4 fallback
function startServer(): void {
	server.once('error', (err: NodeJS.ErrnoException) => {
		if (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL') {
			logger.warn({ err, attempted_ip: config.ip }, 'IPv6 not available - falling back to IPv4');
			config.ip = '0.0.0.0';
			server.listen(Number(config.port), config.ip, () => {
				logger.info(
					{ port: config.port, ip: config.ip, env: app.get('env') },
					'Express server started (IPv4 fallback)'
				);
			});
		} else {
			logger.fatal({ err }, 'Server failed to start');
			process.exit(1);
		}
	});

	server.listen(Number(config.port), config.ip, () => {
		logger.info(
			{
				port: config.port,
				ip: config.ip,
				env: app.get('env')
			},
			'Express server started'
		);
	});
}

startServer();

// Global error handlers
process.on('uncaughtException', (err: Error) => {
	logger.fatal({ err }, 'Uncaught exception - exiting');
	process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
	logger.error({ reason, promise }, 'Unhandled promise rejection');
});

// Graceful shutdown handler
function gracefulShutdown(signal: string): void {
	logger.info({ signal }, 'Shutdown signal received - closing HTTP server');

	server.close(() => {
		logger.info({ port: config.port }, 'HTTP server closed - exiting');
		process.exit(0);
	});

	// Force exit after 10 seconds if server doesn't close gracefully
	setTimeout(() => {
		logger.error('Could not close connections in time - forcing shutdown');
		process.exit(1);
	}, 10000);
}

// Listen for termination signals
process.on('SIGTERM', () => {
	gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
	gracefulShutdown('SIGINT');
});

// Expose app
export default app;
