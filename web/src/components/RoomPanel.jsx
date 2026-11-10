import React, { useEffect, useState } from 'react';
import { EVENTS } from '../socket.js';
import { ALGORITHMS } from 'shared/constants';
import { api } from '../api.js';

export function RoomPanel({ roomCode, algorithm, socket, onRoomChange }) {
  const [selectedAlgo, setSelectedAlgo] = useState(algorithm || ALGORITHMS.FCFS);
  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedAlgo(algorithm || ALGORITHMS.FCFS);
  }, [algorithm, roomCode]);

  const handleCreateRoom = () => {
    if (!socket) return;
    setLoading(true);

    socket.emit(EVENTS.ROOM_CREATE, { algorithm: selectedAlgo });

    socket.once(EVENTS.ROOM_CREATED, ({ roomCode: newCode }) => {
      setLoading(false);
      onRoomChange(newCode, selectedAlgo);
    });
  };

  const handleSetAlgorithm = async () => {
    if (!roomCode) return;
    setLoading(true);
    setError('');
    try {
      const updated = await api.setRoomAlgorithm(roomCode, selectedAlgo);
      onRoomChange(roomCode, updated.algorithm);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    onRoomChange(inputCode.trim().toUpperCase(), selectedAlgo);
  };

  return (
    <div className="card room-panel" id="room-panel">
      <div className="section-title">
        <span className="section-kicker">SETUP</span>
        <h2>Processing room</h2>
      </div>

      <div className="room-controls">
        <div className="form-group">
          <label>Scheduling algorithm</label>
          <select
            value={selectedAlgo}
            onChange={(e) => setSelectedAlgo(e.target.value)}
            disabled={loading}
          >
            <option value={ALGORITHMS.FCFS}>FCFS</option>
            <option value={ALGORITHMS.SJF}>SJF</option>
          </select>
        </div>

        <button className="btn btn-primary" onClick={handleCreateRoom} disabled={loading}>
          {loading ? 'Creating...' : 'Create room'}
        </button>

        {roomCode && (
          <button className="btn btn-secondary" onClick={handleSetAlgorithm} disabled={loading}>
            Apply algorithm
          </button>
        )}

        <form onSubmit={handleJoinRoom} className="join-room-form">
          <input
            type="text"
            placeholder="Enter room code"
            maxLength={6}
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">
            Join room
          </button>
        </form>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {roomCode && (
        <div className="room-info">
          <span className="badge badge-success">
            Room <strong>{roomCode}</strong>
          </span>
          <span className="badge badge-info">{algorithm}</span>
        </div>
      )}
    </div>
  );
}
