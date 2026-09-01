import type { PerformancePointEvent, PerformancePeriod } from '../types/index.ts';

export function gradeForScore(score: number): PerformancePeriod['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function monthScore(employeeId: string, events: PerformancePointEvent[], base = 70) {
  const total = events.filter((event) => event.employeeId === employeeId).reduce((sum, event) => sum + event.points, 0);
  return Math.max(0, Math.min(100, base + total));
}

export function scoreSummary(employeeId: string, events: PerformancePointEvent[]) {
  const employeeEvents = events.filter((event) => event.employeeId === employeeId);
  const score = monthScore(employeeId, events);
  return {
    score,
    grade: gradeForScore(score),
    delta: employeeEvents.reduce((sum, event) => sum + event.points, 0),
    positive: employeeEvents.filter((event) => event.points > 0).length,
    negative: employeeEvents.filter((event) => event.points < 0).length,
  };
}
