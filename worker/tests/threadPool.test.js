import { describe, it, expect, afterAll } from '@jest/globals';
import { ThreadPool } from '../src/threadPool.js';

describe('Worker ThreadPool', () => {
  let pool;

  afterAll(() => {
    if (pool) {
      pool.destroy();
    }
  });

  it('initializes worker threads and executes preprocess task', async () => {
    pool = new ThreadPool(2);

    const content = JSON.stringify([{ name: 'Alice', email: 'ALICE@EXAMPLE.COM' }]);

    const result = await pool.executeTask({
      taskType: 'preprocess',
      content,
      workerName: 'W-Test',
    });

    expect(result.count).toBe(1);
    expect(result.rows[0].email).toBe('alice@example.com');
    expect(result.rows[0].processed_by).toBe('W-Test');
  });

  it('executes index task in thread pool', async () => {
    const result = await pool.executeTask({
      taskType: 'index',
      content: 'Distributed operating system simulator with node worker threads',
      workerName: 'W-Test',
    });

    expect(result.terms.simulator).toBe(1);
    expect(result.terms.threads).toBe(1);
  });

  it('rejects unsupported task type without crashing pool', async () => {
    await expect(
      pool.executeTask({
        taskType: 'invalid_task',
        content: 'data',
        workerName: 'W-Test',
      })
    ).rejects.toThrow(/Unsupported task type/);
  });
});
