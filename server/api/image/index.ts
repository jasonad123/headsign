import { Router } from 'express';
import * as controller from './image.controller.js';

const router = Router();

router.get('/:id', controller.show);

export default router;
