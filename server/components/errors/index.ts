/**
 * Error responses
 */

import { Request, Response } from 'express';

interface ErrorHandlers {
	404: (req: Request, res: Response) => void;
}

const errors: ErrorHandlers = {
	404: function pageNotFound(req: Request, res: Response): void {
		const viewFilePath = '404';
		const statusCode = 404;
		const result = {
			status: statusCode
		};

		res.status(result.status);
		res.render(viewFilePath, (err: Error | null) => {
			if (err) {
				res.status(result.status).json(result);
				return;
			}

			res.render(viewFilePath);
		});
	}
};

export default errors;
