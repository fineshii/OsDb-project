import crypto from 'crypto';
import db from '../db/index.js';

/**
 * Checks if a buffer contains readable text rather than binary data.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isReadableText(buffer) {
  if (!buffer || buffer.length === 0) return false;
  // Inspect first 8KB for null bytes (typical indicator of binary files)
  const bytesToCheck = Math.min(buffer.length, 8192);
  for (let i = 0; i < bytesToCheck; i++) {
    if (buffer[i] === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Computes SHA-256 hash of content.
 * @param {string|Buffer} content
 * @returns {string}
 */
export function computeContentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export class FileService {
  constructor(knexInstance = db) {
    this.knex = knexInstance;
  }

  /**
   * Saves an uploaded file.
   * @param {object} file
   * @param {string} file.originalname
   * @param {string} file.mimetype
   * @param {number} file.size
   * @param {Buffer} file.buffer
   * @returns {Promise<object>}
   */
  async saveFile({ originalname, mimetype, size, buffer }) {
    if (!buffer || buffer.length === 0) {
      const err = new Error('File content cannot be empty');
      err.statusCode = 400;
      throw err;
    }

    if (!isReadableText(buffer)) {
      const err = new Error('Only readable text files are supported');
      err.statusCode = 400;
      throw err;
    }

    const contentText = buffer.toString('utf-8');
    const contentHash = computeContentHash(contentText);

    // Check for duplicate by content hash
    const existing = await this.knex('files').where({ content_hash: contentHash }).first();

    if (existing) {
      const err = new Error(
        `File with identical content already exists (ID: ${existing.id}, Name: ${existing.name})`
      );
      err.statusCode = 409;
      throw err;
    }

    // Insert new file
    const [fileId] = await this.knex('files').insert({
      name: originalname,
      mime_type: mimetype || 'text/plain',
      size_bytes: size || buffer.length,
      content_hash: contentHash,
      content: contentText,
    });

    const created = await this.knex('files')
      .select('id', 'name', 'mime_type', 'size_bytes', 'content_hash', 'uploaded_at')
      .where({ id: fileId })
      .first();

    return created;
  }

  /**
   * Lists all files (excluding large content column for efficiency).
   * @returns {Promise<Array<object>>}
   */
  async listFiles() {
    return this.knex('files')
      .select('id', 'name', 'mime_type', 'size_bytes', 'content_hash', 'uploaded_at')
      .orderBy('uploaded_at', 'desc');
  }

  /**
   * Retrieves file by ID including content.
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async getFileById(id) {
    return this.knex('files').where({ id }).first();
  }

  /**
   * Retrieves only the raw content of a file.
   * @param {number} id
   * @returns {Promise<string|null>}
   */
  async getFileContent(id) {
    const file = await this.knex('files').select('content').where({ id }).first();
    return file ? file.content : null;
  }
}

export const fileService = new FileService();
