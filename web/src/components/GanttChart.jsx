import React, { useState } from 'react';

function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function GanttChart({ ganttRuns = [], workers = [] }) {
  const [selectedBatch, setSelectedBatch] = useState('latest');
  const validRuns = ganttRuns
    .map((run) => ({
      ...run,
      startMs: Number(run.start),
      endMs: run.end == null ? Date.now() : Number(run.end),
    }))
    .filter((run) => Number.isFinite(run.startMs) && Number.isFinite(run.endMs));

  const batches = (() => {
    const grouped = new Map();
    for (const run of validRuns) {
      const key = String(run.batchTime ?? 'unknown');
      if (!grouped.has(key)) grouped.set(key, { key, time: Number(run.batchTime), runs: 0 });
      grouped.get(key).runs += 1;
    }
    return [...grouped.values()].sort((a, b) => b.time - a.time);
  })();
  const activeBatchKey = selectedBatch === 'latest' ? batches[0]?.key : selectedBatch;
  const visibleRuns = activeBatchKey
    && activeBatchKey !== 'all'
    ? validRuns.filter((run) => String(run.batchTime ?? 'unknown') === activeBatchKey)
    : validRuns;

  if (visibleRuns.length === 0) {
    return (
      <div className="card gantt-chart" id="gantt">
        <h2>Execution timeline</h2>
        <p className="empty-text">Worker activity will appear here.</p>
      </div>
    );
  }

  const minTime = Math.min(...visibleRuns.map((run) => run.startMs));
  const maxTime = Math.max(...visibleRuns.map((run) => run.endMs));
  const totalDuration = Math.max(1, maxTime - minTime);
  // Keep long runs readable: 3 px per second with a useful minimum, scrolled horizontally.
  const timelineWidth = Math.max(640, Math.min(12000, (totalDuration / 1000) * 3));
  const workerNames = Array.from(
    new Set([...workers.map((worker) => worker.name), ...visibleRuns.map((run) => run.workerName)])
  ).sort((a, b) => a.localeCompare(b));

  const runsByWorker = Object.fromEntries(
    workerNames.map((name) => [
      name,
      visibleRuns.filter((run) => run.workerName === name).sort((a, b) => a.startMs - b.startMs),
    ])
  );

  const completedRuns = visibleRuns.filter((run) => run.outcome === 'done');
  const failedRuns = visibleRuns.filter((run) => run.outcome === 'failed');
  const requeuedRuns = visibleRuns.filter((run) => run.outcome === 'requeued');
  const activeRuns = visibleRuns.filter((run) => !run.outcome);
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
    <div className="card gantt-chart" id="gantt">
      <div className="section-header gantt-heading">
        <div>
          <div className="section-title">
            <span className="section-kicker">ACTIVITY</span>
            <h2>Execution timeline</h2>
          </div>
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

      <label className="gantt-batch-filter">Batch
        <select value={selectedBatch === 'latest' ? (batches[0]?.key || 'all') : selectedBatch} onChange={(event) => setSelectedBatch(event.target.value)}>
          <option value="all">All batches ({validRuns.length} runs)</option>
          {batches.map((batch) => <option key={batch.key} value={batch.key}>
            {Number.isFinite(batch.time) ? new Date(batch.time).toLocaleString() : 'Unknown batch'} · {batch.runs} runs
          </option>)}
        </select>
      </label>

      <div className="gantt-insights">
        <div className="gantt-insight">
          <span>Total runs</span>
          <strong>{visibleRuns.length}</strong>
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
        <div className="gantt-label-column" aria-hidden="true" />
        <div className="gantt-scroll-hint">Scroll horizontally to explore the timeline →</div>
        <div className="gantt-timeline-scroll">
          <div className="gantt-timeline-content" style={{ width: `${timelineWidth}px` }}>
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
              <div className="gantt-track" style={{ width: `${timelineWidth}px` }}>
                {runs.map((run) => {
                  const durationMs = Math.max(0, run.endMs - run.startMs);
                  const leftPx = ((run.startMs - minTime) / totalDuration) * timelineWidth;
                  const exactWidth = (durationMs / totalDuration) * timelineWidth;
                  const widthPx = Math.max(14, Math.min(timelineWidth - leftPx, exactWidth));
                  const fileLabel = run.fileName || `Job #${run.jobId}`;
                  const outcome = run.outcome || 'running';
                  const startOffset = formatDuration(run.startMs - minTime);
                  const runType = run.jobType ? ` · ${run.jobType}` : '';

                  return (
                    <div
                      key={run.id || `${run.jobId}-${run.startMs}`}
                      className={`gantt-block ${getOutcomeClass(run.outcome)}`}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                      }}
                      title={`${fileLabel}${runType} · ${name}\nStarted +${startOffset}\nRun time: ${formatDuration(durationMs)}\nStatus: ${outcome}`}
                      aria-label={`${fileLabel}, worker ${name}, ${formatDuration(durationMs)}, ${outcome}`}
                    >
                      {widthPx >= 88 ? fileLabel : `#${run.jobId}`}
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
        <details className="gantt-run-details">
            <summary>View all {visibleRuns.length} runs</summary>
          <div className="gantt-run-list">
            {visibleRuns
              .slice()
              .sort((a, b) => a.startMs - b.startMs)
              .map((run) => (
                <div className="gantt-run-item" key={run.id || `${run.jobId}-${run.startMs}`}>
                  <strong>{run.fileName || `Job #${run.jobId}`}</strong>
                  <span>Job #{run.jobId} · {run.workerName}</span>
                  <span>{formatDuration(run.endMs - run.startMs)} · {run.outcome || 'running'}</span>
                </div>
              ))}
          </div>
        </details>
      </div>
    </div>
  );
}
