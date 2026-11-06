import { z } from 'zod';
import { getScheduler } from '../scheduler/index.js';
import { averages } from '../scheduler/metrics.js';
import { ALGORITHMS } from 'shared/constants';
import { schedulingRunService } from '../services/schedulingRunService.js';

const jobInputSchema = z.object({
  id: z.union([z.string(), z.number()]),
  arrival: z.number().int().nonnegative('Arrival time must be an integer >= 0'),
  burst: z.number().int().positive('Burst time must be an integer > 0'),
});

const simulateSchema = z.object({
  algorithm: z.enum([ALGORITHMS.FCFS, ALGORITHMS.SJF]),
  jobs: z.array(jobInputSchema),
  roomCode: z
    .string()
    .regex(/^[A-Za-z0-9]{6}$/)
    .optional(),
});

export const schedulerController = {
  /**
   * POST /api/scheduler/simulate
   */
  async simulate(req, res) {
    try {
      const parsed = simulateSchema.safeParse(req.body);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message || 'Invalid simulation payload';
        return res.status(400).json({ error: errorMsg });
      }

      const { algorithm, jobs } = parsed.data;
      const schedulerFn = getScheduler(algorithm);
      const { timeline, results } = schedulerFn(jobs);
      const metrics = averages(results);
      const roomCode = parsed.data.roomCode?.toUpperCase();
      const savedRun = roomCode
        ? await schedulingRunService.save(roomCode, {
            algorithm,
            avgWaiting: metrics.avgWaiting,
            avgTurnaround: metrics.avgTurnaround,
            jobCount: jobs.length,
          })
        : null;

      return res.json({
        algorithm,
        timeline,
        results,
        metrics,
        savedRun,
      });
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },
};
