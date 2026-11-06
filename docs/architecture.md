# Architecture — Distributed Cloud Resource Simulator

## Component Overview

```mermaid
flowchart TD
    Browser["🌐 Web Browser\n(React + Vite :5173)"]
    Master["🖥️ Master Server\n(Express + Socket.IO :5000)"]
    Worker["⚙️ Worker Node\n(Socket.IO client + ThreadPool)"]
    MySQL["🗄️ MySQL 8\n(cloud_simulator)"]
    Shared["📦 shared/\n(events, constants)"]

    Browser -->|"REST /api/*"| Master
    Browser -->|"Socket.IO events"| Master
    Worker -->|"Socket.IO events\n(join, job:done, job:failed)"| Master
    Master -->|"Knex queries"| MySQL
    Master -->|"job:assign"| Worker
    Master -.->|"import"| Shared
    Worker -.->|"import"| Shared
```

Browser clients emit the shared `room:subscribe` event after entering or creating a room. The master joins the Socket.IO room and sends the current workers, job queue, and Gantt snapshot before subsequent live updates.

## Internal Master Subsystems

```mermaid
flowchart LR
    Req["HTTP Request\nor Socket Event"]

    subgraph Master ["Master (src/)"]
        Router["Express Router\n(files / search / scheduler / rooms)"]
        SockH["Socket Handlers\n(sockets/handlers.js)"]

        subgraph Services ["Services"]
            RM["RoomManager\n(in-memory)"]
            FS["FileService\n(save, hash, dedup)"]
            SS["SearchService\n(LIKE / FULLTEXT / Index)"]
            IS["IndexService\n(term postings batch)"]
            JS["JobService\n(create, queue view, Gantt)"]
            Disp["Dispatcher\n(SELECT…FOR UPDATE)"]
        end

        subgraph Scheduler ["Pure Scheduler (no DB)"]
            FCFS["fcfs.js"]
            SJF["sjf.js"]
            Metrics["metrics.js"]
        end

        DB["Knex / MySQL2\n(db/index.js)"]
    end

    Req --> Router
    Req --> SockH
    Router --> FS
    Router --> SS
    Router --> IS
    Router --> JS
    Router --> Scheduler
    SockH --> RM
    SockH --> JS
    SockH --> Disp
    SockH --> IS
    FS --> DB
    SS --> DB
    IS --> DB
    JS --> DB
    Disp --> DB
    FCFS --> Metrics
    SJF --> Metrics
```

## Worker Internals

```mermaid
flowchart TD
    WC["workerClient.js\n(Socket.IO client)"]
    TP["ThreadPool\n(worker_threads)"]
    TT["threadTask.js\n(thread worker script)"]

    subgraph Tasks ["tasks/"]
        PP["preprocess.js\n(normalise fields)"]
        IX["indexFile.js\n(TF tokenizer)"]
    end

    WC -->|"submit(payload)"| TP
    TP -->|"new Worker(threadTask)"| TT
    TT -->|"import"| PP
    TT -->|"import"| IX
    TT -->|"parentPort.postMessage"| TP
    TP -->|"resolve promise"| WC
    WC -->|"job:done / job:failed"| Master["Master Socket"]
```

## Database Schema

```mermaid
erDiagram
    files {
        int id PK
        varchar name
        varchar mime_type
        int size_bytes
        char content_hash
        longtext content
        datetime uploaded_at
    }
    rooms {
        int id PK
        varchar code
        enum algorithm
        datetime created_at
    }
    workers {
        int id PK
        int room_id FK
        varchar name
        varchar socket_id
        varchar status
        timestamp last_seen
    }
    jobs {
        int id PK
        int file_id FK
        int room_id FK
        varchar type
        varchar status
        int burst_estimate
        int attempts
        bigint arrival_time
        bigint started_at
        bigint finished_at
    }
    job_runs {
        int id PK
        int job_id FK
        int worker_id FK
        varchar outcome
        bigint started_at
        bigint ended_at
        text error
    }
    index_terms {
        int id PK
        varchar term
    }
    postings {
        int term_id PK, FK
        int file_id PK, FK
        int tf
    }
    scheduling_runs {
        int id PK
        int room_id FK
        varchar algorithm
        double avg_waiting
        double avg_turnaround
        int job_count
        datetime created_at
    }

    rooms ||--o{ workers : "has"
    rooms ||--o{ jobs : "has"
    files ||--o{ jobs : "processed by"
    jobs ||--o{ job_runs : "tracked by"
    workers ||--o{ job_runs : "executes"
    index_terms ||--o{ postings : "appears in"
    files ||--o{ postings : "indexed in"
    rooms ||--o{ scheduling_runs : "records"
```

## Request Flow: File Upload → Index Job

```mermaid
sequenceDiagram
    participant B as Browser
    participant M as Master API
    participant FS as FileService
    participant DB as MySQL
    participant S as Socket.IO
    participant W as Worker

    B->>M: POST /api/files (multipart)
    M->>FS: saveFile(buffer)
    FS->>DB: SELECT content_hash (dedup check)
    DB-->>FS: not found
    FS->>DB: INSERT INTO files
    DB-->>FS: fileId
    FS-->>M: { id, name, size_bytes, … }
    M-->>B: 201 { files: […] }

    B->>M: POST /api/rooms/:code/jobs (selected file IDs and type)
    M->>DB: INSERT queued jobs
    Note over M,W: Worker is in the same room
    M->>DB: Claim queued job in transaction
    M->>S: job:assign → Worker
    W->>W: ThreadPool.submit(task)
    W->>S: job:done { jobId, result }
    S->>M: handlers.js job:done
    M->>DB: UPDATE jobs SET status=done
    M->>DB: IndexService.saveIndexTermsAndPostings()
    M->>S: queue:update and gantt:update → Browser
```
