import { describe, it, expect, jest } from '@jest/globals';
import { isReadableText, computeContentHash, FileService } from '../src/services/fileService.js';

describe('FileService & Helpers', () => {
  describe('isReadableText()', () => {
    it('returns true for readable ASCII and UTF-8 text', () => {
      const textBuf = Buffer.from('Hello world! Operating Systems & Databases.', 'utf-8');
      expect(isReadableText(textBuf)).toBe(true);
    });

    it('returns false for binary buffers containing null bytes', () => {
      const binaryBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x0d]);
      expect(isReadableText(binaryBuf)).toBe(false);
    });

    it('returns false for empty buffers or null', () => {
      expect(isReadableText(Buffer.alloc(0))).toBe(false);
      expect(isReadableText(null)).toBe(false);
    });
  });

  describe('computeContentHash()', () => {
    it('generates consistent 64-char SHA-256 hex hash', () => {
      const hash1 = computeContentHash('test file content');
      const hash2 = computeContentHash('test file content');
      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);

      const hash3 = computeContentHash('different content');
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('FileService.saveFile()', () => {
    it('rejects empty file with 400 status code', async () => {
      const service = new FileService({});
      await expect(
        service.saveFile({
          originalname: 'empty.txt',
          mimetype: 'text/plain',
          size: 0,
          buffer: Buffer.alloc(0),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects binary file with 400 status code', async () => {
      const service = new FileService({});
      await expect(
        service.saveFile({
          originalname: 'binary.bin',
          mimetype: 'application/octet-stream',
          size: 4,
          buffer: Buffer.from([0x00, 0x01, 0x02, 0x00]),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects duplicate file upload with 409 status code', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 10, name: 'original.txt' }),
      };
      const mockKnex = jest.fn(() => mockQueryBuilder);

      const service = new FileService(mockKnex);
      await expect(
        service.saveFile({
          originalname: 'duplicate.txt',
          mimetype: 'text/plain',
          size: 12,
          buffer: Buffer.from('hello world!'),
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('saves valid non-duplicate file into database', async () => {
      const content = 'Unique file content for cloud scheduling';
      const expectedHash = computeContentHash(content);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest
          .fn()
          // First call for duplicate check -> returns null (not duplicate)
          .mockResolvedValueOnce(null)
          // Second call after insert -> returns newly inserted file
          .mockResolvedValueOnce({
            id: 42,
            name: 'unique.txt',
            mime_type: 'text/plain',
            size_bytes: Buffer.byteLength(content),
            content_hash: expectedHash,
            uploaded_at: '2026-11-05T12:00:00Z',
          }),
        insert: jest.fn().mockResolvedValue([42]),
        select: jest.fn().mockReturnThis(),
      };
      const mockKnex = jest.fn(() => mockQueryBuilder);

      const service = new FileService(mockKnex);
      const result = await service.saveFile({
        originalname: 'unique.txt',
        mimetype: 'text/plain',
        size: Buffer.byteLength(content),
        buffer: Buffer.from(content),
      });

      expect(result.id).toBe(42);
      expect(result.name).toBe('unique.txt');
      expect(result.content_hash).toBe(expectedHash);
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
        name: 'unique.txt',
        mime_type: 'text/plain',
        size_bytes: Buffer.byteLength(content),
        content_hash: expectedHash,
        content,
      });
    });
  });

  describe('FileService.getFileContent()', () => {
    it('returns raw text content when file exists', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ content: 'Raw file content' }),
      };
      const mockKnex = jest.fn(() => mockQueryBuilder);

      const service = new FileService(mockKnex);
      const content = await service.getFileContent(42);
      expect(content).toBe('Raw file content');
    });

    it('returns null when file does not exist', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      const mockKnex = jest.fn(() => mockQueryBuilder);

      const service = new FileService(mockKnex);
      const content = await service.getFileContent(999);
      expect(content).toBeNull();
    });
  });
});
