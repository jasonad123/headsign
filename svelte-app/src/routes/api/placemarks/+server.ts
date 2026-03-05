import type { RequestHandler } from './$types';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

export const GET: RequestHandler = async ({ url }) => {
	const params = url.searchParams;
	const backendUrl = `${BACKEND_URL}/api/placemarks?${params.toString()}`;

	try {
		const response = await fetch(backendUrl);

		// Forward status code and headers from backend
		const headers: HeadersInit = {
			'Content-Type': 'application/json'
		};

		// Forward Cache-Control header if present
		const cacheControl = response.headers.get('Cache-Control');
		if (cacheControl) {
			headers['Cache-Control'] = cacheControl;
		}

		const data = await response.json();

		return new Response(JSON.stringify(data), {
			status: response.status,
			headers
		});
	} catch (error) {
		console.error('Error proxying to backend:', error);
		return new Response(JSON.stringify({ error: 'Backend unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
