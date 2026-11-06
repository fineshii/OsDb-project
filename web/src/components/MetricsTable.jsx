import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export function MetricsTable({ algorithm, roomCode, queue, ganttRuns }) {
  const [savedRuns, setSavedRuns] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');

  // Compute live metrics from completed jobs in queue
  const completedJobs = queue.filter((j) => j.status === 'done');

  const refreshRuns = useCallback(async () => {
    if (!roomCode) {
      setSavedRuns([]);
      return;
    }
    setSavedRuns(await api.listSchedulingRuns(roomCode));
  }, [roomCode]);

  useEffect(() => {
    setError('');
    refreshRuns().catch((err) => setError(err.message));
  }, [refreshRuns]);

  const latestRuns = Object.fromEntries(
    ['FCFS', 'SJF'].map((name) => [name, savedRuns.find((run) => run.algorithm === name)])
  );

  // Interactive OS Simulator runner for classroom demo
  const runComparisonDemo = async () => {
    if (!roomCode) return;
    setSimulating(true);
    setError('');
    try {
      // Test A & B jobs from Section 6 of PLAN.md
      const testJobs = [
        { id: 'J1', arrival: 0, burst: 5 },
        { id: 'J2', arrival: 1, burst: 3 },
        { id: 'J3', arrival: 2, burst: 8 },
        { id: 'J4', arrival: 3, burst: 6 },
      ];

      await api.simulateScheduler('FCFS', testJobs, roomCode);
      await api.simulateScheduler('SJF', testJobs, roomCode);
      await refreshRuns();
    } catch (err) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="card metrics-table">
      <div className="section-header">
        <h2>6. OS Scheduling Metrics & Comparison</h2>
        <button
          className="btn btn-secondary"
          onClick={runComparisonDemo}
          disabled={simulating || !roomCode}
        >
          {simulating ? 'Running...' : 'Save FCFS vs SJF Comparison'}
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

      {roomCode && (
        <div className="comparison-table-wrapper">
          <h3>Saved Room Comparisons</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Algorithm</th>
                <th>Average Waiting Time</th>
                <th>Average Turnaround Time</th>
                <th>Jobs</th>
                <th>Saved</th>
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
                <td>
                  {latestRuns.FCFS ? new Date(latestRuns.FCFS.createdAt).toLocaleString() : '—'}
                </td>
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
                <td>
                  {latestRuns.SJF ? new Date(latestRuns.SJF.createdAt).toLocaleString() : '—'}
                </td>
              </tr>
            </tbody>
          </table>
          {!latestRuns.FCFS && !latestRuns.SJF && (
            <p className="hint-text">No simulation results saved for this room yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
