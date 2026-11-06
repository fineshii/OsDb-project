const RETRYABLE_CODES = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
let transactionQueue = Promise.resolve();

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Retry a transaction after transient InnoDB lock conflicts. */
export async function withTransactionRetry(
  knex,
  callback,
  { maxRetries = 3, baseDelayMs = 25, wait = delay } = {}
) {
  const execute = async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await knex.transaction(callback);
      } catch (error) {
        const retryable = RETRYABLE_CODES.has(error.code) || [1205, 1213].includes(error.errno);
        if (!retryable || attempt >= maxRetries) throw error;
        await wait(baseDelayMs * 2 ** attempt);
      }
    }
  };

  // Keep master-side write transactions from racing over shared job/index rows.
  const operation = transactionQueue.then(execute, execute);
  transactionQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}
