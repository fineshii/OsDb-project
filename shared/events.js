export const EVENTS = Object.freeze({
  // Room events
  ROOM_CREATE: 'room:create',
  ROOM_CREATED: 'room:created',
  ROOM_SUBSCRIBE: 'room:subscribe',

  // Worker events
  WORKER_JOIN: 'worker:join',
  WORKER_JOINED: 'worker:joined',
  WORKER_LIST: 'worker:list',

  // Job lifecycle events
  JOB_ASSIGN: 'job:assign',
  JOB_STARTED: 'job:started',
  JOB_DONE: 'job:done',
  JOB_FAILED: 'job:failed',

  // Real-time UI updates
  QUEUE_UPDATE: 'queue:update',
  GANTT_UPDATE: 'gantt:update',
  METRICS_UPDATE: 'metrics:update',

  // Generic errors
  ERROR_MESSAGE: 'error:message',
});
