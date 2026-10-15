import type { TimesheetEntry } from '../types/index.ts';
import { apiClient } from './apiClient.ts';
import { reportApiFailure } from './apiEvents.ts';
import { timesheetRepository } from './repositories.ts';

async function confirmed(operation: string, request: () => Promise<{ data: TimesheetEntry }>): Promise<TimesheetEntry> {
  try {
    const response = await request();
    return timesheetRepository.adopt(response.data);
  } catch (error) {
    reportApiFailure({ message: error instanceof Error ? error.message : 'تغییر ساعت کاری در سرور انجام نشد.', operation, resource: 'timesheets' });
    throw error;
  }
}

export function reviewTimesheet(id: string, status: TimesheetEntry['status'], reason?: string) {
  return confirmed('review', () => apiClient.reviewTimesheet<TimesheetEntry>(id, { status, reason }));
}
