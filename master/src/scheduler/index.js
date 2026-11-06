import { schedule as scheduleFCFS } from './fcfs.js';
import { schedule as scheduleSJF } from './sjf.js';
import { averages } from './metrics.js';
import { ALGORITHMS } from 'shared/constants';

/**
 * Returns the scheduling algorithm function for the given algorithm name.
 * @param {string} name
 * @returns {Function}
 */
export function getScheduler(name) {
  switch (name) {
    case ALGORITHMS.FCFS:
      return scheduleFCFS;
    case ALGORITHMS.SJF:
      return scheduleSJF;
    default:
      throw new Error(
        `Unknown scheduling algorithm: ${name}. Supported algorithms: ${Object.values(ALGORITHMS).join(', ')}`
      );
  }
}

export { scheduleFCFS, scheduleSJF, averages };
