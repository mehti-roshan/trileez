import type { TimesheetEntry } from '../types/index.ts';
import { apiClient } from './apiClient.ts';
import { reportApiFailure } from './apiEvents.ts';
import { timesheetRepository } from './repositories.ts';

export interface TaskTimeInput {
  employeeId: string;
  projectId: string;
  taskId: string;
  date: string;
  hours: number;
  startTime?: string;
  endTime?: string;
  billable: boolean;
  customerVisible?: boolean;
  description?: string;
}

async function confirmed(operation: string, request: () => Promise<{ data: TimesheetEntry }>) {
  try {
    const response = await request();
    return timesheetRepository.adopt(response.data);
  } catch (error) {
    reportApiFailure({ message: error instanceof Error ? error.message : 'تغییر زمان وظیفه در سرور انجام نشد.', operation, resource: 'timesheets' });
    throw error;
  }
}

export const taskTimeService = {
  create(input: TaskTimeInput) {
    return confirmed('create', () => apiClient.create<TimesheetEntry>('data/timesheets', input));
  },
  update(id: string, patch: Partial<Pick<TaskTimeInput, 'date' | 'hours' | 'startTime' | 'endTime' | 'billable' | 'customerVisible' | 'description'>>) {
    return confirmed('update', () => apiClient.update<TimesheetEntry>('data/timesheets', id, patch));
  },
};
