import React, { useState } from 'react';
import { api } from '../api.js';
import { JOB_STATUS, JOB_TYPES } from 'shared/constants';

export function JobQueue({ roomCode, queue, selectedFileIds, onJobsCreated }) {
  const [jobType, setJobType] = useState(JOB_TYPES.INDEX);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleCreateJobs = async () => {
    if (!roomCode) {
      setErrorMsg('Please select or create an active room first.');
      return;
    }
    if (selectedFileIds.length === 0) {
      setErrorMsg('Please select at least one file to convert into a job.');
      return;
    }

    setCreating(true);
    setErrorMsg('');

    try {
      await api.createJobs(roomCode, {
        fileIds: selectedFileIds,
        type: jobType,
      });
      onJobsCreated();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setCreating(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case JOB_STATUS.QUEUED:
        return 'badge-primary';
      case JOB_STATUS.RUNNING:
        return 'badge-warning';
      case JOB_STATUS.DONE:
        return 'badge-success';
      case JOB_STATUS.FAILED:
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <div className="card job-queue">
      <div className="section-header">
        <h2>4. OS Job Queue ({queue.length})</h2>
        <div className="job-actions">
          <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
            <option value={JOB_TYPES.INDEX}>Job Type: Inverted Index</option>
            <option value={JOB_TYPES.PREPROCESS}>Job Type: Preprocess</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={handleCreateJobs}
            disabled={creating || selectedFileIds.length === 0}
          >
            {creating ? 'Dispatching...' : `Queue ${selectedFileIds.length} Job(s)`}
          </button>
        </div>
      </div>

      {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

      {queue.length === 0 ? (
        <p className="empty-text">
          No jobs in queue. Select uploaded files above and click "Queue Jobs" to trigger
          scheduling.
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>File Name</th>
                <th>Type</th>
                <th>Burst Estimate (KB)</th>
                <th>Status</th>
                <th>Worker</th>
                <th>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>#{j.id}</strong>
                  </td>
                  <td>{j.name || `File ${j.fileId}`}</td>
                  <td>
                    <code>{j.type}</code>
                  </td>
                  <td>{j.burst} unit(s)</td>
                  <td>
                    <span className={`badge ${getStatusBadge(j.status)}`}>
                      {j.status.toUpperCase()}
                    </span>
                  </td>
                  <td>{j.workerName || '—'}</td>
                  <td>{j.attempts || 0} / 3</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
