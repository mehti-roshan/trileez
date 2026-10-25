import type { User } from '../types/index.ts';

export type ApiUser = User & { permissions?: string[] };
export type ApiResponse<T> = { data: T; page?: { limit: number; hasMore: boolean; nextCursor?: string } };

const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_BASE = (runtimeEnv?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'trileez-api-token';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly issues?: { message?: string }[];

  constructor(message: string, status: number, code?: string, issues?: { message?: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const execute = async () => {
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store', credentials: 'include' });
  };
  let response = await execute();
  if (response.status === 401 && !path.startsWith('/auth/') && localStorage.getItem(TOKEN_KEY)) {
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', cache: 'no-store' });
    if (refreshed.ok) {
      const payload = await refreshed.json() as { token: string };
      localStorage.setItem(TOKEN_KEY, payload.token);
      response = await execute();
    } else localStorage.removeItem(TOKEN_KEY);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string; issues?: { message?: string }[] };
  if (!response.ok) {
    const issues = Array.isArray(payload.issues) ? payload.issues : undefined;
    const detail = issues?.map((issue) => issue.message).filter(Boolean).join(' ');
    throw new ApiError(detail || payload.error || `API request failed (${response.status})`, response.status, payload.code, issues);
  }
  return payload as T;
}

async function download(path: string): Promise<{ blob: Blob; filename?: string }> {
  const headers = new Headers();
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { headers, cache: 'no-store', credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error || `API request failed (${response.status})`, response.status, payload.code);
  }
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return { blob: await response.blob(), filename: encoded ? decodeURIComponent(encoded) : undefined };
}

async function listAll<T>(resource: string): Promise<ApiResponse<T[]>> {
  const data: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ limit: '200' });
    if (cursor) query.set('cursor', cursor);
    const result = await request<ApiResponse<T[]>>(`/${resource}?${query.toString()}`);
    data.push(...result.data);
    if (!result.page?.hasMore || !result.page.nextCursor) return { data };
    cursor = result.page.nextCursor;
  }
  throw new Error(`Pagination limit exceeded while loading ${resource}`);
}

export const apiClient = {
  health: () => request<{ ok: boolean; service: string }>('/health'),
  login: async (email: string, password: string) => {
    const result = await request<{ token: string; user: ApiUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(TOKEN_KEY, result.token);
    return result;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const result = await request<{ token: string; user: ApiUser }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    localStorage.setItem(TOKEN_KEY, result.token);
    return result;
  },
  logout: async () => {
    try { await request<void>('/auth/logout', { method: 'POST' }); } finally { localStorage.removeItem(TOKEN_KEY); }
  },
  me: () => request<{ user: ApiUser }>('/auth/me'),
  list: <T>(resource: string) => listAll<T>(resource),
  get: <T>(resource: string, id: string) => request<ApiResponse<T>>(`/${resource}/${id}`),
  create: <T>(resource: string, input: unknown) => request<ApiResponse<T>>(`/${resource}`, { method: 'POST', body: JSON.stringify(input) }),
  bulkCreate: <T>(resource: string, input: unknown[]) => request<ApiResponse<T[]>>(`/${resource}/bulk`, { method: 'POST', body: JSON.stringify({ items: input }) }),
  update: <T>(resource: string, id: string, patch: unknown) => request<ApiResponse<T>>(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  reviewTimesheet: <T>(id: string, input: unknown) => request<ApiResponse<T>>(`/data/timesheets/${id}/review`, { method: 'PATCH', body: JSON.stringify(input) }),
  reviewAttendance: <T>(id: string, input: unknown) => request<ApiResponse<T>>(`/data/attendance/${id}/review`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (resource: string, id: string) => request<void>(`/${resource}/${id}`, { method: 'DELETE' }),
  createPerformanceAdjustment: <TEvent, TPeriod>(input: unknown) => request<{ data: TEvent; period: TPeriod }>('/performance/events', { method: 'POST', body: JSON.stringify(input) }),
  finalizePerformancePeriod: <TPeriod>(input: unknown) => request<ApiResponse<TPeriod>>('/performance/periods/finalize', { method: 'POST', body: JSON.stringify(input) }),
  reopenPerformancePeriod: <TPeriod>(periodId: string, reason: string) => request<ApiResponse<TPeriod>>(`/performance/periods/${periodId}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) }),
  resetPassword: (userId: string) => request<ApiResponse<{ user: ApiUser; generatedPassword: string; oneTime: boolean }>>(`/users/${userId}/password-reset`, { method: 'POST', body: JSON.stringify({}) }),
  uploadFile: <T>(file: File, metadata: Record<string, unknown> = {}) => {
    const form = new FormData();
    form.set('file', file);
    Object.entries(metadata).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
    return request<ApiResponse<T>>('/files', { method: 'POST', body: form });
  },
  downloadFile: (fileId: string, inline = false) => download(`/files/${fileId}/content?disposition=${inline ? 'inline' : 'attachment'}`),
};

export function hasApiToken() { return typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(TOKEN_KEY)); }

export function requiresPasswordChange(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'PASSWORD_CHANGE_REQUIRED';
}

export function userMustChangePassword(user: { mustChangePassword?: boolean } | null | undefined): boolean {
  return Boolean(user?.mustChangePassword);
}
