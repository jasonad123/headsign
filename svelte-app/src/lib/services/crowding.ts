import { writable } from 'svelte/store';
import type { Route, OccupancyStatus, CrowdingMap } from '$lib/services/nearby';

export const crowdingStore = writable<CrowdingMap>(new Map());

const POLL_INTERVAL = 30000; // 30s
const STAGGER_DELAY = 500; // 500ms between sequential route fetches

let pollingId: ReturnType<typeof setInterval> | null = null;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns global_route_ids that have at least one real-time schedule item.
 */
function getRealTimeRouteIds(routes: Route[]): string[] {
	const ids: string[] = [];
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
			ids.push(route.global_route_id);
		}
	}
	return ids;
}

/**
 * Fetch occupancy data for each real-time route and merge into the store.
 * Fails silently -- crowding is best-effort.
 */
export async function refreshCrowding(routes: Route[]): Promise<void> {
	const routeIds = getRealTimeRouteIds(routes);
	if (routeIds.length === 0) {
		crowdingStore.set(new Map());
		return;
	}

	const merged: CrowdingMap = new Map();

	for (let i = 0; i < routeIds.length; i++) {
		try {
			const res = await fetch(`/api/vehicles?global_route_id=${encodeURIComponent(routeIds[i])}`);
			if (res.ok) {
				const data = await res.json();
				if (data.occupancy) {
					for (const [tripId, status] of Object.entries(data.occupancy)) {
						merged.set(tripId, status as OccupancyStatus);
					}
				}
			}
		} catch {
			// Silent failure
		}

		// Stagger between requests (skip after last)
		if (i < routeIds.length - 1) {
			await sleep(STAGGER_DELAY);
		}
	}

	crowdingStore.set(merged);
}

let currentRoutes: Route[] = [];

export function startCrowdingPolling(routes: Route[]): void {
	stopCrowdingPolling();
	currentRoutes = routes;
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
