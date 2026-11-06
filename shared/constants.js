export const ALGORITHMS = Object.freeze({
  FCFS: 'FCFS',
  SJF: 'SJF',
});

export const JOB_TYPES = Object.freeze({
  INDEX: 'index',
  PREPROCESS: 'preprocess',
});

export const JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
});

export const JOB_RUN_OUTCOME = Object.freeze({
  DONE: 'done',
  FAILED: 'failed',
  REQUEUED: 'requeued',
});

export const WORKER_STATUS = Object.freeze({
  IDLE: 'idle',
  BUSY: 'busy',
  OFFLINE: 'offline',
});

export const SEARCH_MODES = Object.freeze({
  LIKE: 'like',
  FULLTEXT: 'fulltext',
  INDEX: 'index',
});

export const MAX_JOB_ATTEMPTS = 3;
export const DEFAULT_SOCKET_PAYLOAD_LIMIT = 1048576; // 1 MB
