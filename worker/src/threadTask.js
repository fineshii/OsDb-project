import { parentPort } from 'worker_threads';
import { preprocessData } from './tasks/preprocess.js';
import { indexFile } from './tasks/indexFile.js';
import { createHash } from 'crypto';

if (parentPort) {
  parentPort.on('message', async (task) => {
    const { id, taskType, content, workerName, workloadRounds = 0 } = task;

    try {
      let result;
      if (taskType === 'preprocess') {
        result = preprocessData(content, workerName);
      } else if (taskType === 'index') {
        result = indexFile(content);
      } else {
        throw new Error(`Unsupported task type: ${taskType}`);
      }

      const workloadStart = performance.now();
      let digest = String(content || '');
      for (let round = 0; round < workloadRounds; round++) {
        digest = createHash('sha256').update(digest).digest('hex');
      }
      if (workloadRounds > 0) {
        result.workload = { rounds: workloadRounds, elapsedMs: performance.now() - workloadStart };
      }

      parentPort.postMessage({ id, success: true, result });
    } catch (err) {
      parentPort.postMessage({ id, success: false, error: err.message });
    }
  });
}
