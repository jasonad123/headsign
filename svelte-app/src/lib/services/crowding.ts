import { writable } from 'svelte/store';
import type { Route, OccupancyStatus, CrowdingMap } from '#lib/services/nearby.js';
import { isHighPriorityMode } from '#lib/utils/sortingUtils.js';

export const crowdingStore = writable<CrowdingMap>(new Map());

const POLL_INTERVAL = 30000; // 30s
const STAGGER_DELAY = 500; // 500ms between sequential route fetches
const MOCK_CROWDING = import.meta.env.DEV && import.meta.env.VITE_MOCK_CROWDING === 'true';

let pollingId: ReturnType<typeof setInterval> | null = null;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns global_route_ids that have at least one real-time schedule item,
 * buses and other surface modes first (rail/subway feeds rarely carry occupancy).
 */
function getRealTimeRouteIds(routes: Route[]): string[] {
	const ids: string[] = [];
	const railIds: string[] = [];
	for (const route of routes) {
		if (!route.itineraries) continue;
		let hasRt = false;
		for (const it of route.itineraries) {
			if (hasRt) break;
			for (const item of it.schedule_items || []) {
				if (item.is_real_time) {
					hasRt = true;
					break;
				}
			}
		}
		if (hasRt) {
			(isHighPriorityMode(route.mode_name) ? railIds : ids).push(route.global_route_id);
		}
	}
	return ids.concat(railIds);
}

/**
 * Generate mock occupancy data from rt_trip_ids already in the routes.
 * Uses a stable hash so values don't flicker on each poll.
 */
function generateMockCrowding(routes: Route[]): CrowdingMap {
	const map: CrowdingMap = new Map();
	for (const route of routes) {
		if (!route.itineraries) continue;
		for (const it of route.itineraries) {
			for (const item of it.schedule_items || []) {
				if (item.rt_trip_id) {
					// Stable hash: sum char codes mod 3 -> 1, 2, or 3
					let hash = 0;
					for (let i = 0; i < item.rt_trip_id.length; i++) {
						hash += item.rt_trip_id.charCodeAt(i);
					}
					map.set(item.rt_trip_id, ((hash % 3) + 1) as OccupancyStatus);
				}
			}
		}
	}
	return map;
}

// Routes fetched per poll; the rest are rotated through on later polls to stay
// within the Transit API rate limit (shared with the nearby_routes polling).
const BATCH_SIZE = 2;

const EMPTY_SKIP_MS = 600000; // skip routes with no occupancy for 10 minutes

let occupancyCache: CrowdingMap = new Map();
let routeCursor = 0;
let emptyUntil = new Map<string, number>();
let pausedUntil = 0;
let refreshing = false;

function getTripIds(routes: Route[]): Set<string> {
	const ids = new Set<string>();
	for (const route of routes) {
		for (const it of route.itineraries || []) {
			for (const item of it.schedule_items || []) {
				if (item.rt_trip_id) ids.add(item.rt_trip_id);
			}
		}
	}
	return ids;
}

/**
 * Fetch occupancy for a rotating batch of real-time routes and merge it into
 * the store. Previously fetched data is kept (pruned to trips still shown).
 * Stops the batch on a 429. Fails silently -- crowding is best-effort.
 */
export async function refreshCrowding(routes: Route[]): Promise<void> {
	if (MOCK_CROWDING) {
		crowdingStore.set(generateMockCrowding(routes));
		return;
	}

	const now = Date.now();
	const allIds = getRealTimeRouteIds(routes);
	const routeIds = allIds.filter((id) => (emptyUntil.get(id) ?? 0) <= now);
	if (allIds.length === 0) {
		occupancyCache = new Map();
		emptyUntil = new Map();
		routeCursor = 0;
		crowdingStore.set(new Map());
		return;
	}

	if (now < pausedUntil || routeIds.length === 0) {
		crowdingStore.set(new Map(occupancyCache));
		return;
	}

	if (refreshing) return;
	refreshing = true;

	try {
		await fetchBatch(routes, routeIds);
	} finally {
		refreshing = false;
	}
}

async function fetchBatch(routes: Route[], routeIds: string[]): Promise<void> {
	const batchSize = Math.min(BATCH_SIZE, routeIds.length);
	const start = routeCursor % routeIds.length;

	for (let i = 0; i < batchSize; i++) {
		const routeId = routeIds[(start + i) % routeIds.length];
		try {
			const res = await fetch(`/api/vehicles?global_route_id=${encodeURIComponent(routeId)}`);
			if (res.status === 429) {
				const retryAfter = parseInt(res.headers.get('Retry-After') || '60');
				pausedUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 60) * 1000;
				break;
			}
			if (res.ok) {
				const data = await res.json();
				if (!data.occupancy || Object.keys(data.occupancy).length === 0) {
					emptyUntil.set(routeId, Date.now() + EMPTY_SKIP_MS);
				} else {
					for (const [tripId, status] of Object.entries(data.occupancy)) {
						occupancyCache.set(tripId, status as OccupancyStatus);
					}
				}
			}
		} catch {
			// Silent failure
		}
		routeCursor = start + i + 1;

		// Stagger between requests (skip after last)
		if (i < batchSize - 1) {
			await sleep(STAGGER_DELAY);
		}
	}

	const shown = getTripIds(routes);
	const pruned: CrowdingMap = new Map();
	for (const [tripId, status] of occupancyCache) {
		if (shown.has(tripId)) pruned.set(tripId, status);
	}
	occupancyCache = pruned;
	crowdingStore.set(new Map(pruned));
}

let currentRoutes: Route[] = [];

export function startCrowdingPolling(routes: Route[]): void {
	stopCrowdingPolling();
	currentRoutes = routes;
	refreshCrowding(currentRoutes);
	pollingId = setInterval(() => {
		refreshCrowding(currentRoutes);
	}, POLL_INTERVAL);
}

export function updateCrowdingRoutes(routes: Route[]): void {
	currentRoutes = routes;
}

export function stopCrowdingPolling(): void {
	if (pollingId) {
		clearInterval(pollingId);
		pollingId = null;
	}
}
