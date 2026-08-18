/**
 * Time-related utility functions for Headsign
 */

/**
 * Calculate minutes until a departure time
 * @param departureTime Unix timestamp in seconds
 * @returns Minutes from now until departure (rounded)
 */
export function getMinutesUntil(departureTime: number): number {
	return Math.round((departureTime * 1000 - Date.now()) / 60000);
}
