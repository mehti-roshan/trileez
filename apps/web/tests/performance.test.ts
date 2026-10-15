import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { PerformancePointEvent, PerformancePeriod } from '../src/types/index.ts';
import { createMockRepository } from '../src/services/mockRepository.ts';
import { createPerformanceAdjustment, finalizePerformanceMonth } from '../src/services/performanceService.ts';
import { gradeForScore, monthScore, scoreSummary } from '../src/utils/performance.ts';

const positive = 'کیفیت ممتاز';
const negative = 'تعهد انجام‌نشده';
const custom = 'تشویق سفارشی';

const period = (id: string, score: number, startedAt: string, endedAt: string): PerformancePeriod => ({
  id, employeeId: 'u1', title: id, score, grade: gradeForScore(score), trend: 'flat', status: 'finalized', startedAt, endedAt,
});

test('current score uses only events from the selected Persian month', () => {
  const events: PerformancePointEvent[] = [
    { id: 'e1', employeeId: 'u1', reason: positive, points: 10, date: '2026-09-05', description: positive, createdBy: 'u2' },
    { id: 'e2', employeeId: 'u1', reason: negative, points: -8, date: '2026-08-20', description: negative, createdBy: 'u2' },
  ];
  const periods = [period('previous', 76, '2026-07-23', '2026-08-22')];
  assert.equal(monthScore('u1', events, periods, '2026-09-14'), 86);
  const summary = scoreSummary('u1', events, periods, '2026-09-14');
  assert.equal(summary.baseline, 76);
  assert.equal(summary.delta, 10);
  assert.equal(summary.eventCount, 1);
});

test('scores are clamped to the real 0–100 model', () => {
  const high = [{ id: 'e1', employeeId: 'u1', reason: positive, points: 80, date: '2026-09-05', description: '', createdBy: 'u2' }];
  const low = [{ id: 'e2', employeeId: 'u1', reason: negative, points: -90, date: '2026-09-05', description: '', createdBy: 'u2' }];
  assert.equal(monthScore('u1', high, [], '2026-09-14'), 100);
  assert.equal(monthScore('u1', low, [], '2026-09-14'), 0);
  assert.equal(gradeForScore(95), 'A+');
  assert.equal(gradeForScore(49), 'F');
});

test('adjustments preserve direction, reason, author, project and notes', async () => {
  const events = createMockRepository<PerformancePointEvent>('performance-test-events-1', []);
  const periods = createMockRepository<PerformancePeriod>('performance-test-periods-1', []);
  const created = await createPerformanceAdjustment({ employeeId: 'u1', reason: negative, points: -6, date: '2026-09-14', description: 'تحویل تعهد ثبت‌شده انجام نشد.', projectId: 'p1', createdBy: 'u2' }, { events, periods });
  assert.equal(created.points, -6);
  assert.equal(created.reason, negative);
  assert.equal(created.projectId, 'p1');
  assert.equal(created.createdBy, 'u2');
  assert.equal(created.description, 'تحویل تعهد ثبت‌شده انجام نشد.');
  assert.match(created.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('adjustments require a whole number in the bounded 0–100 model', async () => {
  const events = createMockRepository<PerformancePointEvent>('performance-test-events-integer', []);
  const periods = createMockRepository<PerformancePeriod>('performance-test-periods-integer', []);
  await assert.rejects(() => createPerformanceAdjustment({ employeeId: 'u1', reason: positive, points: 1.5, date: '2026-09-14', createdBy: 'u2' }, { events, periods }), /عدد صحیح/);
  await assert.rejects(() => createPerformanceAdjustment({ employeeId: 'u1', reason: positive, points: 101, date: '2026-09-14', createdBy: 'u2' }, { events, periods }), /بین ۱ تا ۱۰۰/);
});

test('adjustments require a non-zero signed amount', async () => {
  const events = createMockRepository<PerformancePointEvent>('performance-test-events-2', []);
  const periods = createMockRepository<PerformancePeriod>('performance-test-periods-2', []);
  await assert.rejects(() => createPerformanceAdjustment({ employeeId: 'u1', reason: custom, points: 0, date: '2026-09-14', createdBy: 'u2' }, { events, periods }), /مقدار تغییر امتیاز/);
});

test('finalizing a month snapshots its event ids and prevents duplicate finalization or later edits', async () => {
  const events = createMockRepository<PerformancePointEvent>('performance-test-events-3', [
    { id: 'e1', employeeId: 'u1', reason: positive, points: 10, date: '2026-09-05', description: positive, createdBy: 'u2' },
    { id: 'e2', employeeId: 'u1', reason: negative, points: -5, date: '2026-09-08', description: negative, createdBy: 'u2' },
  ]);
  const periods = createMockRepository<PerformancePeriod>('performance-test-periods-3', [period('mordad', 78, '2026-07-23', '2026-08-22')]);
  const snapshot = await finalizePerformanceMonth({ employeeId: 'u1', period: '2026-09-14', evaluatedBy: 'u2', notes: 'جمع‌بندی ماه' }, { events, periods });
  assert.equal(snapshot.baselineScore, 78);
  assert.equal(snapshot.adjustmentTotal, 5);
  assert.equal(snapshot.score, 83);
  assert.deepEqual(snapshot.eventIds, ['e1', 'e2']);
  await assert.rejects(() => finalizePerformanceMonth({ employeeId: 'u1', period: '2026-09-20', evaluatedBy: 'u2' }, { events, periods }), /قبلاً نهایی/);
  await assert.rejects(() => createPerformanceAdjustment({ employeeId: 'u1', reason: positive, points: 5, date: '2026-09-18', createdBy: 'u2' }, { events, periods }), /نهایی شده/);
});
