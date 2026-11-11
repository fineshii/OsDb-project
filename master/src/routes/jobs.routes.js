import { Router } from 'express';
import { jobController } from '../controllers/jobController.js';

const router = Router({ mergeParams: true });

router.patch('/:code/algorithm', jobController.setAlgorithm);
router.get('/:code/scheduling-runs', jobController.listSchedulingRuns);
router.post('/:code/jobs', jobController.create);
router.get('/:code/jobs', jobController.list);
router.get('/:code/batches', jobController.listBatches);

export default router;
