import { Router } from 'express';
import { schedulerController } from '../controllers/schedulerController.js';

const router = Router();

router.post('/simulate', schedulerController.simulate);

export default router;
