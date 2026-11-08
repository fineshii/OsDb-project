import { performance } from 'perf_hooks';
import db from '../db/index.js';
import { SEARCH_MODES } from 'shared/constants';

/**
 * Escapes characters with special meaning in SQL LIKE patterns (% , _ and \).
 * @param {string} str
 * @returns {string}
 */
export function escapeLike(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

/**
 * Extracts a contextual text snippet around the first match of query term.
 * @param {string} content
 * @param {string} term
 * @param {number} [radius=60]
 * @returns {string}
 */
export function createSnippet(content, term, radius = 60) {
  if (!content || !term) return '';
  const lowerContent = content.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lowerContent.indexOf(lowerTerm);

  if (idx === -1) {
    return content.length > radius * 2 ? content.slice(0, radius * 2) + '...' : content;
  }

  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + term.length + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';

  return prefix + content.slice(start, end).replace(/\s+/g, ' ').trim() + suffix;
}

function toSearchResult(row, queryTerm, ranking = {}) {
  const normalizedQuery = queryTerm.toLowerCase();
  const filenameMatched = row.name.toLowerCase().includes(normalizedQuery);
  const contentMatched = row.content?.toLowerCase().includes(normalizedQuery) || false;
  const matchedIn = [];

  if (filenameMatched) matchedIn.push('filename');
  // FULLTEXT and token-index matches can match normalized terms that aren't
  // present as an exact substring, so retain their content match attribution.
  if (contentMatched || !filenameMatched) matchedIn.push('content');

  return {
    id: row.id,
    name: row.name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    uploaded_at: row.uploaded_at,
    ...ranking,
    matchedIn,
    snippet:
      filenameMatched && !contentMatched
        ? `Filename match: ${row.name}`
        : createSnippet(row.content, queryTerm),
  };
}

export class SearchService {
  constructor(knexInstance = db) {
    this.knex = knexInstance;
  }

  /**
   * 1. Strategy: SQL LIKE search (Baseline from original project).
   * @param {string} queryTerm
   * @returns {Promise<{ mode: string, query: string, timeMs: number, count: number, results: Array<object> }>}
   */
  async searchLike(queryTerm) {
    const start = performance.now();
    const pattern = `%${escapeLike(queryTerm)}%`;

    const columns = ['id', 'name', 'mime_type', 'size_bytes', 'uploaded_at', 'content'];
    const contentRows = await this.knex('files')
      .select(...columns)
      .where('content', 'like', pattern);
    const filenameRows = await this.knex('files')
      .select(...columns)
      .where('name', 'like', pattern);
    const contentIds = new Set(contentRows.map((row) => row.id));
    const rows = [...contentRows, ...filenameRows.filter((row) => !contentIds.has(row.id))];

    const end = performance.now();
    const timeMs = Number((end - start).toFixed(2));

    const results = rows.map((row) => toSearchResult(row, queryTerm));

    return {
      mode: SEARCH_MODES.LIKE,
      query: queryTerm,
      timeMs,
      count: results.length,
      results,
    };
  }

  /**
   * 2. Strategy: MySQL FULLTEXT search using MATCH(...) AGAINST(... IN NATURAL LANGUAGE MODE).
   * @param {string} queryTerm
   * @returns {Promise<{ mode: string, query: string, timeMs: number, count: number, results: Array<object> }>}
   */
  async searchFulltext(queryTerm) {
    const start = performance.now();
    const pattern = `%${escapeLike(queryTerm)}%`;

    // Bound parameters prevent any SQL injection
    const rows = await this.knex('files')
      .select(
        'id',
        'name',
        'mime_type',
        'size_bytes',
        'uploaded_at',
        'content',
        this.knex.raw('MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE) as score', [queryTerm])
      )
      .whereRaw('(MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE) OR name LIKE ?)', [
        queryTerm,
        pattern,
      ])
      .orderBy('score', 'desc');

    const end = performance.now();
    const timeMs = Number((end - start).toFixed(2));

    const results = rows.map((row) => {
      const score = Number(row.score?.toFixed(4));
      return toSearchResult(row, queryTerm, score > 0 ? { score } : {});
    });

    return {
      mode: SEARCH_MODES.FULLTEXT,
      query: queryTerm,
      timeMs,
      count: results.length,
      results,
    };
  }

  /**
   * 3. Strategy: Inverted index lookup through index_terms and postings, ranked by TF.
   * @param {string} queryTerm
   * @returns {Promise<{ mode: string, query: string, timeMs: number, count: number, results: Array<object> }>}
   */
  async searchIndex(queryTerm) {
    const start = performance.now();
    const normalizedTerm = queryTerm.trim().toLowerCase();
    const pattern = `%${escapeLike(queryTerm)}%`;

    const columns = [
      'files.id',
      'files.name',
      'files.mime_type',
      'files.size_bytes',
      'files.uploaded_at',
      'files.content',
    ];
    const indexedRows = await this.knex('files')
      .join('postings', 'files.id', 'postings.file_id')
      .join('index_terms', 'postings.term_id', 'index_terms.id')
      .select(...columns, 'postings.tf')
      .where('index_terms.term', normalizedTerm)
      .orderBy('postings.tf', 'desc');
    const filenameRows = await this.knex('files')
      .select(...columns)
      .where('name', 'like', pattern);
    const indexedIds = new Set(indexedRows.map((row) => row.id));
    const rows = [...indexedRows, ...filenameRows.filter((row) => !indexedIds.has(row.id))];

    const end = performance.now();
    const timeMs = Number((end - start).toFixed(2));

    const results = rows.map((row) => toSearchResult(row, queryTerm, row.tf ? { tf: row.tf } : {}));

    return {
      mode: SEARCH_MODES.INDEX,
      query: queryTerm,
      timeMs,
      count: results.length,
      results,
    };
  }

  /**
   * Dispatches search according to the specified mode.
   * @param {string} queryTerm
   * @param {string} mode
   */
  async search(queryTerm, mode = SEARCH_MODES.LIKE) {
    if (!queryTerm || queryTerm.trim().length === 0) {
      return {
        mode,
        query: queryTerm,
        timeMs: 0,
        count: 0,
        results: [],
      };
    }

    const trimmed = queryTerm.trim();
    switch (mode) {
      case SEARCH_MODES.LIKE:
        return this.searchLike(trimmed);
      case SEARCH_MODES.FULLTEXT:
        return this.searchFulltext(trimmed);
      case SEARCH_MODES.INDEX:
        return this.searchIndex(trimmed);
      default: {
        const error = new Error(
          `Unsupported search mode '${mode}'. Use 'like', 'fulltext', or 'index'.`
        );
        error.statusCode = 400;
        throw error;
      }
    }
  }

  /**
   * Benchmarks all three search strategies on the same query term.
   * @param {string} queryTerm
   */
  async benchmark(queryTerm) {
    if (!queryTerm || queryTerm.trim().length === 0) {
      const err = new Error('Query parameter q is required for benchmarking');
      err.statusCode = 400;
      throw err;
    }

    const trimmed = queryTerm.trim();

    // Run each search mode
    const likeRes = await this.searchLike(trimmed);
    const fulltextRes = await this.searchFulltext(trimmed);
    const indexRes = await this.searchIndex(trimmed);

    const modes = {
      like: { timeMs: likeRes.timeMs, count: likeRes.count },
      fulltext: { timeMs: fulltextRes.timeMs, count: fulltextRes.count },
      index: { timeMs: indexRes.timeMs, count: indexRes.count },
    };

    // Determine fastest mode
    const sorted = [
      { name: 'like', time: likeRes.timeMs },
      { name: 'fulltext', time: fulltextRes.timeMs },
      { name: 'index', time: indexRes.timeMs },
    ].sort((a, b) => a.time - b.time);

    const fastest = sorted[0].name;
    const speedupVsLike =
      likeRes.timeMs > 0 && modes[fastest].timeMs > 0
        ? Number((likeRes.timeMs / modes[fastest].timeMs).toFixed(2))
        : 1.0;

    return {
      query: trimmed,
      modes,
      comparison: {
        fastest,
        speedupVsLike,
      },
    };
  }
}

export const searchService = new SearchService();
