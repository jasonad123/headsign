import path from 'path';

// Note: Environment variables are loaded via --env-file flag (Node 24+)
// or injected by the deployment platform (Railway, Docker, etc.)

// Check for Transit API key in production
// Note: API key is validated in validateEnvironment() below
// Server will start but API requests will fail with 401/403 if key is missing
if (process.env.NODE_ENV === 'production' && !process.env.TRANSIT_API_KEY) {
	console.warn(
		'WARNING: TRANSIT_API_KEY is not set. API requests will fail with authentication errors.'
	);
}

// Configuration validation helpers
// =================================

/**
 * Parses a boolean environment variable (case-insensitive)
 * SECURITY: Only use with trusted input (environment variables).
 * DO NOT use with user-supplied or external data without validation.
 */
export function parseBoolean(value: string | undefined): boolean {
	if (!value) return false;

	// Type guard: prevent prototype pollution attacks
	if (typeof value !== 'string') {
		console.warn('parseBoolean received non-string value:', typeof value);
		return false;
	}

	// Length guard: prevent DoS via large strings (boolean values should be short)
	if (value.length > 10) {
		console.warn('parseBoolean received excessively long value (length: ' + value.length + ')');
		return false;
	}

	const normalized = value.toLowerCase().trim();
	return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

type AllowedMaxDistance = 250 | 500 | 750 | 1000 | 1250 | 1500;

/**
 * Validates and returns a safe max distance value
 */
function validateMaxDistance(distance: number): AllowedMaxDistance {
	const allowed: AllowedMaxDistance[] = [250, 500, 750, 1000, 1250, 1500];
	if ((allowed as number[]).includes(distance)) {
		return distance as AllowedMaxDistance;
	}
	console.warn(
		'Invalid UNATTENDED_MAX_DISTANCE value: ' +
			distance +
			'. Must be one of: ' +
			allowed.join(', ') +
			'. Using default: 500'
	);
	return 500;
}

type AllowedTimeFormat = 'HH:mm' | 'hh:mm A' | 'hh:mm';

/**
 * Validates and returns a safe time format value
 */
function validateTimeFormat(format: string): AllowedTimeFormat {
	const allowed: AllowedTimeFormat[] = ['HH:mm', 'hh:mm A', 'hh:mm'];
	if ((allowed as string[]).includes(format)) {
		return format as AllowedTimeFormat;
	}
	console.warn(
		'Invalid UNATTENDED_TIME_FORMAT value: ' +
			format +
			'. Must be one of: ' +
			allowed.join(', ') +
			'. Using default: hh:mm A'
	);
	return 'hh:mm A';
}

type AllowedLanguage = 'en' | 'fr' | 'es' | 'de';

/**
 * Validates and returns a safe language code
 */
function validateLanguage(lang: string): AllowedLanguage {
	const allowed: AllowedLanguage[] = ['en', 'fr', 'es', 'de'];
	if ((allowed as string[]).includes(lang)) {
		return lang as AllowedLanguage;
	}
	console.warn(
		'Invalid UNATTENDED_LANGUAGE value: ' +
			lang +
			'. Must be one of: ' +
			allowed.join(', ') +
			'. Using default: en'
	);
	return 'en';
}

type AllowedViewMode = 'card' | 'board' | 'vertical';

/**
 * Validates and returns a safe view mode value
 */
function validateViewMode(viewMode: string): AllowedViewMode {
	const allowed: AllowedViewMode[] = ['card', 'board', 'vertical'];
	if ((allowed as string[]).includes(viewMode)) {
		return viewMode as AllowedViewMode;
	}
	console.warn(
		'Invalid UNATTENDED_VIEW_MODE value: ' +
			viewMode +
			'. Must be one of: ' +
			allowed.join(', ') +
			'. Using default: card'
	);
	return 'card';
}

type AllowedTheme = 'light' | 'dark' | 'auto';

/**
 * Validates and returns a safe theme value
 */
function validateTheme(theme: string): AllowedTheme {
	const allowed: AllowedTheme[] = ['light', 'dark', 'auto'];
	if ((allowed as string[]).includes(theme)) {
		return theme as AllowedTheme;
	}
	console.warn(
		'Invalid UNATTENDED_THEME value: ' +
			theme +
			'. Must be one of: ' +
			allowed.join(', ') +
			'. Using default: auto'
	);
	return 'auto';
}

type AllowedColumns = 'auto' | '1' | '2' | '3' | '4' | '5';

/**
 * Validates and returns a safe columns value
 */
function validateColumns(columns: string): AllowedColumns {
	const allowed: AllowedColumns[] = ['auto', '1', '2', '3', '4', '5'];
	if ((allowed as string[]).includes(columns)) {
		return columns as AllowedColumns;
	}
	console.warn(
		'Invalid UNATTENDED_COLUMNS value: ' +
			columns +
			'. Must be one of: ' +
			allowed.join(', ') +
			'. Using default: auto'
	);
	return 'auto';
}

/**
 * Validates location format (lat,lng)
 */
function validateLocation(location: string): string {
	if (!location) return '';

	const parts = location.split(',');
	if (parts.length !== 2) {
		console.warn(
			'Invalid UNATTENDED_LOCATION format: ' + location + '. Expected format: "latitude,longitude"'
		);
		return '';
	}

	const lat = parseFloat(parts[0]);
	const lng = parseFloat(parts[1]);

	if (isNaN(lat) || isNaN(lng)) {
		console.warn('Invalid UNATTENDED_LOCATION coordinates: ' + location);
		return '';
	}

	if (lat < -90 || lat > 90) {
		console.warn('Invalid latitude: ' + lat + '. Must be between -90 and 90');
		return '';
	}

	if (lng < -180 || lng > 180) {
		console.warn('Invalid longitude: ' + lng + '. Must be between -180 and 180');
		return '';
	}

	return location;
}

// Configuration type definition
export interface Config {
	root: string;
	port: number | string;
	ip: string;
	secrets: {
		session: string;
	};
	transitApiKey: string;
	requestTimeout: number;
	logLevel: string;
	cache: {
		realtimeTTL: number;
		staticTTL: number;
	};
	unattendedSetup: {
		enabled: boolean;
		location: string;
		title: string;
		timeFormat: AllowedTimeFormat;
		language: AllowedLanguage;
		theme: AllowedTheme;
		headerColor: string;
		columns: AllowedColumns;
		showQRCode: boolean;
		maxDistance: AllowedMaxDistance;
		customLogo: string | null;
		viewMode: AllowedViewMode;
		groupItinerariesByStop: boolean;
		filterRedundantTerminus: boolean;
		showRouteLongName: boolean;
	};
	security: {
		cors: {
			allowedOrigins: string[];
		};
	};
}

// All configurations will extend these options
// ============================================
const config: Config = {
	// Root path of server
	root: path.normalize(__dirname + '/../../..'),

	// Server port
	port: process.env.PORT || 8080,

	// Server IP - add explicit IPv6 support
	ip: process.env.IP || '::',

	// Secret for session, you will want to change this and make it an environment variable
	secrets: {
		session: process.env.SESSION_SECRET || 'transit-screen-secret'
	},

	// Transit API Key
	transitApiKey: process.env.TRANSIT_API_KEY || '',

	// API request timeout in milliseconds
	requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '') || 10000,

	// Logging configuration
	logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

	// Cache TTL configuration
	cache: {
		realtimeTTL: parseInt(process.env.REALTIME_CACHE_TTL || '') || 5000,
		staticTTL: parseInt(process.env.STATIC_CACHE_TTL || '') || 120000
	},

	// Unattended setup configuration
	unattendedSetup: {
		enabled: parseBoolean(process.env.UNATTENDED_SETUP),
		location: validateLocation(process.env.UNATTENDED_LOCATION || ''),
		title: process.env.UNATTENDED_TITLE || '',
		timeFormat: validateTimeFormat(process.env.UNATTENDED_TIME_FORMAT || 'HH:mm'),
		language: validateLanguage(process.env.UNATTENDED_LANGUAGE || 'en'),
		theme: validateTheme(process.env.UNATTENDED_THEME || 'auto'),
		headerColor: process.env.UNATTENDED_HEADER_COLOR || '#30b566',
		columns: validateColumns(process.env.UNATTENDED_COLUMNS || 'auto'),
		showQRCode: parseBoolean(process.env.UNATTENDED_SHOW_QR_CODE),
		maxDistance: validateMaxDistance(parseInt(process.env.UNATTENDED_MAX_DISTANCE || '') || 500),
		customLogo: process.env.UNATTENDED_CUSTOM_LOGO || null,
		viewMode: validateViewMode(process.env.UNATTENDED_VIEW_MODE || 'card'),
		groupItinerariesByStop: parseBoolean(process.env.UNATTENDED_GROUP_ITINERARIES),
		filterRedundantTerminus: parseBoolean(process.env.UNATTENDED_FILTER_TERMINUS),
		showRouteLongName: parseBoolean(process.env.UNATTENDED_SHOW_ROUTE_NAMES)
	},

	// Security settings
	security: {
		// CORS settings (development only - disabled in production)
		cors: {
			allowedOrigins: process.env.ALLOWED_ORIGINS
				? process.env.ALLOWED_ORIGINS.split(',')
				: ['http://localhost:5173', 'http://localhost:8080']
		}
	}
};

// Validate environment configuration on startup (non-breaking)
// Logs warnings but doesn't exit in development mode
function validateEnvironment(): void {
	const warnings: string[] = [];
	const errors: string[] = [];

	if (!process.env.NODE_ENV) {
		console.warn('NODE_ENV not set, defaulting to development');
		process.env.NODE_ENV = 'development';
	} else if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'development') {
		warnings.push('NODE_ENV should be "production" or "development", got: ' + process.env.NODE_ENV);
	}

	// Transit API key in production
	// Note: Changed from error to warning - server will start but API calls will fail with 401/403
	// Frontend has proper error handling to display auth errors to users
	if (process.env.NODE_ENV === 'production' && !process.env.TRANSIT_API_KEY) {
		warnings.push('TRANSIT_API_KEY is not set. API requests will fail with authentication errors.');
	}

	// Validate TRUST_PROXY if set
	if (process.env.TRUST_PROXY) {
		const validValues = ['true', '1', '2', '3'];
		if (!validValues.includes(process.env.TRUST_PROXY)) {
			warnings.push(
				'TRUST_PROXY should be "true" or a number (1-3), got: ' + process.env.TRUST_PROXY
			);
		}
	}

	// Validate REQUEST_TIMEOUT if set
	if (process.env.REQUEST_TIMEOUT) {
		const timeout = parseInt(process.env.REQUEST_TIMEOUT);
		if (isNaN(timeout) || timeout < 1000 || timeout > 60000) {
			warnings.push(
				'REQUEST_TIMEOUT should be between 1000-60000ms, got: ' + process.env.REQUEST_TIMEOUT
			);
		}
	}

	// Log warnings
	if (warnings.length > 0) {
		console.warn('Environment configuration warnings:');
		warnings.forEach((warning) => {
			console.warn('  ⚠ ' + warning);
		});
	}

	// Handle errors
	if (errors.length > 0) {
		console.error('Environment configuration errors:');
		errors.forEach((error) => {
			console.error('  ✗ ' + error);
		});

		if (process.env.NODE_ENV === 'production') {
			console.error('\nFailing fast in production mode due to configuration errors.');
			process.exit(1);
		} else {
			console.warn('\nContinuing in development mode despite errors (for testing).');
		}
	}
}

// Run validation on module load
validateEnvironment();

// Export configuration
export default config;
