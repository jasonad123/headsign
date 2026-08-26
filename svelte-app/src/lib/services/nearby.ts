import { get } from 'svelte/store';
import { apiCache } from '$lib/utils/apiCache';
import { config } from '$lib/stores/config';
import { mergeItineraries } from '$lib/utils/itineraryUtils';

export interface Route {
	global_route_id: string;
	route_short_name?: string;
	route_long_name?: string;
	mode_name?: string;
	route_color: string;
	route_text_color: string;
	route_display_short_name?: {
		elements: string[];
		route_name_redundancy?: boolean;
		boxed_text?: string;
	};
	compact_display_short_name?: {
		elements: string[];
		route_name_redundancy?: boolean;
		boxed_text?: string;
	};
	sorting_key?: string;
	tts_short_name?: string;
	branch_code?: string;
	route_network_name?: string;
	itineraries?: Itinerary[];
	alerts?: Alert[];
}

export interface Itinerary {
	closest_stop?: {
		stop_name: string;
		global_stop_id?: string;
		stop_lat?: number;
		stop_lon?: number;
		parent_station?: {
			global_stop_id?: string;
		};
		parent_station_global_stop_id?: string;
	};
	merged_headsign?: string;
	direction_id?: number;
	direction_headsign?: string;
	variant_id?: string;
	canonical_itinerary?: boolean;
	branch_code?: string;
	internal_itinerary_id?: string;
	schedule_items?: ScheduleItem[];
}

export interface ScheduleItem {
	departure_time: number;
	is_real_time?: boolean;
	is_cancelled?: boolean;
	trip_search_key?: string;
	rt_trip_id?: string;
	is_last?: boolean;
}

export type OccupancyStatus = 1 | 2 | 3;
export type CrowdingMap = Map<string, OccupancyStatus>;

export interface InformedEntity {
	global_route_id?: string;
	global_stop_id?: string;
	rt_trip_id?: string;
}

export interface Alert {
	effect: string;
	severity: string;
	title?: string;
	description: string;
	created_at: number;
	informed_entities: InformedEntity[];
}

export interface LatLng {
	latitude: number;
	longitude: number;
}

export interface RateLimitError extends Error {
	retryAfter?: number;
	isRateLimit: true;
}

export interface AuthenticationError extends Error {
	isAuthError: true;
}

export interface TimeoutError extends Error {
	isTimeout: true;
}

export interface BackendError extends Error {
	isBackendError: true;
}

export type ApiError = RateLimitError | AuthenticationError | TimeoutError | BackendError;

export async function findNearbyRoutes(location: LatLng, radius: number): Promise<Route[]> {
	const params = {
		lat: location.latitude.toString(),
		lon: location.longitude.toString(),
		max_distance: radius.toString()
	};

	return apiCache
		.fetch(
			'/api/routes/nearby',
			params,
			async () => {
				const urlParams = new URLSearchParams(params);
				const response = await fetch(`/api/routes/nearby?${urlParams}`);

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));

					// Handle rate limiting
					if (response.status === 429) {
						const retryAfter = errorData.retryAfter || 60;

						const error = new Error(
							errorData.message || 'Rate limit exceeded. Please try again later.'
						) as RateLimitError;
						error.retryAfter = retryAfter;
						error.isRateLimit = true;

						throw error;
					}

					// Handle authentication errors
					if (response.status === 401 || response.status === 403) {
						const error = new Error(
							'Authentication failed. Please check API credentials.'
						) as AuthenticationError;
						error.isAuthError = true;

						throw error;
					}

					// Handle timeout errors
					if (response.status === 504) {
						const error = new Error('Request timed out. Please try again.') as TimeoutError;
						error.isTimeout = true;

						throw error;
					}

					// Handle backend unavailable
					if (response.status === 503) {
						const error = new Error(
							'Service temporarily unavailable. Please try again.'
						) as BackendError;
						error.isBackendError = true;

						throw error;
					}

					// Generic error for other status codes
					throw new Error(errorData.message || errorData.error || 'Failed to fetch nearby routes');
				}

				const data = await response.json();
				return data.routes || [];
			}
			// Let cache determine TTL based on real-time vs schedule data (3s vs 120s)
		)
		.then((routes) => {
			// Merge itineraries with same direction_id and merged_headsign
			// v4 API returns separate itineraries for variants, even when they serve the same destination
			// (e.g., two different routes both going to Ashburn). Merging combines their schedule_items.
			return routes.map((route: Route) => ({
				...route,
				itineraries: route.itineraries ? mergeItineraries(route.itineraries) : undefined
			}));
		})
		.then((routes) => {
			// Filter out itineraries with no shown departures
			// Prevents displaying commuter route directions with no active trips (e.g., morning-only routes in PM)
			return routes.map((route: Route) => ({
				...route,
				itineraries: route.itineraries?.filter((itinerary) => hasShownDeparture(route, itinerary))
			}));
		})
		.then((routes) => applyFilters(routes));
}

// Helper function to check if an itinerary is a redundant terminus
function isRedundantTerminus(itinerary: Itinerary): boolean {
	if (!itinerary.closest_stop || !itinerary.merged_headsign) {
		return false;
	}

	const stopName = itinerary.closest_stop.stop_name.toLowerCase().trim();
	const destination = itinerary.merged_headsign.toLowerCase().trim();
	const coreStopName = stopName.replace(/\s+station$/i, '').trim();
	const destinationPattern = new RegExp(`^(\\w+\\s+to\\s+)?${coreStopName}(\\s+station)?$`, 'i');

	return destinationPattern.test(destination);
}

// Apply filters based on current config (called after cache retrieval)
function applyFilters(routes: Route[]): Route[] {
	const seen = new Set<string>();
	const result: Route[] = [];

	// Get current config value for terminus filtering
	const currentConfig = get(config);
	const shouldFilterTerminus = currentConfig.filterRedundantTerminus;

	for (const route of routes) {
		const idStr = route.global_route_id.toString();
		if (!seen.has(idStr)) {
			seen.add(idStr);

			// Clone route to avoid mutating cached data
			const routeCopy = {
				...route,
				itineraries: route.itineraries ? [...route.itineraries] : undefined
			};

			// Filter redundant terminus entries if enabled
			if (shouldFilterTerminus && routeCopy.itineraries && Array.isArray(routeCopy.itineraries)) {
				routeCopy.itineraries = routeCopy.itineraries.filter(
					(itinerary) => !isRedundantTerminus(itinerary)
				);
			}

			// Only include routes that have at least one itinerary
			// Prevents showing route headers with no directions (e.g., commuter routes with all trips filtered)
			if (routeCopy.itineraries && routeCopy.itineraries.length > 0) {
				result.push(routeCopy);
			}
		}
	}

	return result;
}

export function hasShownDeparture(route: Route, itinerary?: Itinerary): boolean {
	if (!route) return false;

	if (itinerary) {
		if (!itinerary.schedule_items?.length) return false;

		for (const item of itinerary.schedule_items) {
			if (shouldShowDeparture(item.departure_time)) {
				return true;
			}
		}
	} else {
		if (!route.itineraries?.length) return false;

		for (const itin of route.itineraries) {
			if (hasShownDeparture(route, itin)) {
				return true;
			}
		}
	}

	return false;
}

export function shouldShowDeparture(departure: number): boolean {
	const diff = departure * 1000 - Date.now();
	return diff > 0 && diff <= 130 * 60000;
}

const stopIdCache = new WeakMap<Route[], Set<string>>();

export function extractGlobalStopIds(routes: Route[]): Set<string> {
	const cached = stopIdCache.get(routes);
	if (cached) return cached;

	const stopIds = new Set<string>();

	for (const route of routes) {
		const itineraries = route.itineraries;
		if (!itineraries) continue;

		for (const itinerary of itineraries) {
			const stopId = itinerary.closest_stop?.global_stop_id;
			if (stopId) {
				stopIds.add(stopId);
			}
		}
	}

	stopIdCache.set(routes, stopIds);
	return stopIds;
}
