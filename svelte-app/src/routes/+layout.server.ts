import type { LayoutServerLoad } from './$types';
import { initI18n, isSupportedLng, fallbackLng, type SupportedLng } from '$lib/i18n';

function resolveLocale(rawCookie: string | undefined): SupportedLng {
	if (!rawCookie) return fallbackLng;
	try {
		const parsed = JSON.parse(rawCookie);
		if (isSupportedLng(parsed?.language)) return parsed.language;
	} catch {
		// malformed/legacy cookie value — fall back silently
	}
	return fallbackLng;
}

export const load: LayoutServerLoad = async ({ cookies }) => {
	const locale = resolveLocale(cookies.get('config'));

	// Awaited here so it completes before SvelteKit renders +layout.svelte and
	// descendants — this is what makes SSR output come out in the right
	// language instead of always English.
	await initI18n(locale);

	return { locale };
};
