import { describe, it, expect } from '@jest/globals';
import { schedule as scheduleSJF } from '../src/scheduler/sjf.js';
import { averages } from '../src/scheduler/metrics.js';

describe('SJF Scheduler (Non-Preemptive)', () => {
  // Test B (SJF) from PLAN.md Section 6
  it('Test B (SJF): matches exact hand-calculated timeline, waiting, turnaround, and averages', () => {
    const jobs = [
      { id: 'J1', arrival: 0, burst: 5 },
      { id: 'J2', arrival: 1, burst: 3 },
      { id: 'J3', arrival: 2, burst: 8 },
      { id: 'J4', arrival: 3, burst: 6 },
    ];

    const { timeline, results } = scheduleSJF(jobs);

    // Verify timeline (order J1, J2, J4, J3)
    expect(timeline).toEqual([
      { jobId: 'J1', start: 0, end: 5 },
      { jobId: 'J2', start: 5, end: 8 },
      { jobId: 'J4', start: 8, end: 14 },
      { jobId: 'J3', start: 14, end: 22 },
    ]);

    // Verify individual job results
    expect(results).toEqual([
      { jobId: 'J1', arrival: 0, burst: 5, start: 0, completion: 5, turnaround: 5, waiting: 0 },
      { jobId: 'J2', arrival: 1, burst: 3, start: 5, completion: 8, turnaround: 7, waiting: 4 },
      { jobId: 'J4', arrival: 3, burst: 6, start: 8, completion: 14, turnaround: 11, waiting: 5 },
      { jobId: 'J3', arrival: 2, burst: 8, start: 14, completion: 22, turnaround: 20, waiting: 12 },
    ]);

    // Verify metrics
    const { avgWaiting, avgTurnaround } = averages(results);
    expect(avgWaiting).toBe(5.25);
    expect(avgTurnaround).toBe(10.75);
  });

  // Test C (idle gap) from PLAN.md Section 6
  it('Test C (idle gap): handles CPU idle gap correctly', () => {
    const jobs = [
      { id: 'J1', arrival: 0, burst: 2 },
      { id: 'J2', arrival: 5, burst: 3 },
    ];

    const { timeline, results } = scheduleSJF(jobs);

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

  // Test D (tie-break) from PLAN.md Section 6
  it('Test D (tie-break, SJF): breaks equal burst ties by earlier arrival, then lower id', () => {
    // Both arrived before t=10. Equal burst=4. J2 arrived at 1, J3 arrived at 2.
    // So J2 runs before J3.
    const jobsTieArrival = [
      { id: 'J1', arrival: 0, burst: 10 },
      { id: 'J3', arrival: 2, burst: 4 },
      { id: 'J2', arrival: 1, burst: 4 },
    ];

    const resArrivalTie = scheduleSJF(jobsTieArrival);
    expect(resArrivalTie.timeline.map((t) => t.jobId)).toEqual(['J1', 'J2', 'J3']);

    // Both arrived at same time (t=1). Equal burst=4.
    // Ties broken by lower id ('A' before 'B').
    const jobsTieId = [
      { id: 'J0', arrival: 0, burst: 5 },
      { id: 'B', arrival: 1, burst: 4 },
      { id: 'A', arrival: 1, burst: 4 },
    ];

    const resIdTie = scheduleSJF(jobsTieId);
    expect(resIdTie.timeline.map((t) => t.jobId)).toEqual(['J0', 'A', 'B']);
  });

  // Test E (empty list) from PLAN.md Section 6
  it('Test E: empty list returns empty results without throwing', () => {
    const { timeline, results } = scheduleSJF([]);
    expect(timeline).toEqual([]);
    expect(results).toEqual([]);

    const { avgWaiting, avgTurnaround } = averages(results);
    expect(avgWaiting).toBe(0);
    expect(avgTurnaround).toBe(0);
  });

  // Input validation
  it('throws an error on negative or non-integer burst/arrival values', () => {
    expect(() => scheduleSJF([{ id: 'J1', arrival: -1, burst: 5 }])).toThrow();
    expect(() => scheduleSJF([{ id: 'J1', arrival: 0, burst: -3 }])).toThrow();
    expect(() => scheduleSJF([{ id: 'J1', arrival: 1.5, burst: 5 }])).toThrow();
    expect(() => scheduleSJF([{ id: 'J1', arrival: 0, burst: 2.7 }])).toThrow();
    expect(() => scheduleSJF([{ id: 'J1', arrival: '0', burst: 5 }])).toThrow();
    expect(() => scheduleSJF([{ arrival: 0, burst: 5 }])).toThrow();
  });
});
