import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ProjectEvent } from '../src/types/index.ts';
import { createMockRepository } from '../src/services/mockRepository.ts';
import { createProjectEvent } from '../src/services/projectEventService.ts';

test('project events preserve lifecycle type, links, attachments, visibility and audit metadata', () => {
  const repository = createMockRepository<ProjectEvent>('project-event-test', []);
  const created = createProjectEvent({
    projectId: 'p1',
    eventType: 'تأیید مشتری',
    title: 'تأیید نسخه نهایی',
    date: '2026-09-19',
    description: 'مشتری نسخه نهایی را تأیید کرد.',
    createdBy: 'u1',
    personId: 'u2',
    taskId: 't1',
    phaseId: 'phase-1',
    attachments: ['acceptance.pdf', '  '],
    customerVisible: true,
  }, repository);
  assert.equal(created.projectId, 'p1');
  assert.equal(created.eventType, 'تأیید مشتری');
  assert.equal(created.title, 'تأیید نسخه نهایی');
  assert.equal(created.personId, 'u2');
  assert.equal(created.taskId, 't1');
  assert.equal(created.phaseId, 'phase-1');
  assert.deepEqual(created.attachments, ['acceptance.pdf']);
  assert.equal(created.customerVisible, true);
  assert.equal(created.registeredBy, 'u1');
  assert.match(created.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('project events require a project, title and description', () => {
  const repository = createMockRepository<ProjectEvent>('project-event-test-required', []);
  assert.throws(() => createProjectEvent({ projectId: '', eventType: 'یادداشت عملیاتی', title: '', date: '2026-09-19', description: '', createdBy: 'u1' }, repository), /الزامی/);
});
