import { apiCache } from '$lib/utils/apiCache';

export interface StationPlacemark {
	type: 'station';
	id: string;
	title: string;
	subtitle: string;
	networkName: string;
	networkId: number;
	color: string;
	textColor: string;
	latitude: number;
	longitude: number;
}

export interface FloatingPlacemark {
	type: string | null;
	id: string;
	title: string;
	networkName: string;
	networkId: number;
	color: string;
	textColor: string;
	latitude: number;
	longitude: number;
}

export type Placemark = StationPlacemark | FloatingPlacemark;

export interface NetworkStationGroup {
	_kind: 'station-group';
	networkName: string;
	networkId: number;
	color: string;
	textColor: string;
	stations: StationPlacemark[];
}

export interface NetworkFloatingGroup {
	_kind: 'floating-group';
	networkName: string;
	networkId: number;
	color: string;
	textColor: string;
	title: string;
	totalCount: number;
	byTitle: Record<string, number>;
}

export function isStation(p: Placemark): p is StationPlacemark {
	return p.type === 'station';
}

export function groupByNetwork(placemarks: Placemark[]): {
	stationGroups: NetworkStationGroup[];
	floatingGroups: NetworkFloatingGroup[];
} {
	const stationMap = new Map<number, StationPlacemark[]>();
	const floatingMap = new Map<number, FloatingPlacemark[]>();

	for (const p of placemarks) {
		if (isStation(p)) {
			const arr = stationMap.get(p.networkId) || [];
			arr.push(p);
			stationMap.set(p.networkId, arr);
		} else {
			const arr = floatingMap.get(p.networkId) || [];
			arr.push(p as FloatingPlacemark);
			floatingMap.set(p.networkId, arr);
		}
	}

	const stationGroups: NetworkStationGroup[] = [];
	for (const [networkId, stations] of stationMap) {
		const first = stations[0];
		stationGroups.push({
			_kind: 'station-group',
			networkName: first.networkName,
			networkId,
			color: first.color,
			textColor: first.textColor,
			stations
		});
	}

	const floatingGroups: NetworkFloatingGroup[] = [];
	for (const [networkId, vehicles] of floatingMap) {
		const first = vehicles[0];
		const byTitle: Record<string, number> = {};
		for (const v of vehicles) {
			const key = v.title || 'Vehicle';
			byTitle[key] = (byTitle[key] || 0) + 1;
		}
		floatingGroups.push({
			_kind: 'floating-group',
			networkName: first.networkName,
			networkId,
			color: first.color,
			textColor: first.textColor,
			title: first.networkName,
			totalCount: vehicles.length,
			byTitle
		});
	}

	return { stationGroups, floatingGroups };
}

const PLACEMARKS_CACHE_TTL = 30000; // 30s

export async function fetchPlacemarks(
	lat: number,
	lon: number,
	distance?: number
): Promise<Placemark[]> {
	const params: Record<string, any> = { lat: lat.toFixed(4), lon: lon.toFixed(4) };
	if (distance) params.distance = distance;

	return apiCache.fetch<Placemark[]>(
		'/api/placemarks',
		params,
		async () => {
			const qs = new URLSearchParams(params).toString();
			const response = await fetch(`/api/placemarks?${qs}`);
			if (!response.ok) {
				throw new Error(`Placemarks API error: ${response.status}`);
			}
			const data = await response.json();
			return data.placemarks || [];
		},
		PLACEMARKS_CACHE_TTL
	);
}
