import i18next from 'i18next';
import en from './en.json';
import fr from './fr.json';
import es from './es.json';
import de from './de.json';

export const supportedLngs = ['en', 'fr', 'es', 'de'] as const;
export type SupportedLng = (typeof supportedLngs)[number];
export const fallbackLng: SupportedLng = 'en';

export function isSupportedLng(value: unknown): value is SupportedLng {
	return typeof value === 'string' && (supportedLngs as readonly string[]).includes(value);
}

// i18next's own `i18next.language` isn't a Svelte signal, so every t() call
// touches this rune to give templates something reactive to track. It's only
// ever reassigned after i18next.changeLanguage()'s promise resolves (see
// setLocale/initI18n below), so t() and the rune never disagree.
let currentLng = $state<SupportedLng>(fallbackLng);

export const locale = {
	get current() {
		return currentLng;
	}
};

let initPromise: Promise<unknown> | null = null;

function ensureInitialized(startLng: SupportedLng) {
	if (!initPromise) {
		initPromise = i18next.init({
			lng: startLng,
			fallbackLng,
			supportedLngs,
			resources: {
				en: { translation: en },
				fr: { translation: fr },
				es: { translation: es },
				de: { translation: de }
			},
			interpolation: { escapeValue: false }, // Svelte handles its own escaping
			returnEmptyString: false
		});
	}
	return initPromise;
}

/**
 * Initialize (once per process) and set the active locale for the current
 * render. Safe to call on both server and client; on the server this is
 * awaited from +layout.server.ts's load() before Svelte renders, on the
 * client it's called once at layout init with the server-provided locale.
 */
export async function initI18n(lng: SupportedLng): Promise<void> {
	await ensureInitialized(lng);
	if (i18next.language !== lng) {
		await i18next.changeLanguage(lng);
	}
	currentLng = lng;
}

export async function setLocale(lng: SupportedLng): Promise<void> {
	await i18next.changeLanguage(lng);
	currentLng = lng;
}

/** Reactive-in-templates translation helper — the `$_()` replacement. */
export function t(key: string, options?: Record<string, unknown>): string {
	void currentLng; // establish reactive dependency
	return i18next.t(key, options as any) as string;
}
