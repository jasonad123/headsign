import { test, expect } from '@playwright/test';

/**
 * Card view: "move to top" on a split card (routes with >3 itineraries span
 * several cards) must not corrupt the route list.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

function route(n: number, itineraryCount: number) {
	const now = Math.floor(Date.now() / 1000);
	return {
		global_route_id: `TEST:${n}`,
		route_short_name: `R${n}`,
		route_long_name: `Route ${n}`,
		route_color: '0066cc',
		route_text_color: 'ffffff',
		route_network_name: 'Test Transit',
		itineraries: Array.from({ length: itineraryCount }, (_, i) => ({
			closest_stop: { stop_name: `Stop ${n}-${i}`, global_stop_id: `TEST:s${n}-${i}` },
			merged_headsign: `Dest ${n}-${i}`,
			direction_headsign: `Dest ${n}-${i}`,
			direction_id: i % 2,
			schedule_items: [
				{ departure_time: now + 300, is_real_time: false, global_stop_id: `TEST:s${n}-${i}` }
			]
		}))
	};
}

test('card view: moving a later card of a split route to top does not error', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));

	await page.addInitScript(() => {
		localStorage.setItem(
			'config',
			JSON.stringify({ viewMode: 'card', language: 'en', scaleMode: 'manual' })
		);
	});
	// 2 routes -> 3 cards (route 1 splits into 2 cards), so card index 2 exceeds routes.length
	await page.route('**/api/routes/nearby*', (r) =>
		r.fulfill({ json: { routes: [route(1, 6), route(2, 2)] } })
	);
	await page.goto(BASE_URL);

	const cards = page.locator('.route-wrapper');
	await expect(cards).toHaveCount(3);

	await cards.nth(2).getByTitle(/move.*top/i).click({ force: true });
	await page.waitForTimeout(800);

	expect(errors).toEqual([]);
	await expect(cards).toHaveCount(3);
});
