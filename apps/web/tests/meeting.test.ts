import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Meeting } from '../src/types/index.ts';
import { createMockRepository } from '../src/services/mockRepository.ts';
import { createMeeting } from '../src/services/meetingService.ts';

test('meetings support reusable cross-module relationships and audit metadata', () => {
  const repository = createMockRepository<Meeting>('meeting-test', []);
  const meeting = createMeeting({ title: 'جلسه برنامه‌ریزی', startAt: '2026-09-19T10:30:00Z', durationMinutes: 45, organizerId: 'u1', participantIds: ['u1', 'u2', 'u2'], projectId: 'p1', employeeIds: ['u2'], departments: ['فنی', 'محصول'], customerId: 'c1', agenda: 'برنامه‌ریزی نسخه بعد', decisions: 'نسخه بعدی تا پایان ماه آماده شود.', meetingDocument: { name: 'صورتجلسه.pdf', type: 'application/pdf', size: 1200 }, taskIds: ['t1'], attachments: ['agenda.pdf', 'agenda.pdf'], createdBy: 'u1' }, repository);
  assert.equal(meeting.projectId, 'p1');
  assert.equal(meeting.customerId, 'c1');
  assert.equal(meeting.department, 'فنی');
  assert.deepEqual(meeting.departments, ['فنی', 'محصول']);
  assert.equal(meeting.agenda, 'برنامه‌ریزی نسخه بعد');
  assert.equal(meeting.meetingDocument?.name, 'صورتجلسه.pdf');
  assert.deepEqual(meeting.participantIds, ['u1', 'u2']);
  assert.deepEqual(meeting.attachments, ['agenda.pdf']);
  assert.equal(meeting.durationMinutes, 45);
  assert.match(meeting.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('meetings reject invalid duration and missing title', () => {
  const repository = createMockRepository<Meeting>('meeting-test-validation', []);
  assert.throws(() => createMeeting({ title: '', startAt: '2026-09-19T10:30:00Z', durationMinutes: 30, organizerId: 'u1', createdBy: 'u1' }, repository), /الزامی/);
  assert.throws(() => createMeeting({ title: 'جلسه', startAt: '2026-09-19T10:30:00Z', durationMinutes: 2, organizerId: 'u1', createdBy: 'u1' }, repository), /مدت جلسه/);
});
