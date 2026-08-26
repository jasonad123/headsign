import { Router } from 'express';
import * as controller from './routes.controller.js';

const router = Router();

router.get('/nearby', controller.nearby);

export default router;
