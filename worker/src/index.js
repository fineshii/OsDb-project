import os from 'os';
import { parseArgs } from 'util';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorkerClient } from './workerClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const options = {
  master: {
    type: 'string',
    short: 'm',
    default: process.env.MASTER_URL || 'http://localhost:5000',
  },
  room: {
    type: 'string',
    short: 'r',
  },
  name: {
    type: 'string',
    short: 'n',
  },
  threads: {
    type: 'string',
    short: 't',
    default: String(Math.max(1, (os.cpus()?.length || 2) - 1)),
  },
};

let values;
try {
  const parsed = parseArgs({ options, allowPositionals: false });
  values = parsed.values;
} catch (err) {
  console.error(`Invalid arguments: ${err.message}`);
  process.exit(1);
}

if (!values.room) {
  console.error('Error: --room is required (e.g. --room ABC123)');
  process.exit(1);
}

if (!values.name) {
  console.error('Error: --name is required (e.g. --name W1)');
  process.exit(1);
}

const client = new WorkerClient({
  masterUrl: values.master,
  roomCode: values.room.toUpperCase(),
  workerName: values.name,
  threads: parseInt(values.threads, 10) || 1,
});

client.connect();

// Handle graceful shutdown
const shutdown = () => {
  console.log('\nShutting down worker...');
  client.disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
