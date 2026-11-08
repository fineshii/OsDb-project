import React from 'react';

function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function GanttChart({ ganttRuns = [], workers = [] }) {
  const validRuns = ganttRuns
    .map((run) => ({
      ...run,
      startMs: Number(run.start),
      endMs: run.end == null ? Date.now() : Number(run.end),
    }))
    .filter((run) => Number.isFinite(run.startMs) && Number.isFinite(run.endMs));

  if (validRuns.length === 0) {
    return (
      <div className="card gantt-chart">
        <h2>5. Real-Time Execution Gantt Chart</h2>
        <p className="empty-text">
          No job execution history recorded yet. Dispatched jobs will render here.
        </p>
      </div>
    );
  }

  const minTime = Math.min(...validRuns.map((run) => run.startMs));
  const maxTime = Math.max(...validRuns.map((run) => run.endMs));
  const totalDuration = Math.max(1, maxTime - minTime);
  const workerNames = Array.from(
    new Set([...workers.map((worker) => worker.name), ...validRuns.map((run) => run.workerName)])
  ).sort((a, b) => a.localeCompare(b));

  const runsByWorker = Object.fromEntries(
    workerNames.map((name) => [
      name,
      validRuns.filter((run) => run.workerName === name).sort((a, b) => a.startMs - b.startMs),
    ])
  );

  const completedRuns = validRuns.filter((run) => run.outcome === 'done');
  const failedRuns = validRuns.filter((run) => run.outcome === 'failed');
  const requeuedRuns = validRuns.filter((run) => run.outcome === 'requeued');
  const activeRuns = validRuns.filter((run) => !run.outcome);
  const completedDurations = completedRuns.map((run) => Math.max(0, run.endMs - run.startMs));
  const averageDuration = completedDurations.length
    ? completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length
    : null;
  const formatElapsed = (milliseconds) =>
    totalDuration < 1000
      ? `${milliseconds.toFixed(1)} ms`
      : `${(milliseconds / 1000).toFixed(1)} s`;
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const elapsed = (totalDuration * index) / 4;
    return formatElapsed(elapsed);
  });

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
      <div className="section-header gantt-heading">
        <div>
          <h2>5. Real-Time Execution Gantt Chart</h2>
          <p className="gantt-caption">
            Each bar is one actual worker run. The time axis starts at the first run; very short
            runs use a minimum marker width, while tooltips show measured durations.
          </p>
        </div>
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

      <div className="gantt-insights">
        <div className="gantt-insight">
          <span>Total runs</span>
          <strong>{validRuns.length}</strong>
        </div>
        <div className="gantt-insight">
          <span>Completed</span>
          <strong>{completedRuns.length}</strong>
        </div>
        <div className="gantt-insight">
          <span>Failed</span>
          <strong>{failedRuns.length}</strong>
        </div>
        <div className="gantt-insight">
          <span>Requeued</span>
          <strong>{requeuedRuns.length}</strong>
        </div>
        <div className="gantt-insight">
          <span>Avg. run time</span>
          <strong>{averageDuration == null ? '—' : formatDuration(averageDuration)}</strong>
        </div>
        <div className="gantt-insight">
          <span>Observed span</span>
          <strong>{formatDuration(totalDuration)}</strong>
        </div>
        <div className="gantt-insight">
          <span>In progress</span>
          <strong>{activeRuns.length}</strong>
        </div>
      </div>

      <div className="gantt-container">
        {workerNames.map((name) => {
          const runs = runsByWorker[name] || [];
          const workerWorkMs = runs.reduce(
            (total, run) => total + Math.max(0, run.endMs - run.startMs),
            0
          );

          return (
            <div key={name} className="gantt-row">
              <div className="gantt-worker-label" title={name}>
                <strong>{name}</strong>
                <small>
                  {runs.length} {runs.length === 1 ? 'run' : 'runs'} ·{' '}
                  {formatDuration(workerWorkMs)} work
                </small>
              </div>
              <div className="gantt-track">
                {runs.map((run) => {
                  const durationMs = Math.max(0, run.endMs - run.startMs);
                  const leftPercent = Math.max(
                    0,
                    Math.min(99.55, ((run.startMs - minTime) / totalDuration) * 100)
                  );
                  const exactWidth = (durationMs / totalDuration) * 100;
                  const widthPercent = Math.max(0.45, Math.min(100 - leftPercent, exactWidth));
                  const fileLabel = run.fileName || `Job #${run.jobId}`;
                  const outcome = run.outcome || 'running';
                  const startOffset = formatDuration(run.startMs - minTime);
                  const runType = run.jobType ? ` · ${run.jobType}` : '';

                  return (
                    <div
                      key={run.id || `${run.jobId}-${run.startMs}`}
                      className={`gantt-block ${getOutcomeClass(run.outcome)}`}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                      }}
                      title={`${fileLabel}${runType} · ${name}\nStarted +${startOffset}\nRun time: ${formatDuration(durationMs)}\nStatus: ${outcome}`}
                      aria-label={`${fileLabel}, worker ${name}, ${formatDuration(durationMs)}, ${outcome}`}
                    >
                      #{run.jobId}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="gantt-time-axis">
          <span className="gantt-axis-spacer">Elapsed time</span>
          <div className="gantt-axis-labels">
            {ticks.map((tick, index) => (
              <span key={`${tick}-${index}`}>{tick}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
