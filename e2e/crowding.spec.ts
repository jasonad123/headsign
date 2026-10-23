import { test, expect, type Page } from '@playwright/test';

/**
 * Crowding Indicator Tests
 *
 * UI tests mock /api/routes/nearby and /api/vehicles in the browser, so they
 * need a running, built app (pnpm start) but no Transit API key.
 *
 * Live test: set CROWDING_ROUTE_ID (a real-time global_route_id whose agency
 * publishes occupancy, e.g. MTAMNT:2343) and run the server with a real key
 * (pnpm start-auth).
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

const TRIPS = { notCrowded: 'trip-1', some: 'trip-2', crowded: 'trip-3', noData: 'trip-4' };

function nearbyFixture() {
	const now = Math.floor(Date.now() / 1000);
	const items = Object.values(TRIPS).map((rt_trip_id, i) => ({
		departure_time: now + 300 * (i + 1),
		is_real_time: true,
		rt_trip_id,
		global_stop_id: 'TEST:stop1'
	}));
	return {
		routes: [
			{
				global_route_id: 'TEST:1',
				route_short_name: '1',
				route_long_name: 'Test Route',
				route_color: '0066cc',
				route_text_color: 'ffffff',
				route_network_name: 'Test Transit',
				itineraries: [
					{
						closest_stop: { stop_name: 'Test Stop', global_stop_id: 'TEST:stop1' },
						merged_headsign: 'Downtown',
						direction_headsign: 'Downtown',
						direction_id: 0,
						schedule_items: items
					}
				]
			}
		]
	};
}

async function setup(
	page: Page,
	opts: { showCrowding: boolean; occupancy?: Record<string, number>; viewMode?: string }
) {
	await page.addInitScript(
		([showCrowding, viewMode]) => {
			localStorage.setItem(
				'config',
				JSON.stringify({ showCrowding, viewMode, language: 'en', scaleMode: 'manual' })
			);
		},
		[opts.showCrowding, opts.viewMode ?? 'card'] as const
	);

	await page.route('**/api/routes/nearby*', (route) =>
		route.fulfill({ json: nearbyFixture() })
	);
	await page.route('**/api/vehicles*', (route) =>
		route.fulfill({ json: { occupancy: opts.occupancy ?? {} } })
	);
}

test.describe('Crowding indicators (UI)', () => {
	test('shows an icon per departure with occupancy data', async ({ page }) => {
		await setup(page, {
			showCrowding: true,
			occupancy: { [TRIPS.notCrowded]: 1, [TRIPS.some]: 2, [TRIPS.crowded]: 3 }
		});
		await page.goto(BASE_URL);

		const badges = page.locator('.crowding-badge');
		await expect(badges).toHaveCount(3);
		await expect(page.getByLabel('Not crowded')).toHaveCount(1);
		await expect(page.getByLabel('Some crowding')).toHaveCount(1);
		await expect(page.getByLabel('Crowded', { exact: true })).toHaveCount(1);

		// Level n fills n of 3 icons
		await expect(page.getByLabel('Crowded', { exact: true }).locator('.filled')).toHaveCount(3);
		await expect(page.getByLabel('Not crowded').locator('.filled')).toHaveCount(1);
	});

	test('shows no icon when occupancy is missing', async ({ page }) => {
		await setup(page, { showCrowding: true, occupancy: {} });
		await page.goto(BASE_URL);

		await expect(page.locator('.route').first()).toBeVisible();
		await expect(page.locator('.crowding-badge')).toHaveCount(0);
	});

	test('does not request vehicles or show icons when disabled', async ({ page }) => {
		let vehicleRequests = 0;
		await setup(page, { showCrowding: false, occupancy: { [TRIPS.crowded]: 3 } });
		await page.route('**/api/vehicles*', (route) => {
			vehicleRequests++;
			return route.fulfill({ json: { occupancy: { [TRIPS.crowded]: 3 } } });
		});
		await page.goto(BASE_URL);

		await expect(page.locator('.route').first()).toBeVisible();
		await expect(page.locator('.crowding-badge')).toHaveCount(0);
		expect(vehicleRequests).toBe(0);
	});
});

for (const viewMode of ['board', 'vertical']) {
	test(`${viewMode} view shows an icon for the first departure of a row`, async ({ page }) => {
		await setup(page, {
			showCrowding: true,
			viewMode,
			occupancy: { [TRIPS.notCrowded]: 3, [TRIPS.some]: 1 }
		});
		await page.goto(BASE_URL);

		// One row, icon attached to the first departure only
		await expect(page.locator('.crowding-badge')).toHaveCount(1);
		await expect(page.getByLabel('Crowded', { exact: true })).toHaveCount(1);
	});
}

test.describe('Vehicles API', () => {
	test('rejects requests without global_route_id', async ({ request }) => {
		const response = await request.get(`${BASE_URL}/api/vehicles`);
		expect(response.status()).toBe(400);
	});

	test('returns occupancy keyed by rt_trip_id (live)', async ({ request }) => {
		const routeId = process.env.CROWDING_ROUTE_ID;
		test.skip(!routeId, 'Set CROWDING_ROUTE_ID to run against the live Transit API');

		const response = await request.get(
			`${BASE_URL}/api/vehicles?global_route_id=${encodeURIComponent(routeId!)}`
		);
		expect(response.status()).toBe(200);

		const body = await response.json();
		expect(body).toHaveProperty('occupancy');
		const values = Object.values(body.occupancy) as number[];
		expect(values.length).toBeGreaterThan(0);
		for (const v of values) expect([1, 2, 3]).toContain(v);
	});
});
