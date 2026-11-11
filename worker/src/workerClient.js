import { io } from 'socket.io-client';
import { EVENTS } from 'shared/events';
import { ThreadPool } from './threadPool.js';

export class WorkerClient {
  /**
   * @param {object} options
   * @param {string} options.masterUrl
   * @param {string} options.roomCode
   * @param {string} options.workerName
   * @param {number} [options.threads=1]
   */
  constructor({ masterUrl, roomCode, workerName, threads = 1, workloadRounds = 0 }) {
    this.masterUrl = masterUrl;
    this.roomCode = roomCode;
    this.workerName = workerName;
    this.threads = threads;
    this.workloadRounds = workloadRounds;
    this.socket = null;
    this.workerId = null;
    this.threadPool = new ThreadPool(this.threads);
  }

  connect() {
    console.log(
      `[Worker ${this.workerName}] Connecting to master at ${this.masterUrl} (room: ${this.roomCode}, threads: ${this.threads})...`
    );

    this.socket = io(this.masterUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log(
        `[Worker ${this.workerName}] Socket connected (id=${this.socket.id}). Joining room...`
      );
      this.socket.emit(EVENTS.WORKER_JOIN, {
        roomCode: this.roomCode,
        workerName: this.workerName,
      });
    });

    this.socket.on(EVENTS.WORKER_JOINED, ({ roomCode, workerId }) => {
      this.workerId = workerId;
      console.log(
        `[Worker ${this.workerName}] Successfully joined room ${roomCode} with Worker ID: ${workerId}`
      );
    });

    this.socket.on(EVENTS.ERROR_MESSAGE, ({ message }) => {
      console.error(`[Worker ${this.workerName}] Error from master:`, message);
    });

    // Handle job assignment from master
    this.socket.on(EVENTS.JOB_ASSIGN, async (payload) => {
      const { jobId, type, fileId, fileName } = payload;
      console.log(
        `[Worker ${this.workerName}] Received job ${jobId} (type: ${type}, file: ${fileName})`
      );

      // Notify master that job has started
      this.socket.emit(EVENTS.JOB_STARTED, { jobId });

      try {
        let content = payload.content;

        // If file content was omitted because of size limits, fetch via REST API
        if (content === null || content === undefined) {
          console.log(
            `[Worker ${this.workerName}] Fetching content for file ${fileId} via REST API...`
          );
          const res = await fetch(`${this.masterUrl}/api/files/${fileId}/content`);
          if (!res.ok) {
            throw new Error(`Failed to fetch file content: HTTP ${res.status}`);
          }
          content = await res.text();
        }

        // Execute task in worker_threads thread pool
        const result = await this.threadPool.executeTask({
          taskType: type,
          content,
          workerName: this.workerName,
          workloadRounds: this.workloadRounds,
        });

        // Notify master of completion
        this.socket.emit(EVENTS.JOB_DONE, {
          jobId,
          result,
        });
        console.log(`[Worker ${this.workerName}] Finished job ${jobId} successfully`);
      } catch (err) {
        console.error(`[Worker ${this.workerName}] Job ${jobId} failed:`, err);
        this.socket.emit(EVENTS.JOB_FAILED, {
          jobId,
          error: err.message,
        });
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`[Worker ${this.workerName}] Disconnected from master: ${reason}`);
    });

    this.socket.on('connect_error', (err) => {
      console.error(`[Worker ${this.workerName}] Connection error: ${err.message}`);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.threadPool) {
      this.threadPool.destroy();
    }
  }
}
