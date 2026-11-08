import { describe, it, expect, jest } from '@jest/globals';
import { escapeLike, createSnippet, SearchService } from '../src/services/searchService.js';
import { SEARCH_MODES } from 'shared/constants';

describe('SearchService & Helpers', () => {
  describe('escapeLike()', () => {
    it('escapes %, _, and \\ characters in query string', () => {
      expect(escapeLike('100%')).toBe('100\\%');
      expect(escapeLike('user_name')).toBe('user\\_name');
      expect(escapeLike('path\\to\\file')).toBe('path\\\\to\\\\file');
      expect(escapeLike('50%_discount\\deal')).toBe('50\\%\\_discount\\\\deal');
    });

    it('leaves standard text unchanged', () => {
      expect(escapeLike('distributed scheduling')).toBe('distributed scheduling');
      expect(escapeLike('Node.js 20')).toBe('Node.js 20');
    });
  });

  describe('createSnippet()', () => {
    const sampleText =
      'The quick brown fox jumps over the lazy dog in a distributed cloud simulator system.';

    it('extracts text around the target term with context', () => {
      const snippet = createSnippet(sampleText, 'lazy dog', 15);
      expect(snippet).toContain('lazy dog');
      expect(snippet.startsWith('...')).toBe(true);
      expect(snippet.endsWith('...')).toBe(true);
    });

    it('handles case-insensitive matching', () => {
      const snippet = createSnippet(sampleText, 'LAZY DOG', 10);
      expect(snippet.toLowerCase()).toContain('lazy dog');
    });

    it('returns beginning of text if match is near start', () => {
      const snippet = createSnippet(sampleText, 'The quick', 20);
      expect(snippet.startsWith('The quick')).toBe(true);
    });

    it('returns empty string if content or term is empty', () => {
      expect(createSnippet('', 'test')).toBe('');
      expect(createSnippet('content', '')).toBe('');
    });
  });

  describe('SearchService.searchLike()', () => {
    it('executes parameterized query and returns matches with execution time', async () => {
      const mockRows = [
        {
          id: 1,
          name: 'cloud-notes.txt',
          mime_type: 'text/plain',
          size_bytes: 120,
          uploaded_at: '2026-11-05T10:00:00Z',
          content: 'This project simulates distributed OS scheduling algorithms like FCFS and SJF.',
        },
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(mockRows),
      };

      const mockKnex = jest.fn(() => mockQueryBuilder);

      const service = new SearchService(mockKnex);
      const result = await service.search('FCFS', SEARCH_MODES.LIKE);

      expect(mockKnex).toHaveBeenCalledWith('files');
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'id',
        'name',
        'mime_type',
        'size_bytes',
        'uploaded_at',
        'content'
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('content', 'like', '%FCFS%');

      expect(result.mode).toBe(SEARCH_MODES.LIKE);
      expect(result.count).toBe(1);
      expect(result.results[0].name).toBe('cloud-notes.txt');
      expect(result.results[0].snippet).toContain('FCFS');
      expect(typeof result.timeMs).toBe('number');
    });

    it('rejects unsupported search modes with 400', async () => {
      const service = new SearchService({});
      await expect(service.search('test', 'unknown_mode')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('returns empty results immediately for blank query', async () => {
      const service = new SearchService({});
      const result = await service.search('   ');
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
    });
  });

  describe('SearchService.searchFulltext()', () => {
    it('executes MySQL MATCH AGAINST query with bound parameters', async () => {
      const mockRows = [
        {
          id: 2,
          name: 'paper.txt',
          mime_type: 'text/plain',
          size_bytes: 300,
          uploaded_at: '2026-11-05T10:00:00Z',
          content: 'Database indexing significantly improves fulltext keyword queries.',
          score: 1.45,
        },
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockRows),
      };

      const mockKnex = jest.fn(() => mockQueryBuilder);
      mockKnex.raw = jest.fn((str, bindings) => ({ str, bindings }));

      const service = new SearchService(mockKnex);
      const result = await service.search('indexing', SEARCH_MODES.FULLTEXT);

      expect(mockKnex).toHaveBeenCalledWith('files');
      expect(mockQueryBuilder.whereRaw).toHaveBeenCalledWith(
        '(MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE) OR name LIKE ?)',
        ['indexing', '%indexing%']
      );
      expect(result.mode).toBe(SEARCH_MODES.FULLTEXT);
      expect(result.count).toBe(1);
      expect(result.results[0].name).toBe('paper.txt');
    });
  });

  describe('SearchService.searchIndex()', () => {
    it('executes inverted index lookup joining index_terms and postings', async () => {
      const mockRows = [
        {
          id: 3,
          name: 'index-test.txt',
          mime_type: 'text/plain',
          size_bytes: 400,
          uploaded_at: '2026-11-05T10:00:00Z',
          content: 'Operating system thread scheduling and job dispatching.',
          tf: 4,
        },
      ];

      const mockQueryBuilder = {
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockRows),
      };

      const mockKnex = jest.fn(() => mockQueryBuilder);

      const service = new SearchService(mockKnex);
      const result = await service.search('scheduling', SEARCH_MODES.INDEX);

      expect(mockKnex).toHaveBeenCalledWith('files');
      expect(mockQueryBuilder.join).toHaveBeenCalledWith(
        'postings',
        'files.id',
        'postings.file_id'
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('index_terms.term', 'scheduling');
      expect(result.mode).toBe(SEARCH_MODES.INDEX);
      expect(result.count).toBe(1);
      expect(result.results[0].tf).toBe(4);
    });
  });

  describe('SearchService.benchmark()', () => {
    it('runs all three search strategies and returns comparison and timing metrics', async () => {
      const service = new SearchService({});

      // Mock the individual methods
      jest.spyOn(service, 'searchLike').mockResolvedValue({
        mode: SEARCH_MODES.LIKE,
        query: 'algorithm',
        timeMs: 12.5,
        count: 5,
        results: [],
      });

      jest.spyOn(service, 'searchFulltext').mockResolvedValue({
        mode: SEARCH_MODES.FULLTEXT,
        query: 'algorithm',
        timeMs: 3.2,
        count: 5,
        results: [],
      });

      jest.spyOn(service, 'searchIndex').mockResolvedValue({
        mode: SEARCH_MODES.INDEX,
        query: 'algorithm',
        timeMs: 1.1,
        count: 5,
        results: [],
      });

      const bench = await service.benchmark('algorithm');

      expect(bench.query).toBe('algorithm');
      expect(bench.modes.like.timeMs).toBe(12.5);
      expect(bench.modes.fulltext.timeMs).toBe(3.2);
      expect(bench.modes.index.timeMs).toBe(1.1);
      expect(bench.comparison.fastest).toBe('index');
      expect(bench.comparison.speedupVsLike).toBeGreaterThan(1);
    });
  });
});
