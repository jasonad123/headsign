/**
 * Departure filtering utilities for Headsign
 */

import type { ScheduleItem } from '$lib/services/nearby';
import { getMinutesUntil } from './timeUtils';

/**
 * Filter to show only departures within the 0-120 minute display window
 * @param item Schedule item to check
 * @returns true if departure should be displayed
 */
export function shouldShowDeparture(item: ScheduleItem): boolean {
	const minutes = getMinutesUntil(item.departure_time);
	return minutes >= 0 && minutes <= 120;
}
