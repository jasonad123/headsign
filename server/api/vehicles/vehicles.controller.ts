import { Response } from 'express';
import type { Logger } from 'pino';
import { Request } from 'express';

interface RequestWithLog extends Request {
	log: Logger;
}

interface VehicleData {
	rt_trip_id?: string;
	occupancy_status?: number | null;
	[key: string]: unknown;
}

interface VehiclesResponse {
	vehicles?: VehicleData[];
	[key: string]: unknown;
}

interface CacheEntry {
	data: { occupancy: Record<string, number> };
	expiresAt: number;
}

// Simple in-memory cache: { [global_route_id]: { data, expiresAt } }
const vehicleCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds

export async function vehicles(req: RequestWithLog, res: Response): Promise<void> {
	const { global_route_id } = req.query;

	if (!global_route_id) {
		res.status(400).json({ error: 'Missing required parameter: global_route_id' });
		return;
	}

	const routeId = global_route_id as string;

	// Check cache
	const cached = vehicleCache.get(routeId);
	if (cached && Date.now() < cached.expiresAt) {
		res.set({ 'X-Cache': 'HIT' });
		res.status(200).json(cached.data);
		return;
	}

	try {
		const response = await fetch(
			`https://external.transitapp.com/v4/public/vehicles?global_route_id=${encodeURIComponent(routeId)}`,
			{
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					apiKey: process.env.TRANSIT_API_KEY as string
				},
				signal: AbortSignal.timeout(10000)
			}
		);

		if (!response.ok) {
			if (response.status === 429) {
				req.log.warn({ api: 'transit', endpoint: 'vehicles', status: 429 }, 'Rate limited');
				res.status(429).json({ error: 'Rate limit exceeded' });
				return;
			}
			req.log.error(
				{ api: 'transit', endpoint: 'vehicles', status: response.status },
				'Error from Transit API'
			);
			res.status(response.status).json({ error: 'Transit API error' });
			return;
		}

		const data = (await response.json()) as VehiclesResponse;

		// Extract occupancy_status keyed by rt_trip_id (only non-null entries)
		const occupancy: Record<string, number> = {};
		if (Array.isArray(data.vehicles)) {
			for (const vehicle of data.vehicles) {
				if (vehicle.rt_trip_id && vehicle.occupancy_status != null) {
					occupancy[vehicle.rt_trip_id] = vehicle.occupancy_status;
				}
			}
		}

		const result = { occupancy };

		// Cache result
		vehicleCache.set(routeId, {
			data: result,
			expiresAt: Date.now() + CACHE_TTL
		});

		// Bound cache size
		if (vehicleCache.size > 200) {
			const firstKey = vehicleCache.keys().next().value;
			if (firstKey !== undefined) {
				vehicleCache.delete(firstKey);
			}
		}

		res.set({ 'X-Cache': 'MISS' });
		res.status(200).json(result);
	} catch (error) {
		const err = error as Error;
		if (err.name === 'TimeoutError' || err.name === 'AbortError') {
			res.status(504).json({ error: 'Request timeout' });
			return;
		}
		req.log.error({ err, endpoint: 'vehicles' }, 'Error fetching vehicles');
		res.status(500).json({ error: 'Failed to fetch vehicles' });
	}
}
