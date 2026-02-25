<script lang="ts">
	import { fade } from 'svelte/transition';
	import { _ } from 'svelte-i18n';
	import { config } from '$lib/stores/config';
	import { formatCoordinatesForDisplay } from '$lib/utils/formatters';
	import Toggle from '$lib/components/Toggle.svelte';
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
	import SolidSection from '$lib/components/SolidSection.svelte';
	import LocationPickerModal from '$lib/components/LocationPickerModal.svelte';
	import type { Route } from '$lib/services/nearby';
	import type { LatLng } from '$lib/stores/config';
	import 'iconify-icon';

	interface Props {
		open: boolean;
		allRoutes: Route[];
		gettingLocation: boolean;
		locationError: string | null;
		validatingLocation: boolean;
		validationMessage: string | null;
		validationSuccess: boolean | null;
		columnsWarning: string | null;
		appVersion: string;
		contentScale: number;
		onclose: () => void;
		useCurrentLocation: () => void;
		handleLocationInputBlur: () => void;
		toggleRouteHidden: (routeId: string) => void;
		toggleStopHidden: (stopId: string) => void;
		toggleAgencyHidden: (networkName: string) => void;
		onsave: () => void;
	}

	let {
		open,
		allRoutes,
		gettingLocation,
		locationError,
		validatingLocation,
		validationMessage,
		validationSuccess,
		columnsWarning,
		appVersion,
		contentScale,
		onclose,
		useCurrentLocation,
		handleLocationInputBlur,
		toggleRouteHidden,
		toggleStopHidden,
		toggleAgencyHidden,
		onsave
	}: Props = $props();

	// Location picker modal state
	let locationPickerOpen = $state(false);

	// Memoize filtered hidden routes for performance
	let hiddenRoutesList = $derived(
		allRoutes.filter((r) => $config.hiddenRoutes.includes(r.global_route_id))
	);

	// Build stop name map from all routes' itineraries
	let stopNameMap = $derived.by(() => {
		const map = new Map<string, string>();
		for (const route of allRoutes) {
			if (!route.itineraries) continue;
			for (const it of route.itineraries) {
				const stopId =
					it.closest_stop?.parent_station_global_stop_id ||
					it.closest_stop?.global_stop_id ||
					'unknown';
				const stopName = it.closest_stop?.stop_name || 'Unknown stop';
				if (!map.has(stopId)) {
					map.set(stopId, stopName);
				}
			}
		}
		return map;
	});

	let hiddenStopsList = $derived(
		($config.hiddenStops || []).map((id) => ({
			id,
			name: stopNameMap.get(id) || id
		}))
	);

	let allAgencies = $derived.by(() => {
		const seen = new Set<string>();
		for (const route of allRoutes) {
			if (route.route_network_name) seen.add(route.route_network_name);
		}
		return [...seen].sort();
	});

	function openLocationPicker() {
		locationPickerOpen = true;
	}

	function handleLocationFromMap(newLocation: LatLng) {
		config.update((c) => ({
			...c,
			latLng: newLocation
		}));
		// Trigger validation after setting location from map
		handleLocationInputBlur();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={onclose} transition:fade={{ duration: 200 }}>
		<div class="config-modal" onclick={(e) => e.stopPropagation()}>
			<h2>{$_('config.title')}</h2>
			<form onsubmit={(e) => e.preventDefault()}>
				<label>
					{$_('config.fields.title')}
					<input type="text" bind:value={$config.title} />
				</label>

				<label>
					{$_('config.fields.location')}
					<div class="location-input-group">
						<input
							type="text"
							value={formatCoordinatesForDisplay($config.latLng.latitude, $config.latLng.longitude)}
							oninput={(e) => {
								config.setLatLngStr(e.currentTarget.value);
								validationMessage = null;
								validationSuccess = null;
							}}
							onblur={handleLocationInputBlur}
							placeholder="latitude, longitude"
						/>
						<button
							type="button"
							class="btn-location"
							onclick={useCurrentLocation}
							disabled={gettingLocation}
							title={gettingLocation ? 'Getting location...' : 'Use current location'}
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
								<path
									fill="currentColor"
									d="M8 10.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m.5-9a.5.5 0 0 0-1 0v1.525A5 5 0 0 0 3.025 7.5H1.5a.5.5 0 0 0 0 1h1.525A5 5 0 0 0 7.5 12.976V14.5a.5.5 0 0 0 1 0v-1.524A5 5 0 0 0 12.975 8.5H14.5a.5.5 0 1 0 0-1h-1.525A5 5 0 0 0 8.5 3.025zM8 12a4 4 0 1 1 0-8a4 4 0 0 1 0 8"
								/>
							</svg>
						</button>
						<button
							type="button"
							class="btn-map-picker"
							onclick={openLocationPicker}
							title={$_('config.location.pickOnMap')}
						>
							<iconify-icon icon="ix:map"></iconify-icon>
						</button>
					</div>
					{#if locationError}
						<span class="location-error">{locationError}</span>
					{/if}
					{#if validatingLocation}
						<span class="location-validating">{$_('config.location.validating')}</span>
					{:else if validationMessage}
						<span
							class="location-validation"
							class:success={validationSuccess}
							class:error={!validationSuccess}
						>
							{validationMessage}
						</span>
					{/if}
				</label>

				<label>
					{$_('config.fields.timeFormat')}
					<select bind:value={$config.timeFormat}>
						<option value="hh:mm A">{$_('config.timeFormats.12hour')}</option>
						<option value="hh:mm">{$_('config.timeFormats.12hourNoAmPm')}</option>
						<option value="HH:mm">{$_('config.timeFormats.24hour')}</option>
					</select>
				</label>

				<label>
					{$_('config.fields.language')}
					<select bind:value={$config.language}>
						<option value="en">{$_('config.languages.english')}</option>
						<option value="fr">{$_('config.languages.french')}</option>
						<option value="es">{$_('config.languages.spanish')}</option>
						<option value="de">{$_('config.languages.german')}</option>
					</select>
				</label>
				<label>
					{$_('config.fields.maxDistance')}
					<input
						type="range"
						min="250"
						max="1500"
						step="250"
						value={$config.maxDistance}
						class="styled-slider"
						style="--slider-progress: {(($config.maxDistance - 250) / (1500 - 250)) * 100}%"
						oninput={(e) => {
							const value = parseInt(e.currentTarget.value);
							config.update((c) => ({
								...c,
								maxDistance: value
							}));
						}}
					/>
					<div class="slider-value">
						{$config.maxDistance}m
					</div>
				</label>

				<SolidSection title={$_('config.sections.display')}>
					<div class="toggle-container">
						<Toggle
							bind:checked={$config.manualColumnsMode}
							disabled={$config.scaleMode === 'auto' || $config.viewMode === 'vertical'}
						>
							{#snippet label()}
								<span>{$_('config.columns.manualColumnControl')}</span>
							{/snippet}
						</Toggle>
						{#if $config.viewMode === 'vertical'}
							<small class="toggle-help-text">{$_('config.columns.disabledInVerticalMode')}</small>
						{:else if $config.scaleMode === 'auto'}
							<small class="toggle-help-text">{$_('config.autoScale.autoColumnsHelpText')}</small>
						{/if}
					</div>

					{#if $config.manualColumnsMode && typeof $config.columns === 'number'}
						<label>
							{$_('config.fields.columns')}
							<div class="slider-with-reset">
								<input
									type="range"
									min="1"
									max="8"
									value={$config.columns}
									class="styled-slider"
									style="--slider-progress: {(($config.columns - 1) / (8 - 1)) * 100}%"
									oninput={(e) => {
										const value = parseInt(e.currentTarget.value);
										const clampedValue = Math.max(1, Math.min(8, value));
										config.update((c) => ({
											...c,
											columns: clampedValue as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
										}));
									}}
								/>
								<button
									type="button"
									class="btn-slider-reset"
									onclick={() => {
										config.update((c) => ({ ...c, columns: 4 as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }));
									}}
									title={$_('config.buttons.resetToDefault')}
								>
									<iconify-icon icon="ix:refresh"></iconify-icon>
								</button>
							</div>
							<div class="slider-value">
								{$_('config.columns.word', { values: { count: $config.columns } })}
							</div>
							{#if columnsWarning}
								<span class="column-warning">
									{columnsWarning}
								</span>
							{/if}
						</label>
					{:else if $config.scaleMode !== 'auto'}
						<small class="toggle-help-text">{$_('config.columns.automaticColumnControl')}</small>
					{/if}

					<label>
						{$_('config.routeDisplay.viewMode')}
						<div class="button-group">
							<button
								type="button"
								class="btn-option"
								class:active={$config.viewMode === 'card'}
								onclick={() =>
									config.update((c) => ({
										...c,
										viewMode: 'card',
										groupItinerariesByStop: false
									}))}
							>
								<iconify-icon icon="ix:application-screen"></iconify-icon>
								{$_('config.routeDisplay.card')}
							</button>
							<button
								type="button"
								class="btn-option"
								class:active={$config.viewMode === 'board'}
								onclick={() =>
									config.update((c) => ({
										...c,
										viewMode: 'board',
										groupItinerariesByStop: true
									}))}
							>
								<iconify-icon icon="ix:table"></iconify-icon>
								{$_('config.routeDisplay.board')}
							</button>
							<button
								type="button"
								class="btn-option"
								class:active={$config.viewMode === 'vertical'}
								onclick={() =>
									config.update((c) => ({
										...c,
										viewMode: 'vertical',
										groupItinerariesByStop: true,
										manualColumnsMode: false,
										columns: 1
									}))}
							>
								<iconify-icon icon="ix:list"></iconify-icon>
								{$_('config.routeDisplay.vertical')}
							</button>
						</div>
						<small class="help-text">{$_('config.routeDisplay.viewModeHelpText')}</small>
					</label>

					<div class="toggle-container">
						<Toggle bind:checked={$config.showQRCode}>
							{#snippet label()}
								<span>{$_('config.fields.showQRCode')}</span>
							{/snippet}
						</Toggle>
						<small class="toggle-help-text">{$_('config.qrCode.helpText')}</small>
					</div>

					<label>
						{$_('config.fields.scaleMode')}
						<div class="button-group">
							<button
								type="button"
								class="btn-option"
								class:active={$config.scaleMode === 'auto'}
								onclick={() =>
									config.update((c) => ({
										...c,
										scaleMode: 'auto',
										manualColumnsMode: false,
										columns: 'auto'
									}))}
							>
								{$_('config.scaleMode.auto')}
							</button>
							<button
								type="button"
								class="btn-option"
								class:active={$config.scaleMode === 'manual'}
								onclick={() => config.update((c) => ({ ...c, scaleMode: 'manual' }))}
							>
								{$_('config.scaleMode.manual')}
							</button>
						</div>
						<small class="toggle-help-text">{$_('config.scaleMode.helpText')}</small>
					</label>

					{#if $config.scaleMode === 'auto'}
						<label style="margin-top: 0.75rem;">
							{$_('config.fields.autoScaleMinimum')}
							<div class="slider-with-reset">
								<input
									type="range"
									min="0.50"
									max="0.95"
									step="0.05"
									value={$config.autoScaleMinimum}
									class="styled-slider"
									style="--slider-progress: {(($config.autoScaleMinimum - 0.5) / (0.95 - 0.5)) *
										100}%"
									oninput={(e) => {
										const value = parseFloat(e.currentTarget.value);
										config.update((c) => ({
											...c,
											autoScaleMinimum: value
										}));
									}}
								/>
								<button
									type="button"
									class="btn-slider-reset"
									onclick={() => {
										config.update((c) => ({ ...c, autoScaleMinimum: 0.65 }));
									}}
									title={$_('config.buttons.resetToDefault')}
								>
									<iconify-icon icon="ix:refresh"></iconify-icon>
								</button>
							</div>
							<div class="slider-value">
								{Math.round($config.autoScaleMinimum * 100)}%
							</div>
							{#if contentScale < 1}
								<div class="current-scale-indicator">
									{$_('config.autoScale.currentScale')}
									{Math.round(contentScale * 100)}%
								</div>
							{/if}
							<small class="help-text" style="display: block; margin-top: 0.25rem;">
								{$_('config.autoScaleMinimum.helpText')}
							</small>
						</label>
					{/if}

					{#if $config.scaleMode === 'manual'}
						<label style="margin-top: 0.75rem;">
							{$_('config.fields.manualScale')}
							<div class="slider-with-reset">
								<input
									type="range"
									min="0.50"
									max="1.00"
									step="0.05"
									value={$config.manualScale}
									class="styled-slider"
									style="--slider-progress: {(($config.manualScale - 0.5) / (1.0 - 0.5)) * 100}%"
									oninput={(e) => {
										const value = parseFloat(e.currentTarget.value);
										config.update((c) => ({
											...c,
											manualScale: value
										}));
									}}
								/>
								<button
									type="button"
									class="btn-slider-reset"
									onclick={() => {
										config.update((c) => ({ ...c, manualScale: 1.0 }));
									}}
									title={$_('config.buttons.resetToDefault')}
								>
									<iconify-icon icon="ix:refresh"></iconify-icon>
								</button>
							</div>
							<div class="slider-value">
								{Math.round($config.manualScale * 100)}%
							</div>
							<small class="help-text" style="display: block; margin-top: 0.25rem;">
								{$_('config.manualScale.helpText')}
							</small>
						</label>
					{/if}
				</SolidSection>

				<SolidSection title={$_('config.sections.style')}>
					<label>
						{$_('config.fields.theme')}
						<div class="button-group">
							<button
								type="button"
								class="btn-option"
								class:active={$config.theme === 'light'}
								onclick={() => config.update((c) => ({ ...c, theme: 'light' }))}
							>
								{$_('config.theme.light')}
							</button>
							<button
								type="button"
								class="btn-option"
								class:active={$config.theme === 'auto'}
								onclick={() => config.update((c) => ({ ...c, theme: 'auto' }))}
							>
								{$_('config.theme.auto')}
							</button>
							<button
								type="button"
								class="btn-option"
								class:active={$config.theme === 'dark'}
								onclick={() => config.update((c) => ({ ...c, theme: 'dark' }))}
							>
								{$_('config.theme.dark')}
							</button>
						</div>
					</label>

					<label>
						{$_('config.fields.headerColor')}
						<div style="display: flex; gap: 0.5em; align-items: center;">
							<input type="color" bind:value={$config.headerColor} />
							<button
								type="button"
								class="btn-reset"
								onclick={() => {
									const defaultColor = $config.theme === 'dark' ? '#1f7a42' : '#30b566';
									config.update((c) => ({ ...c, headerColor: defaultColor }));
								}}
								title={$_('config.buttons.resetToDefault')}
							>
								{$_('config.buttons.reset')}
							</button>
						</div>
					</label>

					<label>
						{$_('config.fields.customLogo')}
						<input
							type="text"
							bind:value={$config.customLogo}
							placeholder="https://example.com/logo.png or /assets/images/logo.png"
						/>
						<small class="help-text">{$_('config.customLogo.helpText')}</small>
						{#if $config.customLogo}
							<div style="display: flex; gap: 0.5em; margin-top: 0.5em;">
								<button
									type="button"
									class="btn-reset"
									onclick={() => config.update((c) => ({ ...c, customLogo: null }))}
								>
									{$_('config.customLogo.clear')}
								</button>
							</div>
							<div class="logo-preview">
								<img
									src={$config.customLogo}
									alt="Logo preview"
									onerror={(e) => {
										const parent = (e.currentTarget as HTMLImageElement).parentElement;
										if (parent) {
											const errorSpan = document.createElement('span');
											errorSpan.className = 'error';
											errorSpan.textContent = $_('config.customLogo.invalidUrl');
											parent.replaceChildren(errorSpan);
										}
									}}
								/>
							</div>
						{/if}
					</label>
				</SolidSection>

				<SolidSection title={$_('config.sections.routeOptions')}>
					<div class="toggle-container">
						<Toggle
							bind:checked={$config.groupItinerariesByStop}
							disabled={$config.viewMode === 'board' || $config.viewMode === 'vertical'}
						>
							{#snippet label()}
								<span>{$_('config.fields.groupItinerariesByStop')}</span>
							{/snippet}
						</Toggle>
						{#if $config.viewMode === 'board'}
							<small class="toggle-help-text"
								>{$_('config.stopManagement.groupAlwaysOnInBoardMode')}</small
							>
						{:else if $config.viewMode === 'vertical'}
							<small class="toggle-help-text"
								>{$_('config.stopManagement.groupAlwaysOnInVerticalMode')}</small
							>
						{:else}
							<small class="toggle-help-text"
								>{$_('config.stopManagement.groupItinerarieshelpText')}</small
							>
						{/if}
					</div>

					<div class="toggle-container">
						<Toggle bind:checked={$config.filterRedundantTerminus}>
							{#snippet label()}
								<span>{$_('config.fields.filterRedundantTerminus')}</span>
							{/snippet}
						</Toggle>
						<small class="toggle-help-text"
							>{$_('config.stopManagement.filterTerminushelpText')}</small
						>
					</div>

					<div class="toggle-container">
						<Toggle bind:checked={$config.showRouteLongName}>
							{#snippet label()}
								<span>{$_('config.fields.showRouteLongName')}</span>
							{/snippet}
						</Toggle>
						<small class="toggle-help-text"
							>{$_('config.routeDisplay.showRouteLongNameHelpText')}</small
						>
					</div>

					<div class="toggle-container">
						<Toggle bind:checked={$config.showCrowding}>
							{#snippet label()}
								<span>{$_('config.crowding.showCrowding')}</span>
							{/snippet}
						</Toggle>
						<small class="toggle-help-text">{$_('config.crowding.showCrowdingHelpText')}</small>
					</div>
				</SolidSection>

				<CollapsibleSection
					title={$_('config.hiddenAgencies.title')}
					helpText={$_('config.hiddenAgencies.helpText')}
					initiallyOpen={true}
				>
					{#if allAgencies.length > 0}
						<div class="route-management">
							<div class="hidden-routes-list">
								{#each allAgencies as agency}
									{@const isHidden = ($config.hiddenAgencies || []).includes(agency)}
									<button
										type="button"
										class="hidden-route-item"
										onclick={() => toggleAgencyHidden(agency)}
									>
										<iconify-icon icon={isHidden ? 'ix:eye-cancelled-filled' : 'ix:eye-filled'}
										></iconify-icon>
										<span>{agency}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</CollapsibleSection>

				<CollapsibleSection
					title={$_('config.hiddenRoutes.title')}
					helpText={$_('config.hiddenRoutes.helpText')}
					initiallyOpen={false}
				>
					{#if $config.hiddenRoutes.length > 0}
						<div class="route-management">
							<div class="hidden-routes-list">
								{#each hiddenRoutesList as route}
									<button
										type="button"
										class="hidden-route-item"
										onclick={() => toggleRouteHidden(route.global_route_id)}
									>
										<iconify-icon icon="ix:eye-cancelled-filled"></iconify-icon>
										<span>{route.route_short_name || route.route_long_name}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</CollapsibleSection>

				<CollapsibleSection
					title={$_('config.hiddenStops.title')}
					helpText={$_('config.hiddenStops.helpText')}
					initiallyOpen={false}
				>
					{#if ($config.hiddenStops || []).length > 0}
						<div class="route-management">
							<div class="hidden-routes-list">
								{#each hiddenStopsList as stop}
									<button
										type="button"
										class="hidden-route-item"
										onclick={() => toggleStopHidden(stop.id)}
									>
										<iconify-icon icon="ix:eye-cancelled-filled"></iconify-icon>
										<span>{stop.name}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</CollapsibleSection>

				<div class="credits">
					<h3>{$_('config.credits.title')}</h3>
					<h4>
						Headsign version <a
							href="https://github.com/jasonad123/headsign/releases/tag/v{appVersion}"
							target="_blank"
							rel="noopener">{appVersion}</a
						>
					</h4>
					<p class="help-text">
						{@html $_('config.credits.madeWith')}
					</p>
					<p class="help-text">
						{@html $_('config.credits.links')}
					</p>
					<a
						href="https://transitapp.com/partners/apis"
						target="_blank"
						rel="noopener noreferrer"
						class="api-badge-link"
					>
						<img src="/assets/images/api-badge.svg" alt="Transit Logo" class="credits-logo" /></a
					>
				</div>

				<div class="modal-actions">
					<button type="button" class="btn-cancel" onclick={onclose}>
						{$_('config.buttons.cancel')}
					</button>
					<button
						type="button"
						class="btn-save"
						onclick={() => {
							config.save();
							config.update((c) => ({ ...c, isEditing: false }));
							onsave();
						}}
					>
						{$_('config.buttons.save')}
					</button>
				</div>
			</form>
		</div>
	</div>

	{#if locationPickerOpen}
		<LocationPickerModal
			location={$config.latLng}
			radius={$config.maxDistance}
			onclose={() => (locationPickerOpen = false)}
			onsave={handleLocationFromMap}
		/>
	{/if}
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(1px);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.config-modal {
		background: var(--bg-secondary);
		color: var(--text-primary);
		padding: 2em;
		border-radius: 8px;
		box-shadow: 0 4px 6px var(--shadow-color);
		max-width: 30vw;
		min-width: 400px;
		max-height: 80vh;
		overflow-y: auto;
		/* Reset fixed positioning since we are using flex in parent */
		position: relative;
	}

	.config-modal h2 {
		margin-top: 0;
		margin-bottom: 0.5em;
		color: var(--text-primary);
		font-size: 2em;
	}

	.config-modal form {
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.config-modal label {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		color: var(--text-primary);
	}

	.config-modal input,
	.config-modal select {
		padding: 0.5em;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-size: 1em;
		background: var(--bg-primary);
		color: var(--text-primary);
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
	}

	.help-text {
		display: block;
		margin-top: 0.25em;
		margin-bottom: 0;
		font-size: 0.95em;
		color: var(--text-secondary);
		word-wrap: break-word;
		overflow-wrap: break-word;
		max-width: 100%;
	}

	.logo-preview {
		margin-top: 0.5em;
		padding: 1em;
		background: var(--bg-header);
		border-radius: 4px;
		text-align: center;
	}

	.logo-preview img {
		max-height: 60px;
		max-width: 200px;
		object-fit: contain;
	}

	.modal-actions {
		display: flex;
		gap: 1em;
		justify-content: flex-end;
		margin-top: 0.5em;
	}

	.config-modal button {
		padding: 0.65em 1.5em 0.55em 1.5em;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 1em;
		font-family: 'Overpass Variable', Helvetica, Arial, serif;
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
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

	.btn-reset {
		padding: 0.4em 0.8em;
		font-size: 0.9em;
		background: #f0f0f0;
		color: #333;
		border-radius: 4px;
		border: 1px solid #ccc;
		cursor: pointer;
		white-space: nowrap;
	}

	.btn-reset:hover {
		background: #e0e0e0;
		border-color: #999;
	}

	.slider-with-reset {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.slider-with-reset .styled-slider {
		flex: 1;
	}

	.btn-slider-reset {
		flex-shrink: 0;
		width: 5rem;
		height: 1.75em;
		padding: 0;
		background: var(--bg-header);
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		-webkit-font-smoothing: antialiased;
	}

	.btn-slider-reset:hover {
		opacity: 0.85;
	}

	.btn-slider-reset iconify-icon {
		display: block;
		width: 1.25em;
		height: 1.25em;
		font-size: 1.25rem;
	}

	.toggle-container {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
	}

	.toggle-help-text {
		display: block !important;
		margin-top: 0.25em;
		margin-bottom: 0;
		font-size: 0.95em;
		color: var(--text-secondary);
		word-wrap: break-word;
		overflow-wrap: break-word;
		max-width: 85%;
	}

	.slider-value {
		text-align: center;
		font-size: 0.9em;
		font-weight: 500;
		margin-top: 0.5em;
		color: var(--text-primary);
	}

	.current-scale-indicator {
		text-align: center;
		font-size: 0.85em;
		font-weight: 600;
		margin-top: 0.4em;
		padding: 0.4em 0.8em;
		background: var(--bg-header);
		color: white;
		border-radius: 4px;
		opacity: 0.9;
	}

	.hidden-routes-list {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		max-height: 200px;
		overflow-y: auto;
		padding: 0.5em;
		background: var(--bg-primary);
		border-radius: 4px;
	}

	.hidden-route-item {
		display: flex;
		align-items: center;
		gap: 0.75em;
		padding: 0.8em;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s;
		text-align: left;
		font-weight: 700;
		line-height: 1;
	}

	.hidden-route-item:hover {
		background: var(--bg-primary);
	}

	.hidden-route-item iconify-icon {
		color: var(--text-secondary);
		display: inline-flex;
		align-items: center;
		vertical-align: middle;
		flex-shrink: 0;
		font-size: 1.2em;
	}

	.hidden-route-item span {
		font-weight: 500;
		color: var(--text-primary);
		display: flex;
		align-items: center;
	}

	.button-group {
		display: flex;
		gap: 0.5em;
		flex-wrap: wrap;
	}

	.btn-option {
		flex: 2;
		min-width: 60px;
		padding: 0.6em 1em;
		border: 2px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.95em;
	}

	.btn-option:hover {
		border-color: var(--bg-header);
		background: var(--bg-primary);
	}

	.btn-option.active {
		border-color: var(--bg-header);
		background-color: var(--bg-header);
		color: white;
		font-weight: 600;
	}

	.btn-option iconify-icon {
		display: inline-block;
		vertical-align: middle;
		margin-right: 0.3em;
		font-size: 1.1em;
	}

	.location-input-group {
		display: flex;
		gap: 0.5em;
		align-items: center;
	}

	.location-input-group input {
		flex: 1;
	}

	.btn-location {
		flex-shrink: 0;
		width: auto;
		padding: 0.4em 0.5em;
		background: var(--bg-header);
		color: white;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		transition: opacity 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1em;
		backface-visibility: hidden;
		-webkit-font-smoothing: antialiased;
	}

	.btn-location:hover:not(:disabled) {
		opacity: 0.85;
	}

	.btn-location:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-location svg {
		width: 1.25em;
		height: 1.25em;
		display: block;
		color: white;
	}

	.btn-map-picker {
		flex-shrink: 0;
		width: auto;
		padding: 0.4em 0.5em;
		background: var(--bg-header);
		color: white;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		transition: opacity 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1em;
		backface-visibility: hidden;
		-webkit-font-smoothing: antialiased;
	}

	.btn-map-picker:hover {
		opacity: 0.85;
	}

	.btn-map-picker iconify-icon {
		display: block;
		width: 1.25em;
		height: 1.25em;
		color: white;
	}

	.location-error {
		display: block;
		color: #e30022;
		font-size: 0.9em;
		margin-top: 0.3em;
	}

	.location-validating {
		display: block;
		color: var(--text-secondary);
		font-size: 0.9em;
		margin-top: 0.3em;
		font-style: italic;
	}

	.location-validation {
		display: block;
		font-size: 0.9em;
		margin-top: 0.3em;
		font-weight: 500;
	}

	.location-validation.success {
		color: #30b566;
	}

	.location-validation.error {
		color: #f59e0b;
	}

	.column-warning {
		display: block;
		font-size: 0.9em;
		margin-top: 0.3em;
		font-weight: 500;
		color: #f59e0b;
	}

	.styled-slider {
		width: 100%;
		height: 4px;
		border-radius: 10px;
		background: transparent;
		outline: none;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		box-sizing: border-box;
		margin: 0.5em 0;
	}

	.styled-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		cursor: pointer;
		border: none;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		margin-top: -7px;
	}

	.styled-slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: white;
		cursor: pointer;
		border: none;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.styled-slider::-webkit-slider-runnable-track {
		width: 100%;
		height: 4px;
		background: linear-gradient(
			to right,
			var(--bg-header) 0%,
			var(--bg-header) var(--slider-progress, 0%),
			rgba(0, 0, 0, 0.1) var(--slider-progress, 0%),
			rgba(0, 0, 0, 0.1) 100%
		);
		border-radius: 10px;
	}

	.styled-slider::-moz-range-track {
		width: 100%;
		height: 4px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 10px;
	}

	.styled-slider::-moz-range-progress {
		background: var(--bg-header);
		height: 4px;
		border-radius: 10px;
	}

	.credits {
		margin-top: 0;
		padding-top: 1em;
		border-top: 1px solid var(--border-color);
		text-align: left;
	}

	.credits h3 {
		margin-top: 0;
		margin-bottom: 0.5em;
		font-size: 1.2em;
		color: var(--text-primary);
	}

	.credits h4 {
		margin-bottom: 0.2em;
		font-size: 1em;
		color: var(--text-secondary);
		font-weight: 400;
	}

	.credits .help-text {
		text-align: left;
		line-height: 1.5;
		font-size: 0.85em;
	}

	:global(.credits iconify-icon) {
		display: inline-block !important;
		vertical-align: middle !important;
		font-size: 1.3em !important;
		transform: translateY(-1px);
	}

	.credits-logo {
		margin-top: 0.5em;
		height: 40px;
		width: auto;
		display: block;
	}

	:global(.credits a) {
		color: var(--bg-header);
		text-decoration: none;
		font-weight: 500;
	}

	:global(.credits a:hover) {
		text-decoration: underline;
	}
</style>
