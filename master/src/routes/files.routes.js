import { Router } from 'express';
import multer from 'multer';
import { fileController } from '../controllers/fileController.js';
import { config } from '../config.js';

const router = Router();

// Multer memory storage with env size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
  },
});

// Middleware to catch Multer file size errors gracefully
const handleMulterUpload = (req, res, next) => {
  upload.array('files')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(400)
          .json({ error: `File size exceeds the limit of ${config.maxFileSizeMb}MB` });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

router.post('/', handleMulterUpload, fileController.upload);
router.get('/', fileController.list);
router.get('/:id', fileController.getById);
router.get('/:id/content', fileController.getContent);

export default router;
