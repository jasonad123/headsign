'use strict';

// Simple in-memory cache: { [global_route_id]: { data, expiresAt } }
const vehicleCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

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

	try {
		const response = await fetch(
			`https://external.transitapp.com/v4/public/vehicles?global_route_id=${encodeURIComponent(global_route_id)}`,
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
				req.log.warn({ api: 'transit', endpoint: 'vehicles', status: 429 }, 'Rate limited');
				return res.status(429).json({ error: 'Rate limit exceeded' });
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

		// Cache result
		vehicleCache.set(global_route_id, {
			data: result,
			expiresAt: Date.now() + CACHE_TTL
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
