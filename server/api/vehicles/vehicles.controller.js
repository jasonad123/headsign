'use strict';

// Simple in-memory cache: { [global_route_id]: { data, expiresAt } }
const vehicleCache = new Map();
const CACHE_TTL = 30000; // 30 seconds
const EMPTY_CACHE_TTL = 600000; // 10 minutes: agency/route publishes no occupancy
const DEFAULT_COOLDOWN = 60000; // pause upstream calls after a 429

let cooldownUntil = 0;

exports.vehicles = async function (req, res) {
	const { global_route_id } = req.query;

	if (!global_route_id) {
		return res.status(400).json({ error: 'Missing required parameter: global_route_id' });
	}

	// Check cache
	const cached = vehicleCache.get(global_route_id);
	if (cached && Date.now() < cached.expiresAt) {
		res.set({ 'X-Cache': 'HIT' });
		return res.status(200).json(cached.data);
	}

	if (Date.now() < cooldownUntil) {
		const retryAfter = Math.ceil((cooldownUntil - Date.now()) / 1000);
		res.set({ 'Retry-After': String(retryAfter) });
		return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
	}

	try {
		const response = await fetch(
			`https://external.transitapp.com/v4/vehicles?global_route_id=${encodeURIComponent(global_route_id)}`,
			{
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					apiKey: process.env.TRANSIT_API_KEY
				},
				signal: AbortSignal.timeout(10000)
			}
		);

		if (!response.ok) {
			if (response.status === 429) {
				const parsed = parseInt(response.headers.get('Retry-After'));
				const retryAfter = Number.isFinite(parsed) ? parsed : DEFAULT_COOLDOWN / 1000;
				cooldownUntil = Date.now() + retryAfter * 1000;
				req.log.warn({ api: 'transit', endpoint: 'vehicles', status: 429, retryAfter }, 'Rate limited');
				res.set({ 'Retry-After': String(retryAfter) });
				return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
			}
			req.log.error(
				{ api: 'transit', endpoint: 'vehicles', status: response.status },
				'Error from Transit API'
			);
			return res.status(response.status).json({ error: 'Transit API error' });
		}

		const data = await response.json();

		// Extract occupancy_status keyed by rt_trip_id (only non-null entries)
		const occupancy = {};
		if (Array.isArray(data.vehicles)) {
			for (const vehicle of data.vehicles) {
				if (vehicle.rt_trip_id && vehicle.occupancy_status != null) {
					occupancy[vehicle.rt_trip_id] = vehicle.occupancy_status;
				}
			}
		}

		const result = { occupancy };

		req.log.info(
			{
				api: 'transit',
				endpoint: 'vehicles',
				route: global_route_id,
				vehicles: Array.isArray(data.vehicles) ? data.vehicles.length : 0,
				withOccupancy: Object.keys(occupancy).length
			},
			'Vehicles fetched'
		);

		// Cache result
		vehicleCache.set(global_route_id, {
			data: result,
			expiresAt: Date.now() + (Object.keys(occupancy).length ? CACHE_TTL : EMPTY_CACHE_TTL)
		});

		// Bound cache size
		if (vehicleCache.size > 200) {
			const firstKey = vehicleCache.keys().next().value;
			vehicleCache.delete(firstKey);
		}

		res.set({ 'X-Cache': 'MISS' });
		return res.status(200).json(result);
	} catch (error) {
		if (error.name === 'TimeoutError' || error.name === 'AbortError') {
			return res.status(504).json({ error: 'Request timeout' });
		}
		req.log.error({ err: error, endpoint: 'vehicles' }, 'Error fetching vehicles');
		return res.status(500).json({ error: 'Failed to fetch vehicles' });
	}
};
