<script lang="ts">
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { t } from '$lib/i18n';
	import { untrack } from 'svelte';
	import { config } from '$lib/stores/config';
	import type { LatLng } from '$lib/stores/config';
	import 'iconify-icon';

	// Leaflet is imported dynamically to avoid SSR issues
	let L: typeof import('leaflet') | null = null;

	interface Props {
		location: LatLng;
		radius: number;
		onclose: () => void;
		onsave: (newLocation: LatLng) => void;
	}

	let { location, radius, onclose, onsave }: Props = $props();

	let mapContainer = $state<HTMLElement | null>(null);
	let map = $state<any>(null);
	let marker = $state<any>(null);
	let radiusCircle = $state<any>(null);

	// Working location (updates as user drags/clicks)
	// svelte-ignore state_referenced_locally
	let workingLocation = $state<LatLng>({ ...location });

	// Working radius (updates as user adjusts slider)
	// svelte-ignore state_referenced_locally
	let workingRadius = $state(radius);

	// Geolocation state
	let gettingLocation = $state(false);

	// Update working location display
	let formattedCoords = $derived(
		`${workingLocation.latitude.toFixed(4)}, ${workingLocation.longitude.toFixed(4)}`
	);

	// Initialize map when component mounts
	$effect(() => {
		if (!browser || !mapContainer) return;

		let mounted = true;

		// Dynamic import of Leaflet to avoid SSR issues
		import('leaflet')
			.then((leaflet) => {
				// Guard against component unmounting during import
				if (!mounted || !mapContainer) return;

				L = leaflet;

				// Get initial location (untrack to prevent reactivity loops)
				const initialLat = untrack(() => location.latitude);
				const initialLng = untrack(() => location.longitude);

				// Initialize map
				map = L!.map(mapContainer!).setView([initialLat, initialLng], 13);

				// Add CartoDB Positron tileset (no API key required)
				L!
					.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
						attribution:
							'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
						maxZoom: 19,
						subdomains: 'abcd'
					})
					.addTo(map);

				// Create custom icon using the ix location pin
				const customIcon = L!.icon({
					iconUrl: '/assets/images/ix--location-filled.svg',
					iconSize: [32, 32],
					iconAnchor: [16, 32],
					popupAnchor: [0, -32]
				});

				// Add draggable marker with custom icon
				marker = L!
					.marker([initialLat, initialLng], {
						draggable: true,
						autoPan: true,
						icon: customIcon
					})
					.addTo(map);

				// Add radius circle (use workingRadius for initial value)
				radiusCircle = L!
					.circle([initialLat, initialLng], {
						color: '#30b566',
						fillColor: '#30b566',
						fillOpacity: 0.1,
						radius: workingRadius,
						weight: 2
					})
					.addTo(map);

				// Handle marker drag
				marker.on('dragend', () => {
					const pos = marker.getLatLng();
					workingLocation = {
						latitude: pos.lat,
						longitude: pos.lng
					};
					// Update circle position
					radiusCircle.setLatLng(pos);
				});

				// Handle map click to place marker
				map.on('click', (e: any) => {
					const pos = e.latlng;
					marker.setLatLng(pos);
					radiusCircle.setLatLng(pos);
					workingLocation = {
						latitude: pos.lat,
						longitude: pos.lng
					};
				});
			})
			.catch((error) => {
				console.error('Failed to load Leaflet:', error);
			});

		// Cleanup function
		return () => {
			mounted = false;
			if (map) {
				map.remove();
				map = null;
				marker = null;
				radiusCircle = null;
			}
		};
	});

	// Update radius circle when working radius changes
	$effect(() => {
		if (radiusCircle && browser) {
			radiusCircle.setRadius(workingRadius);
		}
	});

	function handleSave() {
		// Update location
		onsave(workingLocation);

		// Update radius in config
		config.update((c) => ({
			...c,
			maxDistance: workingRadius
		}));

		onclose();
	}

	function useCurrentLocationInMap() {
		if (!browser || !navigator.geolocation) {
			alert(t('config.location.geolocationNotSupported'));
			return;
		}

		gettingLocation = true;

		navigator.geolocation.getCurrentPosition(
			(position) => {
				const newLat = position.coords.latitude;
				const newLng = position.coords.longitude;

				// Update working location
				workingLocation = {
					latitude: newLat,
					longitude: newLng
				};

				// Update map, marker, and circle if they exist
				if (map && marker && radiusCircle) {
					map.setView([newLat, newLng], 13);
					marker.setLatLng([newLat, newLng]);
					radiusCircle.setLatLng([newLat, newLng]);
				}

				gettingLocation = false;
			},
			(error) => {
				gettingLocation = false;
				let errorMessage = t('config.location.geolocationError');

				switch (error.code) {
					case error.PERMISSION_DENIED:
						errorMessage = t('config.location.geolocationPermissionDenied');
						break;
					case error.POSITION_UNAVAILABLE:
						errorMessage = t('config.location.geolocationUnavailable');
						break;
					case error.TIMEOUT:
						errorMessage = t('config.location.geolocationTimeout');
						break;
				}

				alert(errorMessage);
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 0
			}
		);
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onclose} transition:fade={{ duration: 200 }}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="map-modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h2>{t('config.location.mapPicker.title')}</h2>
			<button type="button" class="btn-close" onclick={onclose} aria-label="Close">
				<iconify-icon icon="ix:close"></iconify-icon>
			</button>
		</div>

		<div class="modal-instructions">
			<div class="instructions-text">
				<iconify-icon icon="ix:info-circle"></iconify-icon>
				{t('config.location.mapPicker.instructions')}
			</div>
			<button
				type="button"
				class="btn-geolocation"
				onclick={useCurrentLocationInMap}
				disabled={gettingLocation}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
					<path
						fill="currentColor"
						d="M8 10.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m.5-9a.5.5 0 0 0-1 0v1.525A5 5 0 0 0 3.025 7.5H1.5a.5.5 0 0 0 0 1h1.525A5 5 0 0 0 7.5 12.976V14.5a.5.5 0 0 0 1 0v-1.524A5 5 0 0 0 12.975 8.5H14.5a.5.5 0 1 0 0-1h-1.525A5 5 0 0 0 8.5 3.025zM8 12a4 4 0 1 1 0-8a4 4 0 0 1 0 8"
					/>
				</svg>
				<span
					>{gettingLocation
						? t('config.location.validating')
						: t('config.location.mapPicker.useMyLocation')}</span
				>
			</button>
		</div>

		<div class="map-container" bind:this={mapContainer}></div>

		<div class="controls-bar">
			<div class="coordinates-display">
				<iconify-icon icon="ix:location-pin"></iconify-icon>
				<span>{t('config.location.mapPicker.coordinates')}: {formattedCoords}</span>
			</div>

			<div class="radius-control">
				<label>
					<span>{t('config.fields.maxDistance')}: {workingRadius}m</span>
					<input
						type="range"
						min="250"
						max="1500"
						step="250"
						bind:value={workingRadius}
						class="radius-slider"
					/>
				</label>
			</div>
		</div>

		<div class="modal-actions">
			<button type="button" class="btn-cancel" onclick={onclose}>
				{t('config.location.mapPicker.cancel')}
			</button>
			<button type="button" class="btn-save" onclick={handleSave}>
				{t('config.location.mapPicker.save')}
			</button>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(2px);
		z-index: 2000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1em;
	}

	.map-modal {
		background: var(--bg-secondary);
		color: var(--text-primary);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		width: 90vw;
		height: 80vh;
		max-width: 800px;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5em;
		border-bottom: 1px solid var(--border-color);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5em;
		color: var(--text-primary);
	}

	.btn-close {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.5em;
		color: var(--text-secondary);
		font-size: 1.5em;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.btn-close:hover {
		color: var(--text-primary);
	}

	.modal-instructions {
		padding: 1em 1.5em;
		background: var(--bg-primary);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1em;
		font-size: 0.95em;
		color: var(--text-secondary);
	}

	.instructions-text {
		display: flex;
		align-items: center;
		gap: 0.75em;
	}

	.instructions-text iconify-icon {
		font-size: 1.3em;
		color: var(--bg-header);
		flex-shrink: 0;
	}

	.btn-geolocation {
		flex-shrink: 0;
		padding: 0.6em 1em;
		background: var(--bg-header);
		color: white;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.95em;
		font-family: 'Overpass Variable', Helvetica, Arial, serif;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.5em;
		transition: opacity 0.2s;
		white-space: nowrap;
	}

	.btn-geolocation:hover:not(:disabled) {
		opacity: 0.85;
	}

	.btn-geolocation:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-geolocation svg {
		width: 1.1em;
		height: 1.1em;
		display: block;
		color: white;
	}

	.map-container {
		flex: 1;
		width: 100%;
		min-height: 0;
		position: relative;
	}

	.controls-bar {
		padding: 1em 1.5em;
		background: var(--bg-primary);
		border-top: 1px solid var(--border-color);
		display: flex;
		gap: 2em;
		align-items: center;
		flex-wrap: wrap;
	}

	.coordinates-display {
		display: flex;
		align-items: center;
		gap: 0.75em;
		font-size: 1em;
		font-weight: 500;
		color: var(--text-primary);
		flex: 1;
		min-width: 200px;
	}

	.coordinates-display iconify-icon {
		font-size: 1.3em;
		color: var(--bg-header);
		flex-shrink: 0;
	}

	.radius-control {
		flex: 1;
		min-width: 200px;
	}

	.radius-control label {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	.radius-control span {
		font-size: 0.95em;
		font-weight: 500;
		color: var(--text-primary);
	}

	.radius-slider {
		width: 100%;
		height: 4px;
		border-radius: 10px;
		background: transparent;
		outline: none;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		box-sizing: border-box;
	}

	.radius-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--bg-header);
		cursor: pointer;
		border: none;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		margin-top: -6px;
	}

	.radius-slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--bg-header);
		cursor: pointer;
		border: none;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.radius-slider::-webkit-slider-runnable-track {
		width: 100%;
		height: 4px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 10px;
	}

	.radius-slider::-moz-range-track {
		width: 100%;
		height: 4px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 10px;
	}

	.modal-actions {
		display: flex;
		gap: 1em;
		padding: 1.5em;
		justify-content: flex-end;
		border-top: 1px solid var(--border-color);
	}

	.btn-save,
	.btn-cancel {
		padding: 0.65em 1.5em;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 1em;
		font-family: 'Overpass Variable', Helvetica, Arial, serif;
		font-weight: 600;
		transition: background 0.2s;
	}

	.btn-save {
		background: #30b566;
		color: white;
	}

	.btn-save:hover {
		background: #1f7a42;
	}

	.btn-cancel {
		background: #e0e0e0;
		color: #333;
	}

	.btn-cancel:hover {
		background: #c0c0c0;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.map-modal {
			width: 100vw;
			height: 100vh;
			border-radius: 0;
		}

		.modal-header {
			padding: 1em;
		}

		.modal-header h2 {
			font-size: 1.2em;
		}

		.modal-instructions {
			padding: 0.75em 1em;
			font-size: 0.9em;
			flex-direction: column;
			align-items: flex-start;
		}

		.btn-geolocation {
			width: 100%;
			justify-content: center;
		}

		.controls-bar {
			padding: 0.75em 1em;
			flex-direction: column;
			align-items: stretch;
			gap: 1em;
		}

		.coordinates-display {
			font-size: 0.9em;
			min-width: unset;
		}

		.radius-control {
			min-width: unset;
		}

		.modal-actions {
			padding: 1em;
		}

		.btn-save,
		.btn-cancel {
			flex: 1;
		}
	}
</style>
