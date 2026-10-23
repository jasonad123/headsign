import { test, expect } from '@playwright/test';

/**
 * Health Check Endpoint Tests
 *
 * These tests verify the /health endpoint functionality added in v1.3.0
 */

// TODO: Update baseURL to match your deployment
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

test.describe('Health Check Endpoint', () => {
	test('should respond with 200 status', async ({ request }) => {
		const response = await request.get(`${BASE_URL}/health`);
		expect(response.status()).toBe(200);
	});

	test('should return valid JSON structure', async ({ request }) => {
		const response = await request.get(`${BASE_URL}/health`);
		const body = await response.json();

		// Verify required fields exist
		expect(body).toHaveProperty('status');
		expect(body).toHaveProperty('timestamp');
		expect(body).toHaveProperty('version');
		expect(body).toHaveProperty('codename');
		expect(body).toHaveProperty('uptime');
		expect(body).toHaveProperty('environment');
	});

	test('should report healthy status', async ({ request }) => {
		const response = await request.get(`${BASE_URL}/health`);
		const body = await response.json();

		expect(body.status).toBe('healthy');
	});

	test('should return valid version string', async ({ request }) => {
		const response = await request.get(`${BASE_URL}/health`);
		const body = await response.json();

		// Version should be semver format (e.g., "1.3.0")
		expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	test('should return valid ISO timestamp', async ({ request }) => {
		const response = await request.get(`${BASE_URL}/health`);
		const body = await response.json();

		// Timestamp should be valid ISO 8601 format
		expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

		// Should be a recent timestamp (within last 5 seconds)
		const timestamp = new Date(body.timestamp).getTime();
		const now = Date.now();
		expect(now - timestamp).toBeLessThan(5000);
	});

	test('should return positive uptime', async ({ request }) => {
		const response = await request.get(`${BASE_URL}/health`);
		const body = await response.json();

		expect(typeof body.uptime).toBe('number');
		expect(body.uptime).toBeGreaterThan(0);
	});

	test('should work with Docker Compose health check', async ({ request }) => {
		// Simulates the health check defined in compose.yaml
		// Uses wget --spider which only checks if URL is accessible
		const response = await request.get(`${BASE_URL}/health`);

		// Should return 2xx status for health check to pass
		expect(response.status()).toBeGreaterThanOrEqual(200);
		expect(response.status()).toBeLessThan(300);
	});
});
