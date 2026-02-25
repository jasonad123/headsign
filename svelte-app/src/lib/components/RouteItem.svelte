<script lang="ts">
	import { onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { config } from '$lib/stores/config';
	import type { Route, ScheduleItem, Itinerary, CrowdingMap } from '$lib/services/nearby';
	import CrowdingIcon from './CrowdingIcon.svelte';
	import { parseAlertContent, extractImageId } from '$lib/services/alerts';
	import { getMinutesUntil } from '$lib/utils/timeUtils';
	import { shouldShowDeparture } from '$lib/utils/departureFilters';

	let { route, showLongName = false, crowdingMap }: { route: Route; showLongName?: boolean; crowdingMap?: CrowdingMap } = $props();

	let useBlackText = $derived(route.route_text_color === '000000');
	let cellStyle = $derived(`background: #${route.route_color}; color: #${route.route_text_color}`);
	let imageSize = $derived((route.route_display_short_name?.elements?.length || 0) > 1 ? 28 : 34);

	// Smart route name for alerts
	let alertRouteName = $derived.by(() => {
		// SEPTA Metro: Letter-designated lines (L, B, M, D, etc.)
		// Example: L Line, B Line, M Line, D Line
		const shortName = route.route_short_name;
		if (shortName && /^[A-Z]$/.test(shortName) && route.route_network_name === 'SEPTA Metro') {
			return ''; // Pairs with line 89: returns "L Line"
		}

		// Prioritize long names containing "Line"
		if (route.route_long_name?.includes('Line')) {
			return route.route_long_name;
		}

		// LIRR: Use full branch name (e.g., "Montauk Branch", "City Terminal Zone")
		if (route.route_network_name === 'Long Island Rail Road' && route.route_long_name) {
			return route.route_long_name; // Pairs with line 104: returns ""
		}

		// GO Transit: Use long name for abbreviated routes (e.g., "Kitchener" not "KI")
		if (route.route_network_name === 'GO Transit' && route.route_long_name) {
			return route.route_long_name; // Pairs with line 200: returns "Line"
		}

		// Capitol Corridor: Use full name instead of abbreviation
		if (route.route_network_name === 'Capitol Corridor' && route.route_long_name) {
			return route.route_long_name; // Pairs with line 124: returns ""
		}

		const routeName = route.route_short_name || route.route_long_name;

		// Check if route name is numeric and mode_name doesn't contain Train/Subway/Metro
		if (routeName && /^\d+$/.test(routeName)) {
			const modeName = route.mode_name?.toLowerCase() || '';
			if (
				!modeName.includes('train') &&
				!modeName.includes('subway') &&
				!modeName.includes('metro') &&
				!modeName.includes('streetcar') &&
				!modeName.includes('light rail')
			) {
				return `Route ${routeName}`;
			}
		}

		// Name inversion for branded routes - Part 1: Hide route name
		// These pair with alertModeName checks below that prepend the brand name
		// Example: "E RapidRide" becomes "RapidRide E"

		// RapidRide (Seattle): Uppercase letter routes (A, B, C, etc.)
		if (routeName && /^[A-Z]+$/.test(routeName)) {
			const modeName = route.mode_name?.toLowerCase() || '';
			if (modeName.includes('rapidride')) {
				return ''; // Pairs with line 153: returns "RapidRide E"
			}
		}

		// CityLink (Baltimore): Word-based routes (Orange, Yellow, Navy, etc.)
		if (routeName && /^[a-zA-Z]+$/.test(routeName)) {
			const modeName = route.mode_name?.toLowerCase() || '';
			if (modeName.includes('citylink')) {
				return ''; // Pairs with line 161: returns "CityLink Orange"
			}
		}

		// TTC Toronto: Numbered subway/streetcar lines (1, 2, 4, etc.)
		// TTS name is "line 2" (starts with "line") and mode is "Subway", so we invert to "Line 2"
		// Note: BART "yellow line" (ends with "line") and Seattle "1 Line" (Light Rail) do NOT get inverted
		if (routeName && /^\d+$/.test(routeName)) {
			const modeName = route.mode_name?.toLowerCase() || '';
			const ttsName = route.tts_short_name?.toLowerCase() || '';
			if (
				modeName.includes('subway') &&
				ttsName.startsWith('line') &&
				route.route_network_name === 'TTC'
			) {
				return ''; // Pairs with line 125: returns "Line 2"
			}
		}

		// SF Muni: Hide route name so full designation appears in alertModeName
		// Example: "N" hidden here, "N Judah" shown by line 99
		if (route.mode_name?.includes('Muni')) {
			return ''; // Pairs with line 99: returns "N Judah"
		}

		return routeName;
	});

	// Smart mode name for alerts
	let alertModeName = $derived.by(() => {
		const modeName = route.mode_name;
		const shortName = route.route_short_name;

		// SEPTA Metro: Letter-designated lines (L, B, M, D, etc.)
		if (shortName && /^[A-Z]$/.test(shortName) && route.route_network_name === 'SEPTA Metro') {
			return `${shortName} Line`; // Pairs with line 20: routeName returns ''
		}

		// Hide mode name if route long name already contains "Line"
		if (route.route_long_name?.includes('Line')) {
			return '';
		}

		// LIRR: Hide mode name (full branch name shown in alertRouteName)
		if (route.route_network_name === 'Long Island Rail Road') {
			return ''; // Pairs with line 30: returns route_long_name
		}

		// ACE: Branded service, hide mode name (just show "ACE")
		if (route.route_network_name === 'ACE') {
			return ''; // Returns just "ACE" without "Line"
		}

		// Capitol Corridor: Branded corridor name, hide mode name
		if (route.route_network_name === 'Capitol Corridor') {
			return ''; // Pairs with line 40: returns "Capitol Corridor"
		}

		// Hide mode name when it matches the route name (e.g., Caltrain)
		if (modeName && (modeName === shortName || modeName === route.route_long_name)) {
			return ''; // Prevents "Caltrain Caltrain"
		}

		// SF Muni-specific: Combine short name + long name (e.g., "N Judah", "K Ingleside")
		if (modeName?.includes('Muni') && shortName && route.route_long_name) {
			return `${shortName} ${route.route_long_name}`;
		}

		// Generic replacements for common mode types
		// If Metro or Light Rail, generically return "Line"
		if (modeName?.includes('Metro') || modeName?.includes('Light Rail')) {
			return 'Line';
		}

		// Canadian systems - brand name already in route name
		if (modeName?.includes('MAX') || modeName?.includes('REM')) {
			return '';
		}

		if (shortName?.includes('SeaBus')) {
			return '';
		}

		// Subway route differentiation using tts_short_name and route_network_name
		// Toronto TTC uses "line 2", NYC MTA uses "7 train", BART uses "yellow line"
		if (modeName?.includes('Subway') && shortName) {
			const ttsName = route.tts_short_name?.toLowerCase() || '';

			// Toronto TTC: TTS starts with "line" (e.g., "line 2")
			// Name inversion: "2" + "Line" becomes "Line 2"
			if (ttsName.startsWith('line') && route.route_network_name === 'TTC') {
				return `Line ${shortName}`; // Pairs with line 69: routeName returns ''
			}

			// BART: Color-based lines with TTS ending with "line" (e.g., "yellow line")
			// No inversion needed, generic "Line" suffix
			if (ttsName.endsWith('line') && route.route_network_name === 'BART') {
				return 'Line';
			}

			// NYC MTA: routes with "train" in TTS name (both letters like "Q train" and numbers like "7 train")
			if (ttsName.includes('train') && route.route_network_name === 'NYC Subway') {
				return 'Train';
			}
		}

		// Hide generic "Bus" mode name (route number is sufficient)
		if (modeName?.includes('Bus')) {
			return '';
		}

		// Name inversion for branded routes - Part 2: Prepend brand to route name
		// These pair with alertRouteName checks above that hide the route name
		// Example: "E" + "RapidRide" becomes "RapidRide E"

		// RapidRide (Seattle): Uppercase letter routes (A, B, C, E, etc.)
		if (shortName && /^[A-Z]+$/.test(shortName)) {
			const modeNameLower = route.mode_name?.toLowerCase() || '';
			if (modeNameLower.includes('rapidride')) {
				return `RapidRide ${shortName}`; // Pairs with line 50: routeName returns ''
			}
		}

		// CityLink (Baltimore): Word routes (Orange, Yellow, Navy, etc.)
		if (shortName && /^[a-zA-Z]+$/.test(shortName)) {
			const modeNameLower = route.mode_name?.toLowerCase() || '';
			if (modeNameLower.includes('citylink')) {
				return `CityLink ${shortName}`; // Pairs with line 58: routeName returns ''
			}
		}

		// Generic Commuter Rail fallback: Replace "Commuter Rail" with "Line"
		// Handles MARC, GO Transit, and other systems not caught by specific checks above
		if (modeName === 'Commuter Rail') {
			return 'Line';
		}

		return modeName;
	});

	const MAJOR_COLOURS = new Set([
		'Red',
		'Blue',
		'Green',
		'Yellow',
		'Orange',
		'Purple',
		'Pink',
		'Brown',
		'Black',
		'White',
		'Grey',
		'Gray',
		'Silver',
		'Gold',
		'Violet',
		'Indigo',
		'Cyan',
		'Magenta'
	]);

	const MAX_LONG_NAME_LENGTH = 12;

	let miniRouteName = $derived.by(() => {
		const boxedText = route.route_display_short_name?.boxed_text;
		const shortName = route.route_short_name || '';
		let longName = route.route_long_name || '';

		// 1. Priority: Boxed Text
		if (boxedText) return boxedText;

		// 2. Priority: Recognized Major Color
		if (shortName && MAJOR_COLOURS.has(shortName)) {
			return shortName;
		}

		// 3. Process Long Name
		if (longName) {
			// A. Strip " Line"
			if (longName.endsWith(' Line')) {
				longName = longName.slice(0, -5);
			}

			// // B. Handle Hyphenated names (e.g., "Azusa - Long Beach" -> "Azusa")
			// if (longName.includes(" - ")) {
			// 	longName = longName.split(" - ")[0];
			// }

			// C. Length Validation
			if (longName.length <= MAX_LONG_NAME_LENGTH) {
				return longName;
			}
		}

		// 4. Final Fallback:
		// If the long name is still too long after processing,
		// use the shortName (even if it's 1-3 chars), because "A" is better than
		// a giant string that breaks the UI.
		return shortName || longName || '';
	});

	let destinationElements: Map<number, HTMLElement> = new Map();
	let overflowingDestinations = $state<Set<number>>(new Set());
	let sharedResizeObserver: ResizeObserver | null = null;

	// Route header overflow handling
	let routeHeaderElement: HTMLElement | null = null;
	let routeHeaderTextScale = $state(1);
	let routeHeaderShouldWrap = $state(false);
	let routeHeaderIconScale = $state(1);
	let headerCheckTimeout: ReturnType<typeof setTimeout> | null = null;
	let headerCheckTimeouts: Array<ReturnType<typeof setTimeout>> = [];
	let headerCheckVersion = 0; // Track current check version to prevent race conditions

	// Track dark mode state
	let isDarkMode = $state(false);
	let themeObserver: MutationObserver | null = null;

	if (browser) {
		isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

		// Watch for theme changes
		themeObserver = new MutationObserver(() => {
			isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
	}

	// Initialize shared ResizeObserver on mount
	if (browser) {
		sharedResizeObserver = new ResizeObserver((entries) => {
			entries.forEach((entry) => {
				const element = entry.target as HTMLElement;

				// Check if this is the route header element
				if (element === routeHeaderElement) {
					checkRouteHeaderOverflow(element);
					return;
				}

				// Check if this is a destination element
				const destIndex = Array.from(destinationElements.entries()).find(
					([_, el]) => el === element
				)?.[0];
				if (destIndex !== undefined) {
					checkDestinationOverflow(destIndex, element);
					return;
				}

				// Check if this is the alert element
				if (element === alertElement) {
					checkAlertOverflow(element);
					return;
				}

				// Check if this is the alert header element
				if (element === alertHeaderElement) {
					checkAlertHeaderOverflow(element);
					return;
				}
			});
		});
	}

	onDestroy(() => {
		if (themeObserver) {
			themeObserver.disconnect();
			themeObserver = null;
		}
		if (sharedResizeObserver) {
			sharedResizeObserver.disconnect();
			sharedResizeObserver = null;
		}
		// Clear any pending timeouts
		destinationCheckTimeouts.forEach((timeout) => clearTimeout(timeout));
		destinationCheckTimeouts.clear();
		if (alertCheckTimeout) clearTimeout(alertCheckTimeout);
		if (headerCheckTimeout) clearTimeout(headerCheckTimeout);
		headerCheckTimeouts.forEach((timeout) => clearTimeout(timeout));
		headerCheckTimeouts = [];

		// Clear all element references to prevent memory leaks
		destinationElements.clear();
		overflowingDestinations = new Set();
		routeHeaderElement = null;
		alertElement = null;
		alertHeaderElement = null;
	});

	// Calculate relative luminance (0-1) from hex color
	function getRelativeLuminance(hex: string): number {
		const rgb = parseInt(hex, 16);
		const r = ((rgb >> 16) & 0xff) / 255;
		const g = ((rgb >> 8) & 0xff) / 255;
		const b = (rgb & 0xff) / 255;

		// Convert to linear RGB
		const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
		const rLinear = toLinear(r);
		const gLinear = toLinear(g);
		const bLinear = toLinear(b);

		// Calculate luminance
		return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
	}

	// Check if we should invert in dark mode:
	// Only invert if route_color is extremely dark (near black) AND route_text_color is light
	// This catches cases like SamTrans 292 (luminance 0.022, dark navy with white text)
	// But avoids medium-dark colors like #a81c22 (0.09), #005b95 (0.10), etc.
	let shouldInvertInDarkMode = $derived(
		getRelativeLuminance(route.route_color) < 0.05 &&
			getRelativeLuminance(route.route_text_color) > 0.5
	);

	// Check if route has light colors (for wave icon selection in dark mode)
	// Light colored routes like Orange (#f9461c) or Silver (#a7a9ac) need dark waves in dark mode
	let hasLightColor = $derived(getRelativeLuminance(route.route_color) > 0.3);

	// Helper function to check if route icon is an image (not text)
	function isRouteIconImage(): boolean {
		// Check if first element is an image (has getImageUrl)
		return !!getImageUrl(0);
	}

	// Helper function to check if there's adjacent text next to route icon
	function hasAdjacentText(): boolean {
		// Check if there are multiple elements and the second one is text
		return (
			(route.route_display_short_name?.elements?.length || 0) > 1 &&
			!!route.route_display_short_name?.elements?.[1]?.trim()
		);
	}

	// Determine if we should show the route long name based on targeted conditions

	const routeShortTooShort = $derived((route.route_short_name?.length || 0) < 3);

	// Original test: show long name if boxed text or long name exists
	// let shouldShowRouteLongName = $derived(
	// 	showLongName &&
	// 		!routeShortTooShort &&
	// 		(!!route.route_display_short_name?.boxed_text || !!route.route_long_name) &&
	// 		isRouteIconImage() &&
	// 		!hasAdjacentText()
	// );

	// Test: using value route_name_redundancy to determine if we should show the route long name

	let shouldShowRouteLongName = $derived(
		showLongName &&
			!routeShortTooShort &&
			!route.compact_display_short_name?.route_name_redundancy &&
			isRouteIconImage() &&
			!hasAdjacentText()
	);

	// Complex logos that should not be recolored (contain their own internal colors)
	const COMPLEX_LOGOS = new Set(['ccjpaca-logo']);

	// Manual color overrides for specific logos
	// Options:
	//   - alwaysUseDarkModeColor: boolean - Always use the dark mode color calculation
	//   - alwaysUseLightModeColor: boolean - Always use the light mode color calculation
	//   - color: string - Always use this specific hex color (e.g., 'FF0000')
	const COLOR_OVERRIDES = new Map<
		string,
		{
			alwaysUseDarkModeColor?: boolean;
			alwaysUseLightModeColor?: boolean;
			color?: string;
		}
	>([
		// Example: Always use dark mode color (even in light mode)
		// ['wmata-metrorail-orange-v2', { alwaysUseDarkModeColor: true }],
		// ['mla-j', { alwaysUseDarkModeColor: true }],
		// ['bart-y', { alwaysUseDarkModeColor: true }],
		// ['mta-subway-n', { alwaysUseDarkModeColor: true }],
		// ['stm-metro', { alwaysUseDarkModeColor: true }],
		// Example: Always use light mode color (even in dark mode)
		// ['another-logo', { alwaysUseLightModeColor: true }],
		// Example: Always use a specific color
		// ['third-logo', { color: 'FF0000' }],
	]);

	// Route color overrides for route backgrounds and text
	// Options:
	//   - alwaysUseLightModeColors: boolean - Use light mode colors even in dark mode
	//   - alwaysUseDarkModeColors: boolean - Use dark mode colors even in light mode
	const ROUTE_COLOR_OVERRIDES = new Map<
		string,
		{
			alwaysUseLightModeColors?: boolean;
			alwaysUseDarkModeColors?: boolean;
		}
	>([
		// Certain routes with orange backgrounds need to keep black text in dark mode
		// ['GOTRANSIT:1115', { alwaysUseDarkModeColors: true }], // Route 19
		// ['GOTRANSIT:1120', { alwaysUseDarkModeColors: true }],
		['MUNI:4578', { alwaysUseDarkModeColors: true }] // Route 27
	]);

	function getImageUrl(index: number): string | null {
		if (route.route_display_short_name?.elements?.[index]) {
			const iconName = route.route_display_short_name.elements[index];

			// Complex logos should not have color applied - they have their own internal colors
			if (COMPLEX_LOGOS.has(iconName)) {
				return `/api/images/${iconName}.svg`;
			}

			// Check for manual color overrides (icon-specific or route-level)
			const iconOverride = COLOR_OVERRIDES.get(iconName);
			const routeOverride = ROUTE_COLOR_OVERRIDES.get(route.global_route_id);
			let hex: string;

			// Determine which mode's color logic to use
			let useLightMode: boolean;
			if (iconOverride) {
				// Icon-specific overrides take precedence
				useLightMode = iconOverride.alwaysUseLightModeColor
					? true
					: iconOverride.alwaysUseDarkModeColor
						? false
						: !isDarkMode;
			} else if (routeOverride) {
				// Route-level overrides
				useLightMode = routeOverride.alwaysUseLightModeColors
					? true
					: routeOverride.alwaysUseDarkModeColors
						? false
						: !isDarkMode;
			} else {
				// No overrides - use actual mode
				useLightMode = !isDarkMode;
			}

			// Apply color based on determined mode
			if (iconOverride?.color) {
				// Fixed color override
				hex = iconOverride.color;
			} else if (useLightMode) {
				// Light mode calculation
				// Use route color if vibrant enough (luminance > 0.15), otherwise black
				const routeLuminance = getRelativeLuminance(route.route_color);
				hex = useBlackText && routeLuminance < 0.15 ? '000000' : route.route_color;
			} else {
				// Dark mode calculation
				hex = shouldInvertInDarkMode ? route.route_text_color : route.route_color;
			}

			let secondaryHex: string;
			if (iconOverride?.color) {
				secondaryHex = route.route_text_color;
			} else if (useLightMode) {
				secondaryHex = route.route_text_color;
			} else {
				secondaryHex = shouldInvertInDarkMode ? route.route_color : route.route_text_color;
			}

			return `/api/images/${iconName}.svg?primaryColor=${hex}&secondaryColor=${secondaryHex}`;
		}
		return null;
	}

	// Determine text color for route icon and name
	let routeDisplayColor = $derived.by(() => {
		const override = ROUTE_COLOR_OVERRIDES.get(route.global_route_id);

		// Determine which mode's color logic to use
		const useLightMode = override?.alwaysUseLightModeColors
			? true
			: override?.alwaysUseDarkModeColors
				? false
				: !isDarkMode;

		if (useLightMode) {
			// Light mode: use route color if vibrant enough, otherwise black
			// Bright/vibrant colors (luminance > 0.15) should display in their color even with black text
			// Very dark colors with black text should render as black
			const routeLuminance = getRelativeLuminance(route.route_color);
			return useBlackText && routeLuminance < 0.15 ? '#000000' : `#${route.route_color}`;
		} else {
			// Dark mode: invert if very dark bg + light text, otherwise use route color
			return shouldInvertInDarkMode ? `#${route.route_text_color}` : `#${route.route_color}`;
		}
	});

	// Calculate contrast ratio between two colors (WCAG formula)
	function getContrastRatio(lum1: number, lum2: number): number {
		const lighter = Math.max(lum1, lum2);
		const darker = Math.min(lum1, lum2);
		return (lighter + 0.05) / (darker + 0.05);
	}

	// Stop name color: use route color if contrast is acceptable, otherwise use default text
	let stopNameColor = $derived.by(() => {
		// Get the route display color (remove # prefix)
		const routeColorHex = routeDisplayColor.replace('#', '');
		const routeColorLum = getRelativeLuminance(routeColorHex);

		// Background luminance (light mode: white ~1.0, dark mode: dark ~0.05)
		const bgLum = isDarkMode ? 0.03 : 1.0;

		// Check contrast ratio with mode-specific thresholds
		// Light mode: 2.0:1 (stricter - light colors on white are harder to see)
		//   Allows: Green (3.59:1), Blue (5.65:1), Orange (2.54:1)
		//   Forces default: Yellow (1.52:1), Silver (1.61:1)
		// Dark mode: 1.5:1 (more lenient - most colors pop on dark backgrounds)
		//   Allows: Blue (1.86:1), Green (2.93:1), Orange (4.13:1)
		const contrast = getContrastRatio(routeColorLum, bgLum);
		const threshold = isDarkMode ? 1.5 : 2.0;

		// If contrast is sufficient, use route color; otherwise use default text color
		return contrast >= threshold ? routeDisplayColor : 'var(--text-primary)';
	});

	// PERFORMANCE FIX: Cache stop IDs to avoid creating new Set on every alert check
	let localStopIds = $derived.by(() => {
		const stopIds = new Set<string>();
		route.itineraries?.forEach((itinerary) => {
			const stopId = itinerary.closest_stop?.global_stop_id;
			if (stopId) {
				stopIds.add(stopId);
			}
		});
		return stopIds;
	});

	function isAlertRelevantToRoute(alert: any): boolean {
		if (
			!alert.informed_entities ||
			!Array.isArray(alert.informed_entities) ||
			alert.informed_entities.length === 0
		) {
			return true;
		}

		return alert.informed_entities.some((entity: any) => {
			const hasRouteId = !!entity.global_route_id;
			const hasStopId = !!entity.global_stop_id;

			if (!hasRouteId && !hasStopId) {
				return true;
			}

			const routeMatches = !hasRouteId || entity.global_route_id === route.global_route_id;
			const stopMatches = !hasStopId || localStopIds.has(entity.global_stop_id);

			return routeMatches && stopMatches;
		});
	}

	// PERFORMANCE FIX: Cache filtered alerts instead of calling filter multiple times
	let relevantAlerts = $derived.by(() => {
		if (!route.alerts?.length) return [];
		return route.alerts.filter(isAlertRelevantToRoute);
	});

	// PERFORMANCE FIX: Cache alert text to avoid regenerating on every render
	let alertText = $derived.by(() => {
		if (!relevantAlerts.length) return '';

		return relevantAlerts
			.map((alert) => {
				const hasTitle = alert.title && alert.title.trim().length > 0;
				const hasDescription = alert.description && alert.description.trim().length > 0;

				if (hasTitle && hasDescription) {
					return `${alert.title}\n\n${alert.description}`;
				} else if (hasTitle) {
					return alert.title;
				} else if (hasDescription) {
					return alert.description;
				} else {
					return $_('alerts.default');
				}
			})
			.join('\n\n---\n\n');
	});

	let relevantAlertCount = $derived(relevantAlerts.length);

	// PERFORMANCE FIX: Cache severity level instead of recomputing multiple times per template render
	let mostSevereLevel = $derived.by(() => {
		if (!relevantAlerts.length) return 'info';

		// Check for severe first, then warning, then info
		if (relevantAlerts.some((a) => (a.severity || 'Info').toLowerCase() === 'severe')) {
			return 'severe';
		}
		if (relevantAlerts.some((a) => (a.severity || 'Info').toLowerCase() === 'warning')) {
			return 'warning';
		}
		return 'info';
	});

	// PERFORMANCE FIX: Cache icon based on severity level
	let mostSevereIcon = $derived.by(() => {
		if (mostSevereLevel === 'severe') return 'ix:warning-octagon-filled';
		if (mostSevereLevel === 'warning') return 'ix:warning-filled';
		return 'ix:about-filled';
	});

	let alertElement: HTMLElement | null = null;
	let isAlertOverflowing = $state(false);
	let shouldScrollAlert = $derived(
		relevantAlertCount > 1 || (relevantAlertCount === 1 && isAlertOverflowing)
	);

	let alertHeaderElement: HTMLElement | null = null;
	let isAlertHeaderOverflowing = $state(false);

	let destinationCheckTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

	function checkDestinationOverflow(index: number, element: HTMLElement) {
		if (!element) return;

		// Debounce resize checks
		const existing = destinationCheckTimeouts.get(index);
		if (existing) clearTimeout(existing);

		const timeout = setTimeout(() => {
			requestAnimationFrame(() => {
				// Check if content width exceeds element's actual width (not parent)
				// Using element.offsetWidth gives us the constrained flex width
				const isOverflowing = element.scrollWidth > element.offsetWidth;
				const newSet = new Set(overflowingDestinations);
				if (isOverflowing) {
					newSet.add(index);
				} else {
					newSet.delete(index);
				}
				overflowingDestinations = newSet;
			});
		}, 150);

		destinationCheckTimeouts.set(index, timeout);
	}

	let alertCheckTimeout: ReturnType<typeof setTimeout> | null = null;

	function checkAlertOverflow(element: HTMLElement) {
		if (!element) return;
		const parent = element.parentElement;
		if (!parent) return;

		// Debounce resize checks
		if (alertCheckTimeout) clearTimeout(alertCheckTimeout);

		alertCheckTimeout = setTimeout(() => {
			requestAnimationFrame(() => {
				isAlertOverflowing = element.scrollHeight > parent.clientHeight;
			});
		}, 150);
	}

	let alertHeaderCheckTimeout: ReturnType<typeof setTimeout> | null = null;

	function checkAlertHeaderOverflow(element: HTMLElement) {
		if (!element) return;
		const parent = element.parentElement;
		if (!parent) return;

		// Debounce resize checks
		if (alertHeaderCheckTimeout) clearTimeout(alertHeaderCheckTimeout);

		alertHeaderCheckTimeout = setTimeout(() => {
			requestAnimationFrame(() => {
				// Check if content width exceeds element's actual width (not parent)
				// Using element.offsetWidth gives us the constrained flex width
				// Add 2px threshold to account for sub-pixel rendering
				isAlertHeaderOverflowing = element.scrollWidth > element.offsetWidth + 2;
			});
		}, 150);
	}

	function checkRouteHeaderOverflow(headerElement: HTMLElement) {
		if (!headerElement) return;

		// Clear previous check cycle to prevent race conditions
		if (headerCheckTimeout) clearTimeout(headerCheckTimeout);
		headerCheckTimeouts.forEach((timeout) => clearTimeout(timeout));
		headerCheckTimeouts = [];

		// Increment version to invalidate any in-flight checks
		headerCheckVersion++;
		const currentVersion = headerCheckVersion;

		headerCheckTimeout = setTimeout(() => {
			requestAnimationFrame(() => {
				// Verify we're still the current check
				if (currentVersion !== headerCheckVersion) return;

				const routeIconElement = headerElement.querySelector('.route-icon') as HTMLElement;
				if (!routeIconElement) return;

				// Get the available width (h2 container width minus padding)
				const containerWidth = headerElement.clientWidth;
				const iconWrapperWidth = routeIconElement.scrollWidth;

				// Check if content overflows
				if (iconWrapperWidth <= containerWidth) {
					// No overflow - reset all scaling
					routeHeaderTextScale = 1;
					routeHeaderShouldWrap = false;
					routeHeaderIconScale = 1;
					return;
				}

				// Strategy 1: Scale text only (within the route-icon span)
				// Find the text span element (second child)
				const textSpan = routeIconElement.querySelector(
					'span:not(.route-long-name)'
				) as HTMLElement;
				if (textSpan) {
					// Try scaling text from 1.0 down to 0.65
					const textScale = Math.max(0.65, containerWidth / iconWrapperWidth);
					routeHeaderTextScale = textScale;

					// Re-measure after text scaling (need to wait for next frame)
					const timeout1 = setTimeout(() => {
						requestAnimationFrame(() => {
							// Verify we're still the current check and element still exists
							if (currentVersion !== headerCheckVersion || !routeIconElement.isConnected) return;

							const newWidth = routeIconElement.scrollWidth;
							if (newWidth <= containerWidth) {
								// Text scaling worked!
								routeHeaderShouldWrap = false;
								routeHeaderIconScale = 1;
								return;
							}

							// Strategy 2: Allow text to wrap
							routeHeaderTextScale = 1; // Reset text scale
							routeHeaderShouldWrap = true;

							const timeout2 = setTimeout(() => {
								requestAnimationFrame(() => {
									// Verify we're still the current check and element still exists
									if (currentVersion !== headerCheckVersion || !routeIconElement.isConnected)
										return;

									const wrappedWidth = routeIconElement.scrollWidth;
									if (wrappedWidth <= containerWidth) {
										// Wrapping worked!
										routeHeaderIconScale = 1;
										return;
									}

									// Strategy 3: Scale entire icon container (icons + text)
									routeHeaderShouldWrap = false; // Reset wrap
									const iconScale = Math.max(0.65, (containerWidth - 4) / iconWrapperWidth);
									routeHeaderIconScale = iconScale;
								});
							}, 10);
							headerCheckTimeouts.push(timeout2);
						});
					}, 10);
					headerCheckTimeouts.push(timeout1);
				} else {
					// No text span found - just scale the whole icon
					const iconScale = Math.max(0.65, (containerWidth - 4) / iconWrapperWidth);
					routeHeaderIconScale = iconScale;
				}
			});
		}, 150);
	}

	function bindDestinationElement(node: HTMLElement, index: number) {
		destinationElements.set(index, node);

		// Wait for layout to settle before checking overflow
		setTimeout(() => {
			checkDestinationOverflow(index, node);
		}, 100);

		if (sharedResizeObserver) {
			sharedResizeObserver.observe(node);
		}

		return {
			destroy() {
				if (sharedResizeObserver) {
					sharedResizeObserver.unobserve(node);
				}
				destinationElements.delete(index);
			}
		};
	}

	function bindAlertElement(node: HTMLElement) {
		alertElement = node;

		// Wait for layout to settle before checking overflow
		setTimeout(() => {
			checkAlertOverflow(node);
		}, 100);

		if (sharedResizeObserver) {
			sharedResizeObserver.observe(node);
		}

		return {
			destroy() {
				if (sharedResizeObserver) {
					sharedResizeObserver.unobserve(node);
				}
				alertElement = null;
			}
		};
	}

	function bindAlertHeaderElement(node: HTMLElement) {
		alertHeaderElement = node;

		// Wait for layout to settle before checking overflow
		setTimeout(() => {
			checkAlertHeaderOverflow(node);
		}, 100);

		if (sharedResizeObserver) {
			sharedResizeObserver.observe(node);
		}

		return {
			destroy() {
				if (sharedResizeObserver) {
					sharedResizeObserver.unobserve(node);
				}
				alertHeaderElement = null;
			}
		};
	}

	function bindRouteHeaderElement(node: HTMLElement) {
		routeHeaderElement = node;

		// Wait for layout to settle before checking overflow
		setTimeout(() => {
			checkRouteHeaderOverflow(node);
		}, 100);

		if (sharedResizeObserver) {
			sharedResizeObserver.observe(node);
		}

		return {
			destroy() {
				if (sharedResizeObserver) {
					sharedResizeObserver.unobserve(node);
				}
				routeHeaderElement = null;
			}
		};
	}

	// Group itineraries by parent station
	interface ItineraryGroup {
		stopId: string;
		stopName: string;
		itineraries: Itinerary[];
	}

	function groupItinerariesByStop(): ItineraryGroup[] {
		if (!route.itineraries) return [];

		const groups = new Map<string, ItineraryGroup>();

		route.itineraries.forEach((itinerary) => {
			const stopId =
				itinerary.closest_stop?.parent_station_global_stop_id ||
				itinerary.closest_stop?.global_stop_id ||
				'unknown';
			const stopName = itinerary.closest_stop?.stop_name || 'Unknown stop';

			if (!groups.has(stopId)) {
				groups.set(stopId, {
					stopId,
					stopName,
					itineraries: []
				});
			}

			groups.get(stopId)!.itineraries.push(itinerary);
		});

		return Array.from(groups.values());
	}

	let itineraryGroups = $derived(
		$config.groupItinerariesByStop
			? groupItinerariesByStop()
			: route.itineraries?.map((itinerary) => ({
					stopId: itinerary.closest_stop?.global_stop_id || 'unknown',
					stopName: itinerary.closest_stop?.stop_name || 'Unknown stop',
					itineraries: [itinerary]
				})) || []
	);
</script>

<div
	class="route"
	class:white={useBlackText && !isDarkMode}
	class:light-in-dark={isDarkMode && hasLightColor}
	style="color: {routeDisplayColor}"
>
	<h2 use:bindRouteHeaderElement>
		<span
			class="route-icon"
			class:icon-scaled={routeHeaderIconScale !== 1}
			class:allow-wrap={routeHeaderShouldWrap}
			style:transform={routeHeaderIconScale !== 1 ? `scale(${routeHeaderIconScale})` : ''}
			style:transform-origin="left center"
		>
			{#if route.route_display_short_name?.elements}
				{#if getImageUrl(0)}
					<img class="img{imageSize}" src={getImageUrl(0)} alt="Route icon" />
				{/if}
				<span
					class="route-icon-text"
					class:text-scaled={routeHeaderTextScale !== 1}
					class:text-wrapped={routeHeaderShouldWrap}
					style:transform={routeHeaderTextScale !== 1 ? `scale(${routeHeaderTextScale})` : ''}
					style:transform-origin="left center"
					>{route.route_display_short_name.elements[1] || ''}<i>{route.branch_code || ''}</i></span
				>
				{#if getImageUrl(2)}
					<img class="img{imageSize}" src={getImageUrl(2)} alt="Route icon" />
				{/if}
			{/if}
		</span>
		{#if shouldShowRouteLongName}
			<span class="route-long-name" style={cellStyle}>{miniRouteName}</span>
		{/if}
	</h2>

	{#if itineraryGroups.length > 0}
		{#each itineraryGroups as group, groupIndex}
			<div class="content">
				<div class="stop_name" style="color: {stopNameColor}">
					<iconify-icon icon="ix:location-filled"></iconify-icon>
					{group.stopName}
				</div>
				{#each group.itineraries as dir, index}
					{@const globalIndex =
						itineraryGroups.slice(0, groupIndex).reduce((sum, g) => sum + g.itineraries.length, 0) +
						index}
					<div
						class="direction"
						style="{cellStyle}; --route-color: #{route.route_color}"
						class:first-branch={index === 0}
						class:multi-branch={group.itineraries.length > 1}
					>
						<h3>
							{#if dir.branch_code}
								<span class="branch-code-badge">{dir.branch_code}</span>
							{/if}
							<span
								class="destination-text"
								class:scrolling={overflowingDestinations.has(globalIndex)}
								use:bindDestinationElement={globalIndex}
								>{dir.merged_headsign || dir.direction_headsign || 'Unknown destination'}</span
							>
						</h3>

						<div class="time">
							{#each dir.schedule_items?.filter(shouldShowDeparture).slice(0, 3) || [] as item}
								<h4>
									<span class:cancelled={item.is_cancelled}
										>{getMinutesUntil(item.departure_time)}</span
									>
									{#if item.is_real_time}
										<i class="realtime"></i>
									{/if}
									<small class:last={item.is_last}>{item.is_last ? 'last' : 'min'}</small>
									{#if crowdingMap && item.rt_trip_id}
										<CrowdingIcon level={crowdingMap.get(item.rt_trip_id)} />
									{/if}
								</h4>
							{/each}
							{#each Array(Math.max(0, 3 - (dir.schedule_items?.filter(shouldShowDeparture).length || 0))) as _}
								<!-- svelte-ignore a11y_missing_content -->
								<h4>
									<span class="inactive">&nbsp;</span>
									<small>&nbsp;</small>
								</h4>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/each}
	{/if}

	{#if relevantAlerts.length > 0}
		<div>
			<div
				class="route-alert-header"
				class:severe={mostSevereLevel === 'severe'}
				class:warning={mostSevereLevel === 'warning'}
				class:info={mostSevereLevel === 'info'}
				style={mostSevereLevel === 'info'
					? `${cellStyle}; --alert-bg-color: #${route.route_color}`
					: ''}
			>
				<iconify-icon icon={mostSevereIcon}></iconify-icon>
				<span
					class="alert-header-text"
					class:scrolling={isAlertHeaderOverflowing}
					use:bindAlertHeaderElement
					>{$_('alerts.title')} - {[alertRouteName, alertModeName].filter(Boolean).join(' ')}</span
				>
				<span class="alert-count-badge">{relevantAlertCount}</span>
			</div>
			<div
				class="route-alert-ticker"
				class:grouped-alerts={$config.groupItinerariesByStop}
				style={cellStyle}
			>
				<div class="alert-text" class:scrolling={shouldScrollAlert} use:bindAlertElement>
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
		</div>
	{/if}
</div>

<style>
	.route {
		width: 100%;
		box-sizing: border-box;
		contain: layout style;
		display: flex;
		flex-direction: column;
	}

	.route > div {
		padding: 0.25em 0.25em 0.3em;
		border-radius: 0.5em;
	}

	.route > div:hover {
		background: rgba(255, 255, 255, 0.6);
		cursor: move;
	}

	.route > div:last-child {
		flex-shrink: 0;
	}

	.route h2 {
		position: relative;
		padding-left: 0.15em;
		padding-bottom: -0.2em;
		padding-top: 0.25em;
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: 0;
		line-height: 0.82em;
		flex-shrink: 0;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.route h2 .route-icon {
		white-space: nowrap;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.1em;
	}

	.route h2 .route-icon.allow-wrap {
		white-space: normal;
		flex-wrap: wrap;
	}

	.route h2 .route-icon-text {
		display: inline-block;
	}

	.route h2 .route-icon-text.text-wrapped {
		white-space: normal;
		word-break: break-word;
		max-width: 15em;
	}

	.route h2 .route-long-name {
		font-size: 0.4em;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 12em;
		margin-left: 0;
		align-self: center;
		padding: 0.25em 0.35em 0.1em;
		border-radius: 0.5em;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
		line-height: 1.1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.route-alert-header {
		font-size: 1.5em;
		font-weight: bold;
		line-height: 1.3;
		padding: 0.75em 0.5em 0.5em;
		margin-top: 0.25em;
		border-radius: 0.5em 0.5em 0 0;
		text-align: left;
		height: 1em;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.3em;
		white-space: nowrap;
		overflow: hidden;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
	}

	.route-alert-header.severe {
		background-color: #e30613;
		color: #ffffff;
	}

	.route-alert-header.warning {
		background-color: #ffa700;
		color: #000000;
	}

	/* .route-alert-header.info inherits from inline style (cellStyle) */

	.route-alert-header .alert-header-text {
		display: inline-block;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}

	.route-alert-header .alert-header-text.scrolling {
		animation: scroll-alert-header-horizontal 150s linear infinite;
		will-change: transform;
		overflow: visible;
	}

	.route-alert-header .alert-header-text:not(.scrolling) {
		will-change: auto;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.route-alert-header iconify-icon {
		display: block;
		width: 1.25em;
		height: 1.25em;
		flex-shrink: 0;
		transform: translateY(0.05em);
		position: relative;
		z-index: 1;
		padding-left: 0.5em;
		padding-right: 0.5em;
		margin-left: -0.5em;
	}

	.route-alert-header.severe iconify-icon {
		background: linear-gradient(to right, #e30613 0%, #e30613 70%, transparent 100%);
	}

	.route-alert-header.warning iconify-icon {
		background: linear-gradient(to right, #ffa700 0%, #ffa700 70%, transparent 100%);
	}

	.route-alert-header.info iconify-icon {
		background: linear-gradient(
			to right,
			var(--alert-bg-color, transparent) 0%,
			var(--alert-bg-color, transparent) 70%,
			transparent 100%
		);
	}

	.route.white .route-alert-header {
		border-bottom: 1px solid rgba(0, 0, 0, 0.2);
	}

	.route-alert-ticker {
		font-size: 1.5em;
		font-weight: medium;
		line-height: 1.4;
		padding: 0.5em;
		margin-top: 0;
		border-radius: 0 0 0.5em 0.5em;
		overflow: hidden;
		position: relative;
		height: clamp(5em, 6vh, 9em);
		flex-shrink: 0;
	}

	/* Adjust alert height for portrait displays */
	@media (orientation: portrait) {
		.route-alert-ticker {
			height: clamp(5em, 5vh, 5em);
		}
	}

	/* Increase alert ticker height when stop grouping is enabled */
	/* Grouping saves space by consolidating cards, so give that space to alerts */
	.route-alert-ticker.grouped-alerts {
		height: clamp(5em, 7vh, 10em);
	}

	@media (orientation: portrait) {
		.route-alert-ticker.grouped-alerts {
			height: clamp(5em, 6vh, 6em);
		}
	}

	@keyframes scroll-alert-vertical {
		0% {
			transform: translateY(0);
		}
		100% {
			transform: translateY(-100%);
		}
	}

	.route-alert-ticker .alert-text {
		display: block;
		white-space: pre-line;
		word-wrap: break-word;
	}

	.route-alert-ticker .alert-text.scrolling {
		animation: scroll-alert-vertical 180s linear infinite;
		will-change: transform;
		transform: translateZ(0);
		backface-visibility: hidden;
		contain: layout paint;
	}

	.route-alert-ticker .alert-text:not(.scrolling) {
		will-change: auto;
	}

	.route-alert-ticker .alert-image {
		height: 1em;
		display: inline-block;
		margin: 0 0.2em;
		vertical-align: middle;
	}

	.route h3 {
		font-size: 1.75em;
		padding: 0.4em 0.35em 0.15em 0.35em;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
		overflow: hidden;
		position: relative;
		min-height: 1.5em;
		max-height: 1.5em;
		line-height: 1.5em;
		display: flex;
		align-items: center;
		gap: 0.3em;
	}

	.route.white h3 {
		border-bottom: 1px solid rgba(0, 0, 0, 0.2);
	}

	@keyframes scroll-destination-horizontal {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-100%);
		}
	}

	@keyframes scroll-alert-header-horizontal {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-100%);
		}
	}

	.route h3 .branch-code-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--route-color), white 30%);
		color: inherit;
		border-radius: 40rem;
		padding: 5px 0.5em;
		font-size: 1em;
		font-weight: 800;
		line-height: 1;
		min-width: 1.35em;
		z-index: 3;
		flex-shrink: 0;
		transform: translateY(-0.1em);
		font-family: 'Red Hat Display Variable', Arial, Helvetica, sans-serif;
		box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.1);
	}

	.route h3 .destination-text {
		display: inline-block;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}

	.route h3 .destination-text.scrolling {
		animation: scroll-destination-horizontal 150s linear infinite;
		will-change: transform;
		overflow: visible;
	}

	.route h3 .destination-text:not(.scrolling) {
		will-change: auto;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.route .img28 {
		height: 0.875em;
		display: block;
	}

	.route .img34 {
		height: 0.875em;
		display: block;
	}

	.route i {
		font-size: 0.8em;
		font-style: normal;
	}

	.route small {
		color: inherit;
		font-weight: lighter;
		font-size: 0.5em;
		line-height: 0.5em;
		display: block;
		margin-bottom: 0.5em;
		margin-top: 0.3em;
	}

	.route .direction {
		border-radius: 0.5em;
		margin-bottom: 0.2em;
	}

	/* Styling for multi-branch routes */
	.route .direction.multi-branch {
		margin-bottom: 0.15em;
	}

	.route .direction.multi-branch:not(.first-branch) {
		border-top: 1px solid rgba(255, 255, 255, 0.15);
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}

	.route.white .direction.multi-branch:not(.first-branch) {
		border-top: 1px solid rgba(0, 0, 0, 0.15);
	}

	.route .direction.multi-branch.first-branch {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.route .direction.multi-branch:not(:last-child) {
		margin-bottom: 0;
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.route .direction.multi-branch:last-child {
		margin-bottom: 0.25em;
	}

	/* .direction iconify-icon {
		transform: translateY(20%);
		width: 1em;
		height: 1em;
		fill: currentColor;
	} */

	.route .time {
		white-space: nowrap;
		display: flex;
		/* height: clamp(6.5em, 12vh, 30em); */
		align-items: flex-start;
	}

	.route .time h4 {
		flex: 1;
		padding: 0.4em 0;
		text-align: center;
		box-sizing: border-box;
	}

	.route .time h4 span.cancelled {
		position: relative;
		display: inline-block;
		opacity: 0.8;
	}

	.route .time h4 span.cancelled::after {
		content: '';
		position: absolute;
		left: -0.1em;
		right: -0.1em;
		top: 40%;
		height: 0.125em;
		background: currentColor;
		transform: rotate(30deg);
		transform-origin: top center;
	}

	.route .time h4:nth-child(n + 4) {
		display: none;
	}

	.route .time h4:not(:first-of-type) {
		position: relative;
		border-left: none;
	}

	.route .time h4:not(:first-of-type)::before {
		content: '';
		position: absolute;
		left: 0;
		top: 12.5%;
		height: 75%;
		width: 1px;
		background: rgba(255, 255, 255, 0.1);
	}

	.route.white .time h4:not(:first-of-type)::before {
		background: rgba(0, 0, 0, 0.2);
	}

	.route .stop_name {
		position: relative;
		padding-left: 1.1em;
		font-size: 1.3em;
		margin-bottom: 0.4em;
		font-weight: 500;
		display: block;
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
	}

	.route .stop_name iconify-icon {
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 1em;
		height: 1em;
		fill: currentColor;
	}

	@keyframes realtimeAnim {
		0% {
			opacity: 0.5;
		}
		25% {
			opacity: 0.5;
		}
		50% {
			opacity: 0.5;
		}
		75% {
			opacity: 0.6;
		}
		100% {
			opacity: 1;
		}
	}

	.route h4 {
		position: relative;
	}

	.route .realtime {
		width: 0.28em;
		height: 0.28em;
		position: absolute;
		margin-top: -4px;
	}

	.route .realtime::before,
	.route .realtime::after {
		content: '';
		display: block;
		width: 9px;
		height: 9px;
		position: absolute;
		background-size: 100%;
	}

	.route .realtime::before {
		background-image: url('/assets/images/real_time_wave_small-w@2x.png');
		animation: realtimeAnim 1.4s linear 0s infinite alternate;
	}

	/* Light mode: dark waves on white routes */
	.route.white .realtime::before {
		background-image: url('/assets/images/real_time_wave_small@2x.png');
	}

	/* Dark mode: dark waves on light-colored routes */
	.route.light-in-dark .realtime::before {
		background-image: url('/assets/images/real_time_wave_small@2x.png');
	}

	.route .realtime::after {
		background-image: url('/assets/images/real_time_wave_big-w@2x.png');
		animation: realtimeAnim 1.4s linear 0.3s infinite alternate;
	}

	/* Light mode: dark waves on white routes */
	.route.white .realtime::after {
		background-image: url('/assets/images/real_time_wave_big@2x.png');
	}

	/* Dark mode: dark waves on light-colored routes */
	.route.light-in-dark .realtime::after {
		background-image: url('/assets/images/real_time_wave_big@2x.png');
	}

	.route .inactive {
		display: block;
		background-image: url('/assets/images/inactive-w@2x.png');
		background-position: center;
		background-repeat: no-repeat;
		background-size: 16px auto;
	}

	.route.white .inactive {
		background-image: url('/assets/images/inactive@2x.png');
	}

	.alert-count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.3);
		color: inherit;
		border-radius: 40rem;
		padding: 5px 0.5em;
		font-size: 1em;
		font-weight: 800;
		line-height: 1;
		min-width: 1.35em;
		z-index: 3;
		flex-shrink: 1;
		transform: translateY(-0.1em);
		font-family: 'Red Hat Display Variable', Arial, Helvetica, sans-serif;
		box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.1);
	}

	.route-alert-header.severe .alert-count-badge {
		background: color-mix(in srgb, #e30613, white 30%) 0%;
	}

	.route-alert-header.warning .alert-count-badge {
		background: color-mix(in srgb, #ffa700, white 30%) 0%;
	}

	.route-alert-header.info .alert-count-badge {
		background: color-mix(in srgb, var(--alert-bg-color), white 30%) 0%;
	}
</style>
