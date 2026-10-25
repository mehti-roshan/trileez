import type { PerformancePointEvent, PerformancePeriod } from '../types/index.ts';
import type { Repository } from './mockRepository.ts';
import { buildPerformancePeriod, monthKey } from '../utils/performance.ts';
import { apiClient, hasApiToken } from './apiClient.ts';

type AdoptableRepository<T extends { id: string }> = Repository<T> & { adopt?: (item: T) => T };

export interface PerformanceRepositories {
  events: AdoptableRepository<PerformancePointEvent>;
  periods: AdoptableRepository<PerformancePeriod>;
}

export function isFinalizedPerformanceMonth(employeeId: string, date: string, periods: PerformancePeriod[]) {
  const key = monthKey(date);
  return periods.some((period) => period.employeeId === employeeId && period.status !== 'open' && monthKey(period.startedAt) === key);
}

export async function createPerformanceAdjustment(input: {
  employeeId: string;
  reason: string;
  category?: string;
  points: number;
  date: string;
  description?: string;
  projectId?: string;
  taskId?: string;
  createdBy?: string;
}, repositories: PerformanceRepositories) {
  if (!input.employeeId || !input.date) throw new Error('کارمند و تاریخ الزامی هستند.');
  if (!input.reason?.trim()) throw new Error('نوشتن دلیل تغییر امتیاز الزامی است.');
  if (isFinalizedPerformanceMonth(input.employeeId, input.date, repositories.periods.list())) throw new Error('این ماه نهایی شده است و رویداد جدیدی نمی‌توان به آن افزود.');
  const magnitude = Math.abs(Number(input.points));
  if (!Number.isInteger(magnitude) || magnitude <= 0 || magnitude > 100) throw new Error('مقدار تغییر امتیاز باید یک عدد صحیح بین ۱ تا ۱۰۰ باشد.');
  const description = input.description?.trim() || input.reason.trim();
  if (hasApiToken()) {
    return apiClient.createPerformanceAdjustment<PerformancePointEvent, PerformancePeriod>({
      employeeId: input.employeeId, reason: input.reason.trim(), category: input.category?.trim() || 'عمومی',
      points: input.points, date: input.date, description, projectId: input.projectId, taskId: input.taskId,
    }).then(({ data, period }) => {
      repositories.events.adopt?.(data);
      repositories.periods.adopt?.(period);
      return data;
    });
  }
  const createdAt = new Date().toISOString();
  return repositories.events.create({
    employeeId: input.employeeId,
    reason: input.reason.trim(),
    points: Number(input.points) < 0 ? -magnitude : magnitude,
    date: input.date,
    description,
    projectId: input.projectId || undefined,
    taskId: input.taskId || undefined,
    category: input.category?.trim() || 'عمومی',
    createdBy: input.createdBy || 'local-user',
    createdAt,
  });
}

export async function finalizePerformanceMonth(input: {
  employeeId: string;
  period: string;
  evaluatedBy?: string;
  notes?: string;
}, repositories: PerformanceRepositories) {
  if (!input.employeeId || !input.period) throw new Error('کارمند و ماه الزامی هستند.');
  if (isFinalizedPerformanceMonth(input.employeeId, input.period, repositories.periods.list())) throw new Error('ارزیابی این ماه قبلاً نهایی شده است.');
  if (hasApiToken()) {
    return apiClient.finalizePerformancePeriod<PerformancePeriod>({ employeeId: input.employeeId, period: input.period, notes: input.notes })
      .then(({ data }) => { repositories.periods.adopt?.(data); return data; });
  }
  const snapshot = buildPerformancePeriod(input.employeeId, repositories.events.list(), repositories.periods.list(), input.period, input.evaluatedBy || 'local-user', input.notes);
  return repositories.periods.create(snapshot);
}

export async function reopenPerformanceMonth(periodId: string, reason: string, repositories: PerformanceRepositories) {
  if (!reason.trim()) throw new Error('دلیل بازگشایی دوره الزامی است.');
  const period = repositories.periods.get(periodId);
  if (!period || period.status !== 'finalized') throw new Error('فقط دوره نهایی‌شده قابل بازگشایی است.');
  if (hasApiToken()) {
    return apiClient.reopenPerformancePeriod<PerformancePeriod>(periodId, reason.trim())
      .then(({ data }) => { repositories.periods.adopt?.(data); return data; });
  }
  return repositories.periods.update(periodId, { status: 'open', finalizedAt: null, reopenReason: reason.trim(), reopenedAt: new Date().toISOString() });
}
