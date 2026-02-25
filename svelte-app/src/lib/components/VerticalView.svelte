<script lang="ts">
	import { onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import RouteIcon from './RouteIcon.svelte';
	import type { Route, Itinerary, ScheduleItem, CrowdingMap } from '$lib/services/nearby';
	import CrowdingIcon from './CrowdingIcon.svelte';
	import { getMinutesUntil } from '$lib/utils/timeUtils';
	import { shouldShowDeparture } from '$lib/utils/departureFilters';
	import { parseAlertContent, extractImageId } from '$lib/services/alerts';
	import { config } from '$lib/stores/config';
	import {
		isHighPriorityMode,
		haversineDistance,
		mergeProximateStopGroups,
		PRIORITY_MODE_ELEVATION_METERS
	} from '$lib/utils/sortingUtils';
	import QRCode from '$lib/components/QRCode.svelte';

	let {
		routes,
		stopOrder = [],
		showLongName = false,
		showQRCode = false,
		crowdingMap,
		onMoveStop,
		onMoveStopToTop,
		onHideRoute,
		onHideStop
	}: {
		routes: Route[];
		stopOrder?: string[];
		showLongName?: boolean;
		showQRCode?: boolean;
		crowdingMap?: CrowdingMap;
		onMoveStop?: (stopId: string, direction: 'up' | 'down') => void;
		onMoveStopToTop?: (stopId: string) => void;
		onHideRoute?: (routeId: string) => void;
		onHideStop?: (stopId: string) => void;
	} = $props();

	interface DepartureRow {
		route: Route;
		itinerary: Itinerary;
		departures: ScheduleItem[];
		nextDeparture: number;
		alertSeverity: 'none' | 'info' | 'warning' | 'severe';
		alertIcon: string;
	}

	interface StopGroup {
		stopId: string;
		stopName: string;
		rows: DepartureRow[];
		distance: number;
	}

	let isDarkMode = $state(false);
	let themeObserver: MutationObserver | null = null;

	if (typeof document !== 'undefined') {
		isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

		themeObserver = new MutationObserver(() => {
			isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
	}

	// Overflow detection for stock-ticker scrolling on destinations (reuses RouteItem pattern)
	let destinationElements: Map<string, HTMLElement> = new Map();
	let overflowingDestinations = $state<Set<string>>(new Set());
	let overflowObserver: ResizeObserver | null = null;

	function getOverflowObserver() {
		if (!overflowObserver) {
			overflowObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const el = entry.target as HTMLElement;
					const destKey = el.dataset.destKey;
					if (destKey != null) {
						const isOverflowing = el.scrollWidth > el.offsetWidth;
						const newSet = new Set(overflowingDestinations);
						if (isOverflowing) newSet.add(destKey);
						else newSet.delete(destKey);
						overflowingDestinations = newSet;
					}
				}
			});
		}
		return overflowObserver;
	}

	function bindDestinationElement(node: HTMLElement, key: string) {
		node.dataset.destKey = key;
		destinationElements.set(key, node);
		getOverflowObserver().observe(node);
		setTimeout(() => {
			const isOverflowing = node.scrollWidth > node.offsetWidth;
			const newSet = new Set(overflowingDestinations);
			if (isOverflowing) newSet.add(key);
			else newSet.delete(key);
			overflowingDestinations = newSet;
		}, 150);
		return {
			destroy() {
				destinationElements.delete(key);
				overflowObserver?.unobserve(node);
			}
		};
	}

	onDestroy(() => {
		if (themeObserver) {
			themeObserver.disconnect();
			themeObserver = null;
		}
		if (overflowObserver) {
			overflowObserver.disconnect();
			overflowObserver = null;
		}
		destinationElements.clear();
		overflowingDestinations = new Set();
	});

	function formatDistance(meters: number): string {
		if (!isFinite(meters)) return '';
		if (meters < 1000) return `${Math.round(meters)}m`;
		return `${(meters / 1000).toFixed(1)}km`;
	}

	// Cross-route stop grouping
	let stopGroups = $derived.by(() => {
		const groups = new Map<string, StopGroup>();

		for (const route of routes) {
			if (!route.itineraries) continue;

			// Compute per-route alert severity using same logic as ListView
			let alertSeverity: 'none' | 'info' | 'warning' | 'severe' = 'none';
			let alertIcon = '';
			if (route.alerts?.length) {
				if (route.alerts.some((a) => (a.severity || 'Info').toLowerCase() === 'severe')) {
					alertSeverity = 'severe';
					alertIcon = 'ix:warning-octagon-filled';
				} else if (route.alerts.some((a) => (a.severity || 'Info').toLowerCase() === 'warning')) {
					alertSeverity = 'warning';
					alertIcon = 'ix:warning-filled';
				} else {
					alertSeverity = 'info';
					alertIcon = 'ix:about-filled';
				}
			}

			for (const itinerary of route.itineraries) {
				const stopId =
					itinerary.closest_stop?.parent_station_global_stop_id ||
					itinerary.closest_stop?.global_stop_id ||
					'unknown';
				const stopName = itinerary.closest_stop?.stop_name || 'Unknown stop';

				if (!groups.has(stopId)) {
					groups.set(stopId, {
						stopId,
						stopName,
						rows: [],
						distance: Infinity
					});
				}

				const filteredDepartures =
					itinerary.schedule_items?.filter(shouldShowDeparture).slice(0, 3) || [];

				if (filteredDepartures.length === 0) continue;

				const nextDep = filteredDepartures[0]?.departure_time ?? Infinity;

				groups.get(stopId)!.rows.push({
					route,
					itinerary,
					departures: filteredDepartures,
					nextDeparture: nextDep,
					alertSeverity,
					alertIcon
				});
			}
		}

		// Merge groups whose stops are within 50m (handles co-located stops without shared parent stations)
		const mergedGroups = mergeProximateStopGroups<StopGroup>(groups, stopOrder);

		// Sort rows within each group: route → direction → departure
		for (const group of mergedGroups.values()) {
			group.rows.sort((a, b) => {
				if (a.route.global_route_id !== b.route.global_route_id) {
					return a.route.global_route_id.localeCompare(b.route.global_route_id);
				}
				const aDirId = a.itinerary.direction_id ?? 0;
				const bDirId = b.itinerary.direction_id ?? 0;
				if (aDirId !== bDirId) return aDirId - bDirId;
				return a.nextDeparture - b.nextDeparture;
			});
		}

		// Sort groups: stopOrder overrides → high-priority mode → distance → stop ID
		const userLat = $config.latLng.latitude;
		const userLon = $config.latLng.longitude;
		const getStopDist = (group: StopGroup) => {
			const stop = group.rows[0]?.itinerary.closest_stop;
			if (stop?.stop_lat != null && stop?.stop_lon != null) {
				return haversineDistance(userLat, userLon, stop.stop_lat, stop.stop_lon);
			}
			return Infinity;
		};

		const sorted = Array.from(mergedGroups.values()).filter((g) => g.rows.length > 0);

		// Pre-compute distances for sorting and display
		for (const group of sorted) {
			group.distance = getStopDist(group);
		}

		return sorted.sort((a, b) => {
			const aIdx = stopOrder.indexOf(a.stopId);
			const bIdx = stopOrder.indexOf(b.stopId);
			if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
			if (aIdx !== -1) return -1;
			if (bIdx !== -1) return 1;
			const aHigh =
				a.rows.some((r) => isHighPriorityMode(r.route.mode_name)) &&
				a.distance <= PRIORITY_MODE_ELEVATION_METERS;
			const bHigh =
				b.rows.some((r) => isHighPriorityMode(r.route.mode_name)) &&
				b.distance <= PRIORITY_MODE_ELEVATION_METERS;
			if (aHigh !== bHigh) return aHigh ? -1 : 1;
			if (a.distance !== b.distance) return a.distance - b.distance;
			return a.stopId.localeCompare(b.stopId);
		});
	});

	// Consolidated alerts from all routes, deduplicated, with route attribution
	let consolidatedAlerts = $derived.by(() => {
		const alertMap = new Map<string, { alert: any; routeNames: string[] }>();

		for (const route of routes) {
			if (!route.alerts) continue;
			const routeName = route.route_short_name || route.route_long_name || route.global_route_id;
			for (const alert of route.alerts) {
				const key = `${alert.title || ''}::${alert.description || ''}`;
				if (!alertMap.has(key)) {
					alertMap.set(key, { alert, routeNames: [routeName] });
				} else {
					const entry = alertMap.get(key)!;
					if (!entry.routeNames.includes(routeName)) {
						entry.routeNames.push(routeName);
					}
				}
			}
		}

		return Array.from(alertMap.values());
	});

	let alertText = $derived.by(() => {
		if (!consolidatedAlerts.length) return '';

		return consolidatedAlerts
			.map(({ alert, routeNames }) => {
				const routeLabel = routeNames.join(', ');
				const hasTitle = alert.title && alert.title.trim().length > 0;
				const hasDescription = alert.description && alert.description.trim().length > 0;

				const prefix = `[${routeLabel}] `;

				if (hasTitle && hasDescription) {
					return `${prefix}${alert.title}\n\n${alert.description}`;
				} else if (hasTitle) {
					return `${prefix}${alert.title}`;
				} else if (hasDescription) {
					return `${prefix}${alert.description}`;
				} else {
					return `${prefix}${$_('alerts.default')}`;
				}
			})
			.join('\n\n---\n\n');
	});

	let mostSevereLevel = $derived.by(() => {
		if (!consolidatedAlerts.length) return 'info';
		if (consolidatedAlerts.some((a) => (a.alert.severity || 'Info').toLowerCase() === 'severe'))
			return 'severe';
		if (consolidatedAlerts.some((a) => (a.alert.severity || 'Info').toLowerCase() === 'warning'))
			return 'warning';
		return 'info';
	});

	let mostSevereIcon = $derived.by(() => {
		if (mostSevereLevel === 'severe') return 'ix:warning-octagon-filled';
		if (mostSevereLevel === 'warning') return 'ix:warning-filled';
		return 'ix:about-filled';
	});
</script>

<div class="vertical-view" class:dark={isDarkMode}>
	<!-- Scrollable routes area -->
	<div class="routes-scroll" class:has-alerts={consolidatedAlerts.length > 0}>
		{#each stopGroups as group, groupIndex (group.stopId)}
			<div class="stop-group">
				<div class="stop-header">
					<span class="stop-name">{group.stopName}</span>
					{#if isFinite(group.distance)}
						<span class="stop-distance"
							>{$_('stops.distance.away', {
								values: { distance: formatDistance(group.distance) }
							})}</span
						>
					{/if}
					{#if onMoveStop || onMoveStopToTop || onHideStop}
						<div class="stop-controls">
							{#if groupIndex > 0 && onMoveStopToTop}
								<button
									type="button"
									class="btn-stop-control"
									onclick={() => onMoveStopToTop(group.stopId)}
									title={$_('routes.controls.moveStopToTop')}
								>
									<iconify-icon icon="ix:double-chevron-up"></iconify-icon>
								</button>
							{/if}
							{#if groupIndex > 0 && onMoveStop}
								<button
									type="button"
									class="btn-stop-control"
									onclick={() => onMoveStop(group.stopId, 'up')}
									title={$_('routes.controls.moveStopUp')}
								>
									<iconify-icon icon="ix:arrow-up"></iconify-icon>
								</button>
							{/if}
							{#if groupIndex < stopGroups.length - 1 && onMoveStop}
								<button
									type="button"
									class="btn-stop-control"
									onclick={() => onMoveStop(group.stopId, 'down')}
									title={$_('routes.controls.moveStopDown')}
								>
									<iconify-icon icon="ix:arrow-down"></iconify-icon>
								</button>
							{/if}
							{#if onHideStop}
								<button
									type="button"
									class="btn-stop-control"
									onclick={() => onHideStop(group.stopId)}
									title={$_('routes.controls.hideStop')}
								>
									<iconify-icon icon="ix:eye-cancelled-filled"></iconify-icon>
								</button>
							{/if}
						</div>
					{/if}
				</div>

				{#each group.rows as row}
					{@const destKey = `${row.route.global_route_id}-${row.itinerary.direction_id ?? 0}-${row.itinerary.branch_code || ''}`}
					<div
						class="departure-row"
						style="--route-color: #{row.route.route_color}; --route-text-color: #{row.route
							.route_text_color}"
					>
						<div class="row-badge">
							<RouteIcon route={row.route} {showLongName} compact={true} />
						</div>
						<div class="row-destination">
							{#if row.itinerary.branch_code}<span class="branch-code-badge"
									>{row.itinerary.branch_code}</span
								>{/if}<span
								class="destination-text"
								class:scrolling={overflowingDestinations.has(destKey)}
								use:bindDestinationElement={destKey}>{row.itinerary.merged_headsign}</span
							>
						</div>
						<div class="row-times">
							{#if row.alertSeverity !== 'none'}
								<iconify-icon
									icon={row.alertIcon}
									class="route-alert-icon {row.alertSeverity}"
									title={$_('alerts.title')}
								></iconify-icon>
							{/if}
							{#each row.departures as item, itemIdx}
								{#if itemIdx === 0 && crowdingMap && item.rt_trip_id}
									<CrowdingIcon level={crowdingMap.get(item.rt_trip_id)} />
								{/if}
								<span class="time-badge" class:cancelled={item.is_cancelled}>
									{getMinutesUntil(item.departure_time)}<span class="time-suffix">min</span
									>{#if item.is_real_time}<i class="realtime"></i>{/if}{#if item.is_last}*{/if}
								</span>
							{/each}
						</div>
						{#if onHideRoute}
							<button
								type="button"
								class="btn-row-hide"
								onclick={() => onHideRoute(row.route.global_route_id)}
								title={$_('routes.controls.hide')}
							>
								<iconify-icon icon="ix:eye-cancelled-filled"></iconify-icon>
							</button>
						{/if}
					</div>
				{/each}
			</div>

			{#if groupIndex < stopGroups.length - 1}
				<div class="group-divider"></div>
			{/if}
		{/each}
	</div>

	<!-- Pinned bottom bar (alerts + optional QR slot) -->
	{#if consolidatedAlerts.length > 0 || showQRCode}
		<div class="bottom-bar">
			{#if consolidatedAlerts.length > 0}
				<div class="alert-section">
					<div
						class="alert-header"
						class:severe={mostSevereLevel === 'severe'}
						class:warning={mostSevereLevel === 'warning'}
						class:info={mostSevereLevel === 'info'}
					>
						<iconify-icon icon={mostSevereIcon}></iconify-icon>
						<span class="alert-title">{$_('alerts.title')}</span>
						<span class="alert-count-badge">{consolidatedAlerts.length}</span>
					</div>

					<div class="alert-ticker">
						{#key alertText}
							<div class="alert-content">
								<div class="alert-text">
									{#each parseAlertContent(alertText) as content}
										{#if content.type === 'text'}
											{content.value}
										{:else if content.type === 'image'}
											<img
												src="/api/images/{extractImageId(content.value)}"
												alt="transit icon"
												class="alert-image"
											/>
										{/if}
									{/each}
								</div>
							</div>
						{/key}
					</div>
				</div>
			{/if}
			{#if showQRCode}
				<div class="qr-slot" class:solo={consolidatedAlerts.length === 0}>
					<p class="qr-label">
						<span class="qr-label-1">{$_('config.qrCode.scanPrompt')}<br /></span>
						<span class="qr-label-2">{$_('config.qrCode.scanPrompt2')}</span>
					</p>
					<QRCode
						latitude={$config.latLng.latitude}
						longitude={$config.latLng.longitude}
						size={100}
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.vertical-view {
		display: flex;
		flex-direction: column;
		font-size: 2.5em;
		height: 100%;
	}

	/* Routes scroll area takes remaining space above pinned alerts */
	.routes-scroll {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
		font-size: calc(1em * var(--effective-scale, 1));
	}

	.stop-group {
		display: flex;
		flex-direction: column;
	}

	.stop-header {
		display: flex;
		align-items: center;
		gap: 0.25em;
		padding: 0.2em 0.6em 0.15em;
		font-size: 1em;
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1.2;
		background: var(--bg-secondary);
		color: var(--text-secondary);
		border-bottom: 2px solid var(--border-color, rgba(0, 0, 0, 0.15));
		position: relative;
	}

	.stop-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stop-distance {
		flex-shrink: 0;
		font-size: 0.75em;
		font-weight: 500;
		font-style: italic;
		color: var(--text-tertiary);
		white-space: nowrap;
	}

	.stop-controls {
		display: flex;
		gap: 0.25em;
		opacity: 0;
		transition: opacity 0.2s;
		flex-shrink: 0;
		position: absolute;
		right: 0.3em;
		background: var(--bg-secondary);
		padding-left: 0.3em;
		z-index: 1;
	}

	.stop-group:hover .stop-controls {
		opacity: 1;
	}

	.btn-stop-control {
		background: rgba(255, 255, 255, 0.95);
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 0.15em 0.3em;
		cursor: pointer;
		transition: background 0.2s;
		font-size: 0.85em;
		line-height: 1;
	}

	.btn-stop-control:hover {
		background: rgba(255, 255, 255, 1);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
	}

	.btn-stop-control iconify-icon {
		display: block;
		width: 1.2em;
		height: 1.2em;
		transform: translateY(0.05em);
	}

	.departure-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.6em;
		padding: 0.55em 0.6em;
		align-items: center;
		border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
		position: relative;
	}

	.btn-row-hide {
		position: absolute;
		right: 0.3em;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(255, 255, 255, 0.95);
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 0.1em 0.25em;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.2s;
		font-size: 0.7em;
		line-height: 1;
		z-index: 1;
	}

	.departure-row:hover .btn-row-hide {
		opacity: 1;
	}

	.btn-row-hide:hover {
		background: rgba(255, 255, 255, 1);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
	}

	.btn-row-hide iconify-icon {
		display: block;
		width: 1.2em;
		height: 1.2em;
		transform: translateY(0.05em);
	}

	.row-badge {
		display: flex;
		align-items: center;
		gap: 0.2em;
		font-size: 1.1em;
		line-height: 1;
		color: var(--route-color);
	}

	.route-alert-icon {
		display: inline-block;
		width: 0.5em;
		height: 0.5em;
		flex-shrink: 0;
		transform: translateY(-0.25em);
		margin-right: 0.25em;
	}

	.route-alert-icon.severe {
		color: #e30613;
	}

	.route-alert-icon.warning {
		color: #ffa700;
	}

	.route-alert-icon.info {
		color: var(--text-secondary);
	}

	.row-destination {
		display: flex;
		align-items: center;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		font-weight: 700;
		font-size: 1em;
		color: var(--text-primary);
	}

	.row-destination .branch-code-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--route-color), white 30%);
		color: inherit;
		border-radius: 40rem;
		padding: 3px 0.4em;
		font-size: 0.85em;
		font-weight: 800;
		line-height: 1;
		min-width: 1.2em;
		flex-shrink: 0;
		font-family: 'Red Hat Display Variable', Arial, Helvetica, sans-serif;
		box-shadow: 0px 1px 4px rgba(0, 0, 0, 0.1);
		margin-right: 0.3em;
		position: relative;
		z-index: 1;
	}

	.row-destination .destination-text {
		display: inline-block;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}

	.row-destination .destination-text.scrolling {
		animation: scroll-text-horizontal 30s linear infinite;
		will-change: transform;
		overflow: visible;
	}

	.row-destination .destination-text:not(.scrolling) {
		will-change: auto;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-times {
		display: flex;
		align-items: center;
		gap: 0.65em;
		flex-shrink: 0;
	}

	.row-times :global(.crowding-badge) {
		font-size: 0.7em;
	}

	.time-badge {
		font-feature-settings: 'tnum';
		font-weight: 800;
		font-size: 1em;
		white-space: nowrap;
		color: var(--text-primary);
		position: relative;
	}

	.time-badge.cancelled {
		text-decoration: line-through;
		opacity: 0.6;
	}

	.time-suffix {
		font-weight: 400;
		font-size: 0.65em;
		opacity: 0.55;
	}

	/* Real-time indicator — PNG waves matching other views */
	.realtime {
		width: 0.32em;
		height: 0.32em;
		position: absolute;
		top: -0.25em;
		right: -0.15em;
	}

	.realtime::before,
	.realtime::after {
		content: '';
		display: block;
		width: 0.5em;
		height: 0.5em;
		position: absolute;
		background-size: 100%;
	}

	.realtime::before {
		background-image: url('/assets/images/real_time_wave_small-w@2x.png');
		animation: realtimeAnim 1.4s linear 0s infinite alternate;
	}

	.realtime::after {
		background-image: url('/assets/images/real_time_wave_big-w@2x.png');
		animation: realtimeAnim 1.4s linear 0.3s infinite alternate;
	}

	@keyframes realtimeAnim {
		0%,
		25%,
		50%,
		75% {
			opacity: 0.5;
		}
		100% {
			opacity: 1;
		}
	}

	@keyframes scroll-text-horizontal {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-100%);
		}
	}

	.group-divider {
		height: 5px;
		background: var(--border-color, rgba(0, 0, 0, 0.15));
	}

	/* Bottom bar — holds alert section and optional QR slot */
	.bottom-bar {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		flex-shrink: 0;
		border-top: 3px solid var(--border-color, rgba(0, 0, 0, 0.15));
	}

	/* Alert section — fills remaining space beside QR slot */
	.alert-section {
		flex: 1;
		min-width: 0;
	}

	.qr-slot {
		background: var(--bg-header);
		display: flex;
		flex-direction: row;
		align-items: center;
		padding: 0.5em 0.75em;
		gap: 0.75em;
		flex: 0 0 33%;
		min-width: 0;
		margin-left: auto;
	}

	.qr-slot.solo {
		flex: 1;
		margin-left: 0;
	}

	.qr-slot :global(svg) {
		display: block;
		background: white;
		padding: 0.4em;
		border-radius: 8px;
		flex-shrink: 0;
	}

	.qr-slot :global(svg path),
	.qr-slot :global(svg rect),
	.qr-slot :global(svg circle),
	.qr-slot :global(svg polygon) {
		fill: var(--bg-header) !important;
	}

	.qr-slot .qr-label {
		margin: 0;
		color: white;
		font-size: 0.65em;
		line-height: 1.5;
		letter-spacing: 0.02em;
		opacity: 0.95;
		flex: 1;
		min-width: 0;
		overflow-wrap: break-word;
	}

	.qr-slot .qr-label-1 {
		font-weight: 400;
	}

	.qr-slot .qr-label-2 {
		font-weight: bold;
	}

	.alert-header {
		display: flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.4em 0.5em;
		font-size: 0.75em;
		font-weight: 700;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
		background-color: transparent;
		color: var(--text-secondary);
	}

	.alert-header.severe {
		background-color: #e30613;
		color: #fff;
		border-color: #e30613;
	}

	.alert-header.warning {
		background-color: #ffa700;
		color: #000;
		border-color: #ffa700;
	}

	.alert-header.info {
		color: var(--text-secondary);
		border-color: var(--text-secondary);
	}

	.alert-header iconify-icon {
		display: block;
		width: 1em;
		height: 1em;
		flex-shrink: 0;
		transform: translateY(0.05em);
		position: relative;
		z-index: 1;
		padding-left: 0.5em;
		padding-right: 0.5em;
		margin-left: -0.5em;
	}

	.alert-header.severe iconify-icon {
		background: linear-gradient(to right, #e30613 0%, #e30613 70%, transparent 100%);
	}

	.alert-header.warning iconify-icon {
		background: linear-gradient(to right, #ffa700 0%, #ffa700 70%, transparent 100%);
	}

	.alert-title {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.alert-count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--border-color);
		color: inherit;
		border-radius: 40rem;
		padding: 2px 0.5em;
		font-size: 0.9em;
		font-weight: 800;
		line-height: 1;
		min-width: 1.35em;
		flex-shrink: 0;
		font-family: 'Red Hat Display Variable', Arial, Helvetica, sans-serif;
		box-shadow: 0px 1px 4px rgba(0, 0, 0, 0.1);
	}

	.alert-header.severe .alert-count-badge {
		background: color-mix(in srgb, #e30613, white 30%);
		color: #fff;
	}

	.alert-header.warning .alert-count-badge {
		background: color-mix(in srgb, #ffa700, white 30%);
		color: #000;
	}

	.alert-ticker {
		overflow: hidden;
		position: relative;
		flex-shrink: 0;
		height: clamp(5em, 5vh, 7em);
	}

	.alert-content {
		padding: 0.2em 0.5em;
		font-size: 0.75em;
		line-height: 1.3;
		animation: scroll-alert-vertical 180s linear infinite;
		white-space: pre-wrap;
		word-wrap: break-word;
		color: var(--text-tertiary);
		will-change: transform;
		transform: translateZ(0);
		backface-visibility: hidden;
		contain: layout paint;
	}

	@keyframes scroll-alert-vertical {
		0% {
			transform: translateY(0);
		}
		100% {
			transform: translateY(-100%);
		}
	}

	.alert-text {
		margin-bottom: 0.2em;
	}

	.alert-image {
		height: 1em;
		display: inline-block;
		margin: 0 0.2em;
		vertical-align: middle;
	}
</style>
