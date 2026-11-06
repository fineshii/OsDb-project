import db from '../db/index.js';
import { roomManager } from './roomManager.js';
import { jobService } from './jobService.js';
import { config } from '../config.js';
import { EVENTS } from 'shared/events';
import { ALGORITHMS, JOB_STATUS, WORKER_STATUS } from 'shared/constants';
import { withTransactionRetry } from './transactionRetry.js';

/**
 * Dispatches queued jobs in a room to idle workers.
 * Uses atomic SELECT ... FOR UPDATE transactions to prevent race conditions.
 *
 * @param {string} roomCode
 * @param {import('socket.io').Server} io
 */
export async function dispatchRoom(roomCode, io) {
  if (!roomCode || !io) return;

  try {
    // 1. Get room details from DB (or sync from roomManager)
    let room = await db('rooms').where({ code: roomCode }).first();
    if (!room) {
      const memRoom = roomManager.getRoom(roomCode);
      if (memRoom) {
        const [id] = await db('rooms').insert({
          code: memRoom.code,
          algorithm: memRoom.algorithm,
        });
        room = { id, code: memRoom.code, algorithm: memRoom.algorithm };
      } else {
        return;
      }
    }

    // 3. Atomically select and claim queued jobs using a transaction with FOR UPDATE
    let assignments = [];

    await withTransactionRetry(db, async (trx) => {
      const transactionAssignments = [];
      // Lock queued jobs for update
      const queuedJobs = await trx('jobs')
        .where({ room_id: room.id, status: JOB_STATUS.QUEUED })
        .forUpdate();

      if (queuedJobs.length === 0) {
        return;
      }

      // Read and lock idle workers only after the job rows to keep lock ordering stable.
      const idleWorkers = await trx('workers')
        .where({ room_id: room.id, status: WORKER_STATUS.IDLE })
        .orderBy('id', 'asc')
        .forUpdate();
      if (idleWorkers.length === 0) return;

      // Order according to room scheduling algorithm
      if (room.algorithm === ALGORITHMS.SJF) {
        // SJF: smallest burst_estimate, ties broken by arrival_time, then id
        queuedJobs.sort((a, b) => {
          if (a.burst_estimate !== b.burst_estimate) {
            return a.burst_estimate - b.burst_estimate;
          }
          if (a.arrival_time !== b.arrival_time) {
            return a.arrival_time - b.arrival_time;
          }
          return a.id - b.id;
        });
      } else {
        // FCFS: earliest arrival_time, ties broken by id
        queuedJobs.sort((a, b) => {
          if (a.arrival_time !== b.arrival_time) {
            return a.arrival_time - b.arrival_time;
          }
          return a.id - b.id;
        });
      }

      // Assign jobs to available idle workers
      const limit = Math.min(idleWorkers.length, queuedJobs.length);
      for (let i = 0; i < limit; i++) {
        const job = queuedJobs[i];
        const worker = idleWorkers[i];
        const now = Date.now();

        // Update job status to running and increment attempts
        await trx('jobs')
          .where({ id: job.id })
          .update({
            status: JOB_STATUS.RUNNING,
            worker_id: worker.id,
            started_at: now,
            attempts: job.attempts + 1,
          });

        // Insert new job_run record for Gantt chart history
        await trx('job_runs').insert({
          job_id: job.id,
          worker_id: worker.id,
          started_at: now,
          outcome: null,
        });

        // Mark worker as busy in DB
        await trx('workers').where({ id: worker.id }).update({
          status: WORKER_STATUS.BUSY,
          last_seen: trx.fn.now(),
        });

        // Fetch file content for payload
        const file = await trx('files').where({ id: job.file_id }).first();

        // Omit large content payload over MAX_SOCKET_PAYLOAD limit
        const shouldOmitContent = file && file.size_bytes > config.maxSocketPayload;

        transactionAssignments.push({
          jobId: job.id,
          workerSocketId: worker.socket_id,
          workerId: worker.id,
          workerName: worker.name,
          payload: {
            jobId: job.id,
            type: job.type,
            fileId: job.file_id,
            fileName: file ? file.name : `file_${job.file_id}`,
            content: shouldOmitContent ? null : file ? file.content : '',
          },
        });
      }

      assignments = transactionAssignments;
    });

    // 4. Emit assignments over sockets outside the database transaction
    for (const assignment of assignments) {
      // Update in-memory worker status
      roomManager.updateWorkerStatus(assignment.workerId, roomCode, WORKER_STATUS.BUSY);

      if (assignment.workerSocketId) {
        console.log(
          `[Dispatcher] Assigning job ${assignment.jobId} to worker ${assignment.workerName} (socket=${assignment.workerSocketId})`
        );
        io.to(assignment.workerSocketId).emit(EVENTS.JOB_ASSIGN, assignment.payload);
      }
    }

    // 5. Broadcast real-time queue and worker updates to web dashboard
    if (assignments.length > 0) {
      const queueView = await jobService.getQueueView(roomCode);
      const workerList = roomManager.getWorkerList(roomCode);
      const ganttView = await jobService.getGanttView(roomCode);

      io.to(`room:${roomCode}`).emit(EVENTS.QUEUE_UPDATE, queueView);
      io.to(`room:${roomCode}`).emit(EVENTS.WORKER_LIST, workerList);
      io.to(`room:${roomCode}`).emit(EVENTS.GANTT_UPDATE, ganttView);
    }
  } catch (err) {
    console.error(`[Dispatcher] Error dispatching room ${roomCode}:`, err);
  }
}
