<script lang="ts">
	import { fade } from 'svelte/transition';
	import { t } from '$lib/i18n';
	import { config } from '$lib/stores/config';
	import { formatCoordinatesForDisplay } from '$lib/utils/formatters';
	import LocationPickerModal from '$lib/components/LocationPickerModal.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import type { LatLng } from '$lib/stores/config';
	import 'iconify-icon';

	interface Props {
		open: boolean;
		gettingLocation: boolean;
		locationError: string | null;
		validatingLocation: boolean;
		validationMessage: string | null;
		validationSuccess: boolean | null;
		appVersion: string;
		onclose: () => void;
		useCurrentLocation: () => void;
		handleLocationInputBlur: () => void;
		onfinish: () => void;
	}

	let {
		open,
		gettingLocation,
		locationError,
		validatingLocation,
		validationMessage,
		validationSuccess,
		appVersion,
		onclose,
		useCurrentLocation,
		handleLocationInputBlur,
		onfinish
	}: Props = $props();

	const STEPS = ['welcome', 'location', 'display', 'layout', 'finish'] as const;
	type StepId = (typeof STEPS)[number];

	let currentStepIndex = $state(0);
	let currentStep = $derived<StepId>(STEPS[currentStepIndex]);
	let progressPercent = $derived(((currentStepIndex + 1) / STEPS.length) * 100);

	let locationPickerOpen = $state(false);

	function goNext() {
		if (currentStepIndex < STEPS.length - 1) currentStepIndex++;
	}

	function goBack() {
		if (currentStepIndex > 0) currentStepIndex--;
	}

	function skipToAdvanced() {
		// Leaves isEditing true so the parent renders the full settings modal instead.
		config.update((c) => ({ ...c, isFirstRun: false }));
	}

	function finishSetup() {
		config.save();
		config.update((c) => ({ ...c, isEditing: false, isFirstRun: false }));
		onfinish();
	}

	function openLocationPicker() {
		locationPickerOpen = true;
	}

	function handleLocationFromMap(newLocation: LatLng) {
		config.update((c) => ({
			...c,
			latLng: newLocation
		}));
		handleLocationInputBlur();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={onclose} transition:fade={{ duration: 200 }}>
		<div class="wizard-modal" onclick={(e) => e.stopPropagation()}>
			<div class="progress-track">
				<div class="progress-fill" style="width: {progressPercent}%"></div>
			</div>
			<div class="step-label">
				{t('config.wizard.stepIndicator', { current: currentStepIndex + 1, total: STEPS.length })}
			</div>

			<div class="step-content">
				{#if currentStep === 'welcome'}
					<h2>{t('config.wizard.welcome.title')}</h2>
					<p class="subtitle">{t('config.wizard.welcome.subtitle')}</p>

					<label>
						{t('config.wizard.welcome.languageLabel')}
						<select bind:value={$config.language}>
							<option value="en">{t('config.languages.english')}</option>
							<option value="fr">{t('config.languages.french')}</option>
							<option value="es">{t('config.languages.spanish')}</option>
							<option value="de">{t('config.languages.german')}</option>
						</select>
					</label>
				{:else if currentStep === 'location'}
					<h2>{t('config.wizard.location.title')}</h2>
					<p class="subtitle">{t('config.wizard.location.subtitle')}</p>

					<label>
						{t('config.fields.location')}
						<div class="location-input-group">
							<input
								type="text"
								value={formatCoordinatesForDisplay(
									$config.latLng.latitude,
									$config.latLng.longitude
								)}
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
								title={t('config.location.pickOnMap')}
							>
								<iconify-icon icon="ix:map"></iconify-icon>
							</button>
						</div>
						{#if locationError}
							<span class="location-error">{locationError}</span>
						{/if}
						{#if validatingLocation}
							<span class="location-validating">{t('config.location.validating')}</span>
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
						{t('config.fields.maxDistance')}
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
								config.update((c) => ({ ...c, maxDistance: value }));
							}}
						/>
						<div class="slider-value">{$config.maxDistance}m</div>
					</label>
				{:else if currentStep === 'display'}
					<h2>{t('config.wizard.display.title')}</h2>
					<p class="subtitle">{t('config.wizard.display.subtitle')}</p>

					<label>
						{t('config.fields.title')}
						<input type="text" bind:value={$config.title} placeholder={t('app.nearbyRoutes')} />
					</label>

					<label>
						{t('config.fields.timeFormat')}
						<select bind:value={$config.timeFormat}>
							<option value="hh:mm A">{t('config.timeFormats.12hour')}</option>
							<option value="hh:mm">{t('config.timeFormats.12hourNoAmPm')}</option>
							<option value="HH:mm">{t('config.timeFormats.24hour')}</option>
						</select>
					</label>

					<label>
						{t('config.fields.theme')}
						<div class="button-group">
							<button
								type="button"
								class="btn-option"
								class:active={$config.theme === 'light'}
								onclick={() => config.update((c) => ({ ...c, theme: 'light' }))}
							>
								{t('config.theme.light')}
							</button>
							<button
								type="button"
								class="btn-option"
								class:active={$config.theme === 'auto'}
								onclick={() => config.update((c) => ({ ...c, theme: 'auto' }))}
							>
								{t('config.theme.auto')}
							</button>
							<button
								type="button"
								class="btn-option"
								class:active={$config.theme === 'dark'}
								onclick={() => config.update((c) => ({ ...c, theme: 'dark' }))}
							>
								{t('config.theme.dark')}
							</button>
						</div>
					</label>
				{:else if currentStep === 'layout'}
					<h2>{t('config.wizard.layout.title')}</h2>
					<p class="subtitle">{t('config.wizard.layout.subtitle')}</p>

					<label>
						{t('config.routeDisplay.viewMode')}
						<div class="button-group">
							<button
								type="button"
								class="btn-option"
								class:active={$config.viewMode === 'card'}
								onclick={() =>
									config.update((c) => ({ ...c, viewMode: 'card', groupItinerariesByStop: false }))}
							>
								<iconify-icon icon="ix:application-screen"></iconify-icon>
								{t('config.routeDisplay.card')}
							</button>
							<button
								type="button"
								class="btn-option"
								class:active={$config.viewMode === 'board'}
								onclick={() =>
									config.update((c) => ({ ...c, viewMode: 'board', groupItinerariesByStop: true }))}
							>
								<iconify-icon icon="ix:table"></iconify-icon>
								{t('config.routeDisplay.board')}
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
								{t('config.routeDisplay.vertical')}
							</button>
						</div>
						<small class="help-text">{t('config.routeDisplay.viewModeHelpText')}</small>
					</label>

					<div class="toggle-container">
						<Toggle bind:checked={$config.showQRCode}>
							{#snippet label()}
								<span>{t('config.fields.showQRCode')}</span>
							{/snippet}
						</Toggle>
						<small class="toggle-help-text">{t('config.qrCode.helpText')}</small>
					</div>
				{:else if currentStep === 'finish'}
					<h2>{t('config.wizard.finish.title')}</h2>
					<p class="subtitle">{t('config.wizard.finish.subtitle')}</p>

					<dl class="summary-list">
						<dt>{t('config.fields.location')}</dt>
						<dd>
							{formatCoordinatesForDisplay($config.latLng.latitude, $config.latLng.longitude)}
						</dd>

						<dt>{t('config.fields.title')}</dt>
						<dd>{$config.title || t('app.nearbyRoutes')}</dd>

						<dt>{t('config.fields.theme')}</dt>
						<dd>{t(`config.theme.${$config.theme}`)}</dd>

						<dt>{t('config.routeDisplay.viewMode')}</dt>
						<dd>{t(`config.routeDisplay.${$config.viewMode}`)}</dd>
					</dl>

					<button type="button" class="btn-link" onclick={skipToAdvanced}>
						{t('config.wizard.buttons.skipToAdvanced')}
					</button>

					<p class="version-line">Headsign {appVersion}</p>
				{/if}
			</div>

			<div class="wizard-actions">
				{#if currentStepIndex > 0}
					<button type="button" class="btn-cancel" onclick={goBack}>
						{t('config.wizard.buttons.back')}
					</button>
				{:else}
					<span></span>
				{/if}

				{#if currentStep === 'finish'}
					<button type="button" class="btn-save" onclick={finishSetup}>
						{t('config.wizard.buttons.finish')}
					</button>
				{:else}
					<button type="button" class="btn-save" onclick={goNext}>
						{t('config.wizard.buttons.next')}
					</button>
				{/if}
			</div>
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

	.wizard-modal {
		background: var(--bg-secondary);
		color: var(--text-primary);
		padding: 2em;
		border-radius: 8px;
		box-shadow: 0 4px 6px var(--shadow-color);
		max-width: 30vw;
		min-width: 420px;
		max-height: 80vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.25em;
	}

	.progress-track {
		width: 100%;
		height: 6px;
		border-radius: 10px;
		background: var(--bg-primary);
		overflow: hidden;
		flex-shrink: 0;
	}

	.progress-fill {
		height: 100%;
		background: var(--bg-header);
		transition: width 0.25s ease;
	}

	.step-label {
		font-size: 0.85em;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.step-content {
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.step-content h2 {
		margin: 0;
		color: var(--text-primary);
		font-size: 1.6em;
	}

	.subtitle {
		margin: 0;
		color: var(--text-secondary);
	}

	.step-content label {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		color: var(--text-primary);
	}

	.step-content input,
	.step-content select {
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
		font-size: 0.95em;
		color: var(--text-secondary);
	}

	.toggle-container {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
	}

	.toggle-help-text {
		display: block;
		margin-top: 0.25em;
		font-size: 0.95em;
		color: var(--text-secondary);
	}

	.location-input-group {
		display: flex;
		gap: 0.5em;
		align-items: center;
	}

	.location-input-group input {
		flex: 1;
	}

	.btn-location,
	.btn-map-picker {
		flex-shrink: 0;
		width: auto;
		padding: 0.4em 0.5em;
		background: var(--bg-header);
		color: white;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1em;
	}

	.btn-location:hover:not(:disabled),
	.btn-map-picker:hover {
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

	.slider-value {
		text-align: center;
		font-size: 0.9em;
		font-weight: 500;
		margin-top: 0.5em;
		color: var(--text-primary);
	}

	.summary-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.4em 1em;
		margin: 0;
	}

	.summary-list dt {
		color: var(--text-secondary);
		font-weight: 500;
	}

	.summary-list dd {
		margin: 0;
		color: var(--text-primary);
		font-weight: 600;
		text-align: right;
	}

	.wizard-modal .btn-link {
		align-self: flex-start;
		background: none;
		border: none;
		padding: 0;
		color: var(--bg-header);
		text-decoration: underline;
		cursor: pointer;
		font-size: 0.95em;
		font-weight: 500;
	}

	.version-line {
		margin: 0;
		font-size: 0.85em;
		color: var(--text-secondary);
	}

	.wizard-actions {
		display: flex;
		gap: 1em;
		justify-content: space-between;
		align-items: center;
		flex-shrink: 0;
	}

	.wizard-modal button {
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
</style>
