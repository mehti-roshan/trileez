import type { AttendanceRecord, AttendanceStatus } from '../types/index.ts';
import { apiClient } from './apiClient.ts';
import { reportApiFailure } from './apiEvents.ts';
import { attendanceRepository } from './repositories.ts';

export interface AttendanceInput {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  clockIn?: string;
  clockOut?: string;
  source?: 'manual' | 'clock';
  leaveRequestId?: string;
  notes?: string;
}

async function confirmed(operation: string, request: () => Promise<{ data: AttendanceRecord }>) {
  try {
    const response = await request();
    return attendanceRepository.adopt(response.data);
  } catch (error) {
    reportApiFailure({ message: error instanceof Error ? error.message : 'تغییر حضور و غیاب در سرور انجام نشد.', operation, resource: 'attendance' });
    throw error;
  }
}

export const attendanceService = {
  create(input: AttendanceInput) {
    return confirmed('create', () => apiClient.create<AttendanceRecord>('data/attendance', input));
  },
  update(id: string, patch: Partial<Omit<AttendanceInput, 'employeeId' | 'date'>>) {
    return confirmed('update', () => apiClient.update<AttendanceRecord>('data/attendance', id, patch));
  },
  review(id: string, approvalStatus: 'approved' | 'rejected', reason?: string) {
    return confirmed('review', () => apiClient.reviewAttendance<AttendanceRecord>(id, { approvalStatus, reason }));
  },
};
