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
    <div className="card room-panel">
      <h2>1. Room & Scheduling Algorithm</h2>

      <div className="room-controls">
        <div className="form-group">
          <label>Algorithm:</label>
          <select
            value={selectedAlgo}
            onChange={(e) => setSelectedAlgo(e.target.value)}
            disabled={loading}
          >
            <option value={ALGORITHMS.FCFS}>FCFS (First-Come, First-Served)</option>
            <option value={ALGORITHMS.SJF}>SJF (Shortest Job First)</option>
          </select>
        </div>

        <button className="btn btn-primary" onClick={handleCreateRoom} disabled={loading}>
          {loading ? 'Creating...' : 'Create New Room'}
        </button>

        {roomCode && (
          <button className="btn btn-secondary" onClick={handleSetAlgorithm} disabled={loading}>
            Apply to Active Room
          </button>
        )}

        <form onSubmit={handleJoinRoom} className="join-room-form">
          <input
            type="text"
            placeholder="Room Code (e.g. ABC123)"
            maxLength={6}
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">
            Join Room
          </button>
        </form>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {roomCode && (
        <div className="room-info">
          <span className="badge badge-success">
            Active Room: <strong>{roomCode}</strong>
          </span>
          <span className="badge badge-info">
            Algorithm: <strong>{algorithm}</strong>
          </span>
          <span className="copy-hint">
            Workers can join using: <code>--room {roomCode}</code>
          </span>
        </div>
      )}
    </div>
  );
}
