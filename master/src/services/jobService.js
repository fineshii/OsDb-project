import db from '../db/index.js';
import { roomManager } from './roomManager.js';
import { JOB_STATUS } from 'shared/constants';

export class JobService {
  constructor(knexInstance = db) {
    this.knex = knexInstance;
  }

  /**
   * Creates queued jobs from file IDs for a given room.
   * @param {string} roomCode
   * @param {object} params
   * @param {Array<number>} params.fileIds
   * @param {string} params.type - 'index' | 'preprocess'
   * @returns {Promise<Array<object>>}
   */
  async createJobs(roomCode, { fileIds, type }) {
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      const err = new Error('fileIds must be a non-empty array of file IDs');
      err.statusCode = 400;
      throw err;
    }

    // Ensure room exists in DB
    let room = await this.knex('rooms').where({ code: roomCode }).first();
    if (!room) {
      // Check in-memory roomManager
      const memRoom = roomManager.getRoom(roomCode);
      if (memRoom) {
        // Sync room to DB if not yet persisted
        const [insertedId] = await this.knex('rooms').insert({
          code: memRoom.code,
          algorithm: memRoom.algorithm,
        });
        room = { id: insertedId, code: memRoom.code, algorithm: memRoom.algorithm };
      } else {
        const err = new Error(`Room ${roomCode} not found`);
        err.statusCode = 404;
        throw err;
      }
    }

    // Fetch target files
    const files = await this.knex('files').whereIn('id', fileIds);
    if (files.length === 0) {
      const err = new Error('None of the specified fileIds were found');
      err.statusCode = 404;
      throw err;
    }

    const createdJobs = [];
    const now = Date.now();

    for (const file of files) {
      // burst_estimate = ceil(size_bytes / 1024), minimum 1
      const burstEstimate = Math.max(1, Math.ceil(file.size_bytes / 1024));

      const [jobId] = await this.knex('jobs').insert({
        room_id: room.id,
        file_id: file.id,
        type,
        status: JOB_STATUS.QUEUED,
        arrival_time: now,
        burst_estimate: burstEstimate,
        attempts: 0,
      });

      createdJobs.push({
        id: jobId,
        roomId: room.id,
        fileId: file.id,
        fileName: file.name,
        type,
        status: JOB_STATUS.QUEUED,
        arrivalTime: now,
        burstEstimate,
        attempts: 0,
      });
    }

    return createdJobs;
  }

  /**
   * Retrieves all jobs in a room with file and worker details.
   * @param {string} roomCode
   * @returns {Promise<Array<object>>}
   */
  async listJobsByRoom(roomCode) {
    const room = await this.knex('rooms').where({ code: roomCode }).first();
    if (!room) {
      return [];
    }

    const rows = await this.knex('jobs')
      .join('files', 'jobs.file_id', 'files.id')
      .leftJoin('workers', 'jobs.worker_id', 'workers.id')
      .select(
        'jobs.id',
        'jobs.type',
        'jobs.status',
        'jobs.burst_estimate as burst',
        'jobs.arrival_time as arrivalTime',
        'jobs.attempts',
        'jobs.started_at as startedAt',
        'jobs.finished_at as finishedAt',
        'files.name as fileName',
        'workers.name as workerName'
      )
      .where('jobs.room_id', room.id)
      .orderBy('jobs.id', 'asc');

    return rows;
  }

  /**
   * Formats queue update for the socket UI.
   * @param {string} roomCode
   * @returns {Promise<Array<object>>}
   */
  async getQueueView(roomCode) {
    const jobs = await this.listJobsByRoom(roomCode);
    return jobs.map((j) => ({
      id: j.id,
      name: j.fileName,
      status: j.status,
      burst: j.burst,
      workerName: j.workerName || null,
      type: j.type,
      attempts: j.attempts,
    }));
  }

  /**
   * Formats Gantt chart timeline view for the room.
   * @param {string} roomCode
   * @returns {Promise<Array<object>>}
   */
  async getGanttView(roomCode) {
    const room = await this.knex('rooms').where({ code: roomCode }).first();
    if (!room) {
      return [];
    }

    const runs = await this.knex('job_runs')
      .join('jobs', 'job_runs.job_id', 'jobs.id')
      .join('workers', 'job_runs.worker_id', 'workers.id')
      .select(
        'job_runs.id',
        'job_runs.job_id as jobId',
        'workers.name as workerName',
        'job_runs.started_at as start',
        'job_runs.ended_at as end',
        'job_runs.outcome'
      )
      .where('jobs.room_id', room.id)
      .orderBy('job_runs.started_at', 'asc');

    return runs;
  }
}

export const jobService = new JobService();
