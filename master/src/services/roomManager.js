import { ALGORITHMS, WORKER_STATUS } from 'shared/constants';

/**
 * Generates a random 6-character uppercase alphanumeric room code.
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class RoomManager {
  constructor() {
    // Map of roomCode -> roomObject
    this.rooms = new Map();
    // Map of socketId -> { roomCode, workerId }
    this.socketToWorker = new Map();
    // Auto-increment worker ID counter for in-memory tracking
    this.nextWorkerId = 1;
  }

  /**
   * Create a new room with a unique 6-character code.
   * @param {string} [algorithm=ALGORITHMS.FCFS]
   * @returns {{ code: string, algorithm: string, createdAt: number }}
   */
  createRoom(algorithm = ALGORITHMS.FCFS) {
    const validAlgorithm = algorithm === ALGORITHMS.SJF ? ALGORITHMS.SJF : ALGORITHMS.FCFS;
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const room = {
      code,
      algorithm: validAlgorithm,
      createdAt: Date.now(),
      workers: new Map(), // workerId -> worker
    };

    this.rooms.set(code, room);
    return {
      code: room.code,
      algorithm: room.algorithm,
      createdAt: room.createdAt,
    };
  }

  /** Restore a persisted room after a master restart. */
  restoreRoom(roomCode, algorithm = ALGORITHMS.FCFS) {
    const existing = this.rooms.get(roomCode);
    if (existing) return existing;

    const room = {
      code: roomCode,
      algorithm: algorithm === ALGORITHMS.SJF ? ALGORITHMS.SJF : ALGORITHMS.FCFS,
      createdAt: Date.now(),
      workers: new Map(),
    };
    this.rooms.set(roomCode, room);
    return room;
  }

  /**
   * Get room by code.
   * @param {string} roomCode
   */
  getRoom(roomCode) {
    return this.rooms.get(roomCode) || null;
  }

  /** Update the scheduling algorithm held in the in-memory room state. */
  setAlgorithm(roomCode, algorithm) {
    if (![ALGORITHMS.FCFS, ALGORITHMS.SJF].includes(algorithm)) return null;
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    room.algorithm = algorithm;
    return room;
  }

  /**
   * Register or reconnect a worker in a room.
   * @param {string} roomCode
   * @param {string} workerName
   * @param {string} socketId
   * @returns {{ workerId: number, roomCode: string, name: string } | null}
   */
  addWorker(roomCode, workerName, socketId) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return null;
    }

    // Check if worker with the same name already exists in the room (reconnection)
    let existingWorker = null;
    for (const worker of room.workers.values()) {
      if (worker.name === workerName) {
        existingWorker = worker;
        break;
      }
    }

    let workerId;
    if (existingWorker) {
      // Reconnection: update socket ID and mark as idle
      workerId = existingWorker.id;
      existingWorker.socketId = socketId;
      existingWorker.status = WORKER_STATUS.IDLE;
      existingWorker.lastSeen = Date.now();
    } else {
      // New worker registration
      workerId = this.nextWorkerId++;
      const newWorker = {
        id: workerId,
        name: workerName,
        socketId,
        status: WORKER_STATUS.IDLE,
        lastSeen: Date.now(),
      };
      room.workers.set(workerId, newWorker);
    }

    this.socketToWorker.set(socketId, { roomCode, workerId });

    return {
      workerId,
      roomCode,
      name: workerName,
    };
  }

  /**
   * Find worker by socket ID.
   * @param {string} socketId
   */
  getWorkerBySocketId(socketId) {
    const mapping = this.socketToWorker.get(socketId);
    if (!mapping) return null;

    const room = this.rooms.get(mapping.roomCode);
    if (!room) return null;

    return room.workers.get(mapping.workerId) || null;
  }

  /**
   * Update the status of a worker.
   * @param {number} workerId
   * @param {string} roomCode
   * @param {string} status
   */
  updateWorkerStatus(workerId, roomCode, status) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const worker = room.workers.get(workerId);
    if (!worker) return null;

    worker.status = status;
    worker.lastSeen = Date.now();
    return worker;
  }

  /**
   * Mark worker as offline when socket disconnects.
   * @param {string} socketId
   * @returns {{ roomCode: string, worker: object } | null}
   */
  handleDisconnect(socketId) {
    const mapping = this.socketToWorker.get(socketId);
    if (!mapping) return null;

    const room = this.rooms.get(mapping.roomCode);
    this.socketToWorker.delete(socketId);

    if (!room) return null;

    const worker = room.workers.get(mapping.workerId);
    if (!worker) return null;

    worker.status = WORKER_STATUS.OFFLINE;
    worker.lastSeen = Date.now();

    return {
      roomCode: mapping.roomCode,
      worker,
    };
  }

  /**
   * Get all workers in a room formatted for UI/events.
   * @param {string} roomCode
   * @returns {Array<{ id: number, name: string, status: string }>}
   */
  getWorkerList(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return [];

    return Array.from(room.workers.values()).map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
    }));
  }
}

// Export singleton instance for the master server
export const roomManager = new RoomManager();
