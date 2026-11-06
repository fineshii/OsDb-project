import { describe, it, expect, jest } from '@jest/globals';
import { withTransactionRetry } from '../src/services/transactionRetry.js';

describe('withTransactionRetry', () => {
  it('retries deadlocks with a short increasing delay', async () => {
    const deadlock = Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
    const wait = jest.fn().mockResolvedValue(undefined);
    const knex = {
      transaction: jest
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce((callback) => callback({ transaction: true })),
    };

    const result = await withTransactionRetry(knex, async (trx) => trx.transaction, {
      baseDelayMs: 10,
      wait,
    });

    expect(result).toBe(true);
    expect(knex.transaction).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[10], [20]]);
  });

  it('does not retry non-lock errors', async () => {
    const error = Object.assign(new Error('bad query'), { code: 'ER_BAD_FIELD_ERROR' });
    const knex = { transaction: jest.fn().mockRejectedValue(error) };

    await expect(withTransactionRetry(knex, jest.fn())).rejects.toBe(error);
    expect(knex.transaction).toHaveBeenCalledTimes(1);
  });

  it('runs concurrent master write transactions one at a time', async () => {
    let activeTransactions = 0;
    let maxActiveTransactions = 0;
    const knex = {
      transaction: async (callback) => {
        activeTransactions += 1;
        maxActiveTransactions = Math.max(maxActiveTransactions, activeTransactions);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeTransactions -= 1;
        return callback({});
      },
    };

    await Promise.all([
      withTransactionRetry(knex, async () => 'first'),
      withTransactionRetry(knex, async () => 'second'),
      withTransactionRetry(knex, async () => 'third'),
    ]);

    expect(maxActiveTransactions).toBe(1);
  });
});
