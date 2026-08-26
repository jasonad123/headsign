import { Router } from 'express';
import * as controller from './vehicles.controller.js';

const router = Router();

router.get('/', controller.vehicles);

export default router;
