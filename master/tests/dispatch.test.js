import { describe, it, expect } from '@jest/globals';
import { JOB_STATUS, MAX_JOB_ATTEMPTS } from 'shared/constants';

describe('Dispatcher Ordering & Failure Logic', () => {
  const queuedJobs = [
    { id: 1, burst_estimate: 8, arrival_time: 100 },
    { id: 2, burst_estimate: 2, arrival_time: 105 },
    { id: 3, burst_estimate: 5, arrival_time: 102 },
  ];

  it('orders queued jobs by arrival_time for FCFS algorithm', () => {
    const sorted = [...queuedJobs].sort((a, b) => {
      if (a.arrival_time !== b.arrival_time) {
        return a.arrival_time - b.arrival_time;
      }
      return a.id - b.id;
    });

    expect(sorted.map((j) => j.id)).toEqual([1, 3, 2]);
  });

  it('orders queued jobs by burst_estimate for SJF algorithm', () => {
    const sorted = [...queuedJobs].sort((a, b) => {
      if (a.burst_estimate !== b.burst_estimate) {
        return a.burst_estimate - b.burst_estimate;
      }
      if (a.arrival_time !== b.arrival_time) {
        return a.arrival_time - b.arrival_time;
      }
      return a.id - b.id;
    });

    expect(sorted.map((j) => j.id)).toEqual([2, 3, 1]);
  });

  it('requeues failed job if attempts < MAX_JOB_ATTEMPTS (3)', () => {
    const jobAttempt1 = { id: 10, attempts: 1 };
    const shouldRequeue1 = jobAttempt1.attempts < MAX_JOB_ATTEMPTS;
    expect(shouldRequeue1).toBe(true);

    const jobAttempt2 = { id: 10, attempts: 2 };
    const shouldRequeue2 = jobAttempt2.attempts < MAX_JOB_ATTEMPTS;
    expect(shouldRequeue2).toBe(true);

    const jobAttempt3 = { id: 10, attempts: 3 };
    const shouldRequeue3 = jobAttempt3.attempts < MAX_JOB_ATTEMPTS;
    expect(shouldRequeue3).toBe(false);

    const nextStatus = shouldRequeue3 ? JOB_STATUS.QUEUED : JOB_STATUS.FAILED;
    expect(nextStatus).toBe(JOB_STATUS.FAILED);
  });
});
