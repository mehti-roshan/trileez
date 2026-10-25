import { database } from '../db/database.js';
import { relationshipIssue, RequestValidationError } from '../middleware/validate.js';
import type { AppRecord, RecordInput, ResourceName } from '../types/entities.js';
import { createAutomaticProjectEvent } from './collaborationDomain.js';
import { auditService } from './audit.js';
import { assertAttachableFile } from './fileAccess.js';
import { claimOwnTimeEntry } from './employeeIdentity.js';

const countedTimeStatuses = new Set(['approved', 'pending_review', 'review_again']);

function invalid(path: string, message: string): never { throw relationshipIssue(path, message); }
function businessIssue(path: string, message: string): never {
  throw new RequestValidationError([{ location: 'relationship', path, code: 'invalid_relationship', message }]);
}
const SCHEDULE_TIME_ZONE = 'Asia/Tehran';

/** Calendar day in the schedule timezone. A date-only string is that civil day, not a UTC instant. */
function calendarDay(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-CA', { timeZone: SCHEDULE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
}

function dateValue(value: unknown): number | undefined {
  const day = calendarDay(value);
  if (!day) return undefined;
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return undefined;
  return year * 10_000 + month * 100 + date;
}

function affects(changed: ReadonlySet<string> | undefined, fields: readonly string[]): boolean {
  return !changed || fields.some((field) => changed.has(field));
}
function unique(values: unknown[]): string[] { return [...new Set(values.filter(Boolean).map(String))]; }

async function audit(organizationId: string, actorId: string, action: string, entityType: string, entityId: string, fields: string[], ip?: string, before?: unknown, after?: unknown): Promise<void> {
  await auditService.record({ organizationId, actorId, action, entityType, entityId, before, after, metadata: { requestedFields: fields }, ...(ip ? { ip } : {}) });
}

async function personAliases(organizationId: string, personId: string): Promise<Set<string>> {
  const db = database.forOrganization(organizationId);
  const employees = await db.list('Employee');
  const aliases = new Set([personId]);
  for (const employee of employees) {
    if (employee.id === personId || employee.userId === personId) {
      aliases.add(employee.id);
      if (typeof employee.userId === 'string') aliases.add(employee.userId);
    }
  }
  return aliases;
}

async function employeeForPerson(organizationId: string, personId: string): Promise<AppRecord | undefined> {
  const db = database.forOrganization(organizationId);
  return await db.get('Employee', personId)
    || (await db.list('Employee', { userId: personId }))[0];
}

async function requirePerson(organizationId: string, personId: string, path: string): Promise<void> {
  const db = database.forOrganization(organizationId);
  if (await db.get('Employee', personId) || await db.get('User', personId)) return;
  if ((await db.list('Employee')).some((employee) => employee.userId === personId)) return;
  invalid(path, 'Employee or linked user does not exist in this organization');
}

async function activeMemberForPerson(organizationId: string, projectId: string, personId: string): Promise<AppRecord | undefined> {
  const aliases = await personAliases(organizationId, personId);
  return (await database.forOrganization(organizationId).list('ProjectMember', { projectId }))
    .find((member) => member.status === 'active' && aliases.has(String(member.personId)));
}

async function requireProject(organizationId: string, projectId: string, path = 'body.projectId'): Promise<AppRecord> {
  const project = await database.forOrganization(organizationId).get('Project', projectId);
  if (!project) invalid(path, 'Project does not exist in this organization');
  return project;
}

async function validateDateRange(input: Record<string, unknown>, path: string): Promise<void> {
  const start = dateValue(input.startDate);
  const end = dateValue(input.endDate);
  if (start !== undefined && end !== undefined && end < start) businessIssue(path, 'End date must not precede start date');
}

async function validatePhase(organizationId: string, input: Record<string, unknown>): Promise<void> {
  const project = await requireProject(organizationId, String(input.projectId));
  await validateDateRange(input, 'body.endDate');
  const phaseStart = dateValue(input.startDate); const phaseEnd = dateValue(input.endDate);
  const projectStart = dateValue(project.startDate); const projectEnd = dateValue(project.endDate);
  if (phaseStart !== undefined && projectStart !== undefined && phaseStart < projectStart) businessIssue('body.startDate', 'Phase starts before its project');
  if (phaseEnd !== undefined && projectEnd !== undefined && phaseEnd > projectEnd) businessIssue('body.endDate', 'Phase ends after its project');
  if (input.managerId) {
    await requirePerson(organizationId, String(input.managerId), 'body.managerId');
    if (!await activeMemberForPerson(organizationId, String(input.projectId), String(input.managerId))) invalid('body.managerId', 'Phase manager must be an active project member');
  }
}

async function validateRoles(organizationId: string, projectId: string, roleIds: unknown): Promise<void> {
  if (!Array.isArray(roleIds)) return;
  const db = database.forOrganization(organizationId);
  for (const roleId of unique(roleIds)) {
    const role = await db.get('ProjectRole', roleId);
    if (!role || role.projectId !== projectId) invalid('body.roleIds', 'Every member role must belong to the same project');
  }
}

async function validateMember(organizationId: string, input: Record<string, unknown>, current?: AppRecord): Promise<void> {
  const projectId = String(input.projectId);
  const personId = String(input.personId);
  await requireProject(organizationId, projectId);
  await requirePerson(organizationId, personId, 'body.personId');
  await validateRoles(organizationId, projectId, input.roleIds);
  const joined = dateValue(input.joinedAt); const left = dateValue(input.leftAt);
  if (joined !== undefined && left !== undefined && left < joined) businessIssue('body.leftAt', 'Membership end date must not precede join date');
  if (input.status === 'active' && input.leftAt) businessIssue('body.leftAt', 'An active member cannot have a leave date');
  if (input.status === 'inactive' && !input.leftAt) businessIssue('body.leftAt', 'An inactive member requires a leave date');
  const aliases = await personAliases(organizationId, personId);
  const duplicate = (await database.forOrganization(organizationId).list('ProjectMember', { projectId }))
    .find((member) => member.id !== current?.id && member.status === 'active' && input.status !== 'inactive' && aliases.has(String(member.personId)));
  if (duplicate) businessIssue('body.personId', 'This employee already has an active membership in the project');
  if (current) {
    const db = database.forOrganization(organizationId);
    const retainedRoles = new Set(Array.isArray(input.roleIds) ? input.roleIds.map(String) : []);
    const aliases = await personAliases(organizationId, personId);
    const assignedTasks = (await db.list('Task', { projectId })).filter((task) =>
      (Array.isArray(task.assigneeMemberIds) && task.assigneeMemberIds.includes(current.id))
      || aliases.has(String(task.assigneeId))
      || (Array.isArray(task.assigneeIds) && task.assigneeIds.some((id) => aliases.has(String(id)))),
    );
    for (const task of assignedTasks) if (task.activityId) {
      const activity = await db.get('ProjectActivity', String(task.activityId));
      if (activity && !retainedRoles.has(String(activity.roleId))) businessIssue('body.roleIds', 'Cannot remove a role required by an activity assigned to this member');
    }
  }
}

async function validateActivity(organizationId: string, input: Record<string, unknown>): Promise<void> {
  await requireProject(organizationId, String(input.projectId));
  const db = database.forOrganization(organizationId);
  const role = await db.get('ProjectRole', String(input.roleId));
  if (!role || role.projectId !== input.projectId) invalid('body.roleId', 'Activity role must belong to the same project');
  if (input.id) for (const task of await db.list('Task', { activityId: input.id })) {
    const members = await db.list('ProjectMember', { projectId: input.projectId });
    const assigned = members.filter((member) =>
      (Array.isArray(task.assigneeMemberIds) && task.assigneeMemberIds.includes(member.id))
      || task.assigneeId === member.personId
      || (Array.isArray(task.assigneeIds) && task.assigneeIds.includes(member.personId)),
    );
    if (assigned.some((member) => !Array.isArray(member.roleIds) || !member.roleIds.includes(input.roleId))) {
      businessIssue('body.roleId', 'The new activity role is not held by every assigned task member');
    }
  }
}

async function validateTask(organizationId: string, actorId: string, input: Record<string, unknown>, changed?: ReadonlySet<string>): Promise<void> {
  const db = database.forOrganization(organizationId);
  const projectId = String(input.projectId);
  const project = await requireProject(organizationId, projectId);
  const checkAssignment = affects(changed, ['phaseId', 'activityId', 'assigneeId', 'assigneeIds', 'assigneeMemberIds']);
  const checkDates = affects(changed, ['startDate', 'dueDate', 'phaseId']);
  let phase: AppRecord | undefined;
  if (input.phaseId && (checkDates || affects(changed, ['phaseId']))) {
    phase = await db.get('ProjectPhase', String(input.phaseId));
    if (!phase || phase.projectId !== projectId) invalid('body.phaseId', 'Task phase must belong to the task project');
  }
  let activity: AppRecord | undefined;
  if (checkAssignment && input.activityId) {
    activity = await db.get('ProjectActivity', String(input.activityId));
    if (!activity || activity.projectId !== projectId) invalid('body.activityId', 'Task activity must belong to the task project');
  }
  const memberIds = checkAssignment ? unique(Array.isArray(input.assigneeMemberIds) ? input.assigneeMemberIds : []) : [];
  const people = checkAssignment ? unique([input.assigneeId, ...(Array.isArray(input.assigneeIds) ? input.assigneeIds : [])]) : [];
  const members: AppRecord[] = [];
  for (const memberId of memberIds) {
    const member = await db.get('ProjectMember', memberId);
    if (!member || member.projectId !== projectId || member.status !== 'active') invalid('body.assigneeMemberIds', 'Task assignees must be active members of this project');
    members.push(member);
  }
  for (const personId of people) {
    const member = await activeMemberForPerson(organizationId, projectId, personId);
    if (!member) invalid('body.assigneeIds', 'A task cannot be assigned to an employee who is not an active project member');
    members.push(member);
  }
  if (activity && members.length) for (const member of members) {
    if (!Array.isArray(member.roleIds) || !member.roleIds.map(String).includes(String(activity.roleId))) {
      invalid('body.activityId', 'Assigned members must hold the role that owns this activity');
    }
  }
  if (checkDates) {
    const start = dateValue(input.startDate); const due = dateValue(input.dueDate);
    if (start !== undefined && due !== undefined && due < start) businessIssue('body.dueDate', 'Task due date must not precede its start date');
    const lowerBound = dateValue(phase?.startDate) ?? dateValue(project.startDate);
    const upperBound = dateValue(phase?.endDate) ?? dateValue(project.endDate);
    if (start !== undefined && lowerBound !== undefined && start < lowerBound) businessIssue('body.startDate', 'Task starts before its phase or project');
    if (due !== undefined && upperBound !== undefined && due > upperBound) businessIssue('body.dueDate', 'Task ends after its phase or project');
  }
  if (affects(changed, ['attachments']) && Array.isArray(input.attachments)) for (const attachmentId of unique(input.attachments)) {
    await assertAttachableFile(organizationId, actorId, attachmentId, 'body.attachments', {
      projectId, ...(typeof project.customerId === 'string' ? { customerId: project.customerId } : {}), customerVisible: input.customerVisible === true,
    });
  }
}

async function validateTimeEntry(organizationId: string, input: Record<string, unknown>): Promise<AppRecord> {
  const db = database.forOrganization(organizationId);
  const projectId = String(input.projectId); const taskId = String(input.taskId); const employeeId = String(input.employeeId);
  await requireProject(organizationId, projectId);
  const member = await activeMemberForPerson(organizationId, projectId, employeeId);
  if (!member) invalid('body.employeeId', 'Time can only be recorded by an active project member');
  if (!await employeeForPerson(organizationId, employeeId)) invalid('body.employeeId', 'Task time must belong to an employee record');
  const task = await db.get('Task', taskId);
  if (!task || task.projectId !== projectId) invalid('body.taskId', 'Time entry task must belong to the selected project');
  const workDate = dateValue(input.date); const joined = dateValue(member.joinedAt); const left = dateValue(member.leftAt);
  if (workDate !== undefined && joined !== undefined && workDate < joined) businessIssue('body.date', 'Time entry predates project membership');
  if (workDate !== undefined && left !== undefined && workDate > left) businessIssue('body.date', 'Time entry is after project membership ended');
  const assignedMemberIds = unique(Array.isArray(task.assigneeMemberIds) ? task.assigneeMemberIds : []);
  const assignedPeople = unique([task.assigneeId, ...(Array.isArray(task.assigneeIds) ? task.assigneeIds : [])]);
  if (assignedMemberIds.length || assignedPeople.length) {
    const aliases = await personAliases(organizationId, employeeId);
    if (!assignedMemberIds.includes(member.id) && !assignedPeople.some((id) => aliases.has(id))) invalid('body.employeeId', 'Employee is not assigned to this task');
  }
  return member;
}

async function syncProjectMembers(organizationId: string, projectId: string): Promise<void> {
  const active = (await database.forOrganization(organizationId).list('ProjectMember', { projectId })).filter((member) => member.status === 'active');
  await database.forOrganization(organizationId).update('Project', projectId, { members: unique(active.map((member) => member.personId)) });
}

/** Linked user id when the employee has an account; otherwise the employee id. User-only members stay on their user id. */
async function canonicalPersonId(organizationId: string, personId: string): Promise<string> {
  const employee = await employeeForPerson(organizationId, personId);
  if (typeof employee?.userId === 'string' && employee.userId) return employee.userId;
  return employee?.id ?? personId;
}

/** Rewrite assignee ids to one stable id per person and align membership ids. Invalid ids are kept so validation still rejects them. */
async function normalizeTaskAssignment(organizationId: string, input: Record<string, unknown>): Promise<void> {
  const projectId = String(input.projectId ?? '');
  if (!projectId) return;
  const db = database.forOrganization(organizationId);
  const source = unique([input.assigneeId, ...(Array.isArray(input.assigneeIds) ? input.assigneeIds : [])]);
  const explicitMembers = unique(Array.isArray(input.assigneeMemberIds) ? input.assigneeMemberIds : []);
  if (!source.length && !explicitMembers.length) return;
  const canonicalIds: string[] = [];
  const memberIds: string[] = [];
  const seenPeople = new Set<string>();
  const remember = async (personId: string, member?: AppRecord) => {
    const canonical = await canonicalPersonId(organizationId, personId);
    if (!seenPeople.has(canonical)) {
      seenPeople.add(canonical);
      canonicalIds.push(canonical);
    }
    if (member && member.projectId === projectId && member.status === 'active' && !memberIds.includes(member.id)) memberIds.push(member.id);
  };
  for (const personId of source) {
    const member = await activeMemberForPerson(organizationId, projectId, personId);
    await remember(member ? String(member.personId) : personId, member);
  }
  for (const memberId of explicitMembers) {
    const member = await db.get('ProjectMember', memberId);
    if (!member || member.projectId !== projectId || member.status !== 'active') {
      if (!memberIds.includes(memberId)) memberIds.push(memberId);
      continue;
    }
    await remember(String(member.personId), member);
  }
  const fallback = canonicalIds[0];
  if (fallback) {
    const primary = input.assigneeId ? await canonicalPersonId(organizationId, String(input.assigneeId)) : fallback;
    const ordered = canonicalIds.includes(primary) ? [primary, ...canonicalIds.filter((id) => id !== primary)] : canonicalIds;
    input.assigneeId = ordered[0];
    input.assigneeIds = ordered;
  }
  if (memberIds.length || explicitMembers.length) input.assigneeMemberIds = memberIds;
}

/** Mock and single-document stores have no multi-document transaction. Remove the new project graph before the error reaches the client. */
async function rollbackProjectCreate(organizationId: string, projectId: string | undefined, memberIds: readonly string[], eventIds: readonly string[]): Promise<void> {
  const db = database.forOrganization(organizationId);
  for (const eventId of [...eventIds].reverse()) {
    try { await db.remove('ProjectEvent', eventId); } catch (rollbackError) { void rollbackError; }
  }
  for (const memberId of [...memberIds].reverse()) {
    try { await db.remove('ProjectMember', memberId); } catch (rollbackError) { void rollbackError; }
  }
  if (!projectId) return;
  try { await db.remove('Project', projectId); } catch (rollbackError) { void rollbackError; }
}

export async function recalculateProject(organizationId: string, projectId: string): Promise<void> {
  const db = database.forOrganization(organizationId);
  const tasks = await db.list('Task', { projectId });
  const entries = (await db.list('TimeEntry', { projectId })).filter((entry) => countedTimeStatuses.has(String(entry.status)));
  const activities = await db.list('ProjectActivity', { projectId });
  const completed = tasks.filter((task) => task.status === 'done').length;
  const progress = tasks.length ? Math.round(completed * 100 / tasks.length) : 0;
  const estimatedHours = tasks.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0);
  const actualHours = entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const plannedHours = activities.reduce((sum, activity) => sum + Number(activity.expectedHours || 0), 0);
  await db.update('Project', projectId, { tasksCount: tasks.length, completedTasksCount: completed, progress, estimatedHours, actualHours, plannedHours });
  const phases = await db.list('ProjectPhase', { projectId });
  for (const phase of phases) {
    const phaseTasks = tasks.filter((task) => task.phaseId === phase.id);
    const phaseTaskIds = new Set(phaseTasks.map((task) => task.id));
    const phaseCompleted = phaseTasks.filter((task) => task.status === 'done').length;
    await db.update('ProjectPhase', phase.id, {
      progress: phaseTasks.length ? Math.round(phaseCompleted * 100 / phaseTasks.length) : 0,
      estimatedHours: phaseTasks.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0),
      actualHours: entries.filter((entry) => phaseTaskIds.has(String(entry.taskId))).reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    });
  }
  for (const task of tasks) {
    const loggedHours = entries.filter((entry) => entry.taskId === task.id).reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
    if (Number(task.loggedHours || 0) !== loggedHours) await db.update('Task', task.id, { loggedHours });
  }
}

type Kind = 'phase' | 'role' | 'activity' | 'member' | 'timeEntry';
const kindModel: Record<Kind, ResourceName> = { phase: 'ProjectPhase', role: 'ProjectRole', activity: 'ProjectActivity', member: 'ProjectMember', timeEntry: 'TimeEntry' };

export class ProjectDomainService {
  async createProject(organizationId: string, actorId: string, input: RecordInput, ip?: string): Promise<AppRecord> {
    const db = database.forOrganization(organizationId);
    const { initialMembers, members: _members, ...projectInput } = input;
    if (projectInput.customerId && !await db.get('Customer', String(projectInput.customerId))) invalid('body.customerId', 'Project customer does not exist in this organization');
    if (projectInput.managerId) await requirePerson(organizationId, String(projectInput.managerId), 'body.managerId');
    if (projectInput.code && (await db.list('Project', { code: projectInput.code })).length) businessIssue('body.code', 'Project code is already in use');
    await validateDateRange(projectInput, 'body.endDate');
    const requestedMembers = unique(Array.isArray(initialMembers) ? initialMembers : []);
    let projectId: string | undefined;
    const createdMemberIds: string[] = [];
    const createdEventIds: string[] = [];
    try {
      const data = await db.create('Project', { ...projectInput, progress: 0, tasksCount: 0, completedTasksCount: 0, plannedHours: 0, estimatedHours: 0, actualHours: 0, members: [], createdBy: actorId });
      projectId = data.id;
      const seen = new Set<string>();
      const joinedAt = calendarDay(projectInput.startDate) ?? calendarDay(new Date()) ?? new Date().toISOString().slice(0, 10);
      for (const requestedId of requestedMembers) {
        const employee = await employeeForPerson(organizationId, requestedId);
        if (!employee) invalid('body.initialMembers', 'Selected project member is not an employee in this organization');
        if (employee.employmentStatus !== 'active') invalid('body.initialMembers', 'Only active employees can be added as initial project members');
        const personId = await canonicalPersonId(organizationId, employee.id);
        const aliases = await personAliases(organizationId, personId);
        if ([...seen].some((existing) => aliases.has(existing))) continue;
        seen.add(personId);
        const memberInput: RecordInput = { projectId: data.id, personId, status: 'active', joinedAt, createdBy: actorId };
        await validateMember(organizationId, memberInput);
        const member = await db.create('ProjectMember', memberInput);
        createdMemberIds.push(member.id);
      }
      if (createdMemberIds.length) await syncProjectMembers(organizationId, data.id);
      for (const memberId of createdMemberIds) {
        const member = await db.get('ProjectMember', memberId);
        if (!member) continue;
        const event = await createAutomaticProjectEvent(organizationId, actorId, {
          projectId: data.id, projectMemberId: member.id, personId: String(member.personId), eventType: 'عضویت کارمند در پروژه',
          title: 'عضو جدید به پروژه پیوست', description: `عضو ${String(member.personId)} به پروژه اضافه شد.`, systemKey: `member:${member.id}:joined`,
        }, ip);
        createdEventIds.push(event.id);
      }
      const stored = (await db.get('Project', data.id)) ?? data;
      await audit(organizationId, actorId, 'projects.created', 'Project', data.id, Object.keys(projectInput), ip, undefined, stored);
      return stored;
    } catch (error) {
      await rollbackProjectCreate(organizationId, projectId, createdMemberIds, createdEventIds);
      throw error;
    }
  }
  async updateProject(organizationId: string, actorId: string, id: string, patch: Record<string, unknown>, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId); const current = await db.get('Project', id); if (!current) return undefined;
    const previousStatus = current.status;
    const { members: _members, progress: _progress, tasksCount: _tasksCount, completedTasksCount: _completedTasksCount, plannedHours: _plannedHours, estimatedHours: _estimatedHours, actualHours: _actualHours, ...safePatch } = patch;
    if (safePatch.customerId && !await db.get('Customer', String(safePatch.customerId))) invalid('body.customerId', 'Project customer does not exist in this organization');
    if (safePatch.managerId) await requirePerson(organizationId, String(safePatch.managerId), 'body.managerId');
    if (safePatch.code && (await db.list('Project', { code: safePatch.code })).some((project) => project.id !== id)) businessIssue('body.code', 'Project code is already in use');
    await validateDateRange({ ...current, ...safePatch }, 'body.endDate');
    const data = await db.update('Project', id, { ...safePatch, updatedBy: actorId });
    if (data) {
      await audit(organizationId, actorId, 'projects.updated', 'Project', id, Object.keys(safePatch), ip, current, data);
      if (safePatch.status && safePatch.status !== previousStatus) await createAutomaticProjectEvent(organizationId, actorId, {
        projectId: id, eventType: 'تغییر وضعیت پروژه', title: 'وضعیت پروژه تغییر کرد',
        description: `وضعیت پروژه از «${String(previousStatus || 'نامشخص')}» به «${String(safePatch.status)}» تغییر کرد.`,
        systemKey: `project:${id}:status:${String(previousStatus)}:${String(safePatch.status)}:${String(data.updatedAt)}`,
      }, ip);
    }
    return data;
  }
  async removeProject(organizationId: string, actorId: string, id: string, ip?: string): Promise<boolean> {
    const db = database.forOrganization(organizationId); const current = await db.get('Project', id); if (!current) return false;
    const childCounts = await Promise.all([
      db.count('Task', { projectId: id }), db.count('ProjectPhase', { projectId: id }), db.count('ProjectMember', { projectId: id }), db.count('TimeEntry', { projectId: id }), db.count('ProjectAccess', { projectId: id }),
      db.count('ProjectActivity', { projectId: id }), db.count('ProjectRole', { projectId: id }), db.count('ProjectEvent', { projectId: id }), db.count('Meeting', { projectId: id }), db.count('FileRecord', { projectId: id }),
      db.count('Contract', { projectId: id }), db.count('Invoice', { projectId: id }), db.count('Payment', { projectId: id }), db.count('Installment', { projectId: id }), db.count('Expense', { projectId: id }), db.count('ProjectSale', { projectId: id }), db.count('PerformanceEvent', { projectId: id }),
    ]);
    if (childCounts.some(Boolean)) businessIssue('params.id', 'Project is referenced by project structure, collaboration, files, finance, access, or performance records');
    const removed = await db.remove('Project', id); if (removed) await audit(organizationId, actorId, 'projects.deleted', 'Project', id, [], ip, current); return removed;
  }
  async createTask(organizationId: string, actorId: string, input: RecordInput, ip?: string): Promise<AppRecord> {
    const { loggedHours: _loggedHours, ...mutable } = input;
    const prepared = { ...mutable, creatorId: actorId, loggedHours: 0, createdBy: actorId };
    await normalizeTaskAssignment(organizationId, prepared);
    await validateTask(organizationId, actorId, prepared);
    const data = await database.forOrganization(organizationId).create('Task', prepared); await recalculateProject(organizationId, String(data.projectId));
    const result = (await database.forOrganization(organizationId).get('Task', data.id))!;
    await audit(organizationId, actorId, 'tasks.created', 'Task', data.id, Object.keys(input), ip, undefined, result); return result;
  }
  async updateTask(organizationId: string, actorId: string, id: string, patch: Record<string, unknown>, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId); const current = await db.get('Task', id); if (!current) return undefined;
    const previousStatus = current.status;
    const { loggedHours: _loggedHours, ...safePatch } = patch;
    const assignmentFields = ['assigneeId', 'assigneeIds', 'assigneeMemberIds'] as const;
    if (assignmentFields.some((field) => field in safePatch)) {
      const draft: Record<string, unknown> = { ...current, ...safePatch };
      await normalizeTaskAssignment(organizationId, draft);
      for (const field of assignmentFields) if (draft[field] !== undefined) safePatch[field] = draft[field];
    }
    await validateTask(organizationId, actorId, { ...current, ...safePatch }, new Set(Object.keys(safePatch))); const data = await db.update('Task', id, { ...safePatch, updatedBy: actorId });
    await recalculateProject(organizationId, String(current.projectId));
    if (data) {
      await audit(organizationId, actorId, 'tasks.updated', 'Task', id, Object.keys(patch), ip, current, data);
      const major = ['high', 'urgent'].includes(String(data.priority)) || data.customerVisible === true;
      if (previousStatus !== 'done' && data.status === 'done' && major) await createAutomaticProjectEvent(organizationId, actorId, {
        projectId: String(data.projectId), taskId: data.id, ...(data.phaseId ? { phaseId: String(data.phaseId) } : {}),
        eventType: 'دستاورد یا نقطه عطف', title: 'نقطه عطف پروژه تکمیل شد', description: `وظیفه مهم «${String(data.title)}» تکمیل شد.`,
        systemKey: `task:${data.id}:milestone-completed`, priority: data.priority === 'urgent' ? 'بسیار بالا' : 'بالا', customerVisible: data.customerVisible === true,
      }, ip);
    }
    return db.get('Task', id);
  }
  async removeTask(organizationId: string, actorId: string, id: string, ip?: string): Promise<boolean> {
    const db = database.forOrganization(organizationId); const current = await db.get('Task', id); if (!current) return false;
    const directReferences = await Promise.all([db.count('TimeEntry', { taskId: id }), db.count('ProjectEvent', { taskId: id }), db.count('PerformanceEvent', { taskId: id })]);
    const meetingReference = (await db.list('Meeting')).some((meeting) => Array.isArray(meeting.taskIds) && meeting.taskIds.includes(id));
    if (directReferences.some(Boolean) || meetingReference) businessIssue('params.id', 'Task is referenced by time entries, meetings, events, or performance');
    const removed = await db.remove('Task', id); if (removed) { await recalculateProject(organizationId, String(current.projectId)); await audit(organizationId, actorId, 'tasks.deleted', 'Task', id, [], ip, current); } return removed;
  }
  list(organizationId: string, kind: Kind): Promise<AppRecord[]> { return database.forOrganization(organizationId).list(kindModel[kind]); }
  get(organizationId: string, kind: Kind, id: string): Promise<AppRecord | undefined> { return database.forOrganization(organizationId).get(kindModel[kind], id); }
  async create(organizationId: string, actorId: string, kind: Kind, input: RecordInput, ip?: string): Promise<AppRecord> {
    const db = database.forOrganization(organizationId); const prepared: RecordInput = { ...input, createdBy: actorId };
    if (kind === 'phase') { await validatePhase(organizationId, prepared); Object.assign(prepared, { progress: 0, estimatedHours: 0, actualHours: 0 }); }
    if (kind === 'role') await requireProject(organizationId, String(prepared.projectId));
    if (kind === 'activity') await validateActivity(organizationId, prepared);
    if (kind === 'member') { if (!prepared.status) prepared.status = 'active'; await validateMember(organizationId, prepared); }
    if (kind === 'timeEntry') {
      await claimOwnTimeEntry(organizationId, actorId, prepared);
      delete prepared.status; delete prepared.hourlyRate; delete prepared.calculatedCost; delete prepared.billingStatus;
      const member = await validateTimeEntry(organizationId, prepared); const employee = await employeeForPerson(organizationId, String(prepared.employeeId));
      prepared.employeeId = employee!.id;
      const rate = Number(member.hourlyCost ?? employee?.hourlyRate ?? 0); Object.assign(prepared, { hourlyRate: rate, calculatedCost: Number(prepared.hours) * rate, status: 'pending_review' });
    }
    const data = await db.create(kindModel[kind], prepared);
    if (kind === 'member') await syncProjectMembers(organizationId, String(data.projectId));
    if (['phase', 'activity', 'timeEntry'].includes(kind)) await recalculateProject(organizationId, String(data.projectId));
    if (kind === 'member') await createAutomaticProjectEvent(organizationId, actorId, {
      projectId: String(data.projectId), projectMemberId: data.id, personId: String(data.personId), eventType: 'عضویت کارمند در پروژه',
      title: 'عضو جدید به پروژه پیوست', description: `عضو ${String(data.personId)} به پروژه اضافه شد.`, systemKey: `member:${data.id}:joined`,
    }, ip);
    if (kind === 'phase' && data.status === 'completed') await createAutomaticProjectEvent(organizationId, actorId, {
      projectId: String(data.projectId), phaseId: data.id, eventType: 'تکمیل فاز پروژه', title: 'فاز پروژه تکمیل شد',
      description: `فاز «${String(data.title)}» تکمیل شد.`, systemKey: `phase:${data.id}:completed`,
    }, ip);
    const result = (await db.get(kindModel[kind], data.id))!;
    await audit(organizationId, actorId, `${kind}.created`, kindModel[kind], data.id, Object.keys(input), ip, undefined, result); return result;
  }
  async update(organizationId: string, actorId: string, kind: Kind, id: string, patch: Record<string, unknown>, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId); const model = kindModel[kind]; const current = await db.get(model, id); if (!current) return undefined;
    const previousStatus = current.status;
    if (kind === 'phase') { delete patch.progress; delete patch.estimatedHours; delete patch.actualHours; }
    if (kind === 'timeEntry') { delete patch.status; delete patch.hourlyRate; delete patch.calculatedCost; delete patch.billingStatus; }
    const combined = { ...current, ...patch };
    if (kind === 'phase') await validatePhase(organizationId, combined);
    if (kind === 'activity') await validateActivity(organizationId, combined);
    if (kind === 'member') await validateMember(organizationId, combined, current);
    if (kind === 'timeEntry') {
      const member = await validateTimeEntry(organizationId, combined); const employee = await employeeForPerson(organizationId, String(combined.employeeId));
      const rate = Number(member.hourlyCost ?? employee?.hourlyRate ?? 0);
      const affectsApprovedTime = ['date', 'hours', 'startTime', 'endTime'].some((field) => field in patch);
      Object.assign(patch, {
        hourlyRate: rate, calculatedCost: Number(combined.hours) * rate,
        ...(affectsApprovedTime ? { status: 'pending_review', reviewedBy: undefined, reviewedAt: undefined, reviewReason: undefined } : {}),
      });
    }
    const data = await db.update(model, id, { ...patch, updatedBy: actorId });
    if (kind === 'member') await syncProjectMembers(organizationId, String(current.projectId));
    if (['phase', 'activity', 'timeEntry'].includes(kind)) await recalculateProject(organizationId, String(current.projectId));
    if (data && kind === 'member' && previousStatus === 'active' && data.status === 'inactive') await createAutomaticProjectEvent(organizationId, actorId, {
      projectId: String(data.projectId), projectMemberId: data.id, personId: String(data.personId), eventType: 'خروج کارمند از پروژه',
      title: 'عضو از پروژه خارج شد', description: `عضو ${String(data.personId)} از پروژه خارج شد.`, systemKey: `member:${data.id}:left:${String(data.leftAt || data.updatedAt)}`,
    }, ip);
    if (data && kind === 'phase' && previousStatus !== 'completed' && data.status === 'completed') await createAutomaticProjectEvent(organizationId, actorId, {
      projectId: String(data.projectId), phaseId: data.id, eventType: 'تکمیل فاز پروژه', title: 'فاز پروژه تکمیل شد',
      description: `فاز «${String(data.title)}» تکمیل شد.`, systemKey: `phase:${data.id}:completed`,
    }, ip);
    const result = await db.get(model, id);
    if (data) await audit(organizationId, actorId, `${kind}.updated`, model, id, Object.keys(patch), ip, current, result || data); return result;
  }

  async reviewTimeEntry(organizationId: string, actorId: string, id: string, input: { status: string; reason?: string }, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId);
    const current = await db.get('TimeEntry', id);
    if (!current) return undefined;
    if (input.status === 'rejected' && !input.reason?.trim()) invalid('body.reason', 'A rejection reason is required');
    const patch: Record<string, unknown> = {
      status: input.status,
      reviewedBy: actorId,
      reviewedAt: new Date().toISOString(),
      reviewReason: input.reason?.trim() || undefined,
      updatedBy: actorId,
    };
    const data = await db.update('TimeEntry', id, patch);
    await recalculateProject(organizationId, String(current.projectId));
    if (data) await audit(organizationId, actorId, 'timeEntry.reviewed', 'TimeEntry', id, ['status', 'reason'], ip, current, data);
    return data;
  }

  async updateTimeEntryBilling(organizationId: string, actorId: string, id: string, input: { billingStatus?: string }, ip?: string): Promise<AppRecord | undefined> {
    const db = database.forOrganization(organizationId);
    const current = await db.get('TimeEntry', id);
    if (!current) return undefined;
    const data = await db.update('TimeEntry', id, { ...input, updatedBy: actorId });
    if (data) await audit(organizationId, actorId, 'timeEntry.billingUpdated', 'TimeEntry', id, Object.keys(input), ip, current, data);
    return data;
  }
  async remove(organizationId: string, actorId: string, kind: Kind, id: string, ip?: string): Promise<boolean> {
    const db = database.forOrganization(organizationId); const model = kindModel[kind]; const current = await db.get(model, id); if (!current) return false;
    if (kind === 'phase' && (await db.count('Task', { phaseId: id }) || await db.count('ProjectEvent', { phaseId: id }))) businessIssue('params.id', 'Phase referenced by tasks or project events cannot be deleted');
    if (kind === 'role' && (await db.count('ProjectActivity', { roleId: id }) || await db.count('ProjectAccess', { roleId: id }) || (await db.list('ProjectMember', { projectId: current.projectId })).some((member) => Array.isArray(member.roleIds) && member.roleIds.includes(id)))) businessIssue('params.id', 'Role is still used by activities, access grants, or project members');
    if (kind === 'activity' && await db.count('Task', { activityId: id })) businessIssue('params.id', 'Activity with tasks cannot be deleted');
    if (kind === 'member') {
      const assigned = (await db.list('Task', { projectId: current.projectId })).some((task) => (Array.isArray(task.assigneeMemberIds) && task.assigneeMemberIds.includes(id)) || task.assigneeId === current.personId || (Array.isArray(task.assigneeIds) && task.assigneeIds.includes(current.personId)));
      if (assigned || await db.count('ProjectAccess', { projectMemberId: id }) || await db.count('ProjectEvent', { projectMemberId: id }) || (await db.list('TimeEntry', { projectId: current.projectId })).some((entry) => entry.employeeId === current.personId)) businessIssue('params.id', 'Member with task assignments, events, access grants, or time entries cannot be deleted; mark the membership inactive instead');
      await createAutomaticProjectEvent(organizationId, actorId, {
        projectId: String(current.projectId), personId: String(current.personId), eventType: 'خروج کارمند از پروژه',
        title: 'عضو از پروژه حذف شد', description: `عضو ${String(current.personId)} از پروژه حذف شد.`, systemKey: `member:${current.id}:removed`,
      }, ip);
    }
    const removed = await db.remove(model, id);
    if (removed) { if (kind === 'member') await syncProjectMembers(organizationId, String(current.projectId)); if (['phase', 'activity', 'timeEntry'].includes(kind)) await recalculateProject(organizationId, String(current.projectId)); await audit(organizationId, actorId, `${kind}.deleted`, model, id, [], ip, current); }
    return removed;
  }
}
