import React from 'react';

export function GanttChart({ ganttRuns, workers }) {
  if (!ganttRuns || ganttRuns.length === 0) {
    return (
      <div className="card gantt-chart">
        <h2>5. Real-Time Execution Gantt Chart</h2>
        <p className="empty-text">
          No job execution history recorded yet. Dispatched jobs will render here.
        </p>
      </div>
    );
  }

  // Calculate timeline bounds
  const validStarts = ganttRuns.map((r) => r.start).filter(Boolean);
  const validEnds = ganttRuns.map((r) => r.end || r.start + 1000).filter(Boolean);

  const minTime = Math.min(...validStarts);
  const maxTime = Math.max(...validEnds);
  const totalDuration = Math.max(1000, maxTime - minTime);

  // Group runs by worker name
  const workerNames = Array.from(
    new Set([...workers.map((w) => w.name), ...ganttRuns.map((r) => r.workerName)])
  );

  const runsByWorker = {};
  for (const name of workerNames) {
    runsByWorker[name] = ganttRuns.filter((r) => r.workerName === name);
  }

  const getOutcomeClass = (outcome) => {
    switch (outcome) {
      case 'done':
        return 'block-done';
      case 'failed':
        return 'block-failed';
      case 'requeued':
        return 'block-requeued';
      default:
        return 'block-running';
    }
  };

  return (
    <div className="card gantt-chart">
      <div className="section-header">
        <h2>5. Real-Time Execution Gantt Chart</h2>
        <div className="gantt-legend">
          <span className="legend-item">
            <span className="legend-box block-done"></span> Done
          </span>
          <span className="legend-item">
            <span className="legend-box block-running"></span> Running
          </span>
          <span className="legend-item">
            <span className="legend-box block-requeued"></span> Requeued
          </span>
          <span className="legend-item">
            <span className="legend-box block-failed"></span> Failed
          </span>
        </div>
      </div>

      <div className="gantt-container">
        {workerNames.map((name) => {
          const runs = runsByWorker[name] || [];
          return (
            <div key={name} className="gantt-row">
              <div className="gantt-worker-label">{name}</div>
              <div className="gantt-track">
                {runs.map((run) => {
                  const startMs = run.start;
                  const endMs = run.end || startMs + 1000;
                  const durationMs = Math.max(200, endMs - startMs);

                  const leftPercent = Math.max(
                    0,
                    Math.min(100, ((startMs - minTime) / totalDuration) * 100)
                  );
                  const widthPercent = Math.max(
                    3,
                    Math.min(100 - leftPercent, (durationMs / totalDuration) * 100)
                  );

                  return (
                    <div
                      key={run.id || `${run.jobId}-${startMs}`}
                      className={`gantt-block ${getOutcomeClass(run.outcome)}`}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                      }}
                      title={`Job #${run.jobId} (${durationMs}ms) - Outcome: ${run.outcome || 'running'}`}
                    >
                      J#{run.jobId}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="gantt-time-axis">
        <span>0 ms (T-start)</span>
        <span>+{(totalDuration / 2 / 1000).toFixed(1)}s</span>
        <span>+{(totalDuration / 1000).toFixed(1)}s (T-end)</span>
      </div>
    </div>
  );
}
