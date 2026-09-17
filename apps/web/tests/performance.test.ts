import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { PerformancePointEvent, PerformancePointReason, PerformancePeriod } from '../src/types/index.ts';
import { createMockRepository } from '../src/services/mockRepository.ts';
import { createPerformanceAdjustment, finalizePerformanceMonth } from '../src/services/performanceService.ts';
import { gradeForScore, monthScore, scoreSummary } from '../src/utils/performance.ts';

const positive: PerformancePointReason = { id: 'quality', title: 'کیفیت ممتاز', defaultPoints: 10, direction: 'positive', category: 'کیفیت' };
const negative: PerformancePointReason = { id: 'delay', title: 'تعهد انجام‌نشده', defaultPoints: -8, direction: 'negative', category: 'تعهدات' };
const custom: PerformancePointReason = { id: 'reason-custom-positive', title: 'تشویق سفارشی', defaultPoints: 5, direction: 'positive', category: 'سایر' };

const period = (id: string, score: number, startedAt: string, endedAt: string): PerformancePeriod => ({
  id, employeeId: 'u1', title: id, score, grade: gradeForScore(score), trend: 'flat', status: 'finalized', startedAt, endedAt,
});

test('current score uses only events from the selected Persian month', () => {
  const events: PerformancePointEvent[] = [
    { id: 'e1', employeeId: 'u1', reasonId: positive.id, points: 10, date: '2026-09-05', description: positive.title, createdBy: 'u2' },
    { id: 'e2', employeeId: 'u1', reasonId: negative.id, points: -8, date: '2026-08-20', description: negative.title, createdBy: 'u2' },
  ];
  const periods = [period('previous', 76, '2026-07-23', '2026-08-22')];
  assert.equal(monthScore('u1', events, periods, '2026-09-14'), 86);
  const summary = scoreSummary('u1', events, periods, '2026-09-14');
  assert.equal(summary.baseline, 76);
  assert.equal(summary.delta, 10);
  assert.equal(summary.eventCount, 1);
});

test('scores are clamped to the real 0–100 model', () => {
  const high = [{ id: 'e1', employeeId: 'u1', reasonId: positive.id, points: 80, date: '2026-09-05', description: '', createdBy: 'u2' }];
  const low = [{ id: 'e2', employeeId: 'u1', reasonId: negative.id, points: -90, date: '2026-09-05', description: '', createdBy: 'u2' }];
  assert.equal(monthScore('u1', high, [], '2026-09-14'), 100);
  assert.equal(monthScore('u1', low, [], '2026-09-14'), 0);
  assert.equal(gradeForScore(95), 'A+');
  assert.equal(gradeForScore(49), 'F');
});

test('adjustments preserve direction, reason, author, project and notes', () => {
  const events = createMockRepository<PerformancePointEvent>('performance-test-events-1', []);
  const periods = createMockRepository<PerformancePeriod>('performance-test-periods-1', []);
  const created = createPerformanceAdjustment({ employeeId: 'u1', reason: negative, points: 6, date: '2026-09-14', description: 'تحویل تعهد ثبت‌شده انجام نشد.', projectId: 'p1', createdBy: 'u2' }, { events, periods });
  assert.equal(created.points, -6);
  assert.equal(created.reasonId, negative.id);
  assert.equal(created.projectId, 'p1');
  assert.equal(created.createdBy, 'u2');
  assert.equal(created.description, 'تحویل تعهد ثبت‌شده انجام نشد.');
});

test('custom adjustments require an explanation', () => {
  const events = createMockRepository<PerformancePointEvent>('performance-test-events-2', []);
  const periods = createMockRepository<PerformancePeriod>('performance-test-periods-2', []);
  assert.throws(() => createPerformanceAdjustment({ employeeId: 'u1', reason: custom, date: '2026-09-14', createdBy: 'u2' }, { events, periods }), /توضیح الزامی/);
});

test('finalizing a month snapshots its event ids and prevents duplicate finalization or later edits', () => {
  const events = createMockRepository<PerformancePointEvent>('performance-test-events-3', [
    { id: 'e1', employeeId: 'u1', reasonId: positive.id, points: 10, date: '2026-09-05', description: positive.title, createdBy: 'u2' },
    { id: 'e2', employeeId: 'u1', reasonId: negative.id, points: -5, date: '2026-09-08', description: negative.title, createdBy: 'u2' },
  ]);
  const periods = createMockRepository<PerformancePeriod>('performance-test-periods-3', [period('mordad', 78, '2026-07-23', '2026-08-22')]);
  const snapshot = finalizePerformanceMonth({ employeeId: 'u1', period: '2026-09-14', evaluatedBy: 'u2', notes: 'جمع‌بندی ماه' }, { events, periods });
  assert.equal(snapshot.baselineScore, 78);
  assert.equal(snapshot.adjustmentTotal, 5);
  assert.equal(snapshot.score, 83);
  assert.deepEqual(snapshot.eventIds, ['e1', 'e2']);
  assert.throws(() => finalizePerformanceMonth({ employeeId: 'u1', period: '2026-09-20', evaluatedBy: 'u2' }, { events, periods }), /قبلاً نهایی/);
  assert.throws(() => createPerformanceAdjustment({ employeeId: 'u1', reason: positive, date: '2026-09-25', createdBy: 'u2' }, { events, periods }), /نهایی شده/);
});
