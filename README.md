# Distributed Cloud Resource Simulator

> A Node.js monorepo that combines a **distributed pre-processing system** (master/worker with Socket.IO) and a **cloud resource simulator** (file upload, keyword search, OS scheduling).  
> Built for the OS + DBMS academic project.

---

## Features

| Area               | What it does                                                                          |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Master/Worker**  | Master (Express + Socket.IO) manages rooms; workers run tasks in `worker_threads`     |
| **File upload**    | Upload text files via REST; SHA-256 deduplication; binary files rejected              |
| **Keyword search** | Search file names and contents with LIKE, MySQL FULLTEXT, and a custom inverted index |
| **OS Scheduling**  | Pure FCFS and SJF simulations with Gantt timeline + metrics                           |
| **Dashboard**      | React 18 + Vite — rooms, workers, job queue, Gantt chart, search box                  |
| **Testing**        | 94 Jest tests passed; lint, formatting, and web build passed on 2026-11-06            |

---

## Prerequisites

| Tool    | Minimum Version                    |
| ------- | ---------------------------------- |
| Node.js | 20.x or newer                      |
| npm     | 10.x                               |
| Docker  | Docker Engine with Compose support |

---

## Setup

```bash
# 1. Clone the project source
git clone https://github.com/fineshii/OsDb-project.git
cd OsDb-project

# 2. Copy and configure environment variables
# Windows PowerShell: Copy-Item .env.example .env
# macOS/Linux/Git Bash: cp .env.example .env
```

Edit `.env` and replace `DB_PASSWORD=change-me` with a local development password before starting MySQL. Compose reads the database name, host port, and password from `.env`.

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<your-mysql-password>
DB_NAME=cloud_simulator
PORT=5000
MAX_FILE_SIZE_MB=10
```

```bash
# 3. Install all workspace dependencies
npm install

# 4. Start MySQL 8 (the database is created by Compose)
docker compose up -d mysql
docker compose ps

# 5. Run Knex migrations (creates the 8 application tables)
npm --prefix master run migrate
```

---

## Running the System

Open **three** terminals:

**Terminal 1 — Master server**

```bash
npm --prefix master start
# → http://localhost:5000
```

**Terminal 2 — Worker node** (after creating a room in the dashboard)

```bash
node worker/src/index.js --room <ROOM_CODE> --name W1 --threads 1 --workload 100000
```

`--workload` adds a repeatable SHA-256 CPU workload to each job (default `0`, disabled). Use the same workload value for every worker when comparing worker counts. For example, start one worker with `--workload 100000`, queue a batch, then repeat the same batch with four workers using the same setting. Worker output includes the extra workload duration. This is a controlled demonstration load; it is not part of the uploaded file's normal processing.

**Terminal 3 — Web dashboard**

```bash
npm --prefix web run dev
# → http://localhost:5173
```

---

## Running Tests

```bash
# All unit + communication + API integration tests (requires MySQL)
node --experimental-vm-modules ./node_modules/jest/bin/jest.js master/tests/ worker/tests/ --runInBand --forceExit

# API integration tests only (requires MySQL)
node --experimental-vm-modules ./node_modules/jest/bin/jest.js master/tests/api.test.js --runInBand --forceExit

# Lint
npx eslint .

# Format check
npx prettier --check .

# Production build (web)
npm --prefix web run build
```

The latest verification outputs and dashboard captures are linked from [`docs/report.md`](docs/report.md#9-screenshots-and-evidence). The project is hosted in a private GitHub repository, so collaborators need repository access before cloning.

---

## API Endpoints

| Method | Endpoint                           | Description                                             |
| ------ | ---------------------------------- | ------------------------------------------------------- |
| GET    | `/health`                          | Health check → `{ status: 'ok' }`                       |
| POST   | `/api/files`                       | Upload text file(s); field name `files`                 |
| GET    | `/api/files`                       | List all files (no content column)                      |
| GET    | `/api/files/:id`                   | File metadata + content                                 |
| GET    | `/api/files/:id/content`           | Raw text content (`text/plain`)                         |
| GET    | `/api/search?q=&mode=`             | Keyword search (`like` / `fulltext` / `index`)          |
| GET    | `/api/benchmark/search?q=`         | Benchmark all 3 search modes                            |
| POST   | `/api/scheduler/simulate`          | Simulate FCFS or SJF; optional `roomCode` saves metrics |
| PATCH  | `/api/rooms/:code/algorithm`       | Change a room's dispatch algorithm                      |
| GET    | `/api/rooms/:code/scheduling-runs` | Saved scheduler metrics for a room                      |
| GET    | `/api/rooms/:code/jobs`            | Jobs in a room                                          |

---

## Architecture Overview

```
Browser (React)  ←──REST + Socket.IO──→  Master (Express + Socket.IO)
                                                │
                                           Knex ORM
                                                │
                                          MySQL 8 (cloud_simulator)
                                                │
Worker Node  ←──Socket.IO events (job:assign/done)──→  Master
   └── ThreadPool (worker_threads)
         └── preprocess.js / indexFile.js tasks
```

Detailed Mermaid diagrams: [`docs/architecture.md`](docs/architecture.md)  
Full report and viva document: [`docs/report.md`](docs/report.md)  
Benchmarking results: [`docs/benchmarks.md`](docs/benchmarks.md)

---

## Project Structure

```
OsDb-project/
├── master/
│   ├── migrations/        # Knex migrations (8 application tables)
│   ├── src/
│   │   ├── config.js
│   │   ├── server.js      # Express + Socket.IO bootstrap
│   │   ├── db/            # Knex instance
│   │   ├── routes/        # files, search, scheduler, jobs
│   │   ├── controllers/   # thin controllers
│   │   ├── services/      # fileService, searchService, indexService, jobService, dispatcher
│   │   ├── scheduler/     # fcfs.js, sjf.js, metrics.js (pure functions)
│   │   └── sockets/       # Socket.IO event handlers
│   └── tests/             # Jest unit and integration test files
├── worker/
│   ├── src/
│   │   ├── index.js       # CLI entrypoint
│   │   ├── workerClient.js
│   │   ├── threadPool.js
│   │   ├── threadTask.js
│   │   └── tasks/         # preprocess.js, indexFile.js
│   └── tests/
├── web/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── socket.js
│   │   └── components/    # RoomPanel, WorkerList, FileUpload, JobQueue, GanttChart, SearchBox, MetricsTable
│   └── vite.config.js
├── shared/
│   ├── events.js
│   ├── constants.js
│   └── index.js
└── docs/
    ├── architecture.md
    ├── benchmarks.md
    ├── benchmark-raw-2026-11-06.json
    └── report.md
```

---

## Environment Variables

| Variable             | Default                 | Description                      |
| -------------------- | ----------------------- | -------------------------------- |
| `PORT`               | `5000`                  | Master server port               |
| `NODE_ENV`           | `development`           | Environment mode                 |
| `DB_HOST`            | `localhost`             | MySQL host                       |
| `DB_PORT`            | `3306`                  | MySQL port                       |
| `DB_USER`            | `root`                  | MySQL user                       |
| `DB_PASSWORD`        | —                       | MySQL password (**required**)    |
| `DB_NAME`            | `cloud_simulator`       | Database name                    |
| `MAX_FILE_SIZE_MB`   | `10`                    | Maximum upload size              |
| `MAX_SOCKET_PAYLOAD` | `1048576`               | Socket payload threshold (bytes) |
| `MASTER_URL`         | `http://localhost:5000` | Master URL for workers           |
