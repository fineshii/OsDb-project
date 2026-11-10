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

const navigation = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'room-panel', label: 'Room', icon: 'room' },
  { id: 'workers', label: 'Workers', icon: 'workers' },
  { id: 'files', label: 'Files', icon: 'files' },
  { id: 'jobs', label: 'Processing', icon: 'processing' },
  { id: 'gantt', label: 'Activity', icon: 'activity' },
  { id: 'search', label: 'Search', icon: 'search' },
];

function Icon({ name }) {
  const paths = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    room: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5v10h13v-10M9 19.5v-6h6v6" />
      </>
    ),
    workers: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 6.8M18 14a6 6 0 0 1 3.5 5.5" />
      </>
    ),
    files: (
      <>
        <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z" />
        <path d="M13 3v7h7M8 14h8M8 17h6" />
      </>
    ),
    processing: (
      <>
        <path d="M4 7h12M4 12h16M4 17h9" />
        <circle cx="19" cy="7" r="2" />
        <circle cx="16" cy="17" r="2" />
      </>
    ),
    activity: (
      <>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 5 5" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-icon">
      {paths[name]}
    </svg>
  );
}

function StatIcon({ name }) {
  return (
    <span className={`stat-icon stat-icon-${name}`}>
      <Icon name={name} />
    </span>
  );
}

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
  const [activeNav, setActiveNav] = useState('overview');

  const queuedJobs = queue.filter((job) => job.status === 'queued').length;
  const runningJobs = queue.filter((job) => job.status === 'running').length;
  const completedJobs = queue.filter((job) => job.status === 'done').length;
  const activeWorkers = workers.filter((worker) => worker.status !== 'offline').length;
  const summaryStats = [
    { label: 'Files uploaded', value: files.length, icon: 'files' },
    { label: 'Workers online', value: activeWorkers, icon: 'workers' },
    { label: 'Active jobs', value: queuedJobs + runningJobs, icon: 'processing' },
    { label: 'Jobs completed', value: completedJobs, icon: 'activity' },
  ];

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
    <div className="app-container workspace-layout">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => setActiveNav('overview')}>
          <span className="brand-mark">
            <i></i>
            <i></i>
            <i></i>
          </span>
          <span className="brand-copy">
            <strong>CloudSim</strong>
            <small>OS + DBMS project</small>
          </span>
        </a>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <span className="nav-label">WORKSPACE</span>
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`nav-link ${activeNav === item.id ? 'active' : ''}`}
              onClick={() => setActiveNav(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <main className="main-content" id="overview">
        <header className="app-header">
          <div className="header-left">
            <p className="eyebrow">PROJECT OVERVIEW</p>
            <h1>Your workspace</h1>
            <p className="subtitle">Manage files, workers, and processing in one place.</p>
          </div>
          <div className="header-right">
            {roomCode && (
              <span className="room-chip">
                Room <strong>{roomCode}</strong>
              </span>
            )}
            <span className={`status-pill ${connected ? 'status-online' : 'status-offline'}`}>
              <span className={`connection-dot ${connected ? 'online' : ''}`}></span>
              {connected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </header>

        {globalError && <div className="alert alert-danger global-alert">{globalError}</div>}

        <section className="summary-grid" aria-label="Workspace summary">
          {summaryStats.map((stat) => (
            <div className="summary-card" key={stat.label}>
              <StatIcon name={stat.icon} />
              <div>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            </div>
          ))}
        </section>

        <div className="dashboard-grid">
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
        </div>
      </main>
    </div>
  );
}
