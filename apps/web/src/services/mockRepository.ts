type Listener<T> = (items: T[]) => void;

const memory = new Map<string, unknown[]>();

function readStored<T>(key: string, seed: T[]): T[] {
  if (memory.has(key)) return memory.get(key) as T[];
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(`trileez-${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          seed.splice(0, seed.length, ...parsed);
          memory.set(key, parsed);
          return parsed as T[];
        }
      }
    } catch {
      // Storage is optional in the prototype.
    }
  }
  const initial = [...seed];
  memory.set(key, initial);
  return initial;
}

function persist<T>(key: string, items: T[]) {
  memory.set(key, items);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`trileez-${key}`, JSON.stringify(items));
    } catch {
      // Storage quotas/private browsing must not break the UI.
    }
  }
}

export interface Repository<T extends { id: string }> {
  list(): T[];
  get(id: string): T | undefined;
  create(input: Omit<T, 'id'> & { id?: string }): T;
  update(id: string, patch: Partial<T>): T | undefined;
  remove(id: string): boolean;
  subscribe(listener: Listener<T>): () => void;
}

export function createMockRepository<T extends { id: string }>(key: string, seed: T[]): Repository<T> {
  let items = readStored(key, seed);
  const listeners = new Set<Listener<T>>();
  const notify = () => listeners.forEach((listener) => listener([...items]));
  const commit = (next: T[]) => {
    items = next;
    // Keep legacy consumers of the exported mock arrays coherent during migration.
    seed.splice(0, seed.length, ...next);
    persist(key, items);
    notify();
  };
  return {
    list: () => [...items],
    get: (id) => items.find((item) => item.id === id),
    create: (input) => {
      const item = { ...input, id: input.id ?? `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } as T;
      commit([item, ...items]);
      return item;
    },
    update: (id, patch) => {
      const existing = items.find((item) => item.id === id);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch, id };
      commit(items.map((item) => (item.id === id ? updated : item)));
      return updated;
    },
    remove: (id) => {
      const next = items.filter((item) => item.id !== id);
      if (next.length === items.length) return false;
      commit(next);
      return true;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
