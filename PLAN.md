# PLAN.md: Distributed Cloud Resource Simulator (Node.js)

> **For the AI agent:** This file is the source of truth for the project. Read it fully before writing code. Work on **one phase at a time**, only when asked. Do not add features, packages, or folders that are not listed here without asking. After each phase, stop and summarise what changed so the developer can review it.

---

## 1. Project summary

A Node.js system that combines two earlier projects:

1. **Distributed preprocessing system** (Flask + Flask-SocketIO): a _master_ creates a room, _workers_ join it, the master splits a dataset into chunks and sends one to each worker, and workers send results back.
2. **Cloud Resource Simulator** (Spring Boot + MySQL): file upload, content stored in MySQL, keyword search with SQL `LIKE`, and FCFS / non-preemptive SJF job scheduling.

**Combined idea:** a master node accepts uploaded files, stores and indexes them in MySQL, turns each file into a **job**, and uses an **OS-style scheduler** (FCFS, SJF) to decide which job runs next. Jobs are dispatched over Socket.IO to **worker nodes**, which execute them in a `worker_threads` pool and report back. A web dashboard shows workers, the queue, a Gantt chart, and scheduling metrics.

**Subjects covered:**

- **OS:** scheduling algorithms, threads, job queue, synchronisation (no job is taken twice), fault handling (requeue on worker failure).
- **DBMS:** schema design, indexes, transactions, parameterised queries, `LIKE` vs `FULLTEXT` vs inverted index benchmarking.

---

## 2. Tech stack (fixed)

| Area        | Choice                                                                  |
| ----------- | ----------------------------------------------------------------------- |
| Runtime     | Node.js 20 LTS, ES modules (`"type": "module"`)                         |
| Backend     | Express 4                                                               |
| Real-time   | Socket.IO 4 (server on master, `socket.io-client` on workers)           |
| Concurrency | `worker_threads` (a thread pool inside each worker node)                |
| Database    | MySQL 8, accessed with `mysql2` and **Knex** for migrations and queries |
| Uploads     | `multer` (memory storage, size limit via env)                           |
| Validation  | `zod`                                                                   |
| Config      | `dotenv`, all secrets and ports from `.env` (never hard-coded)          |
| Tests       | Jest                                                                    |
| Frontend    | React + Vite (plain CSS, no UI framework)                               |
| Dev tooling | `docker-compose.yml` for MySQL, ESLint, Prettier                        |

Layout: **npm workspaces monorepo** with three packages: `master`, `worker`, `web`, plus `shared`.

---

## 3. Folder structure

```
cloud-resource-simulator/
├── package.json                  # workspaces: master, worker, web, shared
├── .env.example
├── docker-compose.yml            # MySQL 8 only (apps run with npm scripts)
├── PLAN.md
├── README.md
├── docs/                         # diagrams, test evidence, screenshots, report
├── shared/
│   ├── events.js                 # Socket.IO event name constants
│   └── constants.js              # job types, job statuses, algorithm names
├── master/
│   ├── package.json
│   ├── knexfile.js
│   ├── migrations/
│   ├── src/
│   │   ├── server.js             # Express + Socket.IO bootstrap
│   │   ├── config.js
│   │   ├── db/index.js           # knex instance
│   │   ├── routes/               # files.routes.js, search.routes.js, jobs.routes.js, scheduler.routes.js
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── fileService.js
│   │   │   ├── searchService.js
│   │   │   ├── indexService.js   # builds inverted index
│   │   │   ├── jobService.js
│   │   │   ├── roomManager.js    # replaces `rooms{}` from master.py
│   │   │   └── dispatcher.js     # scheduler + idle workers -> assignments
│   │   ├── scheduler/
│   │   │   ├── fcfs.js
│   │   │   ├── sjf.js
│   │   │   ├── metrics.js
│   │   │   └── index.js          # getScheduler(name)
│   │   └── sockets/
│   │       └── handlers.js
│   └── tests/
│       ├── scheduler.fcfs.test.js
│       ├── scheduler.sjf.test.js
│       ├── metrics.test.js
│       └── search.test.js
├── worker/
│   ├── package.json
│   └── src/
│       ├── index.js              # CLI entry: node src/index.js --room ABC123 --name W1
│       ├── workerClient.js       # socket.io-client logic
│       ├── threadPool.js         # worker_threads pool
│       ├── threadTask.js         # code that runs inside each thread
│       └── tasks/
│           ├── preprocess.js     # port of preprocess_data() from worker.py
│           └── indexFile.js      # tokenises text, returns term frequencies
└── web/
    ├── package.json
    └── src/
        ├── App.jsx
        ├── api.js
        ├── socket.js
        └── components/
            ├── RoomPanel.jsx
            ├── FileUpload.jsx
            ├── SearchBox.jsx
            ├── JobQueue.jsx
            ├── WorkerList.jsx
            ├── GanttChart.jsx
            └── MetricsTable.jsx
```

---

## 4. Database schema

Create with Knex migrations (one migration per table group). MySQL, InnoDB, `utf8mb4`.

```sql
CREATE TABLE files (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100),
  size_bytes    INT NOT NULL,
  content_hash  CHAR(64) NOT NULL UNIQUE,      -- SHA-256, prevents duplicates
  content       LONGTEXT NOT NULL,
  uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FULLTEXT KEY ft_content (content)
);

CREATE TABLE rooms (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          CHAR(6) NOT NULL UNIQUE,
  algorithm     ENUM('FCFS','SJF') NOT NULL DEFAULT 'FCFS',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  room_id       INT NOT NULL,
  name          VARCHAR(100) NOT NULL,
  socket_id     VARCHAR(64),
  status        ENUM('idle','busy','offline') NOT NULL DEFAULT 'idle',
  last_seen     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE jobs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  room_id        INT NOT NULL,
  file_id        INT NOT NULL,
  type           ENUM('index','preprocess') NOT NULL,
  status         ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  arrival_time   BIGINT NOT NULL,              -- ms since epoch, used by scheduler
  burst_estimate INT NOT NULL,                 -- estimated work units (see section 6)
  attempts       INT NOT NULL DEFAULT 0,
  worker_id      INT NULL,
  started_at     BIGINT NULL,
  finished_at    BIGINT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (file_id) REFERENCES files(id),
  FOREIGN KEY (worker_id) REFERENCES workers(id),
  KEY idx_jobs_room_status (room_id, status)
);

CREATE TABLE job_runs (                         -- history, used for Gantt chart
  id          INT AUTO_INCREMENT PRIMARY KEY,
  job_id      INT NOT NULL,
  worker_id   INT NOT NULL,
  started_at  BIGINT NOT NULL,
  ended_at    BIGINT NULL,
  outcome     ENUM('done','failed','requeued') NULL,
  error       TEXT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE index_terms (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  term  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE postings (
  term_id  INT NOT NULL,
  file_id  INT NOT NULL,
  tf       INT NOT NULL,
  PRIMARY KEY (term_id, file_id),
  FOREIGN KEY (term_id) REFERENCES index_terms(id),
  FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE TABLE scheduling_runs (                  -- stored results for comparing algorithms
  id          INT AUTO_INCREMENT PRIMARY KEY,
  room_id     INT NOT NULL,
  algorithm   ENUM('FCFS','SJF') NOT NULL,
  avg_waiting DOUBLE NOT NULL,
  avg_turnaround DOUBLE NOT NULL,
  job_count   INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
```

**Rules:** every query uses parameter binding (Knex does this by default). Use a **transaction** whenever a job result is saved (update `jobs`, close `job_runs`, write `postings`, and update `workers` together).

---

## 5. Socket.IO event contract

Define all names in `shared/events.js` and import them on both sides. Never type event names as raw strings elsewhere.

| Event            | Direction       | Payload                                      | Purpose                                              |
| ---------------- | --------------- | -------------------------------------------- | ---------------------------------------------------- |
| `room:create`    | web → master    | `{ algorithm }`                              | Master creates a room                                |
| `room:created`   | master → web    | `{ roomCode }`                               |                                                      |
| `worker:join`    | worker → master | `{ roomCode, workerName }`                   | Worker joins a room                                  |
| `worker:joined`  | master → worker | `{ roomCode, workerId }`                     |                                                      |
| `worker:list`    | master → web    | `[{ id, name, status }]`                     | Sent on every change                                 |
| `job:assign`     | master → worker | `{ jobId, type, fileId, fileName, content }` | Dispatch one job                                     |
| `job:started`    | worker → master | `{ jobId }`                                  |                                                      |
| `job:done`       | worker → master | `{ jobId, result }`                          | `result` = `{ terms: {word: tf} }` or processed rows |
| `job:failed`     | worker → master | `{ jobId, error }`                           |                                                      |
| `queue:update`   | master → web    | `[{ id, name, status, burst, workerName }]`  | Queue changes                                        |
| `gantt:update`   | master → web    | `[{ jobId, workerName, start, end }]`        |                                                      |
| `metrics:update` | master → web    | `{ algorithm, avgWaiting, avgTurnaround }`   |                                                      |
| `error:message`  | master → any    | `{ message }`                                |                                                      |

**Improvements over the Flask version:**

- Room state lives in the database **and** an in-memory map (`roomManager.js`), not only in memory.
- A worker is identified by a stable `workerId`, not just the socket id.
- Heartbeat: Socket.IO ping settings handle liveness; on `disconnect` the master marks the worker offline and **requeues** its running job (outcome `requeued`, `attempts + 1`, max 3 attempts then `failed`).

---

## 6. Scheduler specification

All schedulers are **pure functions** with no database or socket access. This makes them easy to test.

```js
// master/src/scheduler/fcfs.js and sjf.js
// jobs: [{ id, arrival, burst }]   (integers, same time unit)
// returns: { timeline, results }
//   timeline: [{ jobId, start, end }]            (idle gaps are simply absent)
//   results:  [{ jobId, arrival, burst, start, completion, turnaround, waiting }]
export function schedule(jobs) { ... }
```

```js
// master/src/scheduler/metrics.js
export function averages(results) -> { avgWaiting, avgTurnaround }
```

```js
// master/src/scheduler/index.js
export function getScheduler(name) // 'FCFS' | 'SJF'; throws on unknown name
```

**Definitions:** `turnaround = completion − arrival`, `waiting = turnaround − burst`.

**FCFS:** sort by `arrival`, ties by `id`. Run in that order. If the CPU is idle until the next arrival, start at that arrival.

**SJF (non-preemptive):** at each decision time, choose among jobs that have already arrived the one with the smallest `burst`. Ties: earlier `arrival`, then lower `id`. If none has arrived, jump to the next arrival.

**Input validation:** empty list returns `{ timeline: [], results: [] }`. Negative or non-integer burst/arrival throws an error.

**Burst estimate for real jobs:** `burst_estimate = ceil(size_bytes / 1024)` (so 1 unit = 1 KB), minimum 1.

**Live dispatching (`dispatcher.js`):** whenever a job is queued, a job finishes, or a worker becomes idle, the dispatcher takes the room's `queued` jobs, uses the room's algorithm to pick the next job (FCFS = earliest arrival, SJF = smallest burst estimate among queued), and assigns it to an idle worker. Selecting and claiming the job happens inside a DB transaction using `SELECT ... FOR UPDATE` so two workers can never take the same job.

### Required test cases (hand-calculated, must be in the Jest tests exactly)

**Test A (FCFS):**

| Job | Arrival | Burst |
| --- | ------- | ----- |
| J1  | 0       | 5     |
| J2  | 1       | 3     |
| J3  | 2       | 8     |
| J4  | 3       | 6     |

Order J1, J2, J3, J4. Completion: 5, 8, 16, 22. Turnaround: 5, 7, 14, 19. Waiting: 0, 4, 6, 13. **Average waiting = 5.75, average turnaround = 11.25.**

**Test B (SJF, same jobs):**

Order J1, J2, J4, J3. Completion: J1=5, J2=8, J4=14, J3=22. Turnaround: J1=5, J2=7, J3=20, J4=11. Waiting: J1=0, J2=4, J3=12, J4=5. **Average waiting = 5.25, average turnaround = 10.75.**

**Test C (idle gap, both algorithms):** J1 (arrival 0, burst 2), J2 (arrival 5, burst 3). Timeline: J1 0–2, J2 5–8. Waiting 0 and 0. Turnaround 2 and 3.

**Test D (tie-break, SJF):** two jobs available at the same time with equal burst: the one with the earlier arrival runs first; if arrivals are equal, the lower id.

**Test E:** empty list returns empty results without throwing.

---

## 7. REST API (master)

| Method | Path                                           | Description                                                                                                                                                             |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/files`                                   | Upload one or more files (`multipart/form-data`). Validates size, non-empty content, readable text. Rejects duplicates by hash with HTTP 409.                           |
| GET    | `/api/files`                                   | List files (id, name, size, uploaded_at)                                                                                                                                |
| GET    | `/api/files/:id/content`                       | Raw content (used by workers for large files)                                                                                                                           |
| POST   | `/api/rooms/:code/jobs`                        | Body: `{ fileIds: [], type }`. Creates queued jobs.                                                                                                                     |
| GET    | `/api/rooms/:code/jobs`                        | Job list with status                                                                                                                                                    |
| GET    | `/api/search?q=...&mode=like\|fulltext\|index` | Keyword search using the chosen strategy, returns matches plus `timeMs`                                                                                                 |
| POST   | `/api/scheduler/simulate`                      | Body: `{ algorithm, jobs: [{id, arrival, burst}] }`. Runs the pure simulator and returns timeline and metrics (works without workers; this is the classroom-style demo) |
| GET    | `/api/benchmark/search?q=...`                  | Runs all three search modes and returns timings                                                                                                                         |

Use `zod` for every request body and query. Return consistent errors: `{ error: string }` with proper HTTP codes. No stack traces in responses.

---

## 8. Search strategies (DBMS comparison)

1. **`like`**: `WHERE content LIKE ?` with the term escaped (`%`, `_`, `\`). This is the baseline from the original report.
2. **`fulltext`**: `WHERE MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE)`.
3. **`index`**: lookup through `index_terms` and `postings`, ranked by `tf`.

The benchmark endpoint measures each strategy on the same query and returns timings. Record results in `docs/benchmarks.md` using a dataset of at least 100 files.

---

## 9. Worker behaviour

- Start: `node src/index.js --master http://localhost:5000 --room ABC123 --name W1 --threads 2`
- Connects with `socket.io-client`, emits `worker:join`, auto-reconnects.
- On `job:assign`: emit `job:started`, run the task in the thread pool, emit `job:done` or `job:failed`.
- Thread pool size defaults to `os.cpus().length - 1`, minimum 1, overridable with `--threads`.
- `preprocess.js` is a straight port of `preprocess_data()` in the old `worker.py` (normalise keys, trim strings, lowercase emails, strip phone formatting, parse price fields, add `processed_at` and `processed_by`). Keep the same rules, but **do not** uppercase every other string field by default.
- `indexFile.js` lowercases, tokenises on non-alphanumerics, drops tokens shorter than 2 characters, and returns `{ term: tf }`.
- A task that throws must not crash the process.

---

## 10. Dashboard (web)

One page with these panels: **Room** (create room, show code and chosen algorithm), **Workers** (name, idle/busy/offline), **Upload** (drag and drop, progress), **Search** (mode selector, results, timing), **Job queue** (status colours), **Gantt chart** (one row per worker, built with divs and CSS widths, no chart library), **Metrics** (average waiting and turnaround, a table comparing FCFS vs SJF runs from `scheduling_runs`).

Keep it plain and readable. Function matters more than styling.

---

## 11. Phases

Each phase ends with a working, runnable state and a short summary of what to test manually.

### Phase 0: Setup

- Create the monorepo, workspaces, ESLint, Prettier, `.env.example`, `docker-compose.yml` (MySQL).
- `shared/events.js` and `shared/constants.js`.
- **Done when:** `npm install` works at the root and `docker compose up -d` starts MySQL.

### Phase 1: Master/worker communication (port of the Flask project)

- Express + Socket.IO in `master`, `roomManager.js`, events `room:create`, `worker:join`, `worker:list`.
- Worker CLI that joins a room.
- Send a dummy job and get a dummy result back.
- **Done when:** two workers in separate terminals join a room and both appear in the master log.

### Phase 2: Database and file handling

- Knex migrations for all tables in section 4.
- File upload endpoint with validation and hash-based duplicate rejection.
- `like` search.
- **Done when:** uploading the same file twice returns 409, and a keyword search returns the right file.

### Phase 3: Scheduler (pure logic first)

- Implement `fcfs.js`, `sjf.js`, `metrics.js`, `index.js`.
- Write the Jest tests for cases A–E **before** the implementation.
- `/api/scheduler/simulate` endpoint.
- **Done when:** all tests pass and the endpoint returns the numbers from section 6.

### Phase 4: Real job dispatching

- `jobService`, `dispatcher.js`, `job:assign` / `job:done` / `job:failed` handling with transactions.
- `FOR UPDATE` claiming.
- Worker thread pool with `preprocess.js` and `indexFile.js`.
- Failure handling: requeue on disconnect, max 3 attempts.
- **Done when:** uploading 10 files with 2 workers processes all of them, killing a worker mid-job causes its job to finish on the other worker, and switching a room between FCFS and SJF changes execution order.

### Phase 5: Index and search comparison

- Populate `index_terms` and `postings` from `index` jobs.
- Add `fulltext` and `index` modes and the benchmark endpoint.
- **Done when:** `docs/benchmarks.md` contains a real timing table for the 3 strategies.

### Phase 6: Dashboard

- Build the React components in section 10 and connect them to REST and Socket.IO.
- **Done when:** the complete flow can be demonstrated from the browser alone.

### Phase 7: Testing, documentation, report

- Add API tests (Jest + supertest) for upload, search, and error cases.
- README with setup steps, architecture diagram in `docs/`, screenshots.
- Update the Phase 2/3 project report: architecture is now Node.js, not Spring Boot. Record **actual** test outcomes only.
- **Done when:** a new person can clone the repo, follow the README, and run the demo.

---

## 12. Coding rules for the agent

1. ES modules only. Async/await, no callbacks.
2. Keep controllers thin: validate, call a service, return. Business logic goes in `services/`.
3. Scheduler code must stay **pure**: no imports of `db`, `socket.io`, or `Date.now()` inside it.
4. Every SQL statement uses bound parameters. Never concatenate user input into SQL.
5. Read config only through `config.js` / environment variables. No hard-coded secrets (the Flask version had them; do not repeat that).
6. Do not send whole large datasets through sockets: if `size_bytes` exceeds `MAX_SOCKET_PAYLOAD` (env, default 1 MB), send only `fileId` and let the worker fetch via `GET /api/files/:id/content`.
7. Comment non-obvious logic briefly. The developer must be able to explain every file in a viva.
8. Add a Jest test for every new service function that contains logic.
9. Do not install new dependencies without listing them and the reason.
10. After each phase, list: files created or changed, commands to run, and what to verify manually.

---

## 13. Out of scope

- User accounts, login, authentication.
- Preemptive algorithms (SRTF), unless every phase is finished and the developer asks.
- Cloud deployment.
- Real file system watching or crawling.

## 14. Optional extensions (only if time remains and requested)

- Round Robin with a configurable quantum, with its own hand-calculated tests.
- Priority scheduling.
- Reusing the existing C++ indexer as a worker task via `child_process.spawn`, demonstrating inter-process communication.
- Exporting the Gantt chart as an image.
