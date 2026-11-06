import { describe, it, expect } from '@jest/globals';
import { averages } from '../src/scheduler/metrics.js';
import { getScheduler } from '../src/scheduler/index.js';
import { schedule as scheduleFCFS } from '../src/scheduler/fcfs.js';
import { schedule as scheduleSJF } from '../src/scheduler/sjf.js';

describe('Scheduler Metrics & Factory', () => {
  describe('averages()', () => {
    it('computes correct average waiting and turnaround times', () => {
      const results = [
        { waiting: 0, turnaround: 5 },
        { waiting: 4, turnaround: 7 },
        { waiting: 6, turnaround: 14 },
        { waiting: 13, turnaround: 19 },
      ];

      const metrics = averages(results);
      expect(metrics.avgWaiting).toBe(5.75);
      expect(metrics.avgTurnaround).toBe(11.25);
    });

    it('returns 0 for empty results list', () => {
      expect(averages([])).toEqual({ avgWaiting: 0, avgTurnaround: 0 });
    });
  });

  describe('getScheduler()', () => {
    it('returns FCFS scheduler for "FCFS"', () => {
      const fn = getScheduler('FCFS');
      expect(fn).toBe(scheduleFCFS);
    });

    it('returns SJF scheduler for "SJF"', () => {
      const fn = getScheduler('SJF');
      expect(fn).toBe(scheduleSJF);
    });

    it('throws error for unknown scheduler algorithm', () => {
      expect(() => getScheduler('ROUND_ROBIN')).toThrow(
        /Unknown scheduling algorithm: ROUND_ROBIN/
      );
      expect(() => getScheduler('')).toThrow();
    });
  });
});
