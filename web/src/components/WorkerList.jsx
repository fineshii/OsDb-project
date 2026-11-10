import React from 'react';
import { WORKER_STATUS } from 'shared/constants';

export function WorkerList({ workers }) {
  const getBadgeClass = (status) => {
    switch (status) {
      case WORKER_STATUS.IDLE:
        return 'badge-success';
      case WORKER_STATUS.BUSY:
        return 'badge-warning';
      case WORKER_STATUS.OFFLINE:
        return 'badge-secondary';
      default:
        return 'badge-light';
    }
  };

  return (
    <div className="card worker-list" id="workers">
      <div className="section-title">
        <span className="section-kicker">COMPUTE</span>
        <h2>
          Workers <span className="title-count">{workers.length}</span>
        </h2>
      </div>

      {workers.length === 0 ? (
        <p className="empty-text">No workers connected yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Worker Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td>{w.id}</td>
                <td>
                  <strong>{w.name}</strong>
                </td>
                <td>
                  <span className={`badge ${getBadgeClass(w.status)}`}>
                    {w.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
