export interface ActiveTimer {
  taskId: string;
  employeeId: string;
  startedAt: string;
}

const storageKey = 'trileez-active-timer';
let active: ActiveTimer | null = null;
const listeners = new Set<(timer: ActiveTimer | null) => void>();

function load() {
  if (active || typeof window === 'undefined') return active;
  try {
    const value = window.localStorage.getItem(storageKey);
    active = value ? JSON.parse(value) as ActiveTimer : null;
  } catch {
    active = null;
  }
  return active;
}

function publish(next: ActiveTimer | null) {
  active = next;
  if (typeof window !== 'undefined') {
    try {
      if (next) window.localStorage.setItem(storageKey, JSON.stringify(next));
      else window.localStorage.removeItem(storageKey);
    } catch { /* local persistence is optional */ }
  }
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
