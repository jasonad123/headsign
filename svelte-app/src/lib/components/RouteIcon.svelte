<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/env';
	import type { Route } from '$lib/services/nearby';
	import { getRelativeLuminance, getContrastRatio } from '$lib/utils/colorUtils';
	import {
		COMPLEX_LOGOS,
		COLOR_OVERRIDES,
		ROUTE_COLOR_OVERRIDES
	} from '$lib/constants/routeOverrides';

	let {
		route,
		showLongName = false,
		compact = false
	}: { route: Route; showLongName?: boolean; compact?: boolean } = $props();

	let useBlackText = $derived(route.route_text_color === '000000');
	let cellStyle = $derived(`background: #${route.route_color}; color: #${route.route_text_color}`);
	let imageSize = $derived((route.route_display_short_name?.elements?.length || 0) > 1 ? 28 : 34);

	// Smart route name for alerts
	let alertRouteName = $derived.by(() => {
		const shortName = route.route_short_name;
		if (shortName && /^[A-Z]$/.test(shortName) && route.route_network_name === 'SEPTA Metro') {
			return '';
		}

		if (route.route_long_name?.includes('Line')) {
			return route.route_long_name;
		}

		if (route.route_network_name === 'Long Island Rail Road' && route.route_long_name) {
			return route.route_long_name;
		}

		if (route.route_network_name === 'GO Transit' && route.route_long_name) {
			return route.route_long_name;
		}

		if (route.route_network_name === 'Capitol Corridor' && route.route_long_name) {
			return route.route_long_name;
		}

		const routeName = route.route_short_name || route.route_long_name;

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

		if (routeName && /^[A-Z]+$/.test(routeName)) {
			const modeName = route.mode_name?.toLowerCase() || '';
			if (modeName.includes('rapidride')) {
				return '';
			}
		}

		if (routeName && /^[a-zA-Z]+$/.test(routeName)) {
			const modeName = route.mode_name?.toLowerCase() || '';
			if (modeName.includes('citylink')) {
				return '';
			}
		}

		if (routeName && /^\d+$/.test(routeName)) {
			const modeName = route.mode_name?.toLowerCase() || '';
			const ttsName = route.tts_short_name?.toLowerCase() || '';
			if (
				modeName.includes('subway') &&
				ttsName.startsWith('line') &&
				route.route_network_name === 'TTC'
			) {
				return '';
			}
		}

		if (route.mode_name?.includes('Muni')) {
			return '';
		}

		return routeName;
	});

	// Smart mode name for alerts
	let alertModeName = $derived.by(() => {
		const modeName = route.mode_name;
		const shortName = route.route_short_name;

		if (shortName && /^[A-Z]$/.test(shortName) && route.route_network_name === 'SEPTA Metro') {
			return `${shortName} Line`;
		}

		// Metro/Light Rail shorthand: Use "Line"
		if (modeName?.includes('Metro') || modeName?.includes('Light Rail')) {
			const metroLine = route.route_short_name || '';
			if (metroLine) return `${metroLine} Line`;
			return 'Line';
		}

		// LIRR: Use empty to avoid duplication (alertRouteName handles it)
		if (route.route_network_name === 'Long Island Rail Road') {
			return '';
		}

		// GO Transit: Use empty (alertRouteName shows full branch name)
		if (route.route_network_name === 'GO Transit') {
			return 'Line';
		}

		// Capitol Corridor: Use empty (alertRouteName shows full name)
		if (route.route_network_name === 'Capitol Corridor') {
			return '';
		}

		// SF Muni: Combined route designation
		if (route.mode_name?.includes('Muni')) {
			const displayName =
				route.route_display_short_name?.boxed_text || route.route_short_name || '';
			const longName = route.route_long_name?.split(' - ')[0] || '';
			if (longName && longName !== 'Local') {
				return `${displayName} ${longName}`;
			}
			return displayName;
		}

		// RapidRide (Seattle): Brand name first
		if (shortName && /^[A-Z]+$/.test(shortName) && modeName?.toLowerCase().includes('rapidride')) {
			return `RapidRide ${shortName}`;
		}

		// CityLink (Baltimore): Word routes (Orange, Yellow, Navy, etc.)
		if (shortName && /^[a-zA-Z]+$/.test(shortName)) {
			const modeNameLower = modeName?.toLowerCase() || '';
			if (modeNameLower.includes('citylink')) {
				return `CityLink ${shortName}`;
			}
		}

		// TTC Toronto: Special handling for numbered lines with "line" prefix
		if (shortName && /^\d+$/.test(shortName)) {
			const ttsName = route.tts_short_name?.toLowerCase() || '';
			if (
				modeName?.toLowerCase().includes('subway') &&
				ttsName.startsWith('line') &&
				route.route_network_name === 'TTC'
			) {
				return `Line ${shortName}`;
			}
		}

		// Generic Commuter Rail fallback: Replace "Commuter Rail" with "Line"
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

		if (boxedText) return boxedText;

		if (shortName && MAJOR_COLOURS.has(shortName)) {
			return shortName;
		}

		if (longName) {
			if (longName.endsWith(' Line')) {
				longName = longName.slice(0, -5);
			}

			if (longName.length <= MAX_LONG_NAME_LENGTH) {
				return longName;
			}
		}

		return shortName || longName || '';
	});

	let routeShortTooShort = $derived((route.route_short_name?.length || 0) < 3);

	let shouldShowRouteLongName = $derived(
		showLongName &&
			!routeShortTooShort &&
			!route.compact_display_short_name?.route_name_redundancy &&
			isRouteIconImage() &&
			!hasAdjacentText()
	);

	function getImageUrl(index: number): string | null {
		if (route.route_display_short_name?.elements?.[index]) {
			const iconName = route.route_display_short_name.elements[index];

			if (COMPLEX_LOGOS.has(iconName)) {
				return `/api/images/${iconName}.svg`;
			}

			const iconOverride = COLOR_OVERRIDES.get(iconName);
			const routeOverride = ROUTE_COLOR_OVERRIDES.get(route.global_route_id);
			let hex: string;

			let useLightMode: boolean;
			if (iconOverride) {
				useLightMode = iconOverride.alwaysUseLightModeColor
					? true
					: iconOverride.alwaysUseDarkModeColor
						? false
						: !isDarkMode;
			} else if (routeOverride) {
				useLightMode = routeOverride.alwaysUseLightModeColors
					? true
					: routeOverride.alwaysUseDarkModeColors
						? false
						: !isDarkMode;
			} else {
				useLightMode = !isDarkMode;
			}

			if (iconOverride?.color) {
				hex = iconOverride.color;
			} else if (useLightMode) {
				const routeLuminance = getRelativeLuminance(route.route_color);
				hex = useBlackText && routeLuminance < 0.15 ? '000000' : route.route_color;
			} else {
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

	function isRouteIconImage(): boolean {
		return !!getImageUrl(0);
	}

	function hasAdjacentText(): boolean {
		return (
			(route.route_display_short_name?.elements?.length || 0) > 1 &&
			!!route.route_display_short_name?.elements?.[1]?.trim()
		);
	}

	let routeDisplayColor = $derived.by(() => {
		const override = ROUTE_COLOR_OVERRIDES.get(route.global_route_id);

		const useLightMode = override?.alwaysUseLightModeColors
			? true
			: override?.alwaysUseDarkModeColors
				? false
				: !isDarkMode;

		if (useLightMode) {
			const routeLuminance = getRelativeLuminance(route.route_color);
			return useBlackText && routeLuminance < 0.15 ? '#000000' : `#${route.route_color}`;
		} else {
			return shouldInvertInDarkMode ? `#${route.route_text_color}` : `#${route.route_color}`;
		}
	});

	let stopNameColor = $derived.by(() => {
		const routeColorHex = routeDisplayColor.replace('#', '');
		const routeColorLum = getRelativeLuminance(routeColorHex);

		const bgLum = isDarkMode ? 0.03 : 1.0;

		const contrast = getContrastRatio(routeColorLum, bgLum);
		const threshold = isDarkMode ? 1.5 : 2.0;

		return contrast >= threshold ? routeDisplayColor : 'var(--text-primary)';
	});

	let shouldInvertInDarkMode = $derived(
		getRelativeLuminance(route.route_color) < 0.05 &&
			getRelativeLuminance(route.route_text_color) > 0.5
	);

	let hasLightColor = $derived(getRelativeLuminance(route.route_color) > 0.3);

	// Track dark mode state
	let isDarkMode = $state(false);
	let themeObserver: MutationObserver | null = null;

	if (browser) {
		isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

		themeObserver = new MutationObserver(() => {
			isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
	}

	// Three-step rescaling for overflow handling
	let routeIconTextScale = $state(1);
	let routeIconShouldWrap = $state(false);
	let routeIconScale = $state(1);

	let routeIconElement: HTMLElement | undefined = $state();

	let iconCheckTimeouts: Array<ReturnType<typeof setTimeout>> = [];
	let iconCheckVersion = 0; // Track current check version to prevent race conditions

	function checkRouteIconOverflow() {
		if (!browser || !routeIconElement) return;

		// Clear previous check cycle to prevent race conditions
		if (iconCheckTimeouts.length > 0) {
			iconCheckTimeouts.forEach((timeout) => clearTimeout(timeout));
			iconCheckTimeouts = [];
		}

		// Increment version to invalidate any in-flight checks
		iconCheckVersion++;
		const currentVersion = iconCheckVersion;

		const containerWidth = routeIconElement.parentElement?.clientWidth;
		const contentWidth = routeIconElement.scrollWidth;

		if (!containerWidth) return;

		// No overflow
		if (contentWidth <= containerWidth) {
			routeIconScale = 1;
			routeIconTextScale = 1;
			routeIconShouldWrap = false;
			return;
		}

		// Step 1: Scale text only
		const textScale = Math.max(0.65, containerWidth / contentWidth);
		if (textScale >= 0.65) {
			routeIconTextScale = textScale;
			routeIconScale = 1;
			routeIconShouldWrap = false;

			const timeout1 = setTimeout(() => {
				// Verify we're still the current check and element still exists
				if (currentVersion !== iconCheckVersion || !routeIconElement?.isConnected) return;

				if (routeIconElement && routeIconElement.scrollWidth <= containerWidth) {
					return;
				}

				// Step 2: Allow text to wrap
				routeIconTextScale = 1;
				routeIconShouldWrap = true;

				const timeout2 = setTimeout(() => {
					// Verify we're still the current check and element still exists
					if (currentVersion !== iconCheckVersion || !routeIconElement?.isConnected) return;

					if (routeIconElement && routeIconElement.scrollWidth <= containerWidth) {
						return;
					}

					// Step 3: Scale entire container
					const finalScale = Math.max(0.65, (containerWidth - 4) / routeIconElement.scrollWidth);
					routeIconScale = finalScale;
					routeIconShouldWrap = false;
				}, 10);
				iconCheckTimeouts.push(timeout2);
			}, 10);
			iconCheckTimeouts.push(timeout1);
		}
	}

	if (browser) {
		const observer = new ResizeObserver(() => {
			checkRouteIconOverflow();
		});

		let observerElement: HTMLElement | undefined;

		const checkSetup = setInterval(() => {
			if (routeIconElement?.parentElement && observerElement !== routeIconElement.parentElement) {
				observer.observe(routeIconElement.parentElement);
				observerElement = routeIconElement.parentElement;
				checkRouteIconOverflow();
			}
		}, 100);

		onDestroy(() => {
			clearInterval(checkSetup);
			observer.disconnect();
			// Clear any pending timeouts
			iconCheckTimeouts.forEach((timeout) => clearTimeout(timeout));
			iconCheckTimeouts = [];
		});
	}

	onDestroy(() => {
		if (themeObserver) {
			themeObserver.disconnect();
			themeObserver = null;
		}
	});
</script>

<!-- Route icon - exactly matching RouteItem's span.route-icon structure -->
<span
	class="route-icon"
	class:icon-scaled={routeIconScale !== 1}
	class:allow-wrap={routeIconShouldWrap}
	bind:this={routeIconElement}
	style:transform={routeIconScale !== 1 ? `scale(${routeIconScale})` : ''}
	style:transform-origin="left center"
>
	{#if route.route_display_short_name?.elements}
		{#if getImageUrl(0)}
			<img
				src={getImageUrl(0)}
				alt="Route icon"
				class={imageSize === 28 ? 'img28' : 'img34'}
				style="vertical-align: middle;"
			/>
		{/if}
		<span
			class="route-icon-text"
			class:text-scaled={routeIconTextScale !== 1}
			class:text-wrapped={routeIconShouldWrap}
			style={`color: ${routeDisplayColor}`}
			style:transform={routeIconTextScale !== 1 ? `scale(${routeIconTextScale})` : ''}
			style:transform-origin="left center"
		>
			{route.route_display_short_name.elements[1] || ''}
			<i>{route.branch_code || ''}</i>
		</span>
		{#if getImageUrl(2)}
			<img
				src={getImageUrl(2)}
				alt="Route icon"
				class={imageSize === 28 ? 'img28' : 'img34'}
				style="vertical-align: middle;"
			/>
		{/if}
	{/if}

	{#if shouldShowRouteLongName}
		<span class="route-long-name" style={cellStyle}>
			{miniRouteName}
		</span>
	{/if}
</span>

<style>
	.route-icon {
		white-space: nowrap;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.1em;
	}

	.route-icon.allow-wrap {
		white-space: normal;
		flex-wrap: wrap;
	}

	.route-icon-text {
		display: inline-block;
		font-weight: 700;
		font-size: inherit;
	}

	.route-icon-text.text-wrapped {
		white-space: normal;
		word-break: break-word;
		max-width: 15em;
	}

	.route-icon-text i {
		font-style: italic;
		margin-left: 0.1em;
	}

	.route-long-name {
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

	:global(.img28) {
		height: 0.875em;
		display: inline-block;
		vertical-align: middle;
		line-height: 1;
	}

	:global(.img34) {
		height: 0.875em;
		display: inline-block;
		vertical-align: middle;
		line-height: 1;
	}
</style>
