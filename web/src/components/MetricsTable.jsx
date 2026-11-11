import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export function MetricsTable({ algorithm, roomCode, queue, ganttRuns }) {
  const [savedRuns, setSavedRuns] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');
  const [scalingResults, setScalingResults] = useState(null);
  const [batches, setBatches] = useState([]);

  // Compute live metrics from completed jobs in queue
  const completedJobs = queue.filter((j) => j.status === 'done');

  const refreshRuns = useCallback(async () => {
    if (!roomCode) {
      setSavedRuns([]);
      return;
    }
    setSavedRuns(await api.listSchedulingRuns(roomCode));
  }, [roomCode]);

  const refreshBatches = useCallback(async () => {
    if (!roomCode) {
      setBatches([]);
      return;
    }
    setBatches(await api.listBatches(roomCode));
  }, [roomCode]);

  useEffect(() => {
    setError('');
    refreshRuns().catch((err) => setError(err.message));
    refreshBatches().catch((err) => setError(err.message));
  }, [refreshRuns, refreshBatches]);

  useEffect(() => {
    refreshBatches().catch((err) => setError(err.message));
  }, [queue, refreshBatches]);

  const latestRuns = Object.fromEntries(
    ['FCFS', 'SJF'].map((name) => [name, savedRuns.find((run) => run.algorithm === name)])
  );

  const buildJobs = () => {
    const firstArrival = Math.min(...queue.map((job) => Number(job.arrivalTime) || 0));
    return queue.map((job) => ({
      id: job.id,
      arrival: Math.max(0, (Number(job.arrivalTime) || firstArrival) - firstArrival),
      burst: Math.max(1, Number(job.burst) || 1),
    }));
  };

  const estimateMakespan = (jobs, workerCount, policy) => {
    const ordered = [...jobs].sort((a, b) =>
      policy === 'SJF' ? a.burst - b.burst || a.arrival - b.arrival : a.arrival - b.arrival
    );
    const workerFreeAt = Array(workerCount).fill(0);
    for (const job of ordered) {
      const workerIndex = workerFreeAt.indexOf(Math.min(...workerFreeAt));
      const start = Math.max(workerFreeAt[workerIndex], job.arrival);
      workerFreeAt[workerIndex] = start + job.burst;
    }
    return Math.max(...workerFreeAt);
  };

  const runScalingComparison = () => {
    if (queue.length === 0) return;
    const jobs = buildJobs();
    const maxWorkers = Math.min(8, jobs.length);
    setScalingResults(
      Array.from({ length: maxWorkers }, (_, index) => {
        const workers = index + 1;
        return {
          workers,
          fcfs: estimateMakespan(jobs, workers, 'FCFS'),
          sjf: estimateMakespan(jobs, workers, 'SJF'),
        };
      })
    );
  };

  // Compare the real jobs queued from uploaded files in this room.
  const runComparison = async () => {
    if (!roomCode) return;
    setSimulating(true);
    setError('');
    try {
      if (queue.length === 0) {
        throw new Error('Queue jobs from uploaded files before running a comparison.');
      }

      const jobs = buildJobs();

      await api.simulateScheduler('FCFS', jobs, roomCode);
      await api.simulateScheduler('SJF', jobs, roomCode);
      await refreshRuns();
      await refreshBatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="card metrics-table" id="metrics">
      <div className="section-header">
        <div className="section-title">
          <span className="section-kicker">SCHEDULING</span>
          <h2>FCFS vs SJF</h2>
        </div>
        <button
          className="btn btn-secondary"
          onClick={runComparison}
          disabled={simulating || !roomCode || queue.length === 0}
        >
          {simulating ? 'Comparing…' : 'Compare room jobs'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="metrics-summary">
        <div className="metric-box">
          <span className="metric-title">Active Algorithm</span>
          <span className="metric-value">{algorithm || 'FCFS'}</span>
        </div>
        <div className="metric-box">
          <span className="metric-title">Jobs Completed</span>
          <span className="metric-value">{completedJobs.length}</span>
        </div>
        <div className="metric-box">
          <span className="metric-title">Total Job Runs</span>
          <span className="metric-value">{ganttRuns.length}</span>
        </div>
      </div>

      <section className="worker-scaling">
        <div className="section-header">
          <div>
            <h3>What if I add workers?</h3>
            <p className="hint-text">Estimate the same room jobs across different worker counts.</p>
          </div>
          <button className="btn btn-secondary" onClick={runScalingComparison} disabled={!queue.length}>
            Compare worker counts
          </button>
        </div>
        {scalingResults && (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Workers</th><th>FCFS estimated finish</th><th>SJF estimated finish</th></tr></thead>
              <tbody>{scalingResults.map((row) => <tr key={row.workers}>
                <td>{row.workers}</td><td>{row.fcfs} time units</td><td>{row.sjf} time units</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        <p className="hint-text">These are scheduling estimates based on file-size burst estimates. They illustrate parallel work; they are not measured wall-clock runtimes of terminal workers.</p>
      </section>

      <section className="batch-summaries">
        <h3>Batch results</h3>
        <p className="hint-text">Actual elapsed time from the first worker start to the last worker finish in each queued batch.</p>
        {batches.length ? (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Queued</th><th>Algorithm</th><th>Jobs</th><th>Workers used</th><th>Completed</th><th>Avg. wait</th><th>Longest wait</th><th>Elapsed</th><th>Dispatch order</th></tr></thead>
              <tbody>{batches.map((batch) => (
                <tr key={batch.batchTime}>
                  <td>{new Date(batch.batchTime).toLocaleString()}</td>
                  <td>{batch.algorithm}</td>
                  <td>{batch.jobCount}</td><td>{batch.workerCount}</td>
                  <td>{batch.completedJobs}/{batch.jobCount}</td>
                  <td>{batch.averageWaitMs == null ? '—' : `${batch.averageWaitMs} ms`}</td>
                  <td>{batch.longestWaitMs == null ? '—' : `${batch.longestWaitMs} ms`}</td>
                  <td>{batch.elapsedMs == null ? (batch.pendingJobs ? 'In progress' : 'No worker runs') : `${(batch.elapsedMs / 1000).toFixed(3)} s`}</td>
                  <td><details className="batch-order"><summary>View order</summary>
                    {batch.dispatchOrder?.some((job) => job.startedAt) ? (
                      <ol>{batch.dispatchOrder.filter((job) => job.startedAt).map((job) => <li key={job.jobId}>{job.fileName}</li>)}</ol>
                    ) : <span>No jobs have started</span>}
                  </details></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="empty-text">Queue a batch to start recording results.</p>}
      </section>

      {roomCode && (
        <div className="comparison-table-wrapper">
          <h3>Latest comparison</h3>
          <p className="hint-text">Uses the queued jobs in this room. Burst values are size-based estimates from each uploaded file, not measured execution times.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Algorithm</th>
                <th>Avg. wait</th>
                <th>Avg. turnaround</th>
                <th>Jobs</th>
              </tr>
            </thead>
            <tbody>
              <tr className={algorithm === 'FCFS' ? 'row-highlight' : ''}>
                <td>
                  <strong>FCFS</strong>
                </td>
                <td>
                  <strong>{latestRuns.FCFS?.avgWaiting ?? '—'}</strong>
                </td>
                <td>
                  <strong>{latestRuns.FCFS?.avgTurnaround ?? '—'}</strong>
                </td>
                <td>{latestRuns.FCFS?.jobCount ?? '—'}</td>
              </tr>
              <tr className={algorithm === 'SJF' ? 'row-highlight' : ''}>
                <td>
                  <strong>SJF (Non-Preemptive)</strong>
                </td>
                <td>
                  <strong>{latestRuns.SJF?.avgWaiting ?? '—'}</strong>
                </td>
                <td>
                  <strong>{latestRuns.SJF?.avgTurnaround ?? '—'}</strong>
                </td>
                <td>{latestRuns.SJF?.jobCount ?? '—'}</td>
              </tr>
            </tbody>
          </table>
          {!latestRuns.FCFS && !latestRuns.SJF && (
            <p className="hint-text">Run a comparison to see scheduling metrics.</p>
          )}
        </div>
      )}
    </div>
  );
}
