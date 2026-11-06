import { describe, it, expect, jest } from '@jest/globals';
import { IndexService } from '../src/services/indexService.js';

describe('IndexService', () => {
  it('saves terms into index_terms and postings into postings table inside a transaction', async () => {
    const mockTrx = jest.fn((_table) => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        del: jest.fn().mockResolvedValue(1),
        select: jest.fn().mockReturnThis(),
        whereIn: jest.fn((_col, terms) =>
          Promise.resolve(terms.map((t, idx) => ({ id: idx + 1, term: t })))
        ),
        insert: jest.fn().mockResolvedValue([1]),
      };
      return qb;
    });

    const mockKnex = {
      transaction: jest.fn((cb) => cb(mockTrx)),
    };

    const service = new IndexService(mockKnex);
    const termsMap = {
      cloud: 5,
      simulator: 3,
      node: 2,
    };

    const result = await service.saveIndexTermsAndPostings(101, termsMap);

    expect(mockKnex.transaction).toHaveBeenCalled();
    expect(result.insertedPostings).toBe(3);
  });

  it('handles empty terms map gracefully', async () => {
    const service = new IndexService({});
    const result = await service.saveIndexTermsAndPostings(101, {});
    expect(result).toEqual({ insertedTerms: 0, insertedPostings: 0 });
  });
});
