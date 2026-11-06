import db from '../db/index.js';

export class SchedulingRunService {
  constructor(knexInstance = db) {
    this.knex = knexInstance;
  }

  async save(roomCode, { algorithm, avgWaiting, avgTurnaround, jobCount }) {
    const room = await this.knex('rooms').where({ code: roomCode }).first();
    if (!room) {
      const error = new Error(`Room ${roomCode} not found`);
      error.statusCode = 404;
      throw error;
    }

    const [id] = await this.knex('scheduling_runs').insert({
      room_id: room.id,
      algorithm,
      avg_waiting: avgWaiting,
      avg_turnaround: avgTurnaround,
      job_count: jobCount,
    });
    return { id, roomId: room.id, algorithm, avgWaiting, avgTurnaround, jobCount };
  }

  async listByRoom(roomCode) {
    const room = await this.knex('rooms').where({ code: roomCode }).first();
    if (!room) {
      const error = new Error(`Room ${roomCode} not found`);
      error.statusCode = 404;
      throw error;
    }

    return this.knex('scheduling_runs')
      .select(
        'id',
        'algorithm',
        'avg_waiting as avgWaiting',
        'avg_turnaround as avgTurnaround',
        'job_count as jobCount',
        'created_at as createdAt'
      )
      .where({ room_id: room.id })
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  }
}

export const schedulingRunService = new SchedulingRunService();
