/**
 * Phase 7 — API Integration Tests
 *
 * Tests every public REST endpoint using supertest against a real
 * in-process Express server.  A real MySQL connection (cloud_simulator) is
 * used so that file-upload, search, and scheduler flows exercise the actual
 * DB layer.
 *
 * Run:
 *   node --experimental-vm-modules node_modules/jest/bin/jest.js \
 *     master/tests/api.test.js --runInBand --forceExit
 */

import request from 'supertest';
import { app } from '../src/server.js';
import db from '../src/db/index.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Plain text buffer used in upload tests */
const TEXT_CONTENT = 'Hello from integration test – unique content ' + Date.now();

/** Buffer of null bytes – will be rejected as binary */
const BINARY_CONTENT = Buffer.alloc(16, 0);
const SCHEDULER_ROOM_CODE = `T${Date.now().toString(36).slice(-5).toUpperCase()}`;

/** Test A payload from PLAN.md §6 */
const FCFS_TEST_A_JOBS = [
  { id: 'J1', arrival: 0, burst: 5 },
  { id: 'J2', arrival: 1, burst: 3 },
  { id: 'J3', arrival: 2, burst: 8 },
  { id: 'J4', arrival: 3, burst: 6 },
];

/** Test B uses the same jobs as Test A, scheduled with SJF. */
const SJF_TEST_B_JOBS = FCFS_TEST_A_JOBS;

// ─── afterAll ────────────────────────────────────────────────────────────────

afterAll(async () => {
  await db('rooms').where({ code: SCHEDULER_ROOM_CODE }).del();
  await db.destroy();
});

beforeAll(async () => {
  await db('rooms').insert({ code: SCHEDULER_ROOM_CODE, algorithm: 'FCFS' });
});

// ─── Health ──────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── File upload ─────────────────────────────────────────────────────────────

describe('POST /api/files', () => {
  it('uploads a valid text file → 201 with metadata', async () => {
    const res = await request(app)
      .post('/api/files')
      .attach('files', Buffer.from(TEXT_CONTENT), 'integration-test.txt');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('files');
    expect(Array.isArray(res.body.files)).toBe(true);
    expect(res.body.files.length).toBe(1);
    const f = res.body.files[0];
    expect(f).toHaveProperty('id');
    expect(f).toHaveProperty('name', 'integration-test.txt');
    expect(f).toHaveProperty('content_hash');
    expect(f).toHaveProperty('size_bytes');
  });

  it('uploading the same file again → 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/files')
      .attach('files', Buffer.from(TEXT_CONTENT), 'integration-test-dup.txt');

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('uploading a binary file → 400', async () => {
    const res = await request(app).post('/api/files').attach('files', BINARY_CONTENT, 'binary.bin');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('uploading an empty file → 400', async () => {
    const res = await request(app).post('/api/files').attach('files', Buffer.alloc(0), 'empty.txt');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('no file attached → 400', async () => {
    const res = await request(app).post('/api/files');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── File list ───────────────────────────────────────────────────────────────

describe('GET /api/files', () => {
  it('returns an array of files', async () => {
    const res = await request(app).get('/api/files');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should contain at least the file uploaded above
    expect(res.body.length).toBeGreaterThan(0);
    // Each item must have id and name but NOT content (omitted for efficiency)
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).not.toHaveProperty('content');
  });
});

// ─── File content ─────────────────────────────────────────────────────────────

describe('GET /api/files/:id/content', () => {
  let uploadedId;

  beforeAll(async () => {
    // Look up the file we uploaded above
    const listRes = await request(app).get('/api/files');
    const found = listRes.body.find((f) => f.name === 'integration-test.txt');
    uploadedId = found?.id;
  });

  it('returns raw text content for a valid ID', async () => {
    expect(uploadedId).toBeDefined();
    const res = await request(app).get(`/api/files/${uploadedId}/content`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hello from integration test');
  });

  it('returns 404 for a non-existent ID', async () => {
    const res = await request(app).get('/api/files/999999/content');
    expect(res.status).toBe(404);
  });
});

// ─── Search ──────────────────────────────────────────────────────────────────

describe('GET /api/search', () => {
  it('?q=integration&mode=like → 200 with timeMs', async () => {
    const res = await request(app).get('/api/search?q=integration&mode=like');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timeMs');
    expect(typeof res.body.timeMs).toBe('number');
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('?q=integration&mode=fulltext → 200 with timeMs', async () => {
    const res = await request(app).get('/api/search?q=integration&mode=fulltext');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timeMs');
  });

  it('?q=integration&mode=index → 200 with timeMs', async () => {
    const res = await request(app).get('/api/search?q=integration&mode=index');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timeMs');
  });

  it('?q=&mode=like (empty query) → 400', async () => {
    const res = await request(app).get('/api/search?q=&mode=like');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('?q=test&mode=invalid → 400', async () => {
    const res = await request(app).get('/api/search?q=test&mode=invalid');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('missing q param → 400', async () => {
    const res = await request(app).get('/api/search?mode=like');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── Benchmark ───────────────────────────────────────────────────────────────

describe('GET /api/benchmark/search', () => {
  it('?q=integration → 200 with 3 mode entries (like/fulltext/index)', async () => {
    const res = await request(app).get('/api/benchmark/search?q=integration');
    expect(res.status).toBe(200);
    // benchmark returns { query, modes: { like, fulltext, index }, comparison }
    expect(res.body).toHaveProperty('modes');
    const modes = res.body.modes;
    expect(modes).toHaveProperty('like');
    expect(modes).toHaveProperty('fulltext');
    expect(modes).toHaveProperty('index');
    // Each mode entry has timeMs and count
    expect(typeof modes.like.timeMs).toBe('number');
    expect(typeof modes.fulltext.timeMs).toBe('number');
    expect(typeof modes.index.timeMs).toBe('number');
    expect(res.body).toHaveProperty('comparison');
    expect(res.body.comparison).toHaveProperty('fastest');
  });

  it('missing q → 400', async () => {
    const res = await request(app).get('/api/benchmark/search');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── Scheduler simulate ──────────────────────────────────────────────────────

describe('POST /api/scheduler/simulate', () => {
  it('Test A (FCFS) → avgWaiting = 5.75, avgTurnaround = 11.25', async () => {
    const res = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'FCFS',
      jobs: FCFS_TEST_A_JOBS,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('algorithm', 'FCFS');
    expect(res.body).toHaveProperty('metrics');
    expect(res.body.metrics.avgWaiting).toBe(5.75);
    expect(res.body.metrics.avgTurnaround).toBe(11.25);
    expect(res.body.timeline.map((item) => item.jobId)).toEqual(['J1', 'J2', 'J3', 'J4']);
  });

  it('Test B (SJF) → avgWaiting = 5.25, avgTurnaround = 10.75', async () => {
    const res = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'SJF',
      jobs: SJF_TEST_B_JOBS,
    });

    expect(res.status).toBe(200);
    expect(res.body.algorithm).toBe('SJF');
    expect(res.body.metrics.avgWaiting).toBe(5.25);
    expect(res.body.metrics.avgTurnaround).toBe(10.75);
    expect(res.body.timeline.map((item) => item.jobId)).toEqual(['J1', 'J2', 'J4', 'J3']);
  });

  it('saves room simulations and returns the stored comparison history', async () => {
    const fcfs = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'FCFS',
      jobs: FCFS_TEST_A_JOBS,
      roomCode: SCHEDULER_ROOM_CODE,
    });
    const sjf = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'SJF',
      jobs: SJF_TEST_B_JOBS,
      roomCode: SCHEDULER_ROOM_CODE,
    });

    expect(fcfs.status).toBe(200);
    expect(fcfs.body.savedRun.algorithm).toBe('FCFS');
    expect(sjf.status).toBe(200);
    expect(sjf.body.savedRun.algorithm).toBe('SJF');

    const history = await request(app).get(`/api/rooms/${SCHEDULER_ROOM_CODE}/scheduling-runs`);
    expect(history.status).toBe(200);
    expect(history.body.map((run) => run.algorithm)).toContain('FCFS');
    expect(history.body.map((run) => run.algorithm)).toContain('SJF');
    expect(history.body.every((run) => run.jobCount === 4)).toBe(true);
  });

  it('invalid algorithm → 400', async () => {
    const res = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'RR',
      jobs: FCFS_TEST_A_JOBS,
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('missing jobs array → 400', async () => {
    const res = await request(app).post('/api/scheduler/simulate').send({
      algorithm: 'FCFS',
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('job with burst=0 → 400', async () => {
    const res = await request(app)
      .post('/api/scheduler/simulate')
      .send({
        algorithm: 'FCFS',
        jobs: [{ id: 'X1', arrival: 0, burst: 0 }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
