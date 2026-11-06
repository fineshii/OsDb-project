import { parentPort } from 'worker_threads';
import { preprocessData } from './tasks/preprocess.js';
import { indexFile } from './tasks/indexFile.js';

if (parentPort) {
  parentPort.on('message', async (task) => {
    const { id, taskType, content, workerName } = task;

    try {
      let result;
      if (taskType === 'preprocess') {
        result = preprocessData(content, workerName);
      } else if (taskType === 'index') {
        result = indexFile(content);
      } else {
        throw new Error(`Unsupported task type: ${taskType}`);
      }

      parentPort.postMessage({ id, success: true, result });
    } catch (err) {
      parentPort.postMessage({ id, success: false, error: err.message });
    }
  });
}
