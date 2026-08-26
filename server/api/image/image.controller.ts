import { Request, Response } from 'express';
import type { Logger } from 'pino';

interface RequestWithLog extends Request {
	log: Logger;
}

function handleError(
	req: RequestWithLog,
	res: Response,
	err: string,
	statusCode?: number
): Response {
	req.log.error({ error: err, statusCode: statusCode || 500 }, 'Image API error');
	return res.status(statusCode || 500).json({ error: err });
}

// Get one image
export async function show(req: Request, res: Response): Promise<Response | void> {
	const reqWithLog = req as RequestWithLog;

	// Validate input parameters
	if (!req.params.id) {
		return res.status(400).json({ error: 'Image ID is required' });
	}

	const imageName = String(req.params.id);
	const primaryColor = String(req.query.primaryColor || '010101');
	const secondaryColor = String(req.query.secondaryColor || 'FEFEFE');

	// Validate imageName to prevent SSRF and path traversal
	// Only allow alphanumeric, underscore, hyphen, must start with a letter/number, no path traversal, max length 68.
	const imageNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}(\.svg)?$/;
	if (!imageNameRegex.test(imageName)) {
		return res.status(400).json({
			error:
				'Invalid image name. Image name must only contain letters, numbers, underscores, hyphens, optionally end with .svg, and be up to 68 characters.'
		});
	}

	// Validate color format (should be a valid hex color without the # prefix)
	const hexColorRegex = /^[0-9A-Fa-f]{6}$/;
	if (!hexColorRegex.test(primaryColor) || !hexColorRegex.test(secondaryColor)) {
		return res.status(400).json({
			error: 'Invalid color format. Colors must be 6-character hex values without the # prefix'
		});
	}

	const suffix = primaryColor === '000000' ? '-mono' : '-color-light';
	const filename = imageName.replace('.svg', '') + suffix + '.svg';
	const url = 'https://transitapp-data.com/images/svgx/' + filename;

	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(10000) // 10 second timeout
		});

		if (!response.ok) {
			reqWithLog.log.error(
				{
					api: 'image',
					status: response.status,
					url: url,
					imageName: imageName
				},
				'Error response from image API'
			);
			return handleError(reqWithLog, res, 'Image not found or unavailable', response.status);
		}

		let data = await response.text();

		if (!data) {
			return handleError(reqWithLog, res, 'Empty response from image server');
		}

		try {
			data = data
				.replace(new RegExp(`#010101`, 'gi'), `#${primaryColor}`)
				.replace(new RegExp(`#FEFEFE`, 'gi'), `#${secondaryColor}`);
		} catch (err) {
			reqWithLog.log.error({ err, imageName }, 'Error processing image data');
			return handleError(reqWithLog, res, 'Failed to process image data');
		}

		// Set content type for SVG
		res
			.status(200)
			.set('Content-Type', 'image/svg+xml')
			.set('Cache-Control', 'public, max-age=86400')
			.send(data);
	} catch (err) {
		reqWithLog.log.error({ err, url, imageName }, 'Error fetching image');
		return handleError(reqWithLog, res, 'Failed to fetch image');
	}
}
