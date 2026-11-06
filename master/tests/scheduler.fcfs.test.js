import { describe, it, expect } from '@jest/globals';
import { schedule as scheduleFCFS } from '../src/scheduler/fcfs.js';
import { averages } from '../src/scheduler/metrics.js';

describe('FCFS Scheduler', () => {
  // Test A (FCFS) from PLAN.md Section 6
  it('Test A (FCFS): matches exact hand-calculated timeline, waiting, turnaround, and averages', () => {
    const jobs = [
      { id: 'J1', arrival: 0, burst: 5 },
      { id: 'J2', arrival: 1, burst: 3 },
      { id: 'J3', arrival: 2, burst: 8 },
      { id: 'J4', arrival: 3, burst: 6 },
    ];

    const { timeline, results } = scheduleFCFS(jobs);

    // Verify timeline
    expect(timeline).toEqual([
      { jobId: 'J1', start: 0, end: 5 },
      { jobId: 'J2', start: 5, end: 8 },
      { jobId: 'J3', start: 8, end: 16 },
      { jobId: 'J4', start: 16, end: 22 },
    ]);

    // Verify individual job results (order J1, J2, J3, J4)
    expect(results).toEqual([
      { jobId: 'J1', arrival: 0, burst: 5, start: 0, completion: 5, turnaround: 5, waiting: 0 },
      { jobId: 'J2', arrival: 1, burst: 3, start: 5, completion: 8, turnaround: 7, waiting: 4 },
      { jobId: 'J3', arrival: 2, burst: 8, start: 8, completion: 16, turnaround: 14, waiting: 6 },
      { jobId: 'J4', arrival: 3, burst: 6, start: 16, completion: 22, turnaround: 19, waiting: 13 },
    ]);

    // Verify metrics
    const { avgWaiting, avgTurnaround } = averages(results);
    expect(avgWaiting).toBe(5.75);
    expect(avgTurnaround).toBe(11.25);
  });

  // Test C (idle gap) from PLAN.md Section 6
  it('Test C (idle gap): handles CPU idle gap correctly', () => {
    const jobs = [
      { id: 'J1', arrival: 0, burst: 2 },
      { id: 'J2', arrival: 5, burst: 3 },
    ];

    const { timeline, results } = scheduleFCFS(jobs);

    expect(timeline).toEqual([
      { jobId: 'J1', start: 0, end: 2 },
      { jobId: 'J2', start: 5, end: 8 },
    ]);

    expect(results).toEqual([
      { jobId: 'J1', arrival: 0, burst: 2, start: 0, completion: 2, turnaround: 2, waiting: 0 },
      { jobId: 'J2', arrival: 5, burst: 3, start: 5, completion: 8, turnaround: 3, waiting: 0 },
    ]);

    const { avgWaiting, avgTurnaround } = averages(results);
    expect(avgWaiting).toBe(0);
    expect(avgTurnaround).toBe(2.5);
  });

  // Test E (empty list) from PLAN.md Section 6
  it('Test E: empty list returns empty results without throwing', () => {
    const { timeline, results } = scheduleFCFS([]);
    expect(timeline).toEqual([]);
    expect(results).toEqual([]);

    const { avgWaiting, avgTurnaround } = averages(results);
    expect(avgWaiting).toBe(0);
    expect(avgTurnaround).toBe(0);
  });

  // Input validation
  it('throws an error on negative or non-integer burst/arrival values', () => {
    expect(() => scheduleFCFS([{ id: 'J1', arrival: -1, burst: 5 }])).toThrow();
    expect(() => scheduleFCFS([{ id: 'J1', arrival: 0, burst: -3 }])).toThrow();
    expect(() => scheduleFCFS([{ id: 'J1', arrival: 1.5, burst: 5 }])).toThrow();
    expect(() => scheduleFCFS([{ id: 'J1', arrival: 0, burst: 2.7 }])).toThrow();
    expect(() => scheduleFCFS([{ id: 'J1', arrival: '0', burst: 5 }])).toThrow();
    expect(() => scheduleFCFS([{ arrival: 0, burst: 5 }])).toThrow();
  });
});
