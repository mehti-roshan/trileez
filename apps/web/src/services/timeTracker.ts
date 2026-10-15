export interface ActiveTimer {
  taskId: string;
  employeeId: string;
  startedAt: string;
}

let active: ActiveTimer | null = null;
const listeners = new Set<(timer: ActiveTimer | null) => void>();

function load() {
  return active;
}

function publish(next: ActiveTimer | null) {
  active = next;
  listeners.forEach((listener) => listener(active));
}

export const timeTracker = {
  current: () => load(),
  start: (taskId: string, employeeId = 'u1') => {
    const next = { taskId, employeeId, startedAt: new Date().toISOString() };
    publish(next);
    return next;
  },
  stop: () => {
    const previous = load();
    publish(null);
    return previous;
  },
  subscribe: (listener: (timer: ActiveTimer | null) => void) => {
    listeners.add(listener);
    listener(load());
    return () => listeners.delete(listener);
  },
};
