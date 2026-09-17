import type { PerformancePointEvent, PerformancePointReason, PerformancePeriod } from '../types/index.ts';
import type { Repository } from './mockRepository.ts';
import { buildPerformancePeriod, monthKey } from '../utils/performance.ts';

export interface PerformanceRepositories {
  events: Repository<PerformancePointEvent>;
  periods: Repository<PerformancePeriod>;
}

export function isFinalizedPerformanceMonth(employeeId: string, date: string, periods: PerformancePeriod[]) {
  const key = monthKey(date);
  return periods.some((period) => period.employeeId === employeeId && period.status !== 'open' && monthKey(period.startedAt) === key);
}

export function createPerformanceAdjustment(input: {
  employeeId: string;
  reason: PerformancePointReason;
  points?: number;
  date: string;
  description?: string;
  projectId?: string;
  taskId?: string;
  createdBy: string;
}, repositories: PerformanceRepositories) {
  if (!input.employeeId || !input.createdBy || !input.date) throw new Error('کارمند، تاریخ و ثبت‌کننده الزامی هستند.');
  if (isFinalizedPerformanceMonth(input.employeeId, input.date, repositories.periods.list())) throw new Error('این ماه نهایی شده است و رویداد جدیدی نمی‌توان به آن افزود.');
  const magnitude = Math.abs(Number(input.points ?? input.reason.defaultPoints));
  if (!Number.isFinite(magnitude) || magnitude <= 0 || magnitude > 100) throw new Error('مقدار تغییر امتیاز باید بین ۱ تا ۱۰۰ باشد.');
  const description = input.description?.trim() || input.reason.title;
  if (input.reason.id.includes('custom') && !input.description?.trim()) throw new Error('برای دلیل سفارشی، نوشتن توضیح الزامی است.');
  return repositories.events.create({
    employeeId: input.employeeId,
    reasonId: input.reason.id,
    points: input.reason.direction === 'negative' ? -magnitude : magnitude,
    date: input.date,
    description,
    projectId: input.projectId || undefined,
    taskId: input.taskId || undefined,
    createdBy: input.createdBy,
  });
}

export function finalizePerformanceMonth(input: {
  employeeId: string;
  period: string;
  evaluatedBy: string;
  notes?: string;
}, repositories: PerformanceRepositories) {
  if (!input.employeeId || !input.period || !input.evaluatedBy) throw new Error('کارمند، ماه و ارزیاب الزامی هستند.');
  if (isFinalizedPerformanceMonth(input.employeeId, input.period, repositories.periods.list())) throw new Error('ارزیابی این ماه قبلاً نهایی شده است.');
  const snapshot = buildPerformancePeriod(input.employeeId, repositories.events.list(), repositories.periods.list(), input.period, input.evaluatedBy, input.notes);
  return repositories.periods.create(snapshot);
}
