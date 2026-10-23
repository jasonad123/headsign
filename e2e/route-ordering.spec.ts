import { test, expect, type Page } from '@playwright/test';

/**
 * Card view route ordering with split cards. Routes with >3 itineraries span
 * several cards, so card indexes differ from route indexes.
 *
 * Fixture: route 1 (6 itineraries -> 2 cards) then route 2 (1 card):
 *   cards = [R1, R1, R2]
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

test.describe('Card view route ordering (split cards)', () => {
	let errors: string[];

	test.beforeEach(async ({ page }) => {
		errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await page.addInitScript(() => {
			localStorage.setItem(
				'config',
				JSON.stringify({ viewMode: 'card', language: 'en', scaleMode: 'manual' })
			);
		});
		await page.route('**/api/routes/nearby*', (r) =>
			r.fulfill({ json: { routes: [route(1, 6), route(2, 2)] } })
		);
		await page.goto(BASE_URL);
		await expect(page.locator('.route-wrapper')).toHaveCount(3);
	});

	async function control(page: Page, card: number, title: RegExp) {
		const wrapper = page.locator('.route-wrapper').nth(card);
		await wrapper.hover();
		return wrapper.getByTitle(title);
	}

	async function expectOrder(page: Page, order: number[]) {
		const cards = page.locator('.route-wrapper');
		for (const [i, n] of order.entries()) {
			await expect(cards.nth(i)).toContainText(`Dest ${n}-`);
		}
		expect(errors).toEqual([]);
	}

	test('move to top on the last card puts its route first', async ({ page }) => {
		await (await control(page, 2, /move.*top/i)).click();
		await expectOrder(page, [2, 1, 1]);
	});

	test('move up on the last card swaps it with the previous route', async ({ page }) => {
		await (await control(page, 2, /move up/i)).click();
		await expectOrder(page, [2, 1, 1]);
	});

	test('move down on the first card swaps the route with the next route', async ({ page }) => {
		await (await control(page, 0, /move down/i)).click();
		await expectOrder(page, [2, 1, 1]);
	});

	test('hides controls that have nowhere to go', async ({ page }) => {
		// First card: nothing above it
		await expect(await control(page, 0, /move up/i)).toHaveCount(0);
		await expect(await control(page, 0, /move.*top/i)).toHaveCount(0);
		// Second card of the first route: still nothing above it, but R2 is below
		await expect(await control(page, 1, /move up/i)).toHaveCount(0);
		await expect(await control(page, 1, /move down/i)).toHaveCount(1);
		// Last card: nothing below it
		await expect(await control(page, 2, /move down/i)).toHaveCount(0);
	});
});

// Board and vertical views reorder by stop id (not by card index), so split
// routes don't affect them. Guard against regressions.
for (const viewMode of ['board', 'vertical']) {
	test(`${viewMode} view: move stop to top reorders without errors`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await page.addInitScript((vm) => {
			localStorage.setItem(
				'config',
				JSON.stringify({ viewMode: vm, language: 'en', scaleMode: 'manual' })
			);
		}, viewMode);
		await page.route('**/api/routes/nearby*', (r) =>
			r.fulfill({ json: { routes: [route(1, 6), route(2, 2)] } })
		);
		await page.goto(BASE_URL);

		const names = page.locator('.stop-name');
		await expect(names).toHaveCount(8);
		const last = (await names.last().textContent())?.trim();
		expect(last).toBeTruthy();

		const panel = page.locator('.stop-panel, .stop-group').last();
		await panel.hover();
		await panel.getByTitle(/move stop to top/i).click();

		await expect(names.first()).toHaveText(last!);
		expect(errors).toEqual([]);
	});
}
