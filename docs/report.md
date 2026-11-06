# Project Report — Distributed Cloud Resource Simulator

> **Course:** Operating Systems & Database Management Systems  
> **Stack:** Node.js 22 · MySQL 8 · React 18 · Socket.IO 4 · Vite 5

---

## 1. Project Overview

This project merges two academic sub-projects into a single Node.js monorepo:

| Sub-project                       | Original Stack           | Equivalent Component                |
| --------------------------------- | ------------------------ | ----------------------------------- |
| Distributed pre-processing system | Python Flask + Socket.IO | `master/` + `worker/` packages      |
| Cloud resource simulator          | Spring Boot + MySQL      | `master/` REST API + MySQL via Knex |
| Dashboard                         | —                        | `web/` React + Vite                 |

The combined system demonstrates:

- **OS concepts** — concurrent job scheduling (FCFS, SJF), thread pools, inter-process communication via sockets
- **DBMS concepts** — relational schema design, indexed queries, three-way keyword search comparison

---

## 2. System Architecture

### 2.1 Monorepo Layout

```
OsDb-project/
├── master/          # Express + Socket.IO server, DB, schedulers
├── worker/          # Socket.IO client + worker_threads pool
├── web/             # React + Vite dashboard
├── shared/          # Shared event names and constants
└── docs/            # Reports, benchmark results, architecture diagrams
```

### 2.2 Technology Choices vs. Original

| Aspect              | Original       | This Project                  | Reason                                  |
| ------------------- | -------------- | ----------------------------- | --------------------------------------- |
| Language            | Python / Java  | Node.js (ES modules)          | Unified JS stack, lower DevOps overhead |
| Communication       | Flask-SocketIO | socket.io 4                   | Native JS, same protocol                |
| ORM / Query builder | Spring JPA     | Knex.js                       | Lightweight, migration-first            |
| Concurrency         | Python threads | `worker_threads` + ThreadPool | True parallelism without processes      |
| Frontend            | —              | React 18 + Vite               | Fast HMR, modern component model        |
| DB                  | MySQL 5.7      | MySQL 8                       | Full-text + window functions            |

### 2.3 Communication Diagram

See [`docs/architecture.md`](./architecture.md) for Mermaid diagrams of:

- Component overview
- Master internal subsystems
- Worker thread internals
- Full file-upload → index sequence diagram

---

## 3. Operating Systems Concepts

### 3.1 Process / Thread Model

Each **worker node** (`worker/`) is a separate OS process. Inside each worker process a **ThreadPool** (`worker/src/threadPool.js`) manages a fixed number of `worker_threads`. When the master sends a `job:assign` socket event the worker submits the payload to the pool; whichever thread is free picks it up and runs the task script (`worker/src/threadTask.js`).

```
Worker process
  └── ThreadPool (N threads)
        ├── thread-0 (preprocess task)
        ├── thread-1 (index task)
        └── ...
```

This demonstrates classic **multi-threaded process** architecture studied in OS: each thread shares memory (Node.js heap) while running tasks concurrently.

### 3.2 CPU Scheduling Algorithms

Two non-preemptive scheduling algorithms are implemented as **pure functions** (no side-effects, no DB imports) in `master/src/scheduler/`.

#### 3.2.1 First-Come First-Served (FCFS)

```
Sort jobs by arrival time.
CPU picks the next job in order; if CPU is idle it jumps to arrival time.
```

| Property       | Value                            |
| -------------- | -------------------------------- |
| Starvation     | No                               |
| Convoy effect  | Yes (long jobs block short ones) |
| Implementation | `master/src/scheduler/fcfs.js`   |

#### 3.2.2 Shortest Job First (SJF — non-preemptive)

```
When CPU becomes free, pick the ready job with smallest burst.
Tie-break: earliest arrival, then smallest id.
```

| Property       | Value                                              |
| -------------- | -------------------------------------------------- |
| Starvation     | Possible (long jobs)                               |
| Optimal        | Minimum average waiting time for given arrival set |
| Implementation | `master/src/scheduler/sjf.js`                      |

### 3.3 Test Cases (from PLAN.md §6)

The tables below use the required examples from `PLAN.md` §6. Unit test files are present; execution results are recorded separately only after running them.

#### Test A — FCFS (4 jobs, staggered arrivals)

| Job | Arrival | Burst | Start | Finish | Waiting | Turnaround |
| --- | ------- | ----- | ----- | ------ | ------- | ---------- |
| J1  | 0       | 5     | 0     | 5      | 0       | 5          |
| J2  | 1       | 3     | 5     | 8      | 4       | 7          |
| J3  | 2       | 8     | 8     | 16     | 6       | 14         |
| J4  | 3       | 6     | 16    | 22     | 13      | 19         |

**Avg Waiting = 5.75**  
**Avg Turnaround = 11.25**

#### Test B — SJF (same jobs)

| Job | Arrival | Burst | Start | Finish | Waiting | Turnaround |
| --- | ------- | ----- | ----- | ------ | ------- | ---------- |
| J1  | 0       | 5     | 0     | 5      | 0       | 5          |
| J2  | 1       | 3     | 5     | 8      | 4       | 7          |
| J4  | 3       | 6     | 8     | 14     | 5       | 11         |
| J3  | 2       | 8     | 14    | 22     | 12      | 20         |

**Avg Waiting = 5.25**  
**Avg Turnaround = 10.75**

The unit tests assert these outputs. The database-backed API tests also submit the same jobs and assert the exact averages and execution order.

#### Test C — Idle gap (both algorithms)

J1 (arrival 0, burst 2) runs from 0–2. J2 (arrival 5, burst 3) runs from 5–8. Both jobs have zero waiting time; turnaround times are 2 and 3.

#### Test D — SJF tie-breaking

Two jobs same burst: earliest arrival wins.

#### Test E — Empty input

An empty job list returns empty timeline and results without throwing.

### 3.4 Real Job Dispatching

Uploading a file stores it in MySQL. The dashboard then lets the user select files and queue one job type:

- `preprocess` — normalises field values via worker thread
- `index` — tokenises content and writes term postings

The **Dispatcher** (`master/src/services/dispatcher.js`) uses `SELECT ... FOR UPDATE` inside a Knex transaction to claim queued jobs and idle workers atomically, preventing duplicate claims when workers compete. Master write transactions are serialized within the process and transient deadlocks are retried.

Failed jobs are re-queued up to **3 attempts** before being marked `failed` permanently.

---

## 4. Database Management Concepts

### 4.1 Schema Design

The database (`cloud_simulator`) has 10 tables across two concerns:

| Table                  | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `files`                | Stores uploaded text files + SHA-256 hash for deduplication |
| `rooms`                | Named collaboration rooms identified by 6-char code         |
| `workers`              | Socket connections belonging to a room                      |
| `jobs`                 | Work units linked to files and rooms                        |
| `job_runs`             | Audit log of each job attempt (outcome, error, timings)     |
| `index_terms`          | Unique vocabulary terms                                     |
| `postings`             | Inverted index: `(term, file, tf)`                          |
| `scheduling_runs`      | Persisted algorithm averages and job counts                 |
| `knex_migrations`      | Knex migration tracking                                     |
| `knex_migrations_lock` | Knex concurrency lock                                       |

**Design decisions:**

- `files.content_hash` (SHA-256) — O(1) duplicate detection without full-content scan
- `files.content` column has a **FULLTEXT** index on MySQL 8 for natural-language search
- `index_terms` + `postings` implement a classic inverted index allowing boolean retrieval without table scans
- `jobs.attempts` enforces max-retry logic at the application layer
- All foreign keys have `ON DELETE CASCADE` so removing a room cleans up workers and jobs

### 4.2 Three-Way Keyword Search Comparison

Three strategies are implemented in `master/src/services/searchService.js`:

| Strategy           | SQL / Mechanism                                      | Complexity                         |
| ------------------ | ---------------------------------------------------- | ---------------------------------- |
| **LIKE**           | `WHERE content LIKE '%term%'`                        | O(n · m) full table scan           |
| **FULLTEXT**       | `MATCH(content) AGAINST(? IN NATURAL LANGUAGE MODE)` | MySQL full-text index              |
| **Inverted Index** | `JOIN postings JOIN index_terms WHERE term = ?`      | O(k) where k = posting list length |

Each strategy records wall-clock time (`performance.now()`). The `/api/benchmark/search?q=` endpoint runs all three in sequence and returns a `modes` array with timing data.

Measured timings for four terms over 100 indexed files, including raw endpoint observations, are documented in [`docs/benchmarks.md`](./benchmarks.md).

**Key finding:** In this local run, LIKE was fastest for the most frequent term, while the inverted index was fastest for three other terms. The corpus was small, so these measurements describe this run rather than a general performance ranking.

### 4.3 Concurrency Control

The dispatcher locks queued job rows and then idle worker rows inside a transaction. Master write transactions are serialized within the process and retried after transient InnoDB deadlocks:

```js
await withTransactionRetry(db, async (trx) => {
  const queuedJobs = await trx('jobs').where({ room_id, status: 'queued' }).forUpdate();
  // select idle workers, claim jobs, and insert job_runs in this transaction
});
```

This prevents two workers from claiming the same job simultaneously (read-modify-write race).

---

## 5. Test Results

### 5.1 Unit & Integration Tests

On 2026-11-06, the full Jest command completed with **16 suites passed and 94 tests passed**, including database-backed API tests against the configured local MySQL server.

Run with:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js \
  master/tests/ worker/tests/ --runInBand --forceExit
```

| Test File                      | Coverage                                                      |
| ------------------------------ | ------------------------------------------------------------- |
| `roomManager.test.js`          | Room creation, worker join/leave, reconnection                |
| `communication.test.js`        | Socket.IO roundtrip via real in-process server                |
| `fileService.test.js`          | `isReadableText`, `computeContentHash`, saveFile dedup        |
| `search.test.js`               | `escapeLike`, `createSnippet`, all 3 search modes (mocked DB) |
| `indexService.test.js`         | `saveIndexTermsAndPostings` chunked batch inserts             |
| `jobService.test.js`           | `createJobs`, `listJobsByRoom`, queue/Gantt views             |
| `dispatch.test.js`             | `dispatchRoom` with FOR UPDATE transaction mock               |
| `scheduler.fcfs.test.js`       | Tests A, C, E with hand-calculated values                     |
| `scheduler.sjf.test.js`        | Tests B, C, D, E with hand-calculated values                  |
| `metrics.test.js`              | `averages()`, `getScheduler()` factory                        |
| `scheduler.api.test.js`        | `POST /api/scheduler/simulate` endpoint                       |
| `tasks.test.js`                | `preprocessRecord`, `preprocessData`, `tokenize`              |
| `threadPool.test.js`           | ThreadPool submit, concurrent tasks, destroy                  |
| `schedulingRunService.test.js` | Save and list persisted room metrics                          |
| `transactionRetry.test.js`     | Deadlock retries and serialized write transactions            |

### 5.2 API Integration Tests (Phase 7)

`master/tests/api.test.js` contains integration cases for the following endpoints. It requires a configured MySQL connection; the full suite passed on 2026-11-06:

| Test                                          | Expected                                     |
| --------------------------------------------- | -------------------------------------------- |
| `GET /health`                                 | `{ status: 'ok' }`                           |
| `POST /api/files` text file                   | 201 with metadata                            |
| `POST /api/files` duplicate                   | 409 Conflict                                 |
| `POST /api/files` binary                      | 400                                          |
| `POST /api/files` empty                       | 400                                          |
| `GET /api/files`                              | Array with `id`, `name`, no `content`        |
| `GET /api/files/:id/content`                  | Raw text                                     |
| `GET /api/files/999999/content`               | 404                                          |
| `GET /api/search?q=...&mode=like`             | `{ results, timeMs }`                        |
| `GET /api/search?q=...&mode=fulltext`         | `{ results, timeMs }`                        |
| `GET /api/search?q=...&mode=index`            | `{ results, timeMs }`                        |
| `GET /api/search?q=&mode=like`                | 400                                          |
| `GET /api/search?q=test&mode=invalid`         | 400                                          |
| `GET /api/benchmark/search?q=...`             | `{ modes: [3 entries] }`                     |
| `POST /api/scheduler/simulate` Test A FCFS    | `avgWaiting = 5.75`, `avgTurnaround = 11.25` |
| `POST /api/scheduler/simulate` Test B SJF     | `avgWaiting = 5.25`, `avgTurnaround = 10.75` |
| `POST /api/scheduler/simulate` with room code | Stores run in `scheduling_runs`              |
| `GET /api/rooms/:code/scheduling-runs`        | Returns saved room history                   |
| `POST /api/scheduler/simulate` bad algo       | 400                                          |

### 5.3 Live acceptance checks

Manual checks against the local MySQL instance on 2026-11-06:

| Scenario                                          | Result                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| Queue 10 index jobs with two workers              | 10 jobs reached `done`; all 10 files returned from inverted-index search |
| Stop a worker during a large index job            | The job was requeued and completed on the backup worker on attempt 2     |
| Switch a queued room from FCFS to SJF             | A 3-job queue ran in ascending burst order: 1 KB, 2 KB, then 4 KB        |
| Open the dashboard and create a room              | Master connected and the active room/algorithm appeared in the dashboard |
| ESLint, Prettier check, and Vite production build | All passed                                                               |

The dashboard screenshot was observed during the run but has not been saved as a repository image yet.

---

## 6. How to Run

### 6.1 Prerequisites

- **Node.js 20+** (verified with v22.14.0)
- **MySQL 8** running locally on port 3306
- npm 10+

### 6.2 Setup

```bash
# 1. Clone
git clone <repo-url>
cd OsDb-project

# 2. Configure environment
cp .env.example .env
# Edit .env: set DB_USER, DB_PASSWORD, DB_NAME

# 3. Install dependencies (all workspaces)
npm install

# 4. Run DB migrations
npm --prefix master run migrate

# 5. Start master server  (terminal 1)
npm --prefix master start

# 6. Start a worker       (terminal 2)
node worker/src/index.js --room <ROOM_CODE> --name W1 --threads 4

# 7. Start dashboard      (terminal 3)
npm --prefix web run dev
# Open http://localhost:5173
```

### 6.3 Running Tests

```bash
# All unit tests
node --experimental-vm-modules ./node_modules/jest/bin/jest.js \
  master/tests/ worker/tests/ --runInBand --forceExit

# API integration tests only (requires live MySQL)
node --experimental-vm-modules ./node_modules/jest/bin/jest.js \
  master/tests/api.test.js --runInBand --forceExit

# Lint check
npx eslint .

# Format check
npx prettier --check .

# Production build (web)
npm --prefix web run build
```

---

## 7. API Reference

| Method | Endpoint                           | Description                                             |
| ------ | ---------------------------------- | ------------------------------------------------------- |
| GET    | `/health`                          | Health check                                            |
| POST   | `/api/files`                       | Upload text file(s) (multipart, field `files`)          |
| GET    | `/api/files`                       | List all files (no content column)                      |
| GET    | `/api/files/:id`                   | Get file metadata + content                             |
| GET    | `/api/files/:id/content`           | Get raw file content (`text/plain`)                     |
| GET    | `/api/search?q=&mode=`             | Keyword search (mode: `like` / `fulltext` / `index`)    |
| GET    | `/api/benchmark/search?q=`         | Run all 3 search modes and return timings               |
| POST   | `/api/scheduler/simulate`          | Simulate FCFS or SJF; optional `roomCode` saves metrics |
| PATCH  | `/api/rooms/:code/algorithm`       | Change a room's dispatch algorithm                      |
| GET    | `/api/rooms/:code/scheduling-runs` | Read saved scheduler metrics for a room                 |
| GET    | `/api/rooms/:code/jobs`            | Jobs in a room                                          |

---

## 8. Known Limitations & Future Work

| Area        | Limitation                                                       | Potential Fix                           |
| ----------- | ---------------------------------------------------------------- | --------------------------------------- |
| Scheduling  | Non-preemptive only                                              | Add Round Robin (preemptive)            |
| Search      | Inverted index built incrementally (per file)                    | Batch rebuild on demand                 |
| Workers     | No auto-discovery; manual room code entry                        | mDNS / service registry                 |
| Security    | No authentication on REST endpoints                              | JWT middleware                          |
| Persistence | Active socket state is rebuilt as workers and browsers reconnect | Persist current sockets across restarts |
| Deployment  | Local only                                                       | Dockerise + deploy to Cloud Run         |

---

## 9. Screenshots and evidence

The dashboard was captured with the master connected, a worker online, an uploaded file indexed, a completed job rendered in the Gantt chart, and the three search strategies compared. Command output and the live MySQL table list are saved under `docs/evidence/`.

| Step                           | Evidence                                                  |
| ------------------------------ | --------------------------------------------------------- |
| Dashboard — Room creation      | [Screenshot](screenshots/dashboard-room-creation.png)     |
| Dashboard — Active room/worker | [Screenshot](screenshots/dashboard-active-room.jpg)       |
| Dashboard — File upload        | [Screenshot](screenshots/dashboard-file-upload.jpg)       |
| Dashboard — Gantt chart        | [Screenshot](screenshots/dashboard-gantt.jpg)             |
| Dashboard — Search comparison  | [Screenshot](screenshots/dashboard-search-comparison.jpg) |
| Jest — Full suite              | [Run output](evidence/test-run-2026-11-06.txt)            |
| ESLint                         | [Run output](evidence/lint-run-2026-11-06.txt)            |
| Prettier                       | [Run output](evidence/format-run-2026-11-06.txt)          |
| Vite production build          | [Build output](evidence/web-build-2026-11-06.txt)         |
| MySQL — Tables after migration | [Query output](evidence/mysql-tables-2026-11-06.txt)      |

The full test run on 2026-11-06 passed **16 suites and 94 tests**. ESLint, Prettier check, and the Vite production build also passed. The MySQL query returned the eight application tables plus Knex's two migration-tracking tables.

**Reproducibility notes:** These checks ran on Node.js v22.14.0 and MySQL 8.0.43. Docker Compose startup could not be verified on this machine because the Docker CLI is not installed. The project is hosted at `https://github.com/fineshii/OsDb-project`; this private repository requires collaborator access. A clean clone has not yet been tested.

The temporary source files used for the dashboard screenshots were removed. I left the demo room and its uploaded sample files in the local database because additional jobs and run history appeared in that room during capture; deleting it would also remove those records.
