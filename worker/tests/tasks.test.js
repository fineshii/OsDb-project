import { describe, it, expect } from '@jest/globals';
import { preprocessData, preprocessRecord } from '../src/tasks/preprocess.js';
import { indexFile } from '../src/tasks/indexFile.js';

describe('Worker Tasks', () => {
  describe('preprocess.js', () => {
    it('normalizes keys, trims strings, and adds metadata', () => {
      const record = {
        '  First Name ': '  John  ',
        'User Email': 'JOHN.DOE@EXAMPLE.COM',
        'Phone Number': '+1 (555) 123-4567',
        'Item Cost': '$49.99',
      };

      const cleaned = preprocessRecord(record, 'Worker-1');

      expect(cleaned.first_name).toBe('John');
      expect(cleaned.user_email).toBe('john.doe@example.com');
      expect(cleaned.phone_number).toBe('+15551234567');
      expect(cleaned.item_cost).toBe(49.99);
      expect(cleaned.processed_by).toBe('Worker-1');
      expect(cleaned.processed_at).toBeDefined();
    });

    it('processes JSON array of records', () => {
      const jsonContent = JSON.stringify([
        { Name: 'Alice', Email: 'ALICE@TEST.COM', Salary: '1000' },
        { Name: 'Bob', Email: 'BOB@TEST.COM', Salary: '2000' },
      ]);

      const result = preprocessData(jsonContent, 'Worker-Test');
      expect(result.count).toBe(2);
      expect(result.rows[0].email).toBe('alice@test.com');
      expect(result.rows[0].salary).toBe(1000);
      expect(result.rows[1].email).toBe('bob@test.com');
    });

    it('falls back to line processing for plain text', () => {
      const plainText = 'Line 1: system initialized\nLine 2: processing batch';
      const result = preprocessData(plainText, 'Worker-2');
      expect(result.count).toBe(2);
      expect(result.rows[0].line_number).toBe(1);
      expect(result.rows[0].text).toBe('Line 1: system initialized');
    });
  });

  describe('indexFile.js', () => {
    it('lowercases, drops tokens < 2 characters, and counts term frequency', () => {
      const content = 'The quick brown fox jumps over the lazy dog. A quick Fox!';
      const result = indexFile(content);

      // 'a' dropped (< 2 chars)
      expect(result.terms['a']).toBeUndefined();
      // 'the' appears 2 times
      expect(result.terms['the']).toBe(2);
      // 'quick' appears 2 times
      expect(result.terms['quick']).toBe(2);
      // 'fox' appears 2 times
      expect(result.terms['fox']).toBe(2);
      // 'brown', 'jumps', 'over', 'lazy', 'dog' appear 1 time each
      expect(result.terms['brown']).toBe(1);
      expect(result.terms['dog']).toBe(1);

      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('returns empty terms for empty or null content', () => {
      expect(indexFile('')).toEqual({ terms: {}, totalTokens: 0 });
      expect(indexFile(null)).toEqual({ terms: {}, totalTokens: 0 });
    });
  });
});
