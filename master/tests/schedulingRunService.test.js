import { describe, it, expect, jest } from '@jest/globals';
import { SchedulingRunService } from '../src/services/schedulingRunService.js';

describe('SchedulingRunService', () => {
  it('saves metrics against the matching room id', async () => {
    const roomQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 7, code: 'ROOM01' }),
    };
    const runQuery = { insert: jest.fn().mockResolvedValue([42]) };
    const knex = jest.fn((table) => (table === 'rooms' ? roomQuery : runQuery));
    const service = new SchedulingRunService(knex);

    const run = await service.save('ROOM01', {
      algorithm: 'SJF',
      avgWaiting: 5.25,
      avgTurnaround: 10.75,
      jobCount: 4,
    });

    expect(run).toEqual({
      id: 42,
      roomId: 7,
      algorithm: 'SJF',
      avgWaiting: 5.25,
      avgTurnaround: 10.75,
      jobCount: 4,
    });
    expect(runQuery.insert).toHaveBeenCalledWith({
      room_id: 7,
      algorithm: 'SJF',
      avg_waiting: 5.25,
      avg_turnaround: 10.75,
      job_count: 4,
    });
  });

  it('returns a not found error when saving for an unknown room', async () => {
    const knex = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
    }));
    const service = new SchedulingRunService(knex);

    await expect(
      service.save('MISSING', {
        algorithm: 'FCFS',
        avgWaiting: 0,
        avgTurnaround: 0,
        jobCount: 0,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lists a room’s saved results in most-recent-first order', async () => {
    const runs = [{ id: 9, algorithm: 'FCFS', avgWaiting: 2, avgTurnaround: 4, jobCount: 2 }];
    const roomQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 7, code: 'ROOM01' }),
    };
    const listQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      then: (resolve, reject) => Promise.resolve(runs).then(resolve, reject),
    };
    const knex = jest.fn((table) => (table === 'rooms' ? roomQuery : listQuery));
    const service = new SchedulingRunService(knex);

    await expect(service.listByRoom('ROOM01')).resolves.toEqual(runs);
    expect(listQuery.orderBy).toHaveBeenNthCalledWith(1, 'created_at', 'desc');
    expect(listQuery.orderBy).toHaveBeenNthCalledWith(2, 'id', 'desc');
  });
});
