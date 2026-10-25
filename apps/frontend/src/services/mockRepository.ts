type Listener<T> = (items: T[]) => void;

export interface Repository<T extends { id: string }> {
  list(): T[];
  get(id: string): T | undefined;
  create(input: Omit<T, 'id'> & { id?: string }): T | Promise<T>;
  update(id: string, patch: Partial<T>): T | undefined | Promise<T | undefined>;
  remove(id: string): boolean | Promise<boolean>;
  subscribe(listener: Listener<T>): () => void;
}

export function createMockRepository<T extends { id: string }>(key: string, seed: T[]): Repository<T> {
  let items = [...seed];
  const listeners = new Set<Listener<T>>();
  const notify = () => listeners.forEach((listener) => listener([...items]));
  const commit = (next: T[]) => {
    items = next;
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
