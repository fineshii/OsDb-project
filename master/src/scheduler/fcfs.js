/**
 * Validates that an array of job inputs has valid integers for arrival and burst.
 * @param {Array<object>} jobs
 */
function validateJobs(jobs) {
  if (!Array.isArray(jobs)) {
    throw new TypeError('Jobs must be an array');
  }

  for (const job of jobs) {
    if (job.id === undefined || job.id === null) {
      throw new Error('Each job must have an id');
    }
    if (!Number.isInteger(job.arrival) || job.arrival < 0) {
      throw new Error(
        `Job ${job.id} has invalid arrival time: ${job.arrival}. Must be a non-negative integer.`
      );
    }
    if (!Number.isInteger(job.burst) || job.burst <= 0) {
      throw new Error(
        `Job ${job.id} has invalid burst time: ${job.burst}. Must be a positive integer.`
      );
    }
  }
}

/**
 * First-Come, First-Served (FCFS) CPU Scheduling Algorithm.
 * Pure function: no DB, sockets, or side-effects.
 *
 * @param {Array<{ id: string|number, arrival: number, burst: number }>} jobs
 * @returns {{
 *   timeline: Array<{ jobId: string|number, start: number, end: number }>,
 *   results: Array<{ jobId: string|number, arrival: number, burst: number, start: number, completion: number, turnaround: number, waiting: number }>
 * }}
 */
export function schedule(jobs) {
  validateJobs(jobs);

  if (jobs.length === 0) {
    return { timeline: [], results: [] };
  }

  // Sort by arrival time ascending, ties broken by id
  const sorted = [...jobs].sort((a, b) => {
    if (a.arrival !== b.arrival) {
      return a.arrival - b.arrival;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  const timeline = [];
  const results = [];
  let currentTime = 0;

  for (const job of sorted) {
    // If CPU is idle, jump directly to the job's arrival time
    const start = Math.max(currentTime, job.arrival);
    const completion = start + job.burst;
    const turnaround = completion - job.arrival;
    const waiting = turnaround - job.burst;

    timeline.push({
      jobId: job.id,
      start,
      end: completion,
    });

    results.push({
      jobId: job.id,
      arrival: job.arrival,
      burst: job.burst,
      start,
      completion,
      turnaround,
      waiting,
    });

    currentTime = completion;
  }

  return { timeline, results };
}
