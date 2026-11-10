import React, { useState } from 'react';
import { api } from '../api.js';
import { JOB_STATUS, JOB_TYPES } from 'shared/constants';

export function JobQueue({ roomCode, queue, selectedFileIds, onJobsCreated }) {
  const [jobType, setJobType] = useState(JOB_TYPES.INDEX);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleCreateJobs = async () => {
    if (!roomCode) {
      setErrorMsg('Create or join a room first.');
      return;
    }
    if (selectedFileIds.length === 0) {
      setErrorMsg('Select at least one file.');
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
    <div className="card job-queue" id="jobs">
      <div className="section-header">
        <div className="section-title">
          <span className="section-kicker">PROCESSING</span>
          <h2>
            Job queue <span className="title-count">{queue.length}</span>
          </h2>
        </div>
        <div className="job-actions">
          <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
            <option value={JOB_TYPES.INDEX}>Build search index</option>
            <option value={JOB_TYPES.PREPROCESS}>Preprocess file</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={handleCreateJobs}
            disabled={creating || selectedFileIds.length === 0}
          >
            {creating
              ? 'Queueing…'
              : `Queue ${selectedFileIds.length || ''} job${selectedFileIds.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

      {queue.length === 0 ? (
        <p className="empty-text">No jobs yet. Select files and queue work to begin.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Status</th>
                <th>Worker</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>{j.name || `File ${j.fileId}`}</strong>
                  </td>
                  <td>{j.type === JOB_TYPES.INDEX ? 'Index' : 'Preprocess'}</td>
                  <td>
                    <span className={`badge ${getStatusBadge(j.status)}`}>
                      {j.status.toUpperCase()}
                    </span>
                  </td>
                  <td>{j.workerName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
