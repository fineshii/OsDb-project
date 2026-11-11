import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerScriptPath = path.resolve(__dirname, './threadTask.js');

export class ThreadPool {
  /**
   * @param {number} size - Number of worker threads
   */
  constructor(size = 1) {
    this.size = Math.max(1, size);
    this.workers = [];
    this.idleWorkers = [];
    this.taskQueue = [];
    this.pendingTasks = new Map(); // taskId -> { resolve, reject }
    this.nextTaskId = 1;

    this.initialize();
  }

  initialize() {
    for (let i = 0; i < this.size; i++) {
      this.spawnWorker();
    }
  }

  spawnWorker() {
    const worker = new Worker(workerScriptPath);

    worker.on('message', ({ id, success, result, error }) => {
      const task = this.pendingTasks.get(id);
      if (task) {
        this.pendingTasks.delete(id);
        if (success) {
          task.resolve(result);
        } else {
          task.reject(new Error(error));
        }
      }

      // Return worker to idle pool and process next queued task
      this.idleWorkers.push(worker);
      this.dispatchNext();
    });

    worker.on('error', (err) => {
      console.error('[ThreadPool] Worker thread error:', err);
      this.removeAndReplaceWorker(worker);
    });

    worker.on('exit', (code) => {
      if (!this.isDestroyed && code !== 0) {
        console.warn(`[ThreadPool] Worker thread exited with code ${code}. Replacing...`);
        this.removeAndReplaceWorker(worker);
      }
    });

    this.workers.push(worker);
    this.idleWorkers.push(worker);
  }

  removeAndReplaceWorker(worker) {
    const idx = this.workers.indexOf(worker);
    if (idx !== -1) this.workers.splice(idx, 1);

    const idleIdx = this.idleWorkers.indexOf(worker);
    if (idleIdx !== -1) this.idleWorkers.splice(idleIdx, 1);

    this.spawnWorker();
  }

  /**
   * Dispatches the next task in queue to an available idle worker.
   */
  dispatchNext() {
    if (this.taskQueue.length === 0 || this.idleWorkers.length === 0) {
      return;
    }

    const { id, taskType, content, workerName, workloadRounds } = this.taskQueue.shift();
    const worker = this.idleWorkers.shift();

    worker.postMessage({ id, taskType, content, workerName, workloadRounds });
  }

  /**
   * Schedules a task to be processed by the thread pool.
   * @param {object} params
   * @param {string} params.taskType
   * @param {string} params.content
   * @param {string} params.workerName
   * @param {number} [params.workloadRounds]
   * @returns {Promise<any>}
   */
  executeTask({ taskType, content, workerName, workloadRounds = 0 }) {
    return new Promise((resolve, reject) => {
      const id = this.nextTaskId++;
      this.pendingTasks.set(id, { resolve, reject });
      this.taskQueue.push({ id, taskType, content, workerName, workloadRounds });

      this.dispatchNext();
    });
  }

  destroy() {
    this.isDestroyed = true;
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.idleWorkers = [];
    this.taskQueue = [];
    this.pendingTasks.clear();
  }
}
