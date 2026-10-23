/**
 * Color utility functions for Headsign
 * Used for accessibility (WCAG contrast calculations) and theme handling
 */

/**
 * Calculate relative luminance (0-1) from hex color
 * @param hex Hex color string (without # prefix)
 * @returns Relative luminance value (0 = black, 1 = white)
 */
export function getRelativeLuminance(hex: string): number {
	const rgb = parseInt(hex, 16);
	const r = ((rgb >> 16) & 0xff) / 255;
	const g = ((rgb >> 8) & 0xff) / 255;
	const b = (rgb & 0xff) / 255;

	// Convert to linear RGB (sRGB to linear conversion)
	const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
	const rLinear = toLinear(r);
	const gLinear = toLinear(g);
	const bLinear = toLinear(b);

	// Calculate luminance using WCAG formula
	return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculate WCAG contrast ratio between two colors
 * @param lum1 Relative luminance of first color
 * @param lum2 Relative luminance of second color
 * @returns Contrast ratio (1:1 to 21:1)
 */
export function getContrastRatio(lum1: number, lum2: number): number {
	const lighter = Math.max(lum1, lum2);
	const darker = Math.min(lum1, lum2);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick black or white text for a background. Biased toward white (min 2.4:1) so
 * the default brand green keeps white text; only clearly light colors get black.
 * @param hex Hex color string (#RGB or #RRGGBB, # optional)
 * @returns '#000000' or '#ffffff'
 */
export function getContrastTextColor(hex: string): '#000000' | '#ffffff' {
	let h = hex.replace('#', '');
	if (h.length === 3) h = h.replace(/./g, '$&$&');
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#ffffff';
	const lum = getRelativeLuminance(h);
	return getContrastRatio(lum, 1) >= 2.4 ? '#ffffff' : '#000000';
}
