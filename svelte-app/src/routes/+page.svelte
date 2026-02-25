<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { config } from '$lib/stores/config';
	import { findNearbyRoutes } from '$lib/services/nearby';
	import {
		crowdingStore,
		refreshCrowding,
		startCrowdingPolling,
		updateCrowdingRoutes,
		stopCrowdingPolling
	} from '$lib/services/crowding';
	import RouteItem from '$lib/components/RouteItem.svelte';
	import ListView from '$lib/components/ListView.svelte';
	import VerticalView from '$lib/components/VerticalView.svelte';
	import QRCode from '$lib/components/QRCode.svelte';
	import ConfigModal from '$lib/components/ConfigModal.svelte';
	import {
		isHighPriorityMode,
		haversineDistance,
		PRIORITY_MODE_ELEVATION_METERS
	} from '$lib/utils/sortingUtils';
	import type { Route, CrowdingMap } from '$lib/services/nearby';
	import 'iconify-icon';
	let routes = $state<Route[]>([]);
	let allRoutes = $state<Route[]>([]);
	let intervalId: ReturnType<typeof setInterval>;
	let clockIntervalId: ReturnType<typeof setInterval>;
	let countdownIntervalId: ReturnType<typeof setInterval> | null = null;
	let errorRetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let loading = $state(true);
	let currentTime = $state(new Date());
	let errorMessage = $state<string | null>(null);
	let retryCountdown = $state<number | null>(null);
	let errorType = $state<'rate-limit' | 'auth' | 'timeout' | 'backend' | 'generic' | null>(null);

	// Screen width check
	let windowWidth = $state(0);
	let isScreenTooNarrow = $derived(windowWidth > 0 && windowWidth < 640);
	let resizeCleanup: (() => void) | null = null;
	let isMounted = $state(false);

	// Tab visibility tracking (for battery savings on 24/7 displays)
	let tabVisible = $state(true);

	// Geolocation state
	let gettingLocation = $state(false);
	let locationError = $state<string | null>(null);

	// Location validation state
	let validatingLocation = $state(false);
	let validationMessage = $state<string | null>(null);
	let validationSuccess = $state<boolean | null>(null);

	// App version state
	let appVersion = $state<string>('1.5.3'); // Fallback version

	// Auto-scale state
	let contentScale = $state(1.0);
	let routesElement = $state<HTMLElement | null>(null);
	let scaleCheckTimeout: ReturnType<typeof setTimeout> | null = null;
	let transitionTimeout: ReturnType<typeof setTimeout> | null = null;
	let isCalculatingScale = false;
	let isTransitioning = false;
	let lastScaledRouteCount = $state(0);
	let lastContentSignature = ''; // Track content changes beyond just route count
	let resizeObserver: ResizeObserver | null = null;

	// Get transition duration dynamically from computed styles
	function getTransitionDuration(): number {
		if (!routesElement) return 200;
		const style = getComputedStyle(routesElement);
		const duration = parseFloat(style.transitionDuration) * 1000;
		return duration || 200; // Fallback to 200ms
	}

	// Calculate scale value from measurements
	function calculateScale(
		naturalHeight: number,
		availableHeight: number,
		minScale: number
	): number {
		const ratio = availableHeight / naturalHeight;
		return Math.min(1.0, Math.max(minScale, ratio));
	}

	let shouldApplyAutoScale = $derived(
		$config.scaleMode === 'auto' &&
			!$config.isEditing &&
			routes.length > 0 &&
			!loading &&
			$config.columns === 'auto' // Only auto-scale when using auto columns
	);

	// Effective scale: uses calculated scale for auto mode, config value for manual mode
	let effectiveScale = $derived(
		$config.scaleMode === 'manual' ? $config.manualScale : contentScale
	);

	// Check if manual columns might be too narrow for viewport
	let columnsWarning = $derived.by(() => {
		if (!$config.manualColumnsMode || typeof $config.columns !== 'number') return null;
		const minColumnWidth = 300; // Minimum comfortable width per column
		const estimatedWidth = windowWidth / $config.columns;
		if (estimatedWidth < minColumnWidth) {
			const nomColWidth = Math.round(estimatedWidth);
			return $_('config.columns.columnWarning', { values: { nomColWidth } });
		}
		return null;
	});

	// Split routes with too many cards into multiple display items
	const MAX_CARDS_PER_ROUTE = 3;

	let displayRoutes = $derived.by(() => {
		const result: (Route & { _splitIndex?: number; _totalSplits?: number })[] = [];

		// Vertical and board modes: no splitting, pass all routes through directly
		if ($config.viewMode === 'vertical' || $config.viewMode === 'board') {
			return routes.filter((r) => (r.itineraries || []).length > 0) as (Route & {
				_splitIndex?: number;
				_totalSplits?: number;
			})[];
		}

		for (const route of routes) {
			const itineraries = route.itineraries || [];

			// Skip routes with no departures
			if (itineraries.length === 0) {
				continue;
			}

			const maxItineraries = MAX_CARDS_PER_ROUTE;

			if (itineraries.length <= maxItineraries) {
				// Fits in one card
				result.push(route);
			} else {
				// Group by direction_id to keep directions together
				const directionGroups = new Map<number | undefined, typeof itineraries>();
				for (const itinerary of itineraries) {
					const dirId = itinerary.direction_id;
					if (!directionGroups.has(dirId)) {
						directionGroups.set(dirId, []);
					}
					directionGroups.get(dirId)!.push(itinerary);
				}

				// Split into chunks, trying to keep direction groups intact
				const chunks: (typeof itineraries)[] = [];
				let currentChunk: typeof itineraries = [];

				for (const [_, dirItineraries] of directionGroups) {
					if (currentChunk.length + dirItineraries.length <= maxItineraries) {
						// Fits in current chunk
						currentChunk.push(...dirItineraries);
					} else {
						// Start new chunk
						if (currentChunk.length > 0) {
							chunks.push(currentChunk);
							currentChunk = [];
						}
						// If single direction is too large, split it
						if (dirItineraries.length > maxItineraries) {
							for (let i = 0; i < dirItineraries.length; i += maxItineraries) {
								chunks.push(dirItineraries.slice(i, i + maxItineraries));
							}
						} else {
							currentChunk.push(...dirItineraries);
						}
					}
				}
				if (currentChunk.length > 0) {
					chunks.push(currentChunk);
				}

				// Create split route items
				chunks.forEach((chunk, index) => {
					result.push({
						...route,
						itineraries: chunk,
						alerts: index === 0 ? route.alerts : [], // Alert only on first chunk
						_splitIndex: index,
						_totalSplits: chunks.length
					});
				});
			}
		}

		return result;
	});

	// Helper to create content signature for detecting meaningful changes
	function getContentSignature(routes: Route[]): string {
		return (
			`${$config.viewMode}:` +
			routes
				.map((r) => {
					const itineraryTextLen =
						r.itineraries
							?.map((i) => (i.merged_headsign?.length || 0) + (i.direction_headsign?.length || 0))
							.reduce((a, b) => a + b, 0) || 0;
					const alertTextLen =
						r.alerts?.map((a) => a.description?.length || 0).reduce((a, b) => a + b, 0) || 0;
					const splitCount = (r as any)._totalSplits || 1;

					return `${r.global_route_id}:${r.itineraries?.length || 0}:${r.alerts?.length || 0}:${itineraryTextLen}:${alertTextLen}:${splitCount}`;
				})
				.join('|')
		);
	}

	// Adaptive polling configuration
	let consecutiveErrors = 0;
	// Default 10s for free tier (5 calls/min), paid tier can use 5-7s via env var
	const MIN_POLLING_INTERVAL = parseInt(import.meta.env.VITE_CLIENT_POLLING_INTERVAL || '10000'); // Default 10s
	let currentPollingInterval = MIN_POLLING_INTERVAL; // Start at minimum
	const MAX_POLLING_INTERVAL = 120000; // 2 minutes maximum
	const BACKOFF_MULTIPLIER = 1.5;

	function resetPollingInterval() {
		if (intervalId) {
			clearInterval(intervalId);
		}
		if (!$config.isEditing) {
			intervalId = setInterval(loadNearby, currentPollingInterval);
		}
	}

	function increasePollingInterval() {
		consecutiveErrors++;
		const newInterval = Math.min(currentPollingInterval * BACKOFF_MULTIPLIER, MAX_POLLING_INTERVAL);
		if (newInterval !== currentPollingInterval) {
			currentPollingInterval = newInterval;
			// Polling interval increased due to errors
			resetPollingInterval();
		}
	}

	function resetPollingToNormal() {
		consecutiveErrors = 0;
		if (currentPollingInterval !== MIN_POLLING_INTERVAL) {
			currentPollingInterval = MIN_POLLING_INTERVAL;
			// Polling interval reset to normal
			resetPollingInterval();
		}
	}

	// Helper function to format time based on configured format
	function formatTime(date: Date, format: string, language: string): string {
		if (format === 'hh:mm') {
			// 12-hour format without AM/PM - manual formatting required
			let hours = date.getHours();
			const minutes = date.getMinutes();

			// Convert to 12-hour format
			if (hours === 0) {
				hours = 12; // Midnight is 12:XX
			} else if (hours > 12) {
				hours = hours - 12;
			}

			// Pad minutes with leading zero
			const minutesStr = minutes.toString().padStart(2, '0');

			return `${hours}:${minutesStr}`;
		} else {
			// Use toLocaleTimeString for other formats
			return date.toLocaleTimeString(language, {
				hour: 'numeric',
				minute: '2-digit',
				hour12: format.startsWith('hh:mm')
			});
		}
	}

	async function loadNearby() {
		try {
			const currentConfig = $config;
			if (!currentConfig.latLng) return;

			const fetchedRoutes = await findNearbyRoutes(currentConfig.latLng, currentConfig.maxDistance);
			allRoutes = fetchedRoutes;

			const hiddenStops = currentConfig.hiddenStops || [];
			const hiddenAgencies = currentConfig.hiddenAgencies || [];
			routes = fetchedRoutes
				.filter((r) => !currentConfig.hiddenRoutes.includes(r.global_route_id))
				.filter((r) => !hiddenAgencies.includes(r.route_network_name ?? ''))
				.map((r) => {
					if (hiddenStops.length === 0 || !r.itineraries) return r;
					const filtered = r.itineraries.filter((it: any) => {
						const stopId =
							it.closest_stop?.parent_station_global_stop_id ||
							it.closest_stop?.global_stop_id ||
							'unknown';
						return !hiddenStops.includes(stopId);
					});
					return { ...r, itineraries: filtered };
				})
				.filter((r) => !r.itineraries || r.itineraries.length > 0)
				.sort((a, b) => {
					const aIdx = currentConfig.routeOrder.indexOf(a.global_route_id);
					const bIdx = currentConfig.routeOrder.indexOf(b.global_route_id);
					if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
					if (aIdx !== -1) return -1;
					if (bIdx !== -1) return 1;
					const { latitude: uLat, longitude: uLon } = currentConfig.latLng;
					const getRouteDist = (route: Route) => {
						if (!route.itineraries) return Infinity;
						return Math.min(
							...route.itineraries.map((it) => {
								const s = it.closest_stop;
								return s?.stop_lat != null && s?.stop_lon != null
									? haversineDistance(uLat, uLon, s.stop_lat, s.stop_lon)
									: Infinity;
							})
						);
					};
					const aDist = getRouteDist(a);
					const bDist = getRouteDist(b);
					const aHigh = isHighPriorityMode(a.mode_name) && aDist <= PRIORITY_MODE_ELEVATION_METERS;
					const bHigh = isHighPriorityMode(b.mode_name) && bDist <= PRIORITY_MODE_ELEVATION_METERS;
					if (aHigh !== bHigh) return aHigh ? -1 : 1;
					if (aDist !== bDist) return aDist - bDist;
					return a.global_route_id.localeCompare(b.global_route_id);
				});

			loading = false;
			errorMessage = null;
			retryCountdown = null;
			errorType = null;
			// Success - reset polling to normal interval
			resetPollingToNormal();
		} catch (err) {
			console.error('Error loading nearby routes:', err);
			loading = false;

			// Clear any existing retry timers
			if (countdownIntervalId) {
				clearInterval(countdownIntervalId);
				countdownIntervalId = null;
			}
			if (errorRetryTimeoutId) {
				clearTimeout(errorRetryTimeoutId);
				errorRetryTimeoutId = null;
			}

			const error = err as any;

			// Handle rate limiting
			if (error.isRateLimit) {
				errorType = 'rate-limit';
				const retryAfter = error.retryAfter || 60;
				errorMessage = $_('errors.rateLimit', { values: { seconds: retryAfter } });
				retryCountdown = retryAfter;

				// Increase polling interval on rate limit
				increasePollingInterval();

				// Countdown timer
				countdownIntervalId = setInterval(() => {
					if (retryCountdown !== null && retryCountdown > 0) {
						retryCountdown--;
						errorMessage = $_('errors.rateLimit', { values: { seconds: retryCountdown } });
					} else {
						if (countdownIntervalId) {
							clearInterval(countdownIntervalId);
							countdownIntervalId = null;
						}
						errorMessage = null;
						errorType = null;
						retryCountdown = null;
						loadNearby();
					}
				}, 1000);
			}
			// Handle authentication errors - don't retry automatically
			else if (error.isAuthError) {
				errorType = 'auth';
				errorMessage = $_('errors.auth');
				// Don't increase polling interval or auto-retry for auth errors
				// Manual intervention required
			}
			// Handle timeout errors
			else if (error.isTimeout) {
				errorType = 'timeout';
				errorMessage = $_('errors.timeout');
				increasePollingInterval();

				errorRetryTimeoutId = setTimeout(() => {
					errorMessage = null;
					errorType = null;
					errorRetryTimeoutId = null;
					loadNearby();
				}, 10000); // Retry after 10 seconds for timeouts
			}
			// Handle backend unavailable
			else if (error.isBackendError) {
				errorType = 'backend';
				errorMessage = $_('errors.backend');
				increasePollingInterval();

				errorRetryTimeoutId = setTimeout(() => {
					errorMessage = null;
					errorType = null;
					errorRetryTimeoutId = null;
					loadNearby();
				}, 20000);
			}
			// Generic error handling
			else {
				errorType = 'generic';
				errorMessage = $_('errors.generic');
				increasePollingInterval();

				errorRetryTimeoutId = setTimeout(() => {
					errorMessage = null;
					errorType = null;
					errorRetryTimeoutId = null;
					loadNearby();
				}, 20000);
			}
		}
	}

	function moveRoute(index: number, direction: 'up' | 'down') {
		const newRoutes = [...routes];
		const targetIndex = direction === 'up' ? index - 1 : index + 1;

		if (targetIndex < 0 || targetIndex >= newRoutes.length) return;

		[newRoutes[index], newRoutes[targetIndex]] = [newRoutes[targetIndex], newRoutes[index]];
		routes = newRoutes;

		const newOrder = routes.map((r) => r.global_route_id);
		config.update((c) => ({
			...c,
			routeOrder: newOrder
		}));
		config.save();
	}

	function moveRouteToTop(index: number) {
		if (index === 0) return;

		const newRoutes = [...routes];
		const [movedRoute] = newRoutes.splice(index, 1);
		newRoutes.unshift(movedRoute);
		routes = newRoutes;

		const newOrder = routes.map((r) => r.global_route_id);
		config.update((c) => ({
			...c,
			routeOrder: newOrder
		}));
		config.save();
	}

	function getCurrentStopOrder(routes: Route[]): string[] {
		const stopIds = new Set<string>();
		for (const route of routes) {
			if (!route.itineraries) continue;
			for (const itinerary of route.itineraries) {
				const stopId =
					itinerary.closest_stop?.parent_station_global_stop_id ||
					itinerary.closest_stop?.global_stop_id ||
					'unknown';
				stopIds.add(stopId);
			}
		}

		const saved = $config.stopOrder || [];
		const ordered: string[] = [];
		for (const id of saved) {
			if (stopIds.has(id)) {
				ordered.push(id);
				stopIds.delete(id);
			}
		}
		for (const id of stopIds) {
			ordered.push(id);
		}
		return ordered;
	}

	function moveStop(stopId: string, direction: 'up' | 'down') {
		const order = getCurrentStopOrder(routes);
		const index = order.indexOf(stopId);
		if (index === -1) return;

		const targetIndex = direction === 'up' ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= order.length) return;

		[order[index], order[targetIndex]] = [order[targetIndex], order[index]];
		config.update((c) => ({ ...c, stopOrder: order }));
		config.save();
	}

	function moveStopToTop(stopId: string) {
		const order = getCurrentStopOrder(routes);
		const index = order.indexOf(stopId);
		if (index <= 0) return;

		order.splice(index, 1);
		order.unshift(stopId);
		config.update((c) => ({ ...c, stopOrder: order }));
		config.save();
	}

	async function toggleRouteHidden(routeId: string) {
		const wasHidden = $config.hiddenRoutes.includes(routeId);

		config.update((c) => {
			return {
				...c,
				hiddenRoutes: wasHidden
					? c.hiddenRoutes.filter((id) => id !== routeId)
					: [...c.hiddenRoutes, routeId]
			};
		});
		config.save();

		// If unhiding, need to reload all routes to get the unhidden route data
		if (wasHidden) {
			await loadNearby();
		} else {
			// If hiding, just filter the current routes
			routes = routes.filter((r) => r.global_route_id !== routeId);
		}
	}

	async function toggleStopHidden(stopId: string) {
		const wasHidden = $config.hiddenStops.includes(stopId);

		config.update((c) => {
			return {
				...c,
				hiddenStops: wasHidden
					? c.hiddenStops.filter((id) => id !== stopId)
					: [...c.hiddenStops, stopId]
			};
		});
		config.save();

		await loadNearby();
	}

	async function toggleAgencyHidden(networkName: string) {
		const wasHidden = ($config.hiddenAgencies || []).includes(networkName);
		config.update((c) => ({
			...c,
			hiddenAgencies: wasHidden
				? (c.hiddenAgencies || []).filter((n) => n !== networkName)
				: [...(c.hiddenAgencies || []), networkName]
		}));
		config.save();
		await loadNearby();
	}

	function calculateContentScale(forceRecalc = false, fastPath = false) {
		if (!routesElement || !shouldApplyAutoScale || !tabVisible) {
			if (!shouldApplyAutoScale) {
				contentScale = 1.0;
				lastScaledRouteCount = 0;
			}
			return;
		}

		// Cancel any pending calculation
		if (scaleCheckTimeout) {
			clearTimeout(scaleCheckTimeout);
		}

		// Use shorter debounce for fast-path (when autoscale just enabled)
		const debounceDelay = fastPath ? 50 : 150;

		scaleCheckTimeout = setTimeout(() => {
			// Prevent concurrent calculations
			// Only block on transitions for manual resize events (forceRecalc)
			// Allow content-driven rescales even during transitions
			if (isCalculatingScale || (forceRecalc && isTransitioning)) {
				return;
			}
			isCalculatingScale = true;

			requestAnimationFrame(() => {
				try {
					// Verify element is still in DOM
					if (!routesElement || !routesElement.isConnected) {
						return;
					}

					// Use untrack to prevent contentScale from being a dependency
					const previousScale = untrack(() => contentScale);

					// Clone element for measurement without visual flash
					const clone = routesElement.cloneNode(true) as HTMLElement;
					clone.style.position = 'absolute';
					clone.style.top = '-9999px';
					clone.style.left = '-9999px';
					clone.style.fontSize = '100%';
					clone.style.setProperty('--effective-scale', '1');
					clone.style.visibility = 'hidden';

					// Copy the computed grid layout to ensure clone measures correctly
					const currentGridColumns = window.getComputedStyle(routesElement).gridTemplateColumns;
					clone.style.gridTemplateColumns = currentGridColumns;

					document.body.appendChild(clone);

					// Force layout and measure
					clone.offsetHeight;
					const naturalHeight = clone.scrollHeight;

					// Cleanup
					document.body.removeChild(clone);

					const headerHeight = 3 * parseFloat(getComputedStyle(document.documentElement).fontSize);
					const availableHeight = window.innerHeight - headerHeight - 10; // 10px buffer for safety

					const newScale = calculateScale(naturalHeight, availableHeight, $config.autoScaleMinimum);

					// Only update if scale changed significantly (more than 2% to avoid animation-induced jitter)
					if (Math.abs(newScale - previousScale) > 0.02) {
						contentScale = newScale;
						// Set transition flag to prevent recalculation during animation
						isTransitioning = true;

						// Clear any existing transition timeout
						if (transitionTimeout) {
							clearTimeout(transitionTimeout);
						}

						transitionTimeout = setTimeout(() => {
							isTransitioning = false;
							transitionTimeout = null;
						}, getTransitionDuration());
					}

					// Track that we've scaled for this route count
					lastScaledRouteCount = displayRoutes.length;
				} finally {
					isCalculatingScale = false;
				}
			});
		}, debounceDelay);
	}

	onMount(async () => {
		await config.load();

		// Track window width for screen size check
		if (browser) {
			windowWidth = window.innerWidth;

			const handleResize = () => {
				windowWidth = window.innerWidth;
				if (shouldApplyAutoScale) {
					calculateContentScale(true); // Force recalc on resize
				}
			};

			window.addEventListener('resize', handleResize);

			// Track tab visibility for battery savings
			const handleVisibilityChange = () => {
				tabVisible = !document.hidden;
			};

			document.addEventListener('visibilitychange', handleVisibilityChange);

			// Store cleanup function
			resizeCleanup = () => {
				window.removeEventListener('resize', handleResize);
				document.removeEventListener('visibilitychange', handleVisibilityChange);
			};
		}

		// Fetch app version from server
		try {
			const apiBase = browser
				? window.location.port === '5173'
					? 'http://localhost:8080'
					: ''
				: '';
			const healthResponse = await fetch(`${apiBase}/health`);
			if (healthResponse.ok) {
				const healthData = await healthResponse.json();
				appVersion = healthData.version || '1.5.3';
			}
		} catch (err) {
			// Version fetch failed, using fallback
		}

		// Only load routes if screen is wide enough
		if (!$config.isEditing && !isScreenTooNarrow) {
			await loadNearby();
			// Use adaptive polling interval (starts at 20s)
			intervalId = setInterval(loadNearby, currentPollingInterval);

			// Start crowding polling if enabled
			if ($config.showCrowding && routes.length > 0) {
				refreshCrowding(routes);
				startCrowdingPolling(routes);
			}
		}

		// Update clock every second
		clockIntervalId = setInterval(() => {
			currentTime = new Date();
		}, 1000);

		// Mark as mounted to enable reactive width effects
		isMounted = true;
	});

	// React to screen width changes (only after mount to avoid double loading)
	$effect(() => {
		if (!isMounted) return;

		if (isScreenTooNarrow) {
			// Screen too narrow - stop polling
			if (intervalId) {
				clearInterval(intervalId);
				intervalId = undefined!;
			}
		} else if (!$config.isEditing) {
			// Screen wide enough - start/resume polling if not already running
			if (!intervalId) {
				loadNearby();
				intervalId = setInterval(loadNearby, currentPollingInterval);
			}
		}
	});

	// Start/stop crowding polling when toggle or editing state changes
	$effect(() => {
		const enabled = $config.showCrowding;
		const editing = $config.isEditing;

		if (enabled && !editing) {
			startCrowdingPolling(untrack(() => routes));
		} else {
			stopCrowdingPolling();
			if (!enabled) {
				crowdingStore.set(new Map());
			}
		}
	});

	// Pass fresh route data to crowding service without restarting the poll
	$effect(() => {
		if (routes.length > 0 && $config.showCrowding) {
			updateCrowdingRoutes(routes);
		}
	});

	// Enforce auto columns when auto-scale is enabled (not applicable in vertical mode)
	$effect(() => {
		if (
			$config.scaleMode === 'auto' &&
			$config.viewMode !== 'vertical' &&
			($config.columns !== 'auto' || $config.manualColumnsMode)
		) {
			config.update((c) => ({
				...c,
				columns: 'auto',
				manualColumnsMode: false
			}));
		}
	});

	// When manual mode is toggled, handle column value transitions
	$effect(() => {
		if ($config.manualColumnsMode && $config.columns === 'auto') {
			// Switching to manual mode: set a default numeric value
			config.update((c) => ({ ...c, columns: 4 }));
		} else if (
			!$config.manualColumnsMode &&
			$config.scaleMode !== 'auto' &&
			$config.columns !== 'auto'
		) {
			// Switching from manual to auto mode
			config.update((c) => ({ ...c, columns: 'auto' }));
		}
	});

	// Track content signature to detect meaningful changes beyond just route count
	let contentSignature = $derived(getContentSignature(displayRoutes));

	// Track previous state to detect when autoscale is re-enabled
	let wasAutoScaleEnabled = false;

	// Recalculate scale when relevant dependencies change
	$effect(() => {
		// Explicit dependencies - use untrack to prevent feedback loops from contentScale changes
		const currentAutoScale = shouldApplyAutoScale;
		const currentSignature = contentSignature;
		void [
			currentAutoScale,
			currentSignature, // Detects route additions/removals, itinerary changes, alert changes
			$config.columns,
			$config.isEditing,
			tabVisible // Recalculate when tab becomes visible again
			// Note: windowWidth is NOT included here because resize handler calls calculateContentScale directly
		];

		untrack(() => {
			if (currentAutoScale && tabVisible) {
				// Track if content signature actually changed
				const signatureChanged = currentSignature !== lastContentSignature;
				lastContentSignature = currentSignature;

				// If autoscale was just re-enabled or content changed, recalculate
				const justEnabled = !wasAutoScaleEnabled && currentAutoScale;

				if (justEnabled || signatureChanged) {
					calculateContentScale(justEnabled, justEnabled);
				}

				wasAutoScaleEnabled = true;
			} else {
				contentScale = 1.0;
				wasAutoScaleEnabled = false;
			}
		});
	});

	// Initialize ResizeObserver when routesElement becomes available
	$effect(() => {
		if (browser && routesElement && shouldApplyAutoScale) {
			// Cleanup previous observer if it exists
			if (resizeObserver) {
				resizeObserver.disconnect();
			}

			// Create new observer
			resizeObserver = new ResizeObserver(() => {
				if (shouldApplyAutoScale && !isCalculatingScale && !isTransitioning) {
					calculateContentScale(false, false);
				}
			});
			resizeObserver.observe(routesElement);

			// Cleanup function
			return () => {
				if (resizeObserver) {
					resizeObserver.disconnect();
					resizeObserver = null;
				}
			};
		}
	});

	onDestroy(() => {
		stopCrowdingPolling();
		if (intervalId) {
			clearInterval(intervalId);
		}
		if (clockIntervalId) {
			clearInterval(clockIntervalId);
		}
		if (scaleCheckTimeout) {
			clearTimeout(scaleCheckTimeout);
		}
		if (transitionTimeout) {
			clearTimeout(transitionTimeout);
		}
		if (countdownIntervalId) {
			clearInterval(countdownIntervalId);
		}
		if (errorRetryTimeoutId) {
			clearTimeout(errorRetryTimeoutId);
		}
		if (resizeCleanup) {
			resizeCleanup();
		}
		if (resizeObserver) {
			resizeObserver.disconnect();
		}
	});

	function openConfig() {
		config.update((c) => ({ ...c, isEditing: true }));
	}

	function closeConfig() {
		// Cancel any changes by reloading or just hiding?
		// Existing cancel button just hides. Save button saves then hides.
		// Clicking outside usually implies cancel/dismiss.
		config.update((c) => ({ ...c, isEditing: false }));
	}

	function handleConfigSave() {
		loadNearby();
		// Reset to current polling interval
		if (intervalId) {
			clearInterval(intervalId);
		}
		intervalId = setInterval(loadNearby, currentPollingInterval);
	}

	function handleKeydown(e: KeyboardEvent) {
		if ($config.isEditing && e.key === 'Escape') {
			closeConfig();
		}
	}

	async function validateLocation(latitude: number, longitude: number) {
		if (!$config.isEditing) return; // Only validate during interactive config

		validatingLocation = true;
		validationMessage = null;
		validationSuccess = null;

		try {
			const routes = await findNearbyRoutes({ latitude, longitude }, $config.maxDistance);
			const count = routes.length;

			if (count > 0) {
				validationSuccess = true;
				validationMessage = $_('config.location.validationSuccess', {
					values: { count, plural: count !== 1 ? 's' : '' }
				});
			} else {
				validationSuccess = false;
				validationMessage = $_('config.location.validationNoRoutes');
			}
		} catch (error) {
			validationSuccess = false;
			validationMessage = $_('config.location.validationError');
		} finally {
			validatingLocation = false;
		}
	}

	function useCurrentLocation() {
		if (!browser || !navigator.geolocation) {
			locationError = $_('config.location.geolocationNotSupported');
			return;
		}

		gettingLocation = true;
		locationError = null;

		navigator.geolocation.getCurrentPosition(
			async (position) => {
				config.update((c) => ({
					...c,
					latLng: {
						latitude: position.coords.latitude,
						longitude: position.coords.longitude
					}
				}));
				gettingLocation = false;
				locationError = null;

				// Validate the location
				await validateLocation(position.coords.latitude, position.coords.longitude);
			},
			(error) => {
				gettingLocation = false;
				switch (error.code) {
					case error.PERMISSION_DENIED:
						locationError = $_('config.location.geolocationPermissionDenied');
						break;
					case error.POSITION_UNAVAILABLE:
						locationError = $_('config.location.geolocationUnavailable');
						break;
					case error.TIMEOUT:
						locationError = $_('config.location.geolocationTimeout');
						break;
					default:
						locationError = $_('config.location.geolocationError');
						break;
				}
			},
			{
				enableHighAccuracy: false,
				timeout: 10000,
				maximumAge: 0
			}
		);
	}

	function handleLocationInputBlur() {
		// Clear validation when user starts typing again
		validationMessage = null;
		validationSuccess = null;

		// Validate if we have valid coordinates
		if ($config.latLng && !isNaN($config.latLng.latitude) && !isNaN($config.latLng.longitude)) {
			validateLocation($config.latLng.latitude, $config.latLng.longitude);
		}
	}
</script>

<svelte:head>
	<title>{$config.title || $_('app.title')}</title>

	<link rel="icon" type="image/png" href="/assets/favicon-96x96.png" sizes="96x96" />
	<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
	<link rel="shortcut icon" href="/assets/favicon.ico" />
	<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-title" content="Headsign" />
	<link rel="manifest" href="/assets/site.webmanifest" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="container" style="--bg-header: {$config.headerColor}">
	<header>
		<table cellpadding="0" cellspacing="0" border="0">
			<tbody>
				<tr>
					<td id="logo">
						<div class="logo-container">
							<a href="https://transitapp.com" aria-label={$_('aria.transitApp')}>
								<img
									src="/assets/images/transit.svg"
									alt="Powered by Transit"
									class="transit-logo"
								/>
							</a>
							{#if $config.customLogo}
								<img
									src={$config.customLogo}
									alt={$_('aria.customLogo')}
									class="custom-logo"
									onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
								/>
							{/if}
						</div>
					</td>
					<td id="title">
						<h1>{$config.title || $_('app.nearbyRoutes')}</h1>
						<button type="button" onclick={openConfig} aria-label={$_('aria.settings')}
							><iconify-icon icon="ix:cogwheel-filled"></iconify-icon></button
						>
					</td>
					<td id="utilities">
						<span class="clock"
							>{formatTime(currentTime, $config.timeFormat, $config.language)}</span
						>
					</td>
				</tr>
			</tbody>
		</table>
	</header>

	<ConfigModal
		open={$config.isEditing}
		{allRoutes}
		{gettingLocation}
		{locationError}
		{validatingLocation}
		{validationMessage}
		{validationSuccess}
		{columnsWarning}
		{appVersion}
		{contentScale}
		onclose={closeConfig}
		{useCurrentLocation}
		{handleLocationInputBlur}
		{toggleRouteHidden}
		{toggleStopHidden}
		{toggleAgencyHidden}
		onsave={handleConfigSave}
	/>

	<div class="content">
		{#if errorMessage}
			<div
				class="error-banner"
				class:error-auth={errorType === 'auth'}
				class:error-timeout={errorType === 'timeout'}
				class:error-backend={errorType === 'backend'}
			>
				<iconify-icon icon={errorType === 'auth' ? 'ix:disconnected' : 'ix:warning-rhomb'}
				></iconify-icon>
				{errorMessage}
			</div>
		{/if}
		{#if loading}
			<div class="loading">{$_('routes.loading')}</div>
		{:else if routes.length === 0}
			<div class="no-routes">{$_('routes.noRoutes')}</div>
		{:else if $config.viewMode === 'vertical'}
			<section
				id="routes"
				bind:this={routesElement}
				class="cols-1 vertical-mode"
				style:--effective-scale={effectiveScale}
			>
				<VerticalView
					routes={displayRoutes}
					stopOrder={$config.stopOrder || []}
					showLongName={$config.showRouteLongName}
					showQRCode={$config.showQRCode && !$config.isEditing}
					crowdingMap={$config.showCrowding ? $crowdingStore : undefined}
					onMoveStop={moveStop}
					onMoveStopToTop={moveStopToTop}
					onHideRoute={toggleRouteHidden}
					onHideStop={toggleStopHidden}
				/>
			</section>
		{:else if $config.viewMode === 'board'}
			<section
				id="routes"
				bind:this={routesElement}
				class="board-mode"
				style:--effective-scale={effectiveScale}
			>
				<ListView
					routes={displayRoutes}
					stopOrder={$config.stopOrder || []}
					showLongName={$config.showRouteLongName}
					showQRCode={$config.showQRCode && !$config.isEditing}
					onMoveStop={moveStop}
					onMoveStopToTop={moveStopToTop}
					onHideRoute={toggleRouteHidden}
					onHideStop={toggleStopHidden}
				/>
			</section>
		{:else}
			<section
				id="routes"
				bind:this={routesElement}
				style:font-size={($config.scaleMode === 'manual' || shouldApplyAutoScale) &&
				effectiveScale < 1
					? `${effectiveScale * 100}%`
					: null}
				class:cols-1={$config.columns === 1}
				class:cols-2={$config.columns === 2}
				class:cols-3={$config.columns === 3}
				class:cols-4={$config.columns === 4}
				class:cols-5={$config.columns === 5}
				class:cols-6={$config.columns === 6}
				class:cols-7={$config.columns === 7}
				class:cols-8={$config.columns === 8}
			>
				{#each displayRoutes as route, index (`${route.global_route_id}-${route._splitIndex ?? 0}`)}
					<div class="route-wrapper" transition:fade={{ duration: 300 }}>
						<RouteItem {route} showLongName={$config.showRouteLongName} crowdingMap={$config.showCrowding ? $crowdingStore : undefined} />
						{#if route._splitIndex !== undefined && route._totalSplits !== undefined}
							<div class="route-split-badge">
								{route._splitIndex + 1}/{route._totalSplits}
							</div>
						{/if}
						<div class="route-controls">
							{#if index > 0}
								<button
									type="button"
									class="btn-route-control"
									onclick={() => moveRouteToTop(index)}
									aria-label={$_('aria.moveRouteToTop')}
									title={$_('routes.controls.moveToTop')}
								>
									<iconify-icon icon="ix:double-chevron-up"></iconify-icon>
								</button>
							{/if}
							{#if index > 0}
								<button
									type="button"
									class="btn-route-control"
									onclick={() => moveRoute(index, 'up')}
									aria-label={$_('aria.moveRouteUp')}
									title={$_('routes.controls.moveUp')}
								>
									<iconify-icon icon="ix:arrow-up"></iconify-icon>
								</button>
							{/if}
							{#if index < routes.length - 1}
								<button
									type="button"
									class="btn-route-control"
									onclick={() => moveRoute(index, 'down')}
									aria-label={$_('aria.moveRouteDown')}
									title={$_('routes.controls.moveDown')}
								>
									<iconify-icon icon="ix:arrow-down"></iconify-icon>
								</button>
							{/if}
							<button
								type="button"
								class="btn-route-control"
								onclick={() => toggleRouteHidden(route.global_route_id)}
								aria-label={$_('aria.hideRoute')}
								title={$_('routes.controls.hide')}
							>
								<iconify-icon icon="ix:eye-cancelled-filled"></iconify-icon>
							</button>
						</div>
					</div>
				{/each}
			</section>
		{/if}
	</div>

	{#if $config.showQRCode && !$config.isEditing && $config.viewMode !== 'board' && $config.viewMode !== 'vertical'}
		<div class="floating-qr">
			<p class="qr-label">
				<span class="qr-label-1">{$_('config.qrCode.scanPrompt')}<br /></span>
				<span class="qr-label-2">{$_('config.qrCode.scanPrompt2')}</span>
			</p>
			<QRCode latitude={$config.latLng.latitude} longitude={$config.latLng.longitude} size={100} />
		</div>
	{/if}
</div>

<style>
	iconify-icon {
		display: inline-block;
		width: 1em;
		height: 1em;
	}

	.container {
		width: 100%;
		height: 100%;
		background: var(--bg-primary);
	}

	.content {
		height: calc(100vh - 3em);
		position: relative;
	}

	.content section {
		height: 100%;
		width: 100%;
		overflow-y: auto;
		box-sizing: border-box;
		padding: 0;
	}

	#routes.vertical-mode {
		display: flex;
		flex-direction: column;
		overflow-y: hidden;
		grid-template-columns: none;
	}

	#routes.vertical-mode > :global(*) {
		width: 100%;
	}

	#routes.board-mode {
		display: flex;
		flex-direction: column;
		overflow-y: hidden;
		grid-template-columns: none;
	}

	#routes.board-mode > :global(*) {
		width: 100%;
		height: 100%;
	}

	#routes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(24em, 1fr));
		gap: 0;
		align-items: start;
		align-content: start;
		transition: font-size 0.4s ease-in;
	}

	header {
		color: var(--text-header);
		background-color: var(--bg-header);
		position: relative;
	}

	header table {
		width: 100%;
		table-layout: fixed;
	}

	#logo {
		width: 33%;
		min-width: 200px;
	}

	.logo-container {
		display: flex;
		align-items: center;
		gap: 0.5em;
		width: 100%;
	}

	.transit-logo {
		height: 3em;
		width: auto;
		display: block;
	}

	.custom-logo {
		height: 3em;
		width: auto;
		max-width: 120px;
		object-fit: contain;
		flex-shrink: 0;
	}

	#logo a {
		display: block;
		flex-shrink: 0;
		text-decoration: none;
	}

	#title {
		width: 34%;
		text-align: center;
		vertical-align: middle;
		border: none;
	}

	#title h1 {
		font-family: 'Overpass Variable', Helvetica, Arial, serif;
		font-size: 1.75em;
		vertical-align: middle;
		display: inline-block;
		line-height: 1.4em;
		margin-bottom: -0.1em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	#title button {
		padding: 0;
		margin-top: 0.45em;
		display: inline-block;
		width: 2em;
		height: 2em;
		background: none;
		background-size: 2em auto;
		outline: none;
		cursor: pointer;
		opacity: 0;
		/* transition: opacity 0.3s ease-in-out; */
		vertical-align: middle;
		border: none;
		backface-visibility: hidden;
		-webkit-font-smoothing: antialiased;
	}

	#title button iconify-icon {
		width: 2em;
		height: 2em;
		font-size: 2em;
		color: #ffffff;
		transform: translateY(-5%);
	}

	#title:hover button {
		opacity: 1;
	}

	#utilities {
		width: 30%;
		min-width: 15em;
		text-align: right;
		vertical-align: middle;
		padding-right: 1em;
	}

	.clock {
		font-size: 1.5em;
		font-family: 'Overpass Variable', Helvetica, Arial, serif;
		line-height: 2.1em;
		font-weight: 500;
		display: inline-block;
		margin-left: 3em;
		margin-right: 0.5em;
		vertical-align: middle;
	}

	.route-wrapper {
		box-sizing: border-box;
		position: relative;
		padding: 0.3em 0.4em;
		min-width: 0; /* Allow grid items to shrink below content size */
	}

	.route-split-badge {
		position: absolute;
		top: 0.8em;
		right: 0.8em;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.75);
		color: white;
		font-size: 0.85em;
		font-weight: 600;
		padding: 0.3em 0.5em;
		border-radius: 0.3em;
		z-index: 5;
		backdrop-filter: blur(4px);
		box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.2);
	}

	/* Manual column overrides */
	#routes.cols-1 {
		grid-template-columns: repeat(1, minmax(0, 1fr));
	}

	#routes.cols-2 {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	#routes.cols-3 {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	#routes.cols-4 {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	#routes.cols-5 {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}

	#routes.cols-6 {
		grid-template-columns: repeat(6, minmax(0, 1fr));
	}

	#routes.cols-7 {
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}

	#routes.cols-8 {
		grid-template-columns: repeat(8, minmax(0, 1fr));
	}

	.route-controls {
		position: absolute;
		top: 0.5em;
		right: 0.5em;
		display: flex;
		gap: 0.3em;
		opacity: 0;
		transition: opacity 0.2s;
		z-index: 10;
	}

	.route-wrapper:hover .route-controls {
		opacity: 1;
	}

	.btn-route-control {
		background: rgba(255, 255, 255, 0.95);
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 0.4em 0.6em;
		cursor: pointer;
		transition: background 0.2s;
		font-size: 0.9em;
	}

	.btn-route-control:hover {
		background: rgba(255, 255, 255, 1);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
	}

	.btn-route-control iconify-icon {
		display: block;
		width: 2em;
		height: auto;
		font-size: 1.25em;
	}

	.loading,
	.no-routes {
		text-align: center;
		padding: 3em;
		font-size: 1.5em;
		color: var(--text-secondary);
	}

	/* Floating QR Code Styles */
	.floating-qr {
		position: fixed;
		bottom: 1.5em;
		right: 0.75em;
		z-index: 100;
		background: var(--bg-header);
		padding: 1em;
		border-radius: 1em;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transition: transform 0.2s ease;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 1.2em;
		min-width: 19.8%;
		max-width: 24em;
		min-height: 125px;
		max-height: auto;
	}

	.floating-qr:hover {
		transform: scale(1.02);
	}

	.floating-qr :global(svg) {
		display: block;
		background: white;
		padding: 0.4em;
		border-radius: 8px;
		flex-shrink: 0;
	}

	.floating-qr :global(svg path),
	.floating-qr :global(svg rect),
	.floating-qr :global(svg circle),
	.floating-qr :global(svg polygon) {
		fill: var(--bg-header) !important;
	}

	.qr-label {
		margin: 0;
		color: white;
		font-size: 1.3em;
		text-align: left;
		letter-spacing: 0.02em;
		opacity: 0.95;
		flex: 1;
		overflow-wrap: break-word;
		line-height: 1.5;
	}
	.qr-label-1 {
		font-weight: 400;
	}
	.qr-label-2 {
		font-weight: bold;
	}

	.error-banner {
		position: fixed;
		top: 5.5em;
		left: 50%;
		transform: translateX(-50%);
		background: #e30079;
		color: white;
		padding: 1em 2em;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 200;
		font-size: 1.5em;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75em;
		animation: slideDown 0.3s ease-out;
	}

	.error-banner iconify-icon {
		font-size: 1.5em;
	}

	.error-banner.error-auth {
		background: #ff6b00;
	}

	.error-banner.error-timeout {
		background: #f59e0b;
	}

	.error-banner.error-backend {
		background: #8b5cf6;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
</style>
