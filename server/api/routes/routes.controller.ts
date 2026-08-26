import { Request, Response } from 'express';
import type { Logger } from 'pino';
import { parseBoolean } from '../../config/environment/index.js';

interface RequestWithLog extends Request {
	log: Logger;
}

interface Stop {
	stop_lat: number;
	stop_lon: number;
	[key: string]: unknown;
}

interface ScheduleItem {
	is_real_time?: boolean;
	internal_itinerary_id?: string;
	[key: string]: unknown;
}

interface Itinerary {
	internal_itinerary_id?: string;
	closest_stop?: Stop;
	schedule_items?: ScheduleItem[];
	[key: string]: unknown;
}

interface MergedItinerary {
	closest_stop?: Stop;
	itineraries?: Itinerary[];
	schedule_items?: ScheduleItem[];
}

interface Route {
	merged_itineraries?: MergedItinerary[];
	itineraries?: Itinerary[];
	schedule_items?: ScheduleItem[];
	[key: string]: unknown;
}

interface V4Response {
	nearby_routes?: Route[];
}

interface V3Response {
	routes?: Route[];
}

interface CacheEntry {
	data: V3Response;
	expiresAt: number;
	freshness: 'fresh-realtime' | 'fresh-schedule';
}

interface FetchError extends Error {
	status?: number;
	retryAfter?: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371000; // Earth radius in meters
	const φ1 = (lat1 * Math.PI) / 180;
	const φ2 = (lat2 * Math.PI) / 180;
	const Δφ = ((lat2 - lat1) * Math.PI) / 180;
	const Δλ = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

/**
 * Transforms v4 API response to v3 format for frontend compatibility.
 * v4 wraps itineraries in merged_itineraries with additional nesting.
 * This function flattens it back to v3 structure while preserving stop information.
 */
function transformV4ToV3Format(v4Response: V4Response): V3Response {
	if (!v4Response || !v4Response.nearby_routes) {
		return v4Response as V3Response;
	}

	// Transform nearby_routes to routes format
	const routes = v4Response.nearby_routes.map((route) => {
		// Flatten merged_itineraries structure
		const flattenedRoute: Route = { ...route };
		delete flattenedRoute.merged_itineraries;

		// Combine all itineraries and schedule_items from merged_itineraries
		// Preserve closest_stop from merged_itinerary on each itinerary
		// Associate schedule_items with their itineraries using internal_itinerary_id
		const allItineraries: Itinerary[] = [];
		const allScheduleItems: ScheduleItem[] = [];
		const scheduleItemsByItineraryId: Record<string, ScheduleItem[]> = {};

		if (Array.isArray(route.merged_itineraries)) {
			// First pass: collect all schedule items grouped by internal_itinerary_id
			for (const merged of route.merged_itineraries) {
				if (Array.isArray(merged.schedule_items)) {
					for (const scheduleItem of merged.schedule_items) {
						const itineraryId = scheduleItem.internal_itinerary_id;
						if (itineraryId) {
							if (!scheduleItemsByItineraryId[itineraryId]) {
								scheduleItemsByItineraryId[itineraryId] = [];
							}
							// Remove internal_itinerary_id from schedule_item (v3 doesn't have it at item level)
							const { internal_itinerary_id: _removed, ...scheduleItemWithoutId } = scheduleItem;
							scheduleItemsByItineraryId[itineraryId].push(scheduleItemWithoutId);
						}
					}
					allScheduleItems.push(...merged.schedule_items);
				}
			}

			// Second pass: create itineraries with their associated schedule_items
			for (const merged of route.merged_itineraries) {
				if (Array.isArray(merged.itineraries)) {
					// Add closest_stop from merged_itinerary to each itinerary
					// Also add schedule_items that belong to this itinerary
					const itinerariesWithData = merged.itineraries.map((itinerary) => ({
						...itinerary,
						closest_stop: merged.closest_stop,
						schedule_items: scheduleItemsByItineraryId[itinerary.internal_itinerary_id || ''] || []
					}));
					allItineraries.push(...itinerariesWithData);
				}
			}
		}

		// Return route in v3 format
		return {
			...flattenedRoute,
			itineraries: allItineraries,
			schedule_items: allScheduleItems
		};
	});

	return { routes };
}

/**
 * Checks whether any route in the response has active alerts.
 * Used to assign a shorter cache TTL so new/resolved alerts are visible
 * within the next polling cycle instead of waiting up to 120s.
 * @param {Object} data - The API response data
 * @returns {boolean} - True if any route has at least one alert
 */
function hasActiveAlerts(data: unknown) {
	const routes = (data as Record<string, unknown>)?.routes;
	if (!Array.isArray(routes)) return false;
	return routes.some((route) => Array.isArray(route.alerts) && route.alerts.length > 0);
}

/**
 * Analyzes Transit API response to detect if it contains real-time predictions
 */
function hasRealTimeData(data: V3Response | unknown): boolean {
	if (!data || typeof data !== 'object') {
		return false;
	}

	// Check if response has routes array
	const dataObj = data as { routes?: Route[] };
	const routes = dataObj.routes || data;
	if (!Array.isArray(routes)) {
		return false;
	}

	// Traverse routes -> itineraries -> schedule_items to find real-time data
	for (const route of routes as Route[]) {
		if (route.itineraries && Array.isArray(route.itineraries)) {
			for (const itinerary of route.itineraries) {
				if (itinerary.schedule_items && Array.isArray(itinerary.schedule_items)) {
					// If ANY schedule item has is_real_time: true, this is real-time data
					if (itinerary.schedule_items.some((item) => item.is_real_time === true)) {
						return true;
					}
				}
			}
		}
	}

	// Default to false (schedule data) for safety
	return false;
}

// Server-side request cache (optional, enabled via ENABLE_SERVER_CACHE env var)
const CACHE_ENABLED = parseBoolean(process.env.ENABLE_SERVER_CACHE);
// Dual-TTL configuration: different cache times for real-time vs schedule data
const REALTIME_CACHE_TTL = parseInt(process.env.REALTIME_CACHE_TTL || '') || 5000; // 5s default (free tier safe)
const STATIC_CACHE_TTL = parseInt(process.env.STATIC_CACHE_TTL || '') || 120000; // 120s for schedule
const MAX_CACHE_SIZE = 100; // Bounded cache to prevent memory issues

/**
 * Get appropriate Cache-Control max-age based on data freshness
 */
function getCacheMaxAge(freshness: 'fresh-realtime' | 'fresh-schedule'): number {
	if (freshness === 'fresh-realtime') {
		// Match REALTIME_CACHE_TTL: 5s for free tier, 3s for paid tier
		return Math.floor(REALTIME_CACHE_TTL / 1000);
	}
	// 120 seconds for schedule data
	return Math.floor(STATIC_CACHE_TTL / 1000);
}

// In-memory cache storage
const requestCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<V3Response>>();

// Periodic cleanup of expired cache entries
let cleanupInterval: NodeJS.Timeout | null = null;
if (CACHE_ENABLED) {
	cleanupInterval = setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of requestCache.entries()) {
			if (now > entry.expiresAt) {
				requestCache.delete(key);
			}
		}
		// Enforce max cache size
		if (requestCache.size > MAX_CACHE_SIZE) {
			const entriesToDelete = requestCache.size - MAX_CACHE_SIZE;
			const keys = Array.from(requestCache.keys());
			for (let i = 0; i < entriesToDelete; i++) {
				requestCache.delete(keys[i]);
			}
		}
	}, 60000); // Cleanup every 60 seconds
}

// Export cleanup function for testing and graceful shutdown
export function cleanup(): void {
	if (cleanupInterval) {
		clearInterval(cleanupInterval);
		cleanupInterval = null;
	}
	requestCache.clear();
	pendingRequests.clear();
}

// Get list of nearby routes
export async function nearby(req: Request, res: Response): Promise<Response | void> {
	const reqWithLog = req as RequestWithLog;
	const { lat, lon, max_distance } = req.query;

	// Validate required parameters
	if (!lat || !lon) {
		return res.status(400).json({ error: 'Missing required parameters: lat and lon are required' });
	}

	// Parse max_distance as integer (query params are strings)
	// Transit API expects an integer, not a string
	const distance = max_distance ? parseInt(max_distance as string, 10) : 1000;

	// Validate that lat and lon are valid numbers
	if (isNaN(parseFloat(lat as string)) || isNaN(parseFloat(lon as string))) {
		return res.status(400).json({ error: 'Invalid parameters: lat and lon must be valid numbers' });
	}

	// Validate distance is a valid number
	if (isNaN(distance) || distance < 0) {
		return res.status(400).json({ error: 'Invalid max_distance parameter' });
	}

	// Round coordinates to 4 decimal places (~10.1m precision) for effective cache key grouping
	// This ensures nearby requests (GPS drift, manual pin drag) share the same cache
	const roundedLat = parseFloat(lat as string).toFixed(4);
	const roundedLon = parseFloat(lon as string).toFixed(4);

	// Cache key based on rounded coordinates
	const cacheKey = `${roundedLat},${roundedLon},${distance}`;

	// Check cache if enabled
	if (CACHE_ENABLED) {
		const cached = requestCache.get(cacheKey);
		if (cached && Date.now() < cached.expiresAt) {
			const maxAge = getCacheMaxAge(cached.freshness || 'fresh-schedule');
			res.set({
				'Cache-Control': `public, max-age=${maxAge}`,
				Vary: 'Accept-Encoding',
				'X-Cache': 'HIT',
				'X-Cache-Freshness': cached.freshness || 'unknown'
			});
			return res.status(200).json(cached.data);
		}

		// Check for in-flight request (deduplication)
		const pending = pendingRequests.get(cacheKey);
		if (pending) {
			try {
				const data = await Promise.race([
					pending,
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('In-flight request timeout')), 15000)
					)
				]);
				// Use conservative short TTL for in-flight (no freshness info yet)
				res.set({
					'Cache-Control': 'public, max-age=3',
					Vary: 'Accept-Encoding',
					'X-Cache': 'HIT-INFLIGHT'
				});
				return res.status(200).json(data);
			} catch {
				// Fall through to make new request if pending request failed
			}
		}
	}

	// Create promise for API request (for in-flight deduplication)
	const fetchPromise = (async (): Promise<V3Response> => {
		try {
			const response = await fetch(
				`https://external.transitapp.com/v4/public/nearby_routes?lat=${lat}&lon=${lon}&max_distance=${distance}&max_num_departures=6`,
				{
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
						apiKey: process.env.TRANSIT_API_KEY || ''
					},
					signal: AbortSignal.timeout(10000) // 10 second timeout
				}
			);

			if (!response.ok) {
				const body = await response.text();

				// Handle rate limiting with more detail
				if (response.status === 429) {
					const retryAfter = response.headers.get('Retry-After');
					reqWithLog.log.warn(
						{
							api: 'transit',
							endpoint: 'nearby_routes',
							status: 429,
							retryAfter: retryAfter || 'not specified',
							cacheKey
						},
						'Rate limited by Transit API'
					);

					const error = new Error('Rate limit exceeded') as FetchError;
					error.status = 429;
					error.retryAfter = retryAfter ? parseInt(retryAfter) : 60;
					throw error;
				}

				reqWithLog.log.error(
					{
						api: 'transit',
						endpoint: 'nearby_routes',
						status: response.status,
						body: body.substring(0, 500)
					},
					'Error response from Transit API'
				);
				const error = new Error('Transit API error') as FetchError;
				error.status = response.status;
				throw error;
			}

			const v4Data = (await response.json()) as V4Response;

			// Transform v4 response to v3 format for frontend compatibility
			const data = transformV4ToV3Format(v4Data);

			// Client-side filtering by distance
			// Transit API v4 doesn't properly filter by max_distance, so we do it here
			if (data.routes && Array.isArray(data.routes)) {
				data.routes = data.routes.filter((route) => {
					// Keep route if ANY of its stops are within max_distance
					return (
						route.itineraries &&
						route.itineraries.some((itinerary) => {
							if (!itinerary.closest_stop) return false;
							const dist = haversine(
								parseFloat(lat as string),
								parseFloat(lon as string),
								itinerary.closest_stop.stop_lat,
								itinerary.closest_stop.stop_lon
							);
							return dist <= distance;
						})
					);
				});
			}

			// Store in cache if enabled
			if (CACHE_ENABLED) {
				// Responses with active alerts also use the short TTL so new/resolved
				// alerts surface on the next poll instead of waiting up to 120s.
				const isRealTime = hasRealTimeData(data);
				const cacheTTL =
					isRealTime || hasActiveAlerts(data) ? REALTIME_CACHE_TTL : STATIC_CACHE_TTL;
				const freshness = isRealTime ? 'fresh-realtime' : 'fresh-schedule';

				requestCache.set(cacheKey, {
					data,
					expiresAt: Date.now() + cacheTTL,
					freshness
				});
			}

			return data;
		} finally {
			// Remove from pending requests
			if (CACHE_ENABLED) {
				pendingRequests.delete(cacheKey);
			}
		}
	})();

	// Store pending request for deduplication
	if (CACHE_ENABLED) {
		pendingRequests.set(cacheKey, fetchPromise);
	}

	try {
		const data = await fetchPromise;

		// Analyze response to set freshness header
		const isRealTime = hasRealTimeData(data);
		const freshness = isRealTime ? 'fresh-realtime' : 'fresh-schedule';
		const maxAge = getCacheMaxAge(freshness);

		res.set({
			'Cache-Control': `public, max-age=${maxAge}`,
			Vary: 'Accept-Encoding',
			'X-Cache': CACHE_ENABLED ? 'MISS' : 'DISABLED',
			'X-Cache-Freshness': freshness
		});

		res.status(200).json(data);
	} catch (err) {
		const error = err as FetchError;
		reqWithLog.log.error(
			{
				api: 'transit',
				endpoint: 'nearby_routes',
				err: error,
				cacheKey
			},
			'Error fetching nearby routes'
		);

		if (error.name === 'TimeoutError' || error.name === 'AbortError') {
			return res.status(504).json({
				error: 'Request timeout',
				message: 'Transit API did not respond in time. Please try again.'
			});
		}

		if (error.status === 429) {
			return res.status(429).json({
				error: 'Rate limit exceeded',
				retryAfter: error.retryAfter || 60,
				message: 'Too many requests. Please try again later.'
			});
		}

		if (error.status === 401 || error.status === 403) {
			return res.status(error.status).json({
				error: 'Authentication error',
				message: 'Invalid or missing Transit API key. Please check server configuration.'
			});
		}

		if (error.status) {
			return res.status(error.status).json({ error: 'Transit API error' });
		}

		return res.status(500).json({ error: 'Failed to fetch nearby routes' });
	}
}
