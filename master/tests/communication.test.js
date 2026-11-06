import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { io as Client } from 'socket.io-client';
import { server, io } from '../src/server.js';
import db from '../src/db/index.js';
import { EVENTS } from 'shared/events';
import { WORKER_STATUS } from 'shared/constants';

describe('Phase 1: Master-Worker Real-Time Communication', () => {
  let masterUrl;
  let testPort;

  beforeAll((done) => {
    // Start server on an ephemeral port (0) for testing
    server.listen(0, () => {
      const addr = server.address();
      testPort = typeof addr === 'string' ? addr : addr.port;
      masterUrl = `http://localhost:${testPort}`;
      done();
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => io.close(resolve));
    try {
      await db.destroy();
    } catch {
      // ignore
    }
  });

  it('allows a web client to create a room, two workers to join, and round-trips a dummy job', (done) => {
    const webClient = Client(masterUrl);
    let workerClient1;
    let workerClient2;
    let currentRoomCode;

    webClient.on('connect', () => {
      // Step 1: Create room
      webClient.emit(EVENTS.ROOM_CREATE, { algorithm: 'FCFS' });
    });

    webClient.on(EVENTS.ROOM_CREATED, ({ roomCode }) => {
      expect(roomCode).toBeDefined();
      expect(roomCode).toHaveLength(6);
      currentRoomCode = roomCode;

      // Step 2: Worker 1 joins
      workerClient1 = Client(masterUrl);
      workerClient1.on('connect', () => {
        workerClient1.emit(EVENTS.WORKER_JOIN, {
          roomCode: currentRoomCode,
          workerName: 'Worker-Alpha',
        });
      });

      // Step 3: Worker 2 joins
      workerClient2 = Client(masterUrl);
      workerClient2.on('connect', () => {
        workerClient2.emit(EVENTS.WORKER_JOIN, {
          roomCode: currentRoomCode,
          workerName: 'Worker-Beta',
        });
      });

      // Listen for job assignment on Worker 1
      workerClient1.on(EVENTS.JOB_ASSIGN, (payload) => {
        expect(payload.jobId).toBe('test-job-101');
        expect(payload.fileName).toBe('sample.txt');

        // Worker emits job:started
        workerClient1.emit(EVENTS.JOB_STARTED, { jobId: payload.jobId });

        // Worker completes dummy job and emits job:done
        setTimeout(() => {
          workerClient1.emit(EVENTS.JOB_DONE, {
            jobId: payload.jobId,
            result: { processed: true, rows: 42 },
          });
        }, 50);
      });
    });

    let jobAssigned = false;

    // Listen for worker:list updates on web client
    webClient.on(EVENTS.WORKER_LIST, (workers) => {
      if (workers.length === 2 && !jobAssigned) {
        jobAssigned = true;
        // Verify both workers appear in worker:list
        expect(workers.some((w) => w.name === 'Worker-Alpha')).toBe(true);
        expect(workers.some((w) => w.name === 'Worker-Beta')).toBe(true);
        expect(workers.every((w) => w.status === WORKER_STATUS.IDLE)).toBe(true);

        // Step 4: Dispatch dummy job to Worker 1
        io.to(`room:${currentRoomCode}`).emit(EVENTS.JOB_ASSIGN, {
          jobId: 'test-job-101',
          type: 'preprocess',
          fileId: 1,
          fileName: 'sample.txt',
          content: 'dummy-file-content',
        });
      } else if (jobAssigned) {
        // Look for completion update where worker is back to idle
        const worker1 = workers.find((w) => w.name === 'Worker-Alpha');
        if (worker1 && worker1.status === WORKER_STATUS.IDLE) {
          // Clean up clients
          webClient.disconnect();
          workerClient1.disconnect();
          workerClient2.disconnect();
          done();
        }
      }
    });
  });

  it('lets another browser subscribe to an existing room and receive an initial worker list', (done) => {
    const creator = Client(masterUrl);
    let browser;
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      browser?.disconnect();
      creator.disconnect();
      if (err) done(err);
      else done();
    };

    creator.on('connect', () => creator.emit(EVENTS.ROOM_CREATE, { algorithm: 'FCFS' }));
    creator.on(EVENTS.ROOM_CREATED, ({ roomCode }) => {
      browser = Client(masterUrl);
      browser.on(EVENTS.WORKER_LIST, (workers) => {
        expect(workers).toEqual([]);
        finish();
      });
      browser.on('connect', () => browser.emit(EVENTS.ROOM_SUBSCRIBE, { roomCode }));
      browser.on(EVENTS.ERROR_MESSAGE, ({ message }) => finish(new Error(message)));
    });
  });
});
