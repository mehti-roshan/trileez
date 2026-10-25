export const DEFAULT_PERFORMANCE_SCORE = 70;

const persianPartsFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
});
const persianTitleFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC', year: 'numeric', month: 'long',
});

function parseDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid performance date');
  return date;
}

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function performanceMonthKey(value: string | Date): string {
  const parts = persianPartsFormatter.formatToParts(parseDate(value));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('Could not determine performance month');
  return `${year}-${month.padStart(2, '0')}`;
}

export function performanceMonthRange(value: string | Date): { periodKey: string; startedAt: string; endedAt: string; title: string } {
  const source = utcDateOnly(parseDate(value));
  const periodKey = performanceMonthKey(source);
  let start = source;
  while (true) {
    const previous = new Date(start.getTime() - 86_400_000);
    if (performanceMonthKey(previous) !== periodKey) break;
    start = previous;
  }
  let end = source;
  while (true) {
    const next = new Date(end.getTime() + 86_400_000);
    if (performanceMonthKey(next) !== periodKey) break;
    end = next;
  }
  return { periodKey, startedAt: isoDate(start), endedAt: isoDate(end), title: persianTitleFormatter.format(source) };
}

export function clampPerformanceScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function performanceGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
