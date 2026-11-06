import { describe, it, expect, beforeEach } from '@jest/globals';
import { RoomManager } from '../src/services/roomManager.js';
import { ALGORITHMS, WORKER_STATUS } from 'shared/constants';

describe('RoomManager Service', () => {
  let roomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  it('creates a room with a 6-character uppercase code and chosen algorithm', () => {
    const room = roomManager.createRoom(ALGORITHMS.SJF);
    expect(room.code).toBeDefined();
    expect(room.code).toHaveLength(6);
    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.algorithm).toBe(ALGORITHMS.SJF);

    const fetched = roomManager.getRoom(room.code);
    expect(fetched).not.toBeNull();
    expect(fetched.code).toBe(room.code);
  });

  it('defaults algorithm to FCFS if none or invalid specified', () => {
    const room = roomManager.createRoom('INVALID');
    expect(room.algorithm).toBe(ALGORITHMS.FCFS);
  });

  it('restores a persisted room with initialized worker state', () => {
    const room = roomManager.restoreRoom('SAVED1', ALGORITHMS.SJF);
    expect(room.code).toBe('SAVED1');
    expect(room.algorithm).toBe(ALGORITHMS.SJF);
    expect(room.workers).toBeInstanceOf(Map);
    expect(roomManager.getRoom('SAVED1')).toBe(room);
  });

  it('changes the algorithm for an existing room and rejects unknown rooms or algorithms', () => {
    const room = roomManager.createRoom(ALGORITHMS.FCFS);

    expect(roomManager.setAlgorithm(room.code, ALGORITHMS.SJF).algorithm).toBe(ALGORITHMS.SJF);
    expect(roomManager.getRoom(room.code).algorithm).toBe(ALGORITHMS.SJF);
    expect(roomManager.setAlgorithm(room.code, 'RR')).toBeNull();
    expect(roomManager.setAlgorithm('MISSING', ALGORITHMS.FCFS)).toBeNull();
  });

  it('adds a worker to an existing room and assigns a unique workerId', () => {
    const room = roomManager.createRoom();
    const joined = roomManager.addWorker(room.code, 'Worker-1', 'socket-123');

    expect(joined).not.toBeNull();
    expect(joined.workerId).toBe(1);
    expect(joined.name).toBe('Worker-1');
    expect(joined.roomCode).toBe(room.code);

    const workers = roomManager.getWorkerList(room.code);
    expect(workers).toHaveLength(1);
    expect(workers[0]).toEqual({
      id: 1,
      name: 'Worker-1',
      status: WORKER_STATUS.IDLE,
    });
  });

  it('handles worker reconnection by reusing existing workerId and updating socketId', () => {
    const room = roomManager.createRoom();
    const w1 = roomManager.addWorker(room.code, 'Worker-1', 'socket-first');
    expect(w1.workerId).toBe(1);

    // Simulate disconnect
    roomManager.handleDisconnect('socket-first');
    expect(roomManager.getWorkerList(room.code)[0].status).toBe(WORKER_STATUS.OFFLINE);

    // Reconnect with new socket ID
    const w1Reconnected = roomManager.addWorker(room.code, 'Worker-1', 'socket-second');
    expect(w1Reconnected.workerId).toBe(1);

    const workers = roomManager.getWorkerList(room.code);
    expect(workers).toHaveLength(1);
    expect(workers[0].status).toBe(WORKER_STATUS.IDLE);
  });

  it('updates worker status correctly', () => {
    const room = roomManager.createRoom();
    const joined = roomManager.addWorker(room.code, 'Worker-1', 'socket-1');

    roomManager.updateWorkerStatus(joined.workerId, room.code, WORKER_STATUS.BUSY);
    expect(roomManager.getWorkerList(room.code)[0].status).toBe(WORKER_STATUS.BUSY);

    roomManager.updateWorkerStatus(joined.workerId, room.code, WORKER_STATUS.IDLE);
    expect(roomManager.getWorkerList(room.code)[0].status).toBe(WORKER_STATUS.IDLE);
  });

  it('returns null when adding a worker to a non-existent room', () => {
    const result = roomManager.addWorker('NONEXIST', 'Worker-1', 'socket-1');
    expect(result).toBeNull();
  });
});
