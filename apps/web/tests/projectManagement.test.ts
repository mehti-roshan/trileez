import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ProjectAccess, ProjectMember, ProjectPhase, ProjectRole, Task, TimesheetEntry } from '../src/types/index.ts';
import { actualTaskHours, derivedPhaseProgress, derivedProjectProgress, effectiveProjectAccesses } from '../src/services/projectManagement.ts';
import { projectActivities, projectMembers, projectPhases, projectRoles, tasks, timesheets } from '../src/mock/data.ts';

const task = (id: string, phaseId: string, status: Task['status']): Task => ({
  id, phaseId, status, projectId: 'p1', title: id, priority: 'medium', assigneeId: 'u1', assigneeIds: ['u1'], assigneeMemberIds: ['pm1'], startDate: '2026-09-01', dueDate: '2026-09-30', estimatedHours: 8, createdAt: '2026-09-01', updatedAt: '2026-09-01', tags: [],
});
const phases: ProjectPhase[] = [
  { id: 'phase-1', projectId: 'p1', title: 'فاز یک', status: 'in_progress', startDate: '2026-09-01', endDate: '2026-09-15', progress: 0, managerId: 'u1', description: '' },
  { id: 'phase-2', projectId: 'p1', title: 'فاز دو', status: 'in_progress', startDate: '2026-09-16', endDate: '2026-09-30', progress: 0, managerId: 'u1', description: '' },
];

test('derives phase and project progress from task state', () => {
  const tasks = [task('t1', 'phase-1', 'done'), task('t2', 'phase-1', 'in_progress'), task('t3', 'phase-2', 'todo')];
  assert.equal(derivedPhaseProgress('phase-1', tasks), 75);
  assert.equal(derivedProjectProgress('p1', phases, tasks), 38);
});

test('keeps actual time entries separate from estimated schedule', () => {
  const entries: TimesheetEntry[] = [
    { id: 'te1', employeeId: 'u1', projectId: 'p1', taskId: 't1', date: '2026-09-10', hours: 3, billable: true, description: '', status: 'approved', createdAt: '2026-09-10' },
    { id: 'te2', employeeId: 'u1', projectId: 'p1', taskId: 't1', date: '2026-09-11', hours: 2.5, billable: true, description: '', status: 'approved', createdAt: '2026-09-11' },
  ];
  assert.equal(actualTaskHours('t1', entries), 5.5);
  assert.equal(task('t1', 'phase-1', 'todo').estimatedHours, 8);
});

test('resolves project, role and person access with explicit override precedence', () => {
  const member: ProjectMember = { id: 'pm1', projectId: 'p1', personId: 'u1', role: 'فنی، سئو', roleIds: ['role-dev', 'role-seo'], status: 'active', joinedAt: '2026-09-01', responsibilities: '' };
  const roles: ProjectRole[] = [{ id: 'role-dev', projectId: 'p1', name: 'فنی', description: '', responsibilities: [], objectives: [], requiredSkills: [], expectedHours: 40, customerVisible: false }];
  const base = { projectId: 'p1', content: 'GitLab repo, username: dev, password: demo', startDate: '2026-09-01', notes: '', grantedBy: 'u2' };
  const accesses: ProjectAccess[] = [
    { ...base, id: 'project-rule', scope: 'project', status: 'granted', createdAt: '2026-09-01' },
    { ...base, id: 'role-rule', scope: 'role', roleId: 'role-dev', status: 'granted', createdAt: '2026-09-02' },
    { ...base, id: 'person-rule', scope: 'person', projectMemberId: 'pm1', status: 'revoked', createdAt: '2026-09-03' },
  ];
  const [effective] = effectiveProjectAccesses(member, roles, accesses, '2026-09-13');
  assert.equal(effective.status, 'revoked');
  assert.equal(effective.source, 'اختصاص مستقیم');
  assert.equal(effective.sourceName, 'این عضو');
});

test('ignores expired access and unrelated role rules', () => {
  const member: ProjectMember = { id: 'pm1', projectId: 'p1', personId: 'u1', role: 'فنی', roleIds: ['role-dev'], status: 'active', joinedAt: '2026-09-01', responsibilities: '' };
  const accesses: ProjectAccess[] = [
    { id: 'expired', projectId: 'p1', content: 'VPN شبکه، رمز ورود', scope: 'project', status: 'granted', expiryDate: '2026-09-12', notes: '', grantedBy: 'u2', createdAt: '2026-09-01' },
    { id: 'other-role', projectId: 'p1', content: 'CMS انتشار، دسترسی ویرایش', scope: 'role', roleId: 'role-content', status: 'granted', notes: '', grantedBy: 'u2', createdAt: '2026-09-01' },
  ];
  assert.deepEqual(effectiveProjectAccesses(member, [], accesses, '2026-09-13'), []);
});

test('mock execution hierarchy remains relational', () => {
  tasks.forEach((item) => {
    assert.ok(item.phaseId && projectPhases.some((phase) => phase.id === item.phaseId && phase.projectId === item.projectId), `${item.id} must belong to a project phase`);
    assert.ok(item.assigneeMemberIds?.length, `${item.id} must be assigned to project members`);
    item.assigneeMemberIds?.forEach((memberId) => assert.ok(projectMembers.some((member) => member.id === memberId && member.projectId === item.projectId)));
    if (item.activityId) assert.ok(projectActivities.some((activity) => activity.id === item.activityId && activity.projectId === item.projectId));
  });
  projectMembers.forEach((member) => member.roleIds.forEach((roleId) => assert.ok(projectRoles.some((role) => role.id === roleId && role.projectId === member.projectId))));
  timesheets.forEach((entry) => assert.ok(tasks.some((item) => item.id === entry.taskId && item.projectId === entry.projectId), `${entry.id} must reference its project task`));
});
