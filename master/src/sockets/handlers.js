import db from '../db/index.js';
import { EVENTS } from 'shared/events';
import {
  JOB_STATUS,
  JOB_RUN_OUTCOME,
  WORKER_STATUS,
  MAX_JOB_ATTEMPTS,
  JOB_TYPES,
} from 'shared/constants';
import { roomManager } from '../services/roomManager.js';
import { jobService } from '../services/jobService.js';
import { indexService } from '../services/indexService.js';
import { dispatchRoom } from '../services/dispatcher.js';
import { withTransactionRetry } from '../services/transactionRetry.js';

/**
 * Register all Socket.IO event handlers.
 * @param {import('socket.io').Server} io
 */
export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Handler: web -> master: create room
    socket.on(EVENTS.ROOM_CREATE, async ({ algorithm } = {}) => {
      try {
        const room = roomManager.createRoom(algorithm);
        socket.join(`room:${room.code}`);
        console.log(`[Socket] Room created: ${room.code} with algorithm ${room.algorithm}`);

        // Persist room to DB
        try {
          const existing = await db('rooms').where({ code: room.code }).first();
          if (!existing) {
            await db('rooms').insert({
              code: room.code,
              algorithm: room.algorithm,
            });
          }
        } catch (dbErr) {
          console.warn(`[Socket] DB persist warning on room create: ${dbErr.message}`);
        }

        socket.emit(EVENTS.ROOM_CREATED, { roomCode: room.code });
        io.to(`room:${room.code}`).emit(EVENTS.WORKER_LIST, []);
      } catch (err) {
        console.error('[Socket] Error creating room:', err);
        socket.emit(EVENTS.ERROR_MESSAGE, { message: 'Failed to create room' });
      }
    });

    // Handler: web -> master: subscribe to updates for an existing room.
    socket.on(EVENTS.ROOM_SUBSCRIBE, async ({ roomCode } = {}) => {
      const normalizedCode = typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
        socket.emit(EVENTS.ERROR_MESSAGE, { message: 'A valid 6-character roomCode is required' });
        return;
      }

      try {
        let room = roomManager.getRoom(normalizedCode);
        const dbRoom = await db('rooms').where({ code: normalizedCode }).first();
        if (!room && !dbRoom) {
          socket.emit(EVENTS.ERROR_MESSAGE, { message: `Room ${normalizedCode} does not exist` });
          return;
        }
        if (!room && dbRoom) {
          room = roomManager.restoreRoom(dbRoom.code, dbRoom.algorithm);
        }

        await socket.join(`room:${normalizedCode}`);
        const [queue, gantt] = await Promise.all([
          jobService.getQueueView(normalizedCode),
          jobService.getGanttView(normalizedCode),
        ]);
        socket.emit(EVENTS.WORKER_LIST, roomManager.getWorkerList(normalizedCode));
        socket.emit(EVENTS.QUEUE_UPDATE, queue);
        socket.emit(EVENTS.GANTT_UPDATE, gantt);
      } catch (err) {
        console.error(`[Socket] Error subscribing to room ${normalizedCode}:`, err);
        socket.emit(EVENTS.ERROR_MESSAGE, { message: 'Failed to subscribe to room updates' });
      }
    });

    // Handler: worker -> master: join room
    socket.on(EVENTS.WORKER_JOIN, async ({ roomCode, workerName } = {}) => {
      try {
        if (!roomCode || !workerName) {
          socket.emit(EVENTS.ERROR_MESSAGE, { message: 'roomCode and workerName are required' });
          return;
        }

        let room = roomManager.getRoom(roomCode);
        let dbRoom = null;

        try {
          dbRoom = await db('rooms').where({ code: roomCode }).first();
        } catch (e) {
          console.warn(`[Socket] DB room fetch warning: ${e.message}`);
        }

        if (!room && !dbRoom) {
          socket.emit(EVENTS.ERROR_MESSAGE, { message: `Room ${roomCode} does not exist` });
          return;
        }

        if (!room && dbRoom) {
          room = roomManager.restoreRoom(dbRoom.code, dbRoom.algorithm);
        }

        const joined = roomManager.addWorker(roomCode, workerName, socket.id);
        socket.join(`room:${roomCode}`);

        // Persist/update worker in DB
        let dbWorkerId = joined.workerId;
        try {
          if (!dbRoom) {
            const [newRoomId] = await db('rooms').insert({
              code: roomCode,
              algorithm: room.algorithm,
            });
            dbRoom = { id: newRoomId };
          }

          const existingWorker = await db('workers')
            .where({ room_id: dbRoom.id, name: workerName })
            .first();

          if (existingWorker) {
            await db('workers').where({ id: existingWorker.id }).update({
              socket_id: socket.id,
              status: WORKER_STATUS.IDLE,
              last_seen: db.fn.now(),
            });
            dbWorkerId = existingWorker.id;
          } else {
            const [insertedWorkerId] = await db('workers').insert({
              room_id: dbRoom.id,
              name: workerName,
              socket_id: socket.id,
              status: WORKER_STATUS.IDLE,
            });
            dbWorkerId = insertedWorkerId;
          }
        } catch (dbErr) {
          console.warn(`[Socket] DB worker insert/update warning: ${dbErr.message}`);
        }

        console.log(`[Socket] Worker ${workerName} (id=${dbWorkerId}) joined room ${roomCode}`);

        socket.emit(EVENTS.WORKER_JOINED, {
          roomCode: joined.roomCode,
          workerId: dbWorkerId,
        });

        // Broadcast updated worker list
        const workers = roomManager.getWorkerList(roomCode);
        io.to(`room:${roomCode}`).emit(EVENTS.WORKER_LIST, workers);

        // Check if there are queued jobs ready to be dispatched to this worker
        await dispatchRoom(roomCode, io);
      } catch (err) {
        console.error('[Socket] Error in worker:join:', err);
        socket.emit(EVENTS.ERROR_MESSAGE, { message: 'Failed to join room' });
      }
    });

    // Handler: worker -> master: job started
    socket.on(EVENTS.JOB_STARTED, async ({ jobId } = {}) => {
      console.log(`[Socket] Worker started job: ${jobId}`);
      const worker = roomManager.getWorkerBySocketId(socket.id);
      if (worker) {
        const mapping = roomManager.socketToWorker.get(socket.id);
        if (mapping) {
          roomManager.updateWorkerStatus(worker.id, mapping.roomCode, WORKER_STATUS.BUSY);
          io.to(`room:${mapping.roomCode}`).emit(
            EVENTS.WORKER_LIST,
            roomManager.getWorkerList(mapping.roomCode)
          );

          try {
            const queueView = await jobService.getQueueView(mapping.roomCode);
            io.to(`room:${mapping.roomCode}`).emit(EVENTS.QUEUE_UPDATE, queueView);
          } catch (e) {
            console.warn(`[Socket] Queue update error: ${e.message}`);
          }
        }
      }
    });

    // Handler: worker -> master: job done
    socket.on(EVENTS.JOB_DONE, async ({ jobId, result: _result } = {}) => {
      console.log(`[Socket] Worker completed job: ${jobId}`);
      const worker = roomManager.getWorkerBySocketId(socket.id);
      const mapping = roomManager.socketToWorker.get(socket.id);
      const now = Date.now();

      if (mapping) {
        const roomCode = mapping.roomCode;
        roomManager.updateWorkerStatus(worker ? worker.id : 0, roomCode, WORKER_STATUS.IDLE);

        try {
          await withTransactionRetry(db, async (trx) => {
            const currentJob = await trx('jobs').where({ id: jobId }).first();

            // Update job status
            await trx('jobs').where({ id: jobId }).update({
              status: JOB_STATUS.DONE,
              finished_at: now,
            });

            // If this was an index job, save terms and postings
            if (currentJob && currentJob.type === JOB_TYPES.INDEX && _result && _result.terms) {
              await indexService.saveIndexTermsAndPostings(currentJob.file_id, _result.terms, trx);
            }

            // Update open job_run for this job
            await trx('job_runs').where({ job_id: jobId, outcome: null }).update({
              ended_at: now,
              outcome: JOB_RUN_OUTCOME.DONE,
            });

            // Mark worker as idle in DB
            if (worker) {
              await trx('workers').where({ socket_id: socket.id }).update({
                status: WORKER_STATUS.IDLE,
                last_seen: trx.fn.now(),
              });
            }
          });

          // Broadcast updates
          const queueView = await jobService.getQueueView(roomCode);
          const ganttView = await jobService.getGanttView(roomCode);
          const workers = roomManager.getWorkerList(roomCode);

          io.to(`room:${roomCode}`).emit(EVENTS.QUEUE_UPDATE, queueView);
          io.to(`room:${roomCode}`).emit(EVENTS.GANTT_UPDATE, ganttView);
          io.to(`room:${roomCode}`).emit(EVENTS.WORKER_LIST, workers);

          // Dispatch any remaining queued jobs
          await dispatchRoom(roomCode, io);
        } catch (dbErr) {
          console.warn(`[Socket] DB job done transaction warning: ${dbErr.message}`);
        }
      }
    });

    // Handler: worker -> master: job failed
    socket.on(EVENTS.JOB_FAILED, async ({ jobId, error } = {}) => {
      console.error(`[Socket] Worker reported job ${jobId} failed:`, error);
      const worker = roomManager.getWorkerBySocketId(socket.id);
      const mapping = roomManager.socketToWorker.get(socket.id);
      const now = Date.now();

      if (mapping) {
        const roomCode = mapping.roomCode;
        roomManager.updateWorkerStatus(worker ? worker.id : 0, roomCode, WORKER_STATUS.IDLE);

        try {
          await withTransactionRetry(db, async (trx) => {
            const currentJob = await trx('jobs').where({ id: jobId }).first();
            const attempts = currentJob ? currentJob.attempts : 1;
            const shouldRequeue = attempts < MAX_JOB_ATTEMPTS;

            await trx('jobs')
              .where({ id: jobId })
              .update({
                status: shouldRequeue ? JOB_STATUS.QUEUED : JOB_STATUS.FAILED,
                worker_id: null,
                finished_at: shouldRequeue ? null : now,
              });

            await trx('job_runs')
              .where({ job_id: jobId, outcome: null })
              .update({
                ended_at: now,
                outcome: shouldRequeue ? JOB_RUN_OUTCOME.REQUEUED : JOB_RUN_OUTCOME.FAILED,
                error: error || 'Job failed execution',
              });

            if (worker) {
              await trx('workers').where({ socket_id: socket.id }).update({
                status: WORKER_STATUS.IDLE,
                last_seen: trx.fn.now(),
              });
            }
          });

          const queueView = await jobService.getQueueView(roomCode);
          const ganttView = await jobService.getGanttView(roomCode);
          const workers = roomManager.getWorkerList(roomCode);

          io.to(`room:${roomCode}`).emit(EVENTS.QUEUE_UPDATE, queueView);
          io.to(`room:${roomCode}`).emit(EVENTS.GANTT_UPDATE, ganttView);
          io.to(`room:${roomCode}`).emit(EVENTS.WORKER_LIST, workers);

          // Trigger dispatcher to retry requeued job
          await dispatchRoom(roomCode, io);
        } catch (dbErr) {
          console.warn(`[Socket] DB job fail transaction warning: ${dbErr.message}`);
        }
      }
    });

    // Disconnect handler
    socket.on('disconnect', async () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      const info = roomManager.handleDisconnect(socket.id);
      const now = Date.now();

      if (info) {
        const { roomCode, worker } = info;
        console.log(
          `[Socket] Worker ${worker.name} (id=${worker.id}) disconnected from room ${roomCode}`
        );

        try {
          await withTransactionRetry(db, async (trx) => {
            // Find worker in DB
            const dbWorker = await trx('workers').where({ socket_id: socket.id }).first();
            if (dbWorker) {
              // Check if worker was running an in-flight job
              const runningJob = await trx('jobs')
                .where({ worker_id: dbWorker.id, status: JOB_STATUS.RUNNING })
                .first();

              if (runningJob) {
                console.log(
                  `[Socket] Worker disconnected with running job ${runningJob.id}. Requeueing (attempt ${runningJob.attempts}/${MAX_JOB_ATTEMPTS})...`
                );

                const shouldRequeue = runningJob.attempts < MAX_JOB_ATTEMPTS;

                await trx('jobs')
                  .where({ id: runningJob.id })
                  .update({
                    status: shouldRequeue ? JOB_STATUS.QUEUED : JOB_STATUS.FAILED,
                    worker_id: null,
                    finished_at: shouldRequeue ? null : now,
                  });

                await trx('job_runs')
                  .where({ job_id: runningJob.id, worker_id: dbWorker.id, outcome: null })
                  .update({
                    ended_at: now,
                    outcome: shouldRequeue ? JOB_RUN_OUTCOME.REQUEUED : JOB_RUN_OUTCOME.FAILED,
                    error: 'Worker disconnected unexpectedly',
                  });
              }

              // Lock job rows before the worker row, matching dispatch transactions.
              await trx('workers').where({ id: dbWorker.id }).update({
                status: WORKER_STATUS.OFFLINE,
                last_seen: trx.fn.now(),
              });
            }
          });

          // Broadcast updates
          io.to(`room:${roomCode}`).emit(EVENTS.WORKER_LIST, roomManager.getWorkerList(roomCode));
          const queueView = await jobService.getQueueView(roomCode);
          const ganttView = await jobService.getGanttView(roomCode);
          io.to(`room:${roomCode}`).emit(EVENTS.QUEUE_UPDATE, queueView);
          io.to(`room:${roomCode}`).emit(EVENTS.GANTT_UPDATE, ganttView);

          // Attempt to dispatch any requeued jobs to remaining idle workers
          await dispatchRoom(roomCode, io);
        } catch (dbErr) {
          console.warn(`[Socket] DB disconnect cleanup warning: ${dbErr.message}`);
        }
      }
    });
  });
}
