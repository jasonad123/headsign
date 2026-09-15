'use strict';

var path = require('path');

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
 * @param {string} value - The environment variable value
 * @returns {boolean} - true if value is truthy, false otherwise
 */
function parseBoolean(value) {
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

	var normalized = value.toLowerCase().trim();
	return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

/**
 * Validates and returns a safe max distance value
 * @param {number} distance - The distance to validate
 * @returns {number} - Valid distance or default (500)
 */
function validateMaxDistance(distance) {
	var allowed = [250, 500, 750, 1000, 1250, 1500];
	if (allowed.includes(distance)) {
		return distance;
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

/**
 * Validates and returns a safe time format value
 * @param {string} format - The time format to validate
 * @returns {string} - Valid format or default (hh:mm A)
 */
function validateTimeFormat(format) {
	var allowed = ['HH:mm', 'hh:mm A', 'hh:mm'];
	if (allowed.includes(format)) {
		return format;
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

/**
 * Validates and returns a safe language code
 * @param {string} lang - The language code to validate
 * @returns {string} - Valid language or default (en)
 */
function validateLanguage(lang) {
	var allowed = ['en', 'fr', 'es', 'de'];
	if (allowed.includes(lang)) {
		return lang;
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

/**
 * Validates and returns a safe theme value
 * @param {string} theme - The theme to validate
 * @returns {string} - Valid theme or default (auto)
 */
function validateTheme(theme) {
	var allowed = ['light', 'dark', 'auto'];
	if (allowed.includes(theme)) {
		return theme;
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

/**
 * Validates and returns a safe columns value
 * @param {string} columns - The columns value to validate
 * @returns {string} - Valid columns or default (auto)
 */
function validateColumns(columns) {
	var allowed = ['auto', '1', '2', '3', '4', '5'];
	if (allowed.includes(columns)) {
		return columns;
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
 * Validates and returns a safe view mode value
 * @param {string} viewMode - The view mode to validate
 * @returns {string} - Valid view mode or default (card)
 */
function validateViewMode(viewMode) {
	var allowed = ['card', 'board', 'vertical'];
	if (allowed.includes(viewMode)) {
		return viewMode;
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

/**
 * Resolves the header color env var, supporting both US and UK spellings
 * (UNATTENDED_HEADER_COLOR and UNATTENDED_HEADER_COLOUR). If both are set
 * to different values, UNATTENDED_HEADER_COLOR takes precedence.
 * @returns {string} - Raw header color value from environment, or default (#30b566)
 */
function resolveHeaderColorEnv() {
	var colorValue = process.env.UNATTENDED_HEADER_COLOR;
	var colourValue = process.env.UNATTENDED_HEADER_COLOUR;
	if (colorValue && colourValue && colorValue !== colourValue) {
		console.warn(
			'Both UNATTENDED_HEADER_COLOR and UNATTENDED_HEADER_COLOUR are set with different values. Using UNATTENDED_HEADER_COLOR: ' +
				colorValue
		);
	}
	return colorValue || colourValue || '#30b566';
}

/**
 * Validates and returns a safe header color hex value
 * @param {string} color - The hex color to validate
 * @returns {string} - Valid hex color or default (#30b566)
 */
function validateHeaderColor(color) {
	var hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
	if (hexPattern.test(color)) {
		return color;
	}
	console.warn(
		'Invalid UNATTENDED_HEADER_COLOR/UNATTENDED_HEADER_COLOUR value: ' +
			color +
			'. Expected a hex color in "#RRGGBB" or "#RGB" format. Using default: #30b566'
	);
	return '#30b566';
}

/**
 * Validates location format (lat,lng)
 * @param {string} location - The location string to validate
 * @returns {string} - Original location or empty string if invalid
 */
function validateLocation(location) {
	if (!location) return '';

	var parts = location.split(',');
	if (parts.length !== 2) {
		console.warn(
			'Invalid UNATTENDED_LOCATION format: ' + location + '. Expected format: "latitude,longitude"'
		);
		return '';
	}

	var lat = parseFloat(parts[0]);
	var lng = parseFloat(parts[1]);

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

// All configurations will extend these options
// ============================================
var all = {
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
	requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 10000,

	// Logging configuration
	logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

	// Cache TTL configuration
	cache: {
		realtimeTTL: parseInt(process.env.REALTIME_CACHE_TTL) || 5000,
		staticTTL: parseInt(process.env.STATIC_CACHE_TTL) || 120000
	},

	// Unattended setup configuration
	unattendedSetup: {
		enabled: parseBoolean(process.env.UNATTENDED_SETUP),
		location: validateLocation(process.env.UNATTENDED_LOCATION || ''),
		title: process.env.UNATTENDED_TITLE || '',
		timeFormat: validateTimeFormat(process.env.UNATTENDED_TIME_FORMAT || 'HH:mm'),
		language: validateLanguage(process.env.UNATTENDED_LANGUAGE || 'en'),
		theme: validateTheme(process.env.UNATTENDED_THEME || 'auto'),
		headerColor: validateHeaderColor(resolveHeaderColorEnv()),
		columns: validateColumns(process.env.UNATTENDED_COLUMNS || 'auto'),
		viewMode: validateViewMode(process.env.UNATTENDED_VIEW_MODE || 'card'),
		showQRCode: parseBoolean(process.env.UNATTENDED_SHOW_QR_CODE),
		maxDistance: validateMaxDistance(parseInt(process.env.UNATTENDED_MAX_DISTANCE) || 500),
		customLogo: process.env.UNATTENDED_CUSTOM_LOGO || null,
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
function validateEnvironment() {
	var warnings = [];
	var errors = [];

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
		var validValues = ['true', '1', '2', '3'];
		if (!validValues.includes(process.env.TRUST_PROXY)) {
			warnings.push(
				'TRUST_PROXY should be "true" or a number (1-3), got: ' + process.env.TRUST_PROXY
			);
		}
	}

	// Validate REQUEST_TIMEOUT if set
	if (process.env.REQUEST_TIMEOUT) {
		var timeout = parseInt(process.env.REQUEST_TIMEOUT);
		if (isNaN(timeout) || timeout < 1000 || timeout > 60000) {
			warnings.push(
				'REQUEST_TIMEOUT should be between 1000-60000ms, got: ' + process.env.REQUEST_TIMEOUT
			);
		}
	}

	// Log warnings
	if (warnings.length > 0) {
		console.warn('Environment configuration warnings:');
		warnings.forEach(function (warning) {
			console.warn('  ⚠ ' + warning);
		});
	}

	// Handle errors
	if (errors.length > 0) {
		console.error('Environment configuration errors:');
		errors.forEach(function (error) {
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

// Export configuration and parseBoolean helper for reuse
module.exports = all;
module.exports.parseBoolean = parseBoolean;
