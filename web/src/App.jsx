import React, { useState, useEffect, useCallback } from 'react';
import { getSocket, EVENTS } from './socket.js';
import { api } from './api.js';

import { RoomPanel } from './components/RoomPanel.jsx';
import { WorkerList } from './components/WorkerList.jsx';
import { FileUpload } from './components/FileUpload.jsx';
import { JobQueue } from './components/JobQueue.jsx';
import { GanttChart } from './components/GanttChart.jsx';
import { MetricsTable } from './components/MetricsTable.jsx';
import { SearchBox } from './components/SearchBox.jsx';

export default function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [algorithm, setAlgorithm] = useState('FCFS');

  // Real-time states
  const [workers, setWorkers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [ganttRuns, setGanttRuns] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [globalError, setGlobalError] = useState('');

  // Refresh files stored in DB
  const refreshFiles = useCallback(async () => {
    try {
      const data = await api.listFiles();
      setFiles(data);
    } catch {
      // ignore
    }
  }, []);

  // Refresh jobs in room
  const refreshJobs = useCallback(async () => {
    if (!roomCode) return;
    try {
      const data = await api.listJobs(roomCode);
      setQueue(data);
    } catch {
      // ignore
    }
  }, [roomCode]);

  // Initialize socket on mount
  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    s.on('connect', () => {
      setConnected(true);
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    s.on(EVENTS.WORKER_LIST, (list) => {
      setWorkers(list || []);
    });

    s.on(EVENTS.QUEUE_UPDATE, (queueData) => {
      setQueue(queueData || []);
    });

    s.on(EVENTS.GANTT_UPDATE, (runs) => {
      setGanttRuns(runs || []);
    });

    s.on(EVENTS.ERROR_MESSAGE, ({ message }) => {
      setGlobalError(message);
      setTimeout(() => setGlobalError(''), 5000);
    });

    refreshFiles();

    return () => {
      s.off(EVENTS.WORKER_LIST);
      s.off(EVENTS.QUEUE_UPDATE);
      s.off(EVENTS.GANTT_UPDATE);
      s.off(EVENTS.ERROR_MESSAGE);
    };
  }, [refreshFiles]);

  const handleRoomChange = (newCode, newAlgo) => {
    const normalizedCode = newCode.toUpperCase();
    setRoomCode(normalizedCode);
    if (newAlgo) setAlgorithm(newAlgo);
    setWorkers([]);
    setQueue([]);
    setGanttRuns([]);
    refreshFiles();
    socket?.emit(EVENTS.ROOM_SUBSCRIBE, { roomCode: normalizedCode });
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <h1>Distributed Cloud Resource Simulator</h1>
          <p className="subtitle">
            Node.js 20 monorepo combining Distributed Preprocessing with OS Job Scheduling & MySQL
            Indexing
          </p>
        </div>
        <div className="header-right">
          <span className={`status-pill ${connected ? 'status-online' : 'status-offline'}`}>
            Master: {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      {globalError && <div className="alert alert-danger global-alert">{globalError}</div>}

      <main className="dashboard-grid">
        <div className="dashboard-col left-col">
          <RoomPanel
            roomCode={roomCode}
            algorithm={algorithm}
            socket={socket}
            onRoomChange={handleRoomChange}
          />
          <WorkerList workers={workers} />
          <FileUpload
            files={files}
            onFilesUploaded={refreshFiles}
            selectedFileIds={selectedFileIds}
            onSelectionChange={setSelectedFileIds}
          />
        </div>

        <div className="dashboard-col right-col">
          <JobQueue
            roomCode={roomCode}
            queue={queue}
            selectedFileIds={selectedFileIds}
            onJobsCreated={refreshJobs}
          />
          <GanttChart ganttRuns={ganttRuns} workers={workers} />
          <MetricsTable
            algorithm={algorithm}
            roomCode={roomCode}
            queue={queue}
            ganttRuns={ganttRuns}
          />
          <SearchBox />
        </div>
      </main>

      <footer className="app-footer">
        Distributed Cloud Resource Simulator &bull; OS &amp; DBMS Project &bull; Socket.IO 4 + Knex
        + React
      </footer>
    </div>
  );
}
