/**
 * Calculates average waiting time and turnaround time from scheduling results.
 * Pure function.
 *
 * @param {Array<{ waiting: number, turnaround: number }>} results
 * @returns {{ avgWaiting: number, avgTurnaround: number }}
 */
export function averages(results) {
  if (!results || results.length === 0) {
    return { avgWaiting: 0, avgTurnaround: 0 };
  }

  const totalWaiting = results.reduce((sum, item) => sum + item.waiting, 0);
  const totalTurnaround = results.reduce((sum, item) => sum + item.turnaround, 0);

  const avgWaiting = totalWaiting / results.length;
  const avgTurnaround = totalTurnaround / results.length;

  return {
    avgWaiting: Number(avgWaiting.toFixed(4)),
    avgTurnaround: Number(avgTurnaround.toFixed(4)),
  };
}
