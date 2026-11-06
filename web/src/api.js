const BASE_URL = '';

async function handleResponse(res) {
  if (!res.ok) {
    let errMsg = `Request failed: HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) errMsg = data.error;
    } catch {
      // ignore
    }
    const err = new Error(errMsg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  // Files
  async listFiles() {
    const res = await fetch(`${BASE_URL}/api/files`);
    return handleResponse(res);
  },

  async uploadFiles(fileList) {
    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      formData.append('files', fileList[i]);
    }
    const res = await fetch(`${BASE_URL}/api/files`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse(res);
  },

  async getFileContent(fileId) {
    const res = await fetch(`${BASE_URL}/api/files/${fileId}/content`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },

  // Jobs
  async setRoomAlgorithm(roomCode, algorithm) {
    const res = await fetch(`${BASE_URL}/api/rooms/${roomCode}/algorithm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm }),
    });
    return handleResponse(res);
  },

  async createJobs(roomCode, { fileIds, type }) {
    const res = await fetch(`${BASE_URL}/api/rooms/${roomCode}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds, type }),
    });
    return handleResponse(res);
  },

  async listJobs(roomCode) {
    const res = await fetch(`${BASE_URL}/api/rooms/${roomCode}/jobs`);
    return handleResponse(res);
  },

  async listSchedulingRuns(roomCode) {
    const res = await fetch(`${BASE_URL}/api/rooms/${roomCode}/scheduling-runs`);
    return handleResponse(res);
  },

  // Search
  async search(query, mode = 'like') {
    const params = new URLSearchParams({ q: query, mode });
    const res = await fetch(`${BASE_URL}/api/search?${params.toString()}`);
    return handleResponse(res);
  },

  async benchmark(query) {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`${BASE_URL}/api/benchmark/search?${params.toString()}`);
    return handleResponse(res);
  },

  // Scheduler Simulator
  async simulateScheduler(algorithm, jobs, roomCode) {
    const res = await fetch(`${BASE_URL}/api/scheduler/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm, jobs, ...(roomCode ? { roomCode } : {}) }),
    });
    return handleResponse(res);
  },
};
