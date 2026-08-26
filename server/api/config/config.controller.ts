import { Request, Response } from 'express';
import config from '../../config/environment/index.js';
import logger from '../../config/logger.js';

// Default coordinates (New York City)
const DEFAULT_COORDINATES = { latitude: 40.75426683398718, longitude: -73.98672703719805 };

interface Coordinates {
	latitude: number;
	longitude: number;
}

// Validate coordinate format (lat,lng)
function validateCoordinates(locationStr: string | undefined): Coordinates | false {
	if (!locationStr || typeof locationStr !== 'string') {
		return false;
	}

	const coords = locationStr.split(',');
	if (coords.length !== 2) {
		return false;
	}

	const lat = parseFloat(coords[0].trim());
	const lng = parseFloat(coords[1].trim());

	// Check if valid numbers and within valid ranges
	if (isNaN(lat) || isNaN(lng)) {
		return false;
	}

	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
		return false;
	}

	return { latitude: lat, longitude: lng };
}

// Get unattended setup configuration
export function getUnattendedConfig(req: Request, res: Response): Response {
	if (!config.unattendedSetup.enabled) {
		return res.status(404).json({
			error: 'Unattended setup is not enabled'
		});
	}

	// Use default coordinates if not provided (New York City)
	let coordinates = validateCoordinates(config.unattendedSetup.location);
	if (!coordinates) {
		// Log warning about falling back to default coordinates
		if (config.unattendedSetup.location) {
			logger.warn(
				{
					providedLocation: config.unattendedSetup.location,
					defaultLatitude: DEFAULT_COORDINATES.latitude,
					defaultLongitude: DEFAULT_COORDINATES.longitude
				},
				'Invalid UNATTENDED_LOCATION format. Falling back to default coordinates (New York City).'
			);
		} else {
			logger.warn(
				{
					defaultLatitude: DEFAULT_COORDINATES.latitude,
					defaultLongitude: DEFAULT_COORDINATES.longitude
				},
				'UNATTENDED_LOCATION not provided. Using default coordinates (New York City).'
			);
		}
		coordinates = DEFAULT_COORDINATES;
	}

	// All other values are pre-validated and defaulted by environment/index.js
	return res.json({
		enabled: true,
		latLng: coordinates,
		title: config.unattendedSetup.title,
		timeFormat: config.unattendedSetup.timeFormat,
		language: config.unattendedSetup.language,
		theme: config.unattendedSetup.theme,
		headerColor: config.unattendedSetup.headerColor,
		columns: config.unattendedSetup.columns,
		showQRCode: config.unattendedSetup.showQRCode,
		maxDistance: config.unattendedSetup.maxDistance,
		customLogo: config.unattendedSetup.customLogo,
		viewMode: config.unattendedSetup.viewMode,
		groupItinerariesByStop: config.unattendedSetup.groupItinerariesByStop,
		filterRedundantTerminus: config.unattendedSetup.filterRedundantTerminus,
		showRouteLongName: config.unattendedSetup.showRouteLongName
	});
}
