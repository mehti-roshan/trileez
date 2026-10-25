const startedAt = new Date();
let ready = false;
let shuttingDown = false;

export const runtimeState = {
  startedAt,
  markReady(): void { ready = true; shuttingDown = false; },
  markNotReady(): void { ready = false; },
  markShuttingDown(): void { ready = false; shuttingDown = true; },
  isReady(): boolean { return ready && !shuttingDown; },
  isShuttingDown(): boolean { return shuttingDown; },
};
