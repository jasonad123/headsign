<script lang="ts">
	import { config } from '$lib/stores/config';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { initI18n, setLocale, t, type SupportedLng } from '$lib/i18n';
	import '../app.css';
	import 'iconify-icon';

	let { data, children } = $props();

	// Client-side: (re-)init i18next with the server-resolved locale so
	// hydration matches the SSR-rendered markup exactly — no flash, no
	// hydration mismatch. On the server this is a no-op (already awaited in
	// +layout.server.ts's load()). Only needs to run once with the initial
	// value, not reactively — later changes are handled by the $effect below.
	// svelte-ignore state_referenced_locally
	initI18n(data.locale as SupportedLng);

	let systemPrefersDark = $state(false);
	let windowWidth = $state(0);
	let widthCheckDisabled = $state(false);
	let isScreenTooNarrow = $derived(windowWidth > 0 && windowWidth < 640 && !widthCheckDisabled);
	let mediaQueryCleanup: (() => void) | null = null;
	let resizeCleanup: (() => void) | null = null;

	onMount(async () => {
		await config.load();
		// Sync i18n locale with config language after loading config, if it
		// differs from the SSR-provided locale (e.g. first-ever visit with
		// no cookie yet, where config.load() pulls from /api/config/unattended)
		if ($config.language !== data.locale) {
			await setLocale($config.language as SupportedLng);
		}

		// Detect system color scheme preference
		if (browser && window.matchMedia) {
			const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			systemPrefersDark = mediaQuery.matches;

			const handleChange = (e: MediaQueryListEvent) => {
				systemPrefersDark = e.matches;
			};

			mediaQuery.addEventListener('change', handleChange);

			// Store cleanup function
			mediaQueryCleanup = () => {
				mediaQuery.removeEventListener('change', handleChange);
			};
		}

		// Track window width for screen size check
		if (browser) {
			windowWidth = window.innerWidth;

			const handleResize = () => {
				windowWidth = window.innerWidth;
			};

			window.addEventListener('resize', handleResize);

			// Store cleanup function
			resizeCleanup = () => {
				window.removeEventListener('resize', handleResize);
			};

			// Check localStorage for width check override (dev/testing purposes)
			widthCheckDisabled = localStorage.getItem('disableWidthCheck') === 'true';

			// Add toggle function to window for console access
			(window as any).toggleWidthCheck = () => {
				widthCheckDisabled = !widthCheckDisabled;
				if (widthCheckDisabled) {
					localStorage.setItem('disableWidthCheck', 'true');
					console.log('✓ Width check DISABLED - page will reload');
				} else {
					localStorage.removeItem('disableWidthCheck');
					console.log('✓ Width check ENABLED - page will reload');
				}
				window.location.reload();
			};
		}
	});

	onDestroy(() => {
		if (mediaQueryCleanup) {
			mediaQueryCleanup();
		}
		if (resizeCleanup) {
			resizeCleanup();
		}
	});

	// Watch for config language changes
	$effect(() => {
		if ($config.language) {
			setLocale($config.language as SupportedLng);
		}
	});

	// Compute effective theme
	$effect(() => {
		if (browser) {
			const effectiveTheme =
				$config.theme === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : $config.theme;

			document.documentElement.setAttribute('data-theme', effectiveTheme);
		}
	});
</script>

{#if isScreenTooNarrow}
	<div class="screen-width-warning">
		<div class="warning-content">
			<iconify-icon icon="ix:application-screen-alarm-classes"></iconify-icon>
			<h2>{t('screenWidth.title')}</h2>
			<p class="min-width-message">{t('screenWidth.message')}</p>
			<p class="min-width-note">{t('screenWidth.minimumWidth')}</p>
			<p class="min-width-dev">{t('screenWidth.developerMessage')}</p>
		</div>
	</div>
{/if}

{@render children()}

<style>
	.screen-width-warning {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.95);
		z-index: 10000;
		display: flex;
		justify-content: center;
		align-items: center;
		color: white;
	}

	.warning-content {
		text-align: center;
		max-width: 90%;
		padding: 2em;
	}

	.warning-content iconify-icon {
		font-size: 5em;
		color: #ffa700;
		display: block;
		margin: 0 auto 0.5em;
	}

	.warning-content h2 {
		font-size: 2em;
		margin: 0 0 0.5em 0;
		font-weight: 600;
	}

	.warning-content p {
		margin: 0.5em 0;
		line-height: 1.5;
	}

	.min-width-message {
		font-size: 1.4em;
		margin-top: 1em;
	}

	.min-width-note {
		font-size: 1.25em;
		color: #cccccc;
		margin-top: 1em;
	}

	.min-width-dev {
		font-size: 1em;
		color: #7b7a7a;
		margin-top: 2em;
	}
</style>
