import type { PerformancePointEvent, PerformancePeriod } from '../types/index.ts';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';

dayjs.extend(jalaliday);

export const DEFAULT_PERFORMANCE_SCORE = 70;

export function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function gradeForScore(score: number): PerformancePeriod['grade'] {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export function monthKey(value: string | Date) {
  const date = dayjs(value).calendar('jalali');
  return date.isValid() ? date.format('YYYY-MM') : '';
}

export function monthRange(value: string | Date) {
  const jalali = dayjs(value).calendar('jalali');
  return {
    startedAt: jalali.startOf('month').calendar('gregory').format('YYYY-MM-DD'),
    endedAt: jalali.endOf('month').calendar('gregory').format('YYYY-MM-DD'),
  };
}

export function performanceMonthTitle(value: string | Date) {
  const date = dayjs(value);
  return date.isValid() ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', year: 'numeric' }).format(date.toDate()) : 'دوره نامعتبر';
}

export function eventsForMonth(employeeId: string, events: PerformancePointEvent[], period: string | Date) {
  const key = monthKey(period);
  return events.filter((event) => event.employeeId === employeeId && monthKey(event.date) === key);
}

export function finalizedPeriods(employeeId: string, periods: PerformancePeriod[]) {
  return periods
    .filter((period) => period.employeeId === employeeId && period.status !== 'open')
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
}

export function baselineForMonth(employeeId: string, periods: PerformancePeriod[], period: string | Date, fallback = DEFAULT_PERFORMANCE_SCORE) {
  const monthStart = new Date(monthRange(period).startedAt).getTime();
  const latestPrevious = finalizedPeriods(employeeId, periods).find((item) => new Date(item.endedAt).getTime() < monthStart);
  return clampScore(latestPrevious?.score ?? fallback);
}

export function monthScore(employeeId: string, events: PerformancePointEvent[], periods: PerformancePeriod[] = [], period: string | Date = new Date(), fallback = DEFAULT_PERFORMANCE_SCORE) {
  const baseline = baselineForMonth(employeeId, periods, period, fallback);
  const adjustmentTotal = eventsForMonth(employeeId, events, period).reduce((sum, event) => sum + event.points, 0);
  return clampScore(baseline + adjustmentTotal);
}

export function scoreSummary(employeeId: string, events: PerformancePointEvent[], periods: PerformancePeriod[] = [], period: string | Date = new Date()) {
  const monthEvents = eventsForMonth(employeeId, events, period);
  const baseline = baselineForMonth(employeeId, periods, period);
  const delta = monthEvents.reduce((sum, event) => sum + event.points, 0);
  const score = clampScore(baseline + delta);
  const history = finalizedPeriods(employeeId, periods);
  return {
    score,
    baseline,
    grade: gradeForScore(score),
    delta,
    positive: monthEvents.filter((event) => event.points > 0).length,
    negative: monthEvents.filter((event) => event.points < 0).length,
    eventCount: monthEvents.length,
    previousScore: history[0]?.score,
    monthEvents,
  };
}

export function buildPerformancePeriod(employeeId: string, events: PerformancePointEvent[], periods: PerformancePeriod[], period: string | Date, evaluatedBy: string, notes = ''): Omit<PerformancePeriod, 'id'> {
  const range = monthRange(period);
  const summary = scoreSummary(employeeId, events, periods, period);
  const previous = finalizedPeriods(employeeId, periods).find((item) => new Date(item.endedAt).getTime() < new Date(range.startedAt).getTime());
  return {
    employeeId,
    title: performanceMonthTitle(period),
    score: summary.score,
    baselineScore: summary.baseline,
    adjustmentTotal: summary.delta,
    eventIds: summary.monthEvents.map((event) => event.id),
    grade: summary.grade,
    trend: previous ? summary.score > previous.score ? 'up' : summary.score < previous.score ? 'down' : 'flat' : 'flat',
    status: 'finalized',
    evaluatedBy,
    notes,
    startedAt: range.startedAt,
    endedAt: range.endedAt,
    finalizedAt: new Date().toISOString(),
  };
}
