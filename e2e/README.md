# End-to-End Tests

This directory contains Playwright-based E2E tests for Headsign.

## Test Coverage

### v1.3.0 Features

1. **health-check.spec.ts** - Tests the `/health` endpoint
   - ✅ Ready to run (no manual setup required)
   - Tests status codes, JSON structure, and timestamp validation

2. **stop-grouping.spec.ts** - Tests route branch grouping functionality
   - ⚠️ Requires manual setup (see below)
   - Tests grouping of routes by parent station

3. **terminus-filtering.spec.ts** - Tests terminus station filtering
   - ⚠️ Requires manual setup (see below)
   - Tests filtering of redundant terminus destinations

## Quick Start

### Prerequisites

```bash
# Install dependencies (if not already done)
pnpm install

# Install Playwright browsers
pnpm exec playwright install
```

### Running Tests

```bash
# Run all tests
pnpm exec playwright test

# Run specific test file
pnpm exec playwright test e2e/health-check.spec.ts

# Run tests in UI mode (recommended for debugging)
pnpm exec playwright test --ui

# Run tests in headed mode (see browser)
pnpm exec playwright test --headed

# View last test report
pnpm exec playwright show-report
```

## Manual Setup Required

### Stop Grouping Tests

These tests require a Transit API key and a test location with routes that have multiple branches:

1. **Set environment variables:**

   ```bash
   export TRANSIT_API_KEY=your_api_key_here
   export BASE_URL=http://localhost:8080
   ```

2. **Update test coordinates** in `stop-grouping.spec.ts`:
   - Find a location with metro/rail systems that have route variants
   - Examples: Montreal Metro, TTC Toronto, NYC Subway
   - Update `TEST_LOCATION.lat` and `TEST_LOCATION.lng`

3. **Configure environment:**

   ```bash
   # In your .env file
   UNATTENDED_SETUP=true
   UNATTENDED_LOCATION=45.5017,-73.5673
   UNATTENDED_GROUP_ITINERARIES=true
   ```

4. **Update test assertions:**
   - Add actual route IDs and stop names from your test location
   - Replace TODO comments with real expectations

### Terminus Filtering Tests

These tests require a terminus/end-of-line station:

1. **Set environment variables** (same as above)

2. **Update test coordinates** in `terminus-filtering.spec.ts`:
   - Choose an end-of-line station (e.g., terminal, turnaround point)
   - Examples: Waterfront Station (Vancouver), South Ferry (NYC)
   - Update `TERMINUS_LOCATION.lat` and `TERMINUS_LOCATION.lng`

3. **Configure environment:**

   ```bash
   # In your .env file
   UNATTENDED_FILTER_TERMINUS=true
   ```

4. **Document expected behavior:**
   - Which routes terminate at your test station
   - Which directions should be filtered
   - Which directions should remain visible

## Test Structure

Each test file follows this pattern:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
	test.describe('when feature is enabled', () => {
		test('should do something', async ({ page }) => {
			// Test implementation
		});
	});

	test.describe('when feature is disabled', () => {
		test('should do something else', async ({ page }) => {
			// Test implementation
		});
	});
});
```

## Writing New Tests

1. Create a new `.spec.ts` file in this directory
2. Import Playwright test utilities
3. Use descriptive test names
4. Add TODO comments for manual setup steps
5. Include example test data in comments
6. Update this README with test coverage info

## Continuous Integration

To run tests in CI:

```yaml
# Example GitHub Actions workflow
- name: Install Playwright Browsers
  run: pnpm exec playwright install --with-deps

- name: Run Playwright tests
  run: pnpm exec playwright test
  env:
    TRANSIT_API_KEY: ${{ secrets.TRANSIT_API_KEY }}
    BASE_URL: http://localhost:8080
```

## Debugging Tests

### Using Playwright Inspector

```bash
# Run with inspector
pnpm exec playwright test --debug
```

### Using UI Mode

```bash
# Best for debugging
pnpm exec playwright test --ui
```

### Viewing Traces

```bash
# Traces are captured on first retry
# View them with:
pnpm exec playwright show-trace trace.zip
```

## Common Issues

### "Cannot connect to server"

- Make sure the server is running on http://localhost:8080
- Check that `pnpm start` is running in another terminal
- For SvelteKit dev mode, run `cd svelte-app && pnpm dev`

### "No routes found"

- Verify TRANSIT_API_KEY is set correctly
- Check that test coordinates have nearby transit
- Ensure location is in a supported transit system

### "Test timeout"

- Increase timeout in test: `test.setTimeout(60000)`
- Check network connectivity
- Verify Transit API is responding

## Best Practices

1. **Always clean up test data**
   - Reset state between tests
   - Use `test.beforeEach()` and `test.afterEach()`

2. **Use meaningful selectors**
   - Prefer `data-testid` attributes
   - Use ARIA labels
   - Avoid brittle CSS selectors

3. **Test user journeys, not implementation**
   - Focus on what users see and do
   - Don't test internal state unless necessary

4. **Keep tests independent**
   - Each test should run in isolation
   - Don't rely on test execution order

5. **Document manual setup steps**
   - Add clear TODO comments
   - Include example values
   - Link to relevant documentation

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Transit API Documentation](https://transitapp.com/apis)
