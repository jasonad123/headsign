import { Router } from 'express';
import * as controller from './config.controller.js';

const router = Router();

router.get('/unattended', controller.getUnattendedConfig);

export default router;
