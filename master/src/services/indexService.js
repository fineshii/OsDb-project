import db from '../db/index.js';

export class IndexService {
  constructor(knexInstance = db) {
    this.knex = knexInstance;
  }

  /**
   * Persists terms and postings for a given file into MySQL.
   * @param {number} fileId
   * @param {Record<string, number>} termsMap - { [term]: tf }
   * @param {import('knex').Knex.Transaction} [externalTrx]
   */
  async saveIndexTermsAndPostings(fileId, termsMap, externalTrx) {
    if (!fileId || !termsMap || Object.keys(termsMap).length === 0) {
      return { insertedTerms: 0, insertedPostings: 0 };
    }

    const runInTransaction = async (trx) => {
      // 1. Delete existing postings for this file to prevent duplicates
      await trx('postings').where({ file_id: fileId }).del();

      const termEntries = Object.entries(termsMap)
        .map(([rawTerm, tf]) => ({
          term: rawTerm.trim().toLowerCase().slice(0, 100),
          tf: Number(tf) || 1,
        }))
        .filter((entry) => entry.term.length >= 2);

      if (termEntries.length === 0) {
        return { insertedTerms: 0, insertedPostings: 0 };
      }

      const uniqueTerms = Array.from(new Set(termEntries.map((e) => e.term)));

      // 2. Fetch existing terms from index_terms
      const existingRows = await trx('index_terms')
        .select('id', 'term')
        .whereIn('term', uniqueTerms);

      const existingTermMap = new Map();
      for (const row of existingRows) {
        existingTermMap.set(row.term, row.id);
      }

      // 3. Find terms that need to be created
      const missingTerms = uniqueTerms.filter((term) => !existingTermMap.has(term));

      if (missingTerms.length > 0) {
        // Insert missing terms in chunks to avoid payload limits
        const chunkSize = 200;
        for (let i = 0; i < missingTerms.length; i += chunkSize) {
          const chunk = missingTerms.slice(i, i + chunkSize).map((term) => ({ term }));
          try {
            await trx('index_terms').insert(chunk);
          } catch (error) {
            // If duplicate occurs on concurrent insert, ignore and re-fetch
            if (error.code !== 'ER_DUP_ENTRY' && error.errno !== 1062) throw error;
          }
        }

        // Re-fetch all IDs
        const allTermRows = await trx('index_terms')
          .select('id', 'term')
          .whereIn('term', uniqueTerms);

        for (const row of allTermRows) {
          existingTermMap.set(row.term, row.id);
        }
      }

      // 4. Construct postings records
      const postings = [];
      for (const entry of termEntries) {
        const termId = existingTermMap.get(entry.term);
        if (termId) {
          postings.push({
            term_id: termId,
            file_id: fileId,
            tf: entry.tf,
          });
        }
      }

      // 5. Batch insert postings
      if (postings.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < postings.length; i += chunkSize) {
          const chunk = postings.slice(i, i + chunkSize);
          await trx('postings').insert(chunk);
        }
      }

      return {
        insertedTerms: missingTerms.length,
        insertedPostings: postings.length,
      };
    };

    if (externalTrx) {
      return runInTransaction(externalTrx);
    } else {
      return this.knex.transaction(runInTransaction);
    }
  }
}

export const indexService = new IndexService();
