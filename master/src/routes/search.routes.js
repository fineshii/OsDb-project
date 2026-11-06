import { Router } from 'express';
import { searchController } from '../controllers/searchController.js';

const router = Router();

router.get('/', searchController.search);
router.get('/benchmark', searchController.benchmark);

export default router;
