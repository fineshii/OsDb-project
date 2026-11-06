import { z } from 'zod';
import { searchService } from '../services/searchService.js';
import { SEARCH_MODES } from 'shared/constants';

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search term q must not be empty'),
  mode: z
    .enum([SEARCH_MODES.LIKE, SEARCH_MODES.FULLTEXT, SEARCH_MODES.INDEX])
    .default(SEARCH_MODES.LIKE),
});

export const searchController = {
  /**
   * GET /api/search?q=...&mode=...
   */
  async search(req, res) {
    try {
      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message || 'Invalid search parameters';
        return res.status(400).json({ error: firstError });
      }

      const { q, mode } = parsed.data;
      const result = await searchService.search(q, mode);
      return res.json(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },

  /**
   * GET /api/benchmark/search?q=...
   */
  async benchmark(req, res) {
    try {
      const q = req.query.q;
      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        return res.status(400).json({ error: 'Search term q is required for benchmarking' });
      }

      const result = await searchService.benchmark(q.trim());
      return res.json(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },
};
