import { describe, it, expect, jest } from '@jest/globals';
import { JobService } from '../src/services/jobService.js';
import { JOB_STATUS } from 'shared/constants';

describe('JobService', () => {
  it('calculates burst_estimate = ceil(size_bytes / 1024) (min 1) and creates queued jobs', async () => {
    const mockFiles = [
      { id: 1, name: 'tiny.txt', size_bytes: 500 }, // < 1024 -> burst 1
      { id: 2, name: 'large.txt', size_bytes: 4500 }, // 4500 / 1024 = 4.39 -> burst 5
    ];

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 10, code: 'ROOM01', algorithm: 'FCFS' }),
      whereIn: jest.fn().mockResolvedValue(mockFiles),
      insert: jest.fn().mockResolvedValueOnce([101]).mockResolvedValueOnce([102]),
    };

    const mockKnex = jest.fn(() => mockQueryBuilder);

    const service = new JobService(mockKnex);
    const jobs = await service.createJobs('ROOM01', { fileIds: [1, 2], type: 'preprocess' });

    expect(jobs).toHaveLength(2);
    // tiny file burst estimate: min 1
    expect(jobs[0].burstEstimate).toBe(1);
    expect(jobs[0].status).toBe(JOB_STATUS.QUEUED);
    // large file burst estimate: ceil(4500/1024) = 5
    expect(jobs[1].burstEstimate).toBe(5);
    expect(jobs[1].status).toBe(JOB_STATUS.QUEUED);

    expect(mockQueryBuilder.insert).toHaveBeenCalledTimes(2);
  });

  it('rejects empty fileIds array with 400', async () => {
    const service = new JobService({});
    await expect(
      service.createJobs('ROOM01', { fileIds: [], type: 'preprocess' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
