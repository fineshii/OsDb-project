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
 * Non-preemptive Shortest Job First (SJF) CPU Scheduling Algorithm.
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

  const remaining = [...jobs];
  const timeline = [];
  const results = [];
  let currentTime = 0;

  while (remaining.length > 0) {
    // Filter jobs that have arrived by currentTime
    let available = remaining.filter((j) => j.arrival <= currentTime);

    // If CPU is idle (no jobs have arrived yet), jump to the earliest arrival
    if (available.length === 0) {
      const minArrival = Math.min(...remaining.map((j) => j.arrival));
      currentTime = minArrival;
      available = remaining.filter((j) => j.arrival <= currentTime);
    }

    // Sort available jobs: smallest burst first, then earlier arrival, then lower id
    available.sort((a, b) => {
      if (a.burst !== b.burst) {
        return a.burst - b.burst;
      }
      if (a.arrival !== b.arrival) {
        return a.arrival - b.arrival;
      }
      return String(a.id).localeCompare(String(b.id));
    });

    const chosenJob = available[0];

    // Remove chosen job from remaining pool
    const index = remaining.findIndex((j) => j.id === chosenJob.id);
    remaining.splice(index, 1);

    const start = currentTime;
    const completion = start + chosenJob.burst;
    const turnaround = completion - chosenJob.arrival;
    const waiting = turnaround - chosenJob.burst;

    timeline.push({
      jobId: chosenJob.id,
      start,
      end: completion,
    });

    results.push({
      jobId: chosenJob.id,
      arrival: chosenJob.arrival,
      burst: chosenJob.burst,
      start,
      completion,
      turnaround,
      waiting,
    });

    currentTime = completion;
  }

  return { timeline, results };
}
