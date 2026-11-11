import { z } from 'zod';
import { jobService } from '../services/jobService.js';
import { dispatchRoom } from '../services/dispatcher.js';
import { io } from '../server.js';
import { ALGORITHMS, JOB_TYPES } from 'shared/constants';
import { EVENTS } from 'shared/events';
import db from '../db/index.js';
import { roomManager } from '../services/roomManager.js';
import { schedulingRunService } from '../services/schedulingRunService.js';

const algorithmSchema = z.object({
  algorithm: z.enum([ALGORITHMS.FCFS, ALGORITHMS.SJF]),
});

const createJobsSchema = z.object({
  fileIds: z.array(z.number().int().positive()).min(1, 'At least one fileId is required'),
  type: z.enum([JOB_TYPES.INDEX, JOB_TYPES.PREPROCESS]),
});

export const jobController = {
  /**
   * PATCH /api/rooms/:code/algorithm
   */
  async setAlgorithm(req, res) {
    const roomCode = req.params.code?.toUpperCase();
    if (!roomCode || roomCode.length !== 6) {
      return res.status(400).json({ error: 'Invalid room code (must be 6 characters)' });
    }

    const parsed = algorithmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message || 'Invalid algorithm' });
    }

    try {
      const room = await db('rooms').where({ code: roomCode }).first();
      if (!room) return res.status(404).json({ error: `Room ${roomCode} not found` });

      await db('rooms').where({ id: room.id }).update({ algorithm: parsed.data.algorithm });
      roomManager.setAlgorithm(roomCode, parsed.data.algorithm);

      // Reorder queued work immediately. Jobs already running keep their assignments.
      await dispatchRoom(roomCode, io);

      return res.json({ roomCode, algorithm: parsed.data.algorithm });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  /**
   * POST /api/rooms/:code/jobs
   */
  async create(req, res) {
    try {
      const roomCode = req.params.code?.toUpperCase();
      if (!roomCode || roomCode.length !== 6) {
        return res.status(400).json({ error: 'Invalid room code (must be 6 characters)' });
      }

      const parsed = createJobsSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message || 'Invalid job creation payload';
        return res.status(400).json({ error: firstError });
      }

      const { fileIds, type } = parsed.data;
      const createdJobs = await jobService.createJobs(roomCode, { fileIds, type });

      // Broadcast queue update to room subscribers
      const queueView = await jobService.getQueueView(roomCode);
      io.to(`room:${roomCode}`).emit(EVENTS.QUEUE_UPDATE, queueView);

      // Trigger dispatcher to allocate newly created jobs to idle workers
      await dispatchRoom(roomCode, io);

      return res.status(201).json({
        message: `Created ${createdJobs.length} job(s)`,
        jobs: createdJobs,
      });
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },

  /**
   * GET /api/rooms/:code/jobs
   */
  async list(req, res) {
    try {
      const roomCode = req.params.code?.toUpperCase();
      if (!roomCode || roomCode.length !== 6) {
        return res.status(400).json({ error: 'Invalid room code (must be 6 characters)' });
      }

      const jobs = await jobService.listJobsByRoom(roomCode);
      return res.json(jobs);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },

  async listBatches(req, res) {
    const roomCode = req.params.code?.toUpperCase();
    if (!roomCode || roomCode.length !== 6) {
      return res.status(400).json({ error: 'Invalid room code (must be 6 characters)' });
    }
    try {
      return res.json(await jobService.listBatchSummaries(roomCode));
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  /** GET /api/rooms/:code/scheduling-runs */
  async listSchedulingRuns(req, res) {
    const roomCode = req.params.code?.toUpperCase();
    if (!roomCode || roomCode.length !== 6) {
      return res.status(400).json({ error: 'Invalid room code (must be 6 characters)' });
    }
    try {
      return res.json(await schedulingRunService.listByRoom(roomCode));
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  },
};
