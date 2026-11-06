import knex from 'knex';
import knexConfig from '../../knexfile.js';
import { config } from '../config.js';

const environment = config.nodeEnv || 'development';
const activeConfig = knexConfig[environment] || knexConfig.development;

export const db = knex(activeConfig);

/**
 * Verifies connectivity to the MySQL database.
 * @returns {Promise<boolean>}
 */
export async function checkDbConnection() {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (err) {
    console.warn(`[DB] Database connection check failed: ${err.message}`);
    return false;
  }
}

export default db;
