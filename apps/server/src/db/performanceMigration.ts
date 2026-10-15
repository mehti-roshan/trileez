import { models } from '../models/index.js';
import { performanceGrade, performanceMonthKey, performanceMonthRange } from '../utils/performanceScoring.js';

export async function backfillPerformanceRecords(): Promise<void> {
  const events = await models.PerformanceEvent.find({ $or: [{ periodKey: { $exists: false } }, { periodKey: null }, { category: { $exists: false } }, { category: null }] });
  for (const event of events) {
    const date = event.get('date') as Date | string | undefined;
    if (!date) continue;
    event.set('periodKey', performanceMonthKey(date));
    if (!event.get('category')) event.set('category', 'عمومی');
    await event.save();
  }

  const periods = await models.PerformancePeriod.find({ $or: [{ periodKey: { $exists: false } }, { periodKey: null }] });
  for (const period of periods) {
    const startedAt = period.get('startedAt') as Date | string | undefined;
    if (!startedAt) continue;
    const range = performanceMonthRange(startedAt);
    const score = Number(period.get('score') ?? 70);
    period.set({
      periodKey: range.periodKey,
      title: period.get('title') || range.title,
      baselineScore: period.get('baselineScore') ?? score,
      adjustmentTotal: period.get('adjustmentTotal') ?? 0,
      eventIds: period.get('eventIds') || [],
      grade: period.get('grade') || performanceGrade(score),
      trend: period.get('trend') || 'flat',
      status: period.get('status') || 'finalized',
      endedAt: period.get('endedAt') || range.endedAt,
      version: period.get('version') || 1,
    });
    await period.save();
  }
}
