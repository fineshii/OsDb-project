import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { registerSocketHandlers } from './sockets/handlers.js';
import { roomManager } from './services/roomManager.js';
import filesRoutes from './routes/files.routes.js';
import searchRoutes from './routes/search.routes.js';
import schedulerRoutes from './routes/scheduler.routes.js';
import jobsRoutes from './routes/jobs.routes.js';
import { searchController } from './controllers/searchController.js';
import { EVENTS } from 'shared/events';
import { WORKER_STATUS } from 'shared/constants';

export const app = express();
export const server = http.createServer(app);

// Configure Socket.IO
export const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// REST API routes
app.use('/api/files', filesRoutes);
app.use('/api/search', searchRoutes);
app.get('/api/benchmark/search', searchController.benchmark);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/rooms', jobsRoutes);

// Helper endpoint for Phase 1 verification: dispatch dummy job to an idle worker in a room
app.post('/api/test/dummy-job', (req, res) => {
  const { roomCode, jobId = 'dummy-1', payload = { text: 'Hello Distributed Worker!' } } = req.body;
  const room = roomManager.getRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: `Room ${roomCode} not found` });
  }

  // Find first idle worker
  const idleWorker = Array.from(room.workers.values()).find((w) => w.status === WORKER_STATUS.IDLE);
  if (!idleWorker) {
    return res.status(400).json({ error: 'No idle workers available in room' });
  }

  io.to(idleWorker.socketId).emit(EVENTS.JOB_ASSIGN, {
    jobId,
    type: 'preprocess',
    fileId: 1,
    fileName: 'dummy.txt',
    content: JSON.stringify(payload),
  });

  res.json({
    message: 'Dummy job dispatched',
    jobId,
    workerId: idleWorker.id,
    workerName: idleWorker.name,
  });
});

// Register Socket.IO handlers
registerSocketHandlers(io);

// Start server if run directly
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  server.listen(config.port, () => {
    console.log(`[Master] Server running on http://localhost:${config.port}`);
  });
}
