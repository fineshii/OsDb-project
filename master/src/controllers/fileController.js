import { fileService } from '../services/fileService.js';
import { z } from 'zod';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const fileController = {
  /**
   * POST /api/files
   */
  async upload(req, res) {
    try {
      const uploadedFiles = req.files || (req.file ? [req.file] : []);

      if (uploadedFiles.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const results = [];
      for (const file of uploadedFiles) {
        const saved = await fileService.saveFile(file);
        results.push(saved);
      }

      return res.status(201).json({
        message: `Successfully uploaded ${results.length} file(s)`,
        files: results,
      });
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },

  /**
   * GET /api/files
   */
  async list(_req, res) {
    try {
      const files = await fileService.listFiles();
      return res.json(files);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },

  /**
   * GET /api/files/:id
   */
  async getById(req, res) {
    try {
      const parsed = idParamSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }

      const file = await fileService.getFileById(parsed.data.id);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      return res.json(file);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },

  /**
   * GET /api/files/:id/content
   */
  async getContent(req, res) {
    try {
      const parsed = idParamSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }

      const content = await fileService.getFileContent(parsed.data.id);
      if (content === null || content === undefined) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(content);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },
};
