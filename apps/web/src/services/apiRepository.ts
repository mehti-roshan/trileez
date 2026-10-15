import type { Repository } from './mockRepository.ts';
import { ApiError, apiClient, hasApiToken } from './apiClient.ts';
import { reportApiFailure } from './apiEvents.ts';

type Entity = { id: string };

interface ApiRepositoryOptions<T extends Entity> {
  resource: string;
  /** Transitional array cache for legacy read-only consumers. Starts empty. */
  cache?: T[];
  fromApi?: (value: Record<string, unknown>, previous?: T) => T;
  toApi?: (value: Partial<T>) => unknown;
}

const repositories = new Set<ApiRepository<Entity>>();

function recordFromApi<T extends Entity>(value: unknown, options: ApiRepositoryOptions<T>, previous?: T): T {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return options.fromApi ? options.fromApi(row, previous) : ({ ...previous, ...row } as T);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * API-backed client cache. MongoDB is authoritative: the cache starts empty,
 * hydration never seeds the server, and mutations are committed only after the
 * server confirms them.
 */
export class ApiRepository<T extends Entity> implements Repository<T> {
  private items: T[] = [];
  private readonly listeners = new Set<(items: T[]) => void>();
  private hydrated = false;
  private readonly options: ApiRepositoryOptions<T>;

  constructor(options: ApiRepositoryOptions<T>) {
    this.options = options;
    options.cache?.splice(0, options.cache.length);
    repositories.add(this as unknown as ApiRepository<Entity>);
  }

  list(): T[] { return [...this.items]; }

  get(id: string): T | undefined { return this.items.find((item) => item.id === id); }

  /** Adopt an entity that has already been confirmed by a specialized API call. */
  adopt(item: T): T {
    const existing = this.get(item.id);
    if (existing) this.replace(item.id, item);
    else this.commit([item, ...this.items]);
    return item;
  }

  async create(input: Omit<T, 'id'> & { id?: string }): Promise<T> {
    this.requireSession();
    try {
      const response = await apiClient.create<Record<string, unknown>>(
        this.options.resource,
        this.options.toApi?.(input as Partial<T>) ?? input,
      );
      const item = recordFromApi(response.data, this.options);
      this.commit([item, ...this.items.filter((current) => current.id !== item.id)]);
      return item;
    } catch (error) {
      this.reportMutationFailure('create', error);
      throw error;
    }
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    this.requireSession();
    const existing = this.get(id);
    if (!existing) {
      const error = new Error('رکورد موردنظر در داده‌های تاییدشده سرور پیدا نشد.');
      this.reportMutationFailure('update', error);
      throw error;
    }
    try {
      const response = await apiClient.update<Record<string, unknown>>(
        this.options.resource,
        id,
        this.options.toApi?.(patch) ?? patch,
      );
      const updated = recordFromApi(response.data, this.options, existing);
      this.replace(id, updated);
      return updated;
    } catch (error) {
      this.reportMutationFailure('update', error);
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    this.requireSession();
    if (!this.get(id)) {
      const error = new Error('رکورد موردنظر در داده‌های تاییدشده سرور پیدا نشد.');
      this.reportMutationFailure('delete', error);
      throw error;
    }
    try {
      await apiClient.remove(this.options.resource, id);
      this.commit(this.items.filter((item) => item.id !== id));
      return true;
    } catch (error) {
      this.reportMutationFailure('delete', error);
      throw error;
    }
  }

  subscribe(listener: (items: T[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.requireSession();
    try {
      const response = await apiClient.list<Record<string, unknown>>(this.options.resource);
      this.commit(response.data.map((row) => recordFromApi(row, this.options)));
      this.hydrated = true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        this.commit([]);
        this.hydrated = true;
        return;
      }
      this.clear();
      throw error;
    }
  }

  reset(): void {
    this.hydrated = false;
    this.clear();
  }

  private requireSession() {
    if (!hasApiToken()) throw new ApiError('برای دسترسی به داده‌ها باید وارد سامانه شوید.', 401, 'AUTH_REQUIRED');
  }

  private reportMutationFailure(operation: string, error: unknown) {
    reportApiFailure({
      message: errorMessage(error, 'ذخیره اطلاعات در سرور ناموفق بود.'),
      operation,
      resource: this.options.resource,
    });
  }

  private replace(id: string, item: T): void {
    this.commit(this.items.map((current) => (current.id === id ? item : current)));
  }

  private clear(): void { this.commit([]); }

  private commit(items: T[]): void {
    this.items = items;
    this.options.cache?.splice(0, this.options.cache.length, ...items);
    this.listeners.forEach((listener) => listener([...items]));
  }
}

export async function hydrateApiRepositories(): Promise<void> {
  await Promise.all([...repositories].map((repository) => repository.hydrate()));
}

export function resetApiRepositoryHydration(): void {
  repositories.forEach((repository) => repository.reset());
}
