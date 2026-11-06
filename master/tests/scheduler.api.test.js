import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/server.js';

describe('Scheduler API: /api/scheduler/simulate', () => {
  const testJobs = [
    { id: 'J1', arrival: 0, burst: 5 },
    { id: 'J2', arrival: 1, burst: 3 },
    { id: 'J3', arrival: 2, burst: 8 },
    { id: 'J4', arrival: 3, burst: 6 },
  ];

  it('runs FCFS simulation and returns exact numbers from Section 6 Test A', async () => {
    const res = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'FCFS',
      jobs: testJobs,
    });

    expect(res.status).toBe(200);
    expect(res.body.algorithm).toBe('FCFS');
    expect(res.body.timeline.map((t) => t.jobId)).toEqual(['J1', 'J2', 'J3', 'J4']);
    expect(res.body.metrics.avgWaiting).toBe(5.75);
    expect(res.body.metrics.avgTurnaround).toBe(11.25);
  });

  it('runs SJF simulation and returns exact numbers from Section 6 Test B', async () => {
    const res = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'SJF',
      jobs: testJobs,
    });

    expect(res.status).toBe(200);
    expect(res.body.algorithm).toBe('SJF');
    expect(res.body.timeline.map((t) => t.jobId)).toEqual(['J1', 'J2', 'J4', 'J3']);
    expect(res.body.metrics.avgWaiting).toBe(5.25);
    expect(res.body.metrics.avgTurnaround).toBe(10.75);
  });

  it('rejects invalid algorithm with 400', async () => {
    const res = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'INVALID',
      jobs: testJobs,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejects negative burst with 400', async () => {
    const res = await request(app)
      .post('/api/scheduler/simulate')
      .send({
        algorithm: 'FCFS',
        jobs: [{ id: 'J1', arrival: 0, burst: -5 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Burst time must be an integer > 0');
  });
});
